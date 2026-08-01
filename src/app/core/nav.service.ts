import { Injectable, signal } from '@angular/core';
import { Album, LibraryView } from './models';

/** Holds the current content-area navigation state (which view / album). */
@Injectable({ providedIn: 'root' })
export class NavService {
  readonly view = signal<LibraryView>('songs');
  /** When set, the content area shows this album's detail page. */
  readonly openAlbum = signal<Album | null>(null);
  /** Free-text search applied to the songs view. */
  readonly search = signal<string>('');
  /** Whether the full-screen Now Playing page is open. */
  readonly nowPlaying = signal(false);

  show(view: LibraryView): void {
    this.openAlbum.set(null);
    this.view.set(view);
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
