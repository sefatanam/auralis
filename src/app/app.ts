import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { LibraryService } from './core/library.service';
import { PlayerBar } from './components/player-bar/player-bar';
import { Sidebar } from './components/sidebar/sidebar';
import { Library } from './components/library/library';

@Component({
  selector: 'app-root',
  imports: [MatIconModule, PlayerBar, Sidebar, Library],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(window:dragover)': 'onDragOver($event)',
    '(window:dragleave)': 'onDragLeave($event)',
    '(window:drop)': 'onDrop($event)',
  },
})
export class App {
  private readonly library = inject(LibraryService);
  protected readonly dragging = signal(false);

  constructor() {
    inject(MatIconRegistry).setDefaultFontSetClass('material-icons-round');
  }

  protected onDragOver(e: DragEvent): void {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      this.dragging.set(true);
    }
  }

  protected onDragLeave(e: DragEvent): void {
    // relatedTarget is null only when the pointer leaves the window entirely.
    if (e.relatedTarget === null) this.dragging.set(false);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const files = e.dataTransfer?.files;
    if (files?.length) void this.library.import(files);
  }
}
