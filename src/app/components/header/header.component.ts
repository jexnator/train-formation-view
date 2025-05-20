import { Component } from '@angular/core';
import { SbbHeaderLeanModule } from '@sbb-esta/angular/header-lean';
import { SbbIconModule } from '@sbb-esta/angular/icon';
import { SbbButtonModule } from '@sbb-esta/angular/button';
import { SbbTooltipModule } from '@sbb-esta/angular/tooltip';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { Observable } from 'rxjs';

/**
 * @fileoverview Header component for SKI+ Train Formation Visualization
 * 
 * This component implements the application header using the SBB Design System's
 * header-lean component for consistent branding and navigation. The component 
 * provides the top navigation bar with the SKI+ logo and application title.
 */

/**
 * Component for displaying the application header
 * Uses SBB header-lean with customized styling
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    SbbHeaderLeanModule,
    SbbIconModule,
    SbbButtonModule,
    SbbTooltipModule
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  darkMode$: Observable<boolean>;

  constructor(private themeService: ThemeService) {
    this.darkMode$ = this.themeService.darkMode$;
  }

  /**
   * Toggle dark mode state
   */
  toggleDarkMode(): void {
    this.themeService.toggleDarkMode();
  }

  // Simple component with no logic, hamburger menu is hidden via CSS
}
