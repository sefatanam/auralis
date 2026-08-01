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

export type JobStatus = 'downloading' | 'importing' | 'done' | 'error';

export interface DownloadJob {
  readonly id: string;
  url: string;
  percent: number;
  message: string;
  status: JobStatus;
}

/** True when running inside the Tauri shell (vs. a plain `ng serve` browser). */
export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Drives the YouTube→MP3 download feature: talks to the Rust `download` module
 * over Tauri IPC, streams progress, and feeds finished files into the existing
 * {@link LibraryService} import pipeline so they play like any imported track.
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly library = inject(LibraryService);

  readonly available = IS_TAURI;
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

  async download(rawUrl: string): Promise<void> {
    const url = rawUrl.trim();
    if (!url || !IS_TAURI) return;

    const id = crypto.randomUUID();
    this.add({ id, url, percent: 0, message: 'Starting…', status: 'downloading' });

    // ponytail: one global progress event; concurrent downloads would cross-update.
    // Per-job event names if simultaneous downloads ever matter.
    // yt-dlp emits progress lines; percent is -1 on non-progress lines.
    const unlisten = await listen<{ percent: number; message: string }>(
      'download-progress',
      (e) => {
        const { percent, message } = e.payload;
        this.patch(id, {
          message,
          ...(percent >= 0 ? { percent } : {}),
        });
      },
    );

    try {
      const files = await invoke<DownloadedFile[]>('download_audio', { url });
      this.patch(id, { percent: 100, status: 'importing', message: 'Importing…' });
      await this.importFiles(files);
      this.patch(id, { status: 'done', message: `${files.length} track(s) added` });
    } catch (err) {
      this.patch(id, { status: 'error', message: String(err) });
    } finally {
      unlisten();
    }
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
