import { effect, Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'ngmusic.theme';

/**
 * Drives the app-wide `color-scheme` via a class on <html>. Apple Music
 * defaults to dark; users can flip to light or follow the OS.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = document.documentElement;
  readonly mode = signal<ThemeMode>(this.restore());

  constructor() {
    effect(() => {
      const mode = this.mode();
      this.root.classList.remove('theme-light', 'theme-dark', 'theme-system');
      this.root.classList.add(`theme-${mode}`);
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        /* storage may be unavailable (private mode) */
      }
    });
  }

  /** Cycles dark → light → dark (system is only used as the initial default). */
  toggle(): void {
    this.mode.update((m) => (m === 'dark' ? 'light' : 'dark'));
  }

  private restore(): ThemeMode {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return 'dark';
  }
}
