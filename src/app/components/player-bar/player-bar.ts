import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { PlayerService } from '../../core/player.service';
import { DurationPipe } from '../../core/duration.pipe';

@Component({
  selector: 'app-player-bar',
  imports: [MatButtonModule, MatIconModule, MatSliderModule, DurationPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-bar.html',
  styleUrl: './player-bar.scss',
})
export class PlayerBar {
  protected readonly player = inject(PlayerService);

  protected readonly remaining = computed(() =>
    Math.max(0, this.player.duration() - this.player.currentTime()),
  );

  protected readonly volumeIcon = computed(() => {
    const v = this.player.effectiveVolume();
    if (v === 0) return 'volume_off';
    if (v < 0.5) return 'volume_down';
    return 'volume_up';
  });

  /** Click or drag anywhere on the progress bar to seek. */
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
    const fraction = (event.clientX - rect.left) / rect.width;
    this.player.seekFraction(Math.min(1, Math.max(0, fraction)));
  }
}
