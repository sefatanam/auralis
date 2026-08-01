import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coverGradient, coverLetter } from '../../core/cover';

/** Artwork if present, otherwise a consistent first-letter gradient tile. */
@Component({
  selector: 'app-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src()) {
      <img [src]="src()!" [alt]="name()" />
    } @else {
      <span class="fallback" [style.background]="gradient()">{{ letter() }}</span>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      container-type: size;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .fallback {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      color: rgba(255, 255, 255, 0.92);
      font-weight: 700;
      font-size: 42cqmin;
      line-height: 1;
      letter-spacing: -0.02em;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    }
  `,
})
export class Cover {
  readonly src = input<string | undefined>();
  readonly name = input.required<string>();

  protected readonly gradient = computed(() => coverGradient(this.name()));
  protected readonly letter = computed(() => coverLetter(this.name()));
}
