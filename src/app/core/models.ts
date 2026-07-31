/** A single playable audio track imported from the local file system. */
export interface Track {
  readonly id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre?: string;
  year?: number;
  trackNo?: number;
  /** Length in seconds (0 when unknown until playback loads metadata). */
  duration: number;
  /** Object URL used as the <audio> source. */
  readonly url: string;
  /** Object URL for embedded cover art, when present. */
  artworkUrl?: string;
  readonly fileName: string;
}

/** A group of tracks that share the same album + album artist. */
export interface Album {
  readonly id: string;
  name: string;
  artist: string;
  artworkUrl?: string;
  year?: number;
  tracks: Track[];
}

/** A group of tracks that share the same artist. */
export interface Artist {
  readonly id: string;
  name: string;
  artworkUrl?: string;
  albumCount: number;
  tracks: Track[];
}

export type LibraryView = 'songs' | 'albums' | 'artists';
export type RepeatMode = 'off' | 'all' | 'one';
