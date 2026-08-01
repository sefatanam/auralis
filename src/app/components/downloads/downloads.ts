import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DownloadService, PlaylistEntry } from '../../core/download.service';

type SelectableEntry = PlaylistEntry & { selected: boolean };

@Component({
  selector: 'app-downloads',
  imports: [DecimalPipe, MatButtonModule, MatIconModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './downloads.html',
  styleUrl: './downloads.scss',
})
export class Downloads {
  protected readonly svc = inject(DownloadService);
  protected readonly url = signal('');
  protected readonly probing = signal(false);
  /** Playlist entries awaiting the user's pick; null when no dialog is open. */
  protected readonly pending = signal<SelectableEntry[] | null>(null);
  protected readonly probeError = signal('');

  constructor() {
    void this.svc.refreshTools();
  }

  protected missingTools(): string[] {
    return this.svc.missingTools();
  }

  /** How to install the missing tools on the current OS. */
  protected installHint(): string {
    switch (this.svc.tools()?.os) {
      case 'windows':
        return 'Install manually, e.g. `winget install yt-dlp.yt-dlp` and `winget install ffmpeg`.';
      case 'linux':
        return 'Install via your package manager, e.g. `sudo apt install yt-dlp ffmpeg`.';
      default:
        return 'Homebrew not found — install from brew.sh, or run `brew install yt-dlp ffmpeg`.';
    }
  }

  protected async submit(): Promise<void> {
    const value = this.url().trim();
    if (!value || !this.svc.ready() || this.probing()) return;
    this.url.set('');
    this.probeError.set('');

    // Only real playlist links need the picker; a plain video downloads
    // straight away. Mirrors the reference's isRealPlaylistUrl() — a `list=RD…`
    // is a YouTube auto-mix/radio, not a playlist, so don't enumerate it.
    if (!this.isRealPlaylistUrl(value)) {
      void this.svc.download(value);
      return;
    }

    this.probing.set(true);
    try {
      const entries = await this.svc.probe(value);
      if (entries.length > 1) {
        this.pending.set(entries.map((e) => ({ ...e, selected: true })));
      } else {
        void this.svc.download(entries[0]?.url ?? value, entries[0]?.title);
      }
    } catch (err) {
      this.probeError.set(String(err));
    } finally {
      this.probing.set(false);
    }
  }

  /** A `list=` param that isn't a YouTube auto-mix/radio (RD…). */
  private isRealPlaylistUrl(url: string): boolean {
    const m = url.match(/[?&]list=([^&]+)/);
    return !!m && !m[1].startsWith('RD');
  }

  protected allSelected(): boolean {
    const list = this.pending();
    return !!list && list.length > 0 && list.every((e) => e.selected);
  }

  protected selectedCount(): number {
    return this.pending()?.filter((e) => e.selected).length ?? 0;
  }

  protected toggleEntry(id: string): void {
    this.pending.update((list) =>
      list?.map((e) => (e.id === id ? { ...e, selected: !e.selected } : e)) ?? null,
    );
  }

  protected toggleAll(): void {
    const next = !this.allSelected();
    this.pending.update((list) => list?.map((e) => ({ ...e, selected: next })) ?? null);
  }

  protected cancelSelection(): void {
    this.pending.set(null);
  }

  protected confirmSelection(): void {
    const chosen = this.pending()?.filter((e) => e.selected) ?? [];
    this.pending.set(null);
    if (chosen.length) void this.svc.downloadMany(chosen);
  }
}
