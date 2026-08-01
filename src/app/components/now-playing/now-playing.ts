import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { PlayerService } from '../../core/player.service';
import { NavService } from '../../core/nav.service';
import { DurationPipe } from '../../core/duration.pipe';
import { Cover } from '../cover/cover';

/** Full-screen "Now Playing" page: big artwork, transport, and a lyrics/queue panel. */
@Component({
  selector: 'app-now-playing',
  imports: [MatButtonModule, MatIconModule, MatSliderModule, DurationPipe, Cover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './now-playing.html',
  styleUrl: './now-playing.scss',
  host: { '(document:keydown.escape)': 'nav.closeNowPlaying()' },
})
export class NowPlaying {
  protected readonly player = inject(PlayerService);
  protected readonly nav = inject(NavService);
  protected readonly panel = signal<'lyrics' | 'queue'>('lyrics');

  // ponytail: fixed seed per open so the random background stays stable while the page is up
  private readonly randomBg = `https://picsum.photos/seed/${Math.floor(Math.random() * 1e9)}/1600/900`;

  protected readonly remaining = computed(() =>
    Math.max(0, this.player.duration() - this.player.currentTime()),
  );

  protected readonly volumeIcon = computed(() => {
    const v = this.player.effectiveVolume();
    if (v === 0) return 'volume_off';
    if (v < 0.5) return 'volume_down';
    return 'volume_up';
  });

  /** Blurred background: the cover art if present, else a random nice photo. */
  protected readonly backdrop = computed(() => {
    const t = this.player.currentTrack();
    return `url("${t?.artworkUrl || this.randomBg}")`;
  });

  protected startScrub(event: PointerEvent, bar: HTMLElement): void {
    event.preventDefault();
    this.seekTo(event, bar);
    const move = (e: PointerEvent) => this.seekTo(e, bar);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  protected onVolume(value: number): void {
    this.player.setVolume(value / 100);
  }

  private seekTo(event: PointerEvent, bar: HTMLElement): void {
    const rect = bar.getBoundingClientRect();
    this.player.seekFraction(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  }
}
