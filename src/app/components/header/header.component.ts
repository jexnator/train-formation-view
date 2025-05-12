import { Component } from '@angular/core';
import { SbbHeaderLeanModule } from '@sbb-esta/angular/header-lean';
import { CommonModule } from '@angular/common';

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
  imports: [SbbHeaderLeanModule, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  // Simple component with no logic, hamburger menu is hidden via CSS
}
