import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DownloadService } from '../../core/download.service';

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

  protected submit(): void {
    const value = this.url().trim();
    if (!value || !this.svc.ready()) return;
    void this.svc.download(value);
    this.url.set('');
  }
}
