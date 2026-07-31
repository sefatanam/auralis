import { computed, Injectable, signal } from '@angular/core';
import { parseBlob, selectCover } from 'music-metadata';
import { Album, Artist, Track } from './models';

const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|flac|wav|ogg|oga|opus|weba|webm)$/i;

/**
 * Owns the imported music library: reads local files, extracts ID3/other tag
 * metadata + cover art via `music-metadata`, and exposes derived album/artist
 * groupings as signals.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  readonly tracks = signal<Track[]>([]);
  readonly importing = signal(false);
  /** Progress counters shown while a batch import runs. */
  readonly importDone = signal(0);
  readonly importTotal = signal(0);

  readonly hasMusic = computed(() => this.tracks().length > 0);

  readonly albums = computed<Album[]>(() => this.groupAlbums(this.tracks()));
  readonly artists = computed<Artist[]>(() => this.groupArtists(this.tracks()));

  /** Accepts a FileList (from an <input>) or a plain File array (drag-drop). */
  async import(files: FileList | File[]): Promise<void> {
    const audio = Array.from(files).filter(
      (f) => AUDIO_EXT.test(f.name) || f.type.startsWith('audio/'),
    );
    if (audio.length === 0) return;

    this.importing.set(true);
    this.importTotal.update((n) => n + audio.length);

    for (const file of audio) {
      const track = await this.parse(file);
      // Push incrementally so the UI fills in as files are read.
      this.tracks.update((list) => [...list, track]);
      this.importDone.update((n) => n + 1);
    }

    this.importing.set(false);
    this.importDone.set(0);
    this.importTotal.set(0);
  }

  /** Opens the OS file picker for one or more audio files. */
  pickFiles(): void {
    this.openPicker(false);
  }

  /** Opens the OS picker in folder mode (imports an entire music folder). */
  pickFolder(): void {
    this.openPicker(true);
  }

  private openPicker(directory: boolean): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (directory) {
      input.webkitdirectory = true;
    } else {
      input.accept = 'audio/*,.mp3,.m4a,.m4b,.flac,.wav,.ogg,.aac,.opus';
    }
    input.addEventListener('change', () => {
      if (input.files?.length) void this.import(input.files);
    });
    input.click();
  }

  clear(): void {
    for (const t of this.tracks()) {
      URL.revokeObjectURL(t.url);
      if (t.artworkUrl) URL.revokeObjectURL(t.artworkUrl);
    }
    this.tracks.set([]);
  }

  private async parse(file: File): Promise<Track> {
    const url = URL.createObjectURL(file);
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
    const track: Track = {
      id: crypto.randomUUID(),
      title: fallbackTitle,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      albumArtist: 'Unknown Artist',
      duration: 0,
      url,
      fileName: file.name,
    };

    try {
      const meta = await parseBlob(file, { duration: true });
      const c = meta.common;
      track.title = c.title?.trim() || fallbackTitle;
      track.artist = c.artist?.trim() || 'Unknown Artist';
      track.album = c.album?.trim() || 'Unknown Album';
      track.albumArtist = c.albumartist?.trim() || track.artist;
      track.year = c.year;
      track.trackNo = c.track?.no ?? undefined;
      track.genre = c.genre?.[0];
      track.duration = meta.format.duration ?? 0;

      const cover = selectCover(c.picture);
      if (cover) {
        const blob = new Blob([cover.data as BlobPart], { type: cover.format });
        track.artworkUrl = URL.createObjectURL(blob);
      }
    } catch {
      /* Unreadable tags — keep filename-derived fallbacks. */
    }

    return track;
  }

  private groupAlbums(tracks: Track[]): Album[] {
    const map = new Map<string, Album>();
    for (const t of tracks) {
      const id = `${t.album}::${t.albumArtist}`;
      let album = map.get(id);
      if (!album) {
        album = {
          id,
          name: t.album,
          artist: t.albumArtist,
          artworkUrl: t.artworkUrl,
          year: t.year,
          tracks: [],
        };
        map.set(id, album);
      }
      album.tracks.push(t);
      if (!album.artworkUrl && t.artworkUrl) album.artworkUrl = t.artworkUrl;
      if (!album.year && t.year) album.year = t.year;
    }
    for (const album of map.values()) {
      album.tracks.sort((a, b) => (a.trackNo ?? 0) - (b.trackNo ?? 0));
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private groupArtists(tracks: Track[]): Artist[] {
    const map = new Map<string, Artist & { albums: Set<string> }>();
    for (const t of tracks) {
      let artist = map.get(t.artist);
      if (!artist) {
        artist = {
          id: t.artist,
          name: t.artist,
          artworkUrl: t.artworkUrl,
          albumCount: 0,
          tracks: [],
          albums: new Set<string>(),
        };
        map.set(t.artist, artist);
      }
      artist.tracks.push(t);
      artist.albums.add(t.album);
      if (!artist.artworkUrl && t.artworkUrl) artist.artworkUrl = t.artworkUrl;
    }
    return [...map.values()]
      .map((a) => ({
        id: a.id,
        name: a.name,
        artworkUrl: a.artworkUrl,
        albumCount: a.albums.size,
        tracks: a.tracks,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
