import { Injectable } from '@angular/core';

/**
 * Service for preloading SVG assets to improve theme switching performance
 * 
 * This service preloads all theme-dependent SVG files into the browser cache
 * so that when users switch between light and dark modes, the images are
 * already available and display immediately without loading delays.
 */
@Injectable({
  providedIn: 'root'
})
export class SvgPreloaderService {
  private preloadedImages = new Set<string>();
  private preloadPromises = new Map<string, Promise<void>>();

  constructor() {}

  /**
   * Preloads all theme-dependent SVG files for both light and dark modes
   * This should be called early in the application lifecycle
   */
  preloadAllSvgs(): Promise<void[]> {
    const svgPaths = this.getAllSvgPaths();
    const promises = svgPaths.map(path => this.preloadSvg(path));
    return Promise.all(promises);
  }

  /**
   * Preloads a single SVG file
   * @param path Path to the SVG file
   * @returns Promise that resolves when the image is loaded
   */
  private preloadSvg(path: string): Promise<void> {
    // Return existing promise if already preloading
    if (this.preloadPromises.has(path)) {
      return this.preloadPromises.get(path)!;
    }

    // Return immediately if already preloaded
    if (this.preloadedImages.has(path)) {
      return Promise.resolve();
    }

    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        this.preloadedImages.add(path);
        this.preloadPromises.delete(path);
        resolve();
      };
      
      img.onerror = () => {
        this.preloadPromises.delete(path);
        console.warn(`Failed to preload SVG: ${path}`);
        resolve(); // Don't reject to avoid breaking the entire preload process
      };
      
      img.src = path;
    });

    this.preloadPromises.set(path, promise);
    return promise;
  }

  /**
   * Gets all SVG paths that need to be preloaded for both themes
   * @returns Array of all SVG file paths
   */
  private getAllSvgPaths(): string[] {
    const themes = ['light', 'dark'];
    const paths: string[] = [];

    // Wagon SVGs
    const wagonTypes = [
      'locomotive',
      'wagon-regular',
      'wagon-left-slope', 
      'wagon-right-slope',
      'wagon-both-slope',
      'wagon-regular-closed',
      'wagon-left-slope-closed',
      'wagon-right-slope-closed', 
      'wagon-both-slope-closed'
    ];

    themes.forEach(theme => {
      wagonTypes.forEach(type => {
        paths.push(`assets/wagons/${type}-${theme}.svg`);
      });
    });

    // Icon SVGs
    const iconTypes = [
      'no-passage',
      'low-floor-entry',
      'entry-with-steps',
      'low-occupancy',
      'medium-occupancy',
      'high-occupancy'
    ];

    themes.forEach(theme => {
      iconTypes.forEach(type => {
        paths.push(`assets/icons/${type}-${theme}.svg`);
      });
    });

    // Sector SVGs (theme-independent but include for completeness)
    const sectors = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    sectors.forEach(sector => {
      paths.push(`assets/pictos/sector-${sector}.svg`);
    });

    // Pictogram SVGs (theme-independent)
    const pictograms = [
      'wheelchair.svg',
      'bike-hooks.svg', 
      'bike-hooks-reservation.svg',
      'business.svg',
      'family-zone.svg',
      'lugage.svg',
      'restaurant.svg',
      'sleep.svg',
      'couchette.svg',
      'stroller.svg'
    ];

    pictograms.forEach(pictogram => {
      paths.push(`assets/pictos/${pictogram}`);
    });

    return paths;
  }

  /**
   * Checks if a specific SVG has been preloaded
   * @param path Path to check
   * @returns true if the SVG is preloaded
   */
  isPreloaded(path: string): boolean {
    return this.preloadedImages.has(path);
  }

  /**
   * Gets the current preload status
   * @returns Object with preload statistics
   */
  getPreloadStatus(): { total: number; loaded: number; percentage: number } {
    const total = this.getAllSvgPaths().length;
    const loaded = this.preloadedImages.size;
    const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
    
    return { total, loaded, percentage };
  }
} 