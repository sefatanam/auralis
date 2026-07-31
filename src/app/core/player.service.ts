import { computed, effect, Injectable, signal } from '@angular/core';
import { RepeatMode, Track } from './models';

/**
 * Wraps a single HTMLAudioElement and exposes its state as signals. All
 * playback (queueing, shuffle, repeat, seeking, volume) flows through here.
 */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly audio = new Audio();

  readonly currentTrack = signal<Track | null>(null);
  readonly isPlaying = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(0.8);
  readonly muted = signal(false);
  readonly shuffle = signal(false);
  readonly repeat = signal<RepeatMode>('off');

  private readonly queue = signal<Track[]>([]);
  private readonly index = signal(0);

  readonly progress = computed(() => {
    const d = this.duration();
    return d > 0 ? this.currentTime() / d : 0;
  });
  readonly hasTrack = computed(() => this.currentTrack() !== null);
  readonly effectiveVolume = computed(() => (this.muted() ? 0 : this.volume()));

  constructor() {
    const a = this.audio;
    a.preload = 'metadata';
    a.addEventListener('timeupdate', () => this.currentTime.set(a.currentTime));
    a.addEventListener('durationchange', () => this.duration.set(a.duration || 0));
    a.addEventListener('loadedmetadata', () => {
      this.duration.set(a.duration || 0);
      this.syncCurrentDuration(a.duration || 0);
    });
    a.addEventListener('play', () => this.isPlaying.set(true));
    a.addEventListener('playing', () => this.isPlaying.set(true));
    a.addEventListener('pause', () => this.isPlaying.set(false));
    a.addEventListener('ended', () => this.onEnded());

    effect(() => {
      a.volume = this.effectiveVolume();
    });
  }

  /** Plays `track`, using `context` as the surrounding queue (album/songs list). */
  play(track: Track, context: Track[]): void {
    const list = context.length ? context : [track];
    const start = Math.max(0, list.indexOf(track));
    this.queue.set(list);
    this.index.set(start);
    this.load(list[start], true);
  }

  togglePlay(): void {
    if (!this.currentTrack()) return;
    if (this.audio.paused) {
      void this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  next(): void {
    const list = this.queue();
    if (!list.length) return;

    if (this.shuffle()) {
      this.index.set(this.randomIndex(list.length));
    } else {
      const nextIndex = this.index() + 1;
      if (nextIndex >= list.length) {
        if (this.repeat() === 'off') {
          this.stop();
          return;
        }
        this.index.set(0);
      } else {
        this.index.set(nextIndex);
      }
    }
    this.load(list[this.index()], true);
  }

  previous(): void {
    // Match Apple Music: restart the track if we're >3s in, otherwise go back.
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    const list = this.queue();
    if (!list.length) return;
    const prevIndex = this.index() - 1;
    this.index.set(prevIndex < 0 ? list.length - 1 : prevIndex);
    this.load(list[this.index()], true);
  }

  seek(seconds: number): void {
    this.audio.currentTime = seconds;
    this.currentTime.set(seconds);
  }

  seekFraction(fraction: number): void {
    const d = this.duration();
    if (d > 0) this.seek(fraction * d);
  }

  setVolume(value: number): void {
    this.volume.set(Math.min(1, Math.max(0, value)));
    if (value > 0) this.muted.set(false);
  }

  toggleMute(): void {
    this.muted.update((m) => !m);
  }

  toggleShuffle(): void {
    this.shuffle.update((s) => !s);
  }

  cycleRepeat(): void {
    this.repeat.update((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }

  private load(track: Track, autoplay: boolean): void {
    this.currentTrack.set(track);
    this.duration.set(track.duration || 0);
    this.currentTime.set(0);
    this.audio.src = track.url;
    this.audio.load();
    if (autoplay) void this.audio.play();
  }

  private stop(): void {
    this.audio.pause();
    this.seek(0);
    this.isPlaying.set(false);
  }

  private onEnded(): void {
    if (this.repeat() === 'one') {
      this.seek(0);
      void this.audio.play();
      return;
    }
    this.next();
  }

  private randomIndex(length: number): number {
    if (length <= 1) return 0;
    let i = this.index();
    while (i === this.index()) i = Math.floor(Math.random() * length);
    return i;
  }

  private syncCurrentDuration(duration: number): void {
    const current = this.currentTrack();
    if (current && duration > 0 && !current.duration) {
      current.duration = duration;
    }
  }
}
