import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DownloadService } from '../../core/download.service';
import { LibraryService } from '../../core/library.service';
import { ThemeService, ThemeMode } from '../../core/theme.service';

@Component({
  selector: 'app-settings',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly theme = inject(ThemeService);
  protected readonly library = inject(LibraryService);
  protected readonly svc = inject(DownloadService);

  protected readonly themes: readonly { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'system', label: 'System', icon: 'contrast' },
    { mode: 'light', label: 'Light', icon: 'light_mode' },
    { mode: 'dark', label: 'Dark', icon: 'dark_mode' },
  ];

  constructor() {
    void this.svc.refreshTools();
  }
}
