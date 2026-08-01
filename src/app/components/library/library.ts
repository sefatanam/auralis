import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LibraryService } from '../../core/library.service';
import { NavService } from '../../core/nav.service';
import { PlayerService } from '../../core/player.service';
import { DurationPipe } from '../../core/duration.pipe';
import { Album, Artist, Track } from '../../core/models';
import { Cover } from '../cover/cover';

@Component({
  selector: 'app-library',
  imports: [MatButtonModule, MatIconModule, DurationPipe, Cover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library {
  protected readonly lib = inject(LibraryService);
  protected readonly nav = inject(NavService);
  protected readonly player = inject(PlayerService);

  protected readonly filteredSongs = computed<Track[]>(() => {
    const q = this.nav.search().trim().toLowerCase();
    const list = this.lib.tracks();
    const base = q
      ? list.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q) ||
            t.album.toLowerCase().includes(q),
        )
      : list;
    return [...base].sort((a, b) => a.title.localeCompare(b.title));
  });

  protected readonly heading = computed(() => {
    switch (this.nav.view()) {
      case 'albums':
        return 'Albums';
      case 'artists':
        return 'Artists';
      default:
        return 'Songs';
    }
  });

  protected isCurrent(track: Track): boolean {
    return this.player.currentTrack()?.id === track.id;
  }

  protected playSong(track: Track, context: Track[]): void {
    this.player.shuffle.set(false);
    this.player.play(track, context);
  }

  protected playAllSongs(): void {
    const list = this.filteredSongs();
    if (list.length) this.playSong(list[0], list);
  }

  protected shuffleSongs(): void {
    const list = this.shuffled(this.filteredSongs());
    if (list.length) {
      this.player.shuffle.set(true);
      this.player.play(list[0], list);
    }
  }

  protected playAlbum(album: Album, shuffle = false): void {
    const tracks = shuffle ? this.shuffled(album.tracks) : album.tracks;
    if (!tracks.length) return;
    this.player.shuffle.set(shuffle);
    this.player.play(tracks[0], tracks);
  }

  protected playArtist(artist: Artist): void {
    if (artist.tracks.length) {
      this.player.shuffle.set(false);
      this.player.play(artist.tracks[0], artist.tracks);
    }
  }

  protected openAlbum(album: Album): void {
    this.nav.openAlbumDetail(album);
  }

  private shuffled(tracks: Track[]): Track[] {
    const a = [...tracks];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
