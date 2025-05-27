import { Injectable } from '@angular/core';
import { enable as enableDarkMode, disable as disableDarkMode, auto as followSystemColorScheme, isEnabled } from 'darkreader';
import { BehaviorSubject } from 'rxjs';

/**
 * Service to manage the application's theme state using Dark Reader
 * Provides methods to toggle between light and dark mode
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private darkMode = new BehaviorSubject<boolean>(false);
  darkMode$ = this.darkMode.asObservable();

  private readonly DARK_MODE_KEY = 'darkMode';
  private readonly DARK_READER_CONFIG = {
    brightness: 100,
    contrast: 100,
    sepia: 0
  };

  constructor() {
    // Ensure polyfill is available before using Dark Reader
    this.ensureSpreadValuesPolyfill();
    
    // Initialize theme from localStorage or system preference
    const savedPreference = localStorage.getItem(this.DARK_MODE_KEY);
    if (savedPreference !== null) {
      this.setDarkMode(savedPreference === 'true');
    } else {
      this.followSystemPreference();
    }
  }

  /**
   * Toggle between dark and light mode
   */
  toggleDarkMode(): void {
    const newState = !this.darkMode.value;
    this.setDarkMode(newState);
    localStorage.setItem(this.DARK_MODE_KEY, String(newState));
  }

  /**
   * Set dark mode state explicitly
   * @param isDark - Whether to enable dark mode
   */
  private setDarkMode(isDark: boolean): void {
    if (isDark) {
      enableDarkMode(this.DARK_READER_CONFIG);
    } else {
      disableDarkMode();
    }
    this.darkMode.next(isDark);
  }

  /**
   * Follow system color scheme preference
   */
  private followSystemPreference(): void {
    followSystemColorScheme(this.DARK_READER_CONFIG);
    this.darkMode.next(isEnabled());
  }

  /**
   * Get current dark mode state
   * @returns true if dark mode is enabled, false otherwise
   */
  isDarkMode(): boolean {
    return this.darkMode.value;
  }

  /**
 * Polyfill for __spreadValues to fix Dark Reader compatibility issues
 */
  private ensureSpreadValuesPolyfill(): void {
    if (typeof (window as any).__spreadValues === 'undefined') {
      (window as any).__spreadValues = function(target: any, source: any) {
        const result = {};
        for (const key in target) {
          if (Object.prototype.hasOwnProperty.call(target, key)) {
            (result as any)[key] = target[key];
          }
        }
        for (const key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            (result as any)[key] = source[key];
          }
        }
        return result;
      };
    }
  }
}
