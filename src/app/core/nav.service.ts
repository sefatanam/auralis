import { Injectable, signal } from '@angular/core';
import { Album, LibraryView } from './models';

/** Top-level content area: the music library, downloads, or settings page. */
export type Section = 'library' | 'downloads' | 'settings';

/** Holds the current content-area navigation state (which view / album). */
@Injectable({ providedIn: 'root' })
export class NavService {
  /** Which top-level page is shown in the content area. */
  readonly section = signal<Section>('library');
  readonly view = signal<LibraryView>('songs');
  /** When set, the content area shows this album's detail page. */
  readonly openAlbum = signal<Album | null>(null);
  /** Free-text search applied to the songs view. */
  readonly search = signal<string>('');
  /** Whether the full-screen Now Playing page is open. */
  readonly nowPlaying = signal(false);

  show(view: LibraryView): void {
    this.openAlbum.set(null);
    this.section.set('library');
    this.view.set(view);
  }

  showDownloads(): void {
    this.section.set('downloads');
  }

  showSettings(): void {
    this.section.set('settings');
  }

  openNowPlaying(): void {
    this.nowPlaying.set(true);
  }

  closeNowPlaying(): void {
    this.nowPlaying.set(false);
  }

  openAlbumDetail(album: Album): void {
    this.openAlbum.set(album);
  }

  closeAlbumDetail(): void {
    this.openAlbum.set(null);
  }
}
