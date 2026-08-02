import { inject, Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LibraryService } from './library.service';

interface ToolStatus {
  yt_dlp: boolean;
  ffmpeg: boolean;
  brew: boolean;
  os: string;
}

interface DownloadedFile {
  path: string;
  name: string;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
}

export type JobStatus = 'downloading' | 'importing' | 'done' | 'error';

export interface DownloadJob {
  readonly id: string;
  url: string;
  title: string;
  percent: number;
  message: string;
  status: JobStatus;
}

/** True when running inside the Tauri shell (vs. a plain `ng serve` browser). */
export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * True on iOS/Android. Downloading shells out to yt-dlp/ffmpeg subprocesses,
 * which mobile sandboxes forbid — so the download feature is unavailable there
 * (folder loading still works; it's just a directory read).
 */
export const IS_MOBILE =
  typeof navigator !== 'undefined' &&
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/**
 * Drives the YouTube→MP3 download feature: talks to the Rust `download` module
 * over Tauri IPC, streams progress, and feeds finished files into the existing
 * {@link LibraryService} import pipeline so they play like any imported track.
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly library = inject(LibraryService);

  readonly available = IS_TAURI && !IS_MOBILE;
  readonly tools = signal<ToolStatus | null>(null);
  /** Absolute folder downloads are saved to. */
  readonly location = signal<string>('');
  readonly jobs = signal<DownloadJob[]>([]);
  readonly installing = signal(false);
  readonly installLog = signal<string[]>([]);

  /** yt-dlp + ffmpeg both present — required before any download. */
  ready(): boolean {
    const t = this.tools();
    return !!t?.yt_dlp && !!t?.ffmpeg;
  }

  /** Homebrew only applies to macOS/Linux. */
  brewApplies(): boolean {
    return this.tools()?.os !== 'windows';
  }

  /** Names of required tools that are missing (for display). */
  missingTools(): string[] {
    const t = this.tools();
    if (!t) return [];
    const missing: string[] = [];
    if (!t.yt_dlp) missing.push('yt-dlp');
    if (!t.ffmpeg) missing.push('ffmpeg');
    return missing;
  }

  async refreshTools(): Promise<void> {
    if (!IS_TAURI) return;
    const [tools, dir] = await Promise.all([
      invoke<ToolStatus>('check_tools'),
      invoke<string>('download_dir').catch(() => ''),
    ]);
    this.tools.set(tools);
    this.location.set(dir);
  }

  /** Open a native folder picker and persist the chosen download location. */
  async changeLocation(): Promise<void> {
    if (!IS_TAURI) return;
    const dir = await invoke<string | null>('pick_download_dir');
    if (dir) this.location.set(dir);
  }

  /**
   * Load audio files already in the download folder (app downloads + files the
   * user dropped in via the Files app) into the library, skipping any already
   * imported (matched by file name).
   */
  async syncFolder(): Promise<void> {
    if (!IS_TAURI) return;
    const files = await invoke<DownloadedFile[]>('list_downloads').catch(() => []);
    const have = new Set(this.library.tracks().map((t) => t.fileName));
    const fresh = files.filter((f) => !have.has(f.name));
    if (fresh.length) await this.importFiles(fresh);
  }

  /** List a playlist's entries (one entry for a single video) without downloading. */
  async probe(rawUrl: string): Promise<PlaylistEntry[]> {
    const url = rawUrl.trim();
    if (!url || !IS_TAURI) return [];
    return invoke<PlaylistEntry[]>('probe_url', { url });
  }

  /** Download several tracks one at a time (avoids progress-event cross-talk). */
  async downloadMany(entries: PlaylistEntry[]): Promise<void> {
    for (const e of entries) {
      await this.download(e.url, e.title);
    }
  }

  async download(rawUrl: string, knownTitle = ''): Promise<void> {
    const url = rawUrl.trim();
    if (!url || !IS_TAURI) return;

    const id = crypto.randomUUID();
    this.add({ id, url, title: knownTitle, percent: 0, message: 'Preparing…', status: 'downloading' });

    // ponytail: one global progress event; concurrent downloads would cross-update.
    // Per-job event names if simultaneous downloads ever matter.
    // yt-dlp emits progress lines; percent is -1 on non-progress lines.
    const unlisten = await listen<{ percent: number; message: string }>(
      'download-progress',
      (e) => {
        const { percent, message } = e.payload;
        const title = this.deriveTitle(message);
        this.patch(id, {
          message,
          ...(title ? { title } : {}),
          ...(percent >= 0 ? { percent } : {}),
        });
      },
    );

    try {
      const files = await invoke<DownloadedFile[]>('download_audio', { url });
      const title = this.stem(files[0]?.name) || knownTitle || 'Download';
      this.patch(id, { percent: 100, status: 'importing', title, message: 'Importing…' });
      await this.importFiles(files);
      this.patch(id, {
        status: 'done',
        title,
        message: files.length > 1 ? `${files.length} tracks added` : 'Added to library',
      });
    } catch (err) {
      this.patch(id, { status: 'error', message: String(err) });
    } finally {
      unlisten();
    }
  }

  /** Pull a readable title from a yt-dlp "Destination: …/Title.f251.webm" line. */
  private deriveTitle(message: string): string | null {
    const m = message.match(/Destination:\s*(.+)$/);
    if (!m) return null;
    const base = m[1].split(/[/\\]/).pop() ?? '';
    return this.stem(base) || null;
  }

  /** Strip a file extension and any yt-dlp format id (".f251"). */
  private stem(name: string | undefined): string {
    if (!name) return '';
    return name.replace(/\.[a-z0-9]{1,4}$/i, '').replace(/\.f\d+$/i, '');
  }

  async installTools(): Promise<void> {
    if (!IS_TAURI) return;
    this.installing.set(true);
    this.installLog.set([]);
    const unlisten = await listen<string>('install-log', (e) =>
      this.installLog.update((l) => [...l, e.payload]),
    );
    try {
      await invoke('install_tools');
      await this.refreshTools();
    } catch (err) {
      this.installLog.update((l) => [...l, `Error: ${err}`]);
    } finally {
      this.installing.set(false);
      unlisten();
    }
  }

  dismiss(id: string): void {
    this.jobs.update((list) => list.filter((j) => j.id !== id));
  }

  private async importFiles(files: DownloadedFile[]): Promise<void> {
    const out: File[] = [];
    for (const f of files) {
      const buf = await invoke<ArrayBuffer>('read_file', { path: f.path });
      out.push(new File([buf], f.name, { type: 'audio/mpeg' }));
    }
    if (out.length) await this.library.import(out);
  }

  private add(job: DownloadJob): void {
    this.jobs.update((list) => [job, ...list]);
  }

  private patch(id: string, data: Partial<DownloadJob>): void {
    this.jobs.update((list) =>
      list.map((j) => (j.id === id ? { ...j, ...data } : j)),
    );
  }
}
