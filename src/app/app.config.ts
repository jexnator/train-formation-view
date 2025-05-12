import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideClientHydration } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { SbbIconModule } from '@sbb-esta/angular/icon';

import { routes } from './app.routes';

/**
 * Application configuration with providers
 * Sets up:
 * - Zone.js change detection with event coalescing for better performance
 * - Router with the application routes
 * - Animations (loaded asynchronously)
 * - SBB Icon module for the SBB design system icons
 * - HTTP client for API requests
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes), 
    provideAnimationsAsync(),
    importProvidersFrom(SbbIconModule, HttpClientModule)
  ]
};
