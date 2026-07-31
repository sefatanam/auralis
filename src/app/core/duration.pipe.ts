import { Pipe, PipeTransform } from '@angular/core';

/** Formats a number of seconds as `m:ss` (or `h:mm:ss` past an hour). */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(seconds: number | null | undefined): string {
    if (seconds == null || !isFinite(seconds) || seconds < 0) {
      return '--:--';
    }
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const ss = s.toString().padStart(2, '0');
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
    }
    return `${m}:${ss}`;
  }
}
