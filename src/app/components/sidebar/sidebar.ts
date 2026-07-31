import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LibraryService } from '../../core/library.service';
import { NavService } from '../../core/nav.service';
import { ThemeService } from '../../core/theme.service';
import { LibraryView } from '../../core/models';

interface NavItem {
  readonly view: LibraryView;
  readonly label: string;
  readonly icon: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  protected readonly library = inject(LibraryService);
  protected readonly nav = inject(NavService);
  protected readonly theme = inject(ThemeService);

  protected readonly items: readonly NavItem[] = [
    { view: 'songs', label: 'Songs', icon: 'music_note' },
    { view: 'albums', label: 'Albums', icon: 'album' },
    { view: 'artists', label: 'Artists', icon: 'person' },
  ];

  protected onSearch(value: string): void {
    this.nav.search.set(value);
    if (value) this.nav.show('songs');
  }
}
