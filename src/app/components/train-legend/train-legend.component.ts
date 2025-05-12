import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SbbIconModule } from '@sbb-esta/angular/icon';
import { FormationService } from '../../services/formation.service';
import { TrainWagon, TrainVisualization } from '../../models/formation.model';
import { Subscription } from 'rxjs';

/**
 * @fileoverview Legend component for SKI+ Train Formation Visualization
 * 
 * This component dynamically generates and displays the legend for:
 * - Wagon types (locomotive, closed wagon, class indicators)
 * - Platform sectors with sector range visualization
 * - Accessibility features (low floor entry, steps)
 * - Available facilities and amenities (wheelchair spaces, bike hooks, etc.)
 * 
 * The legend content adapts based on the elements present in the current train
 * formation, showing only relevant information to the user.
 */

/**
 * Interface for legend items with icon, label and display properties
 */
export interface LegendAttribute {
  /** Icon identifier from SBB icon library */
  icon?: string;
  
  /** Display label for the legend item */
  label: string;
  
  /** CSS class for custom styling of the item */
  style?: string;
  
  /** URL for external SVG icon */
  svgUrl?: string;
  
  /** Additional SVG URL for sector range display (end sector) */
  endSvgUrl?: string;
  
  /** Indicates if item should be rendered as a range (e.g. sector range) */
  isRange?: boolean;
}

/**
 * Component for displaying legend information about train formation elements
 */
@Component({
  selector: 'app-train-legend',
  standalone: true,
  imports: [
    CommonModule,
    SbbIconModule
  ],
  templateUrl: './train-legend.component.html',
  styleUrl: './train-legend.component.scss'
})
export class TrainLegendComponent implements OnInit, OnDestroy {
  /** Current train formation data */
  trainFormation: TrainVisualization | null = null;
  
  /** Legend items for wagon types and general indicators */
  legendWagonTypes: LegendAttribute[] = [];
  
  /** Legend items for accessibility features */
  legendAccessibility: LegendAttribute[] = [];
  
  /** Legend items for onboard facilities and amenities */
  legendFacilities: LegendAttribute[] = [];
  
  /** Currently selected stop index in the journey */
  private currentStopIndex: number = 0;
  
  /** Collection of subscriptions for cleanup */
  private subscriptions: Subscription[] = [];
  
  constructor(private formationService: FormationService) {}
  
  /**
   * Initializes component by subscribing to formation data changes
   * and updates legend content when data or selected stop changes
   */
  ngOnInit(): void {
    this.subscriptions.push(
      this.formationService.currentFormation$.subscribe(formation => {
        this.trainFormation = formation;
        this.updateLegend();
      })
    );
    
    this.subscriptions.push(
      this.formationService.currentStopIndex$.subscribe(index => {
        this.currentStopIndex = index;
        this.updateLegend();
      })
    );
  }
  
  /**
   * Performs cleanup by unsubscribing from all subscriptions
   * to prevent memory leaks when component is destroyed
   */
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  /**
   * Updates legend items based on the current train formation data
   * to show only elements that are actually present in the formation
   */
  updateLegend(): void {
    if (!this.trainFormation) {
      this.legendWagonTypes = [];
      this.legendAccessibility = [];
      this.legendFacilities = [];
      return;
    }
    
    // Get all wagons across all sections
    const allWagons = this.getAllWagons();
    
    // Update wagon types based on current formation
    this.updateWagonTypes(allWagons);
    
    // Update accessibility features based on current formation
    this.updateAccessibility(allWagons);
    
    // Update onboard facilities based on current formation
    this.updateFacilities(allWagons);
  }
  
  /**
   * Returns the URL for the no-passage icon from SVG repository
   * @returns URL to the no-passage SVG
   */
  getNoPassageSvgUrl(): string {
    return 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/icons/no-passage.svg';
  }

  /**
   * Returns the URL for the low floor entry icon from SVG repository
   * @returns URL to the low floor entry SVG
   */
  getLowFloorEntryUrl(): string {
    return 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/icons/low-floor-entry.svg';
  }

  /**
   * Returns the URL for the entry with steps icon from SVG repository
   * @returns URL to the entry with steps SVG
   */
  getEntryWithStepsUrl(): string {
    return 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/icons/entry-with-steps.svg';
  }
  
  /**
   * Returns the URL for a specific sector pictogram from SVG repository
   * @param sector The sector letter (A, B, C, etc.)
   * @returns URL to the sector-specific SVG
   */
  getSectorSvgUrl(sector: string): string {
    // Handle N/A or empty sectors
    if (!sector || sector === 'N/A') {
      return '';
    }
    
    // Convert to lowercase to match filename convention
    const sectorLetter = sector.toLowerCase();
    
    return `https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/sector-${sectorLetter}.svg`;
  }
  
  /**
   * Returns a flat array of all wagons across all sections
   * @returns Array of all wagons in the formation
   */
  private getAllWagons(): TrainWagon[] {
    if (!this.trainFormation) {
      return [];
    }
    
    return this.trainFormation.sections.reduce((wagons, section) => {
      return wagons.concat(section.wagons);
    }, [] as TrainWagon[]);
  }
  
  /**
   * Updates wagon type legend items based on what's present in the formation
   * @param allWagons Array of all wagons to check for types
   */
  private updateWagonTypes(allWagons: TrainWagon[]): void {
    this.legendWagonTypes = [];
    
    // Add locomotive if present
    if (allWagons.some(wagon => wagon.type === 'locomotive')) {
      this.legendWagonTypes.push({ label: 'Locomotive', style: 'locomotive' });
    }
    
    // Add closed wagon if present
    if (allWagons.some(wagon => wagon.statusCodes && wagon.statusCodes.includes('Closed'))) {
      this.legendWagonTypes.push({ label: 'Closed Wagon', style: 'closed' });
    }
    
    // Add class indicators
    if (allWagons.some(wagon => wagon.classes && wagon.classes.length > 0)) {
      this.legendWagonTypes.push({ label: '1st/2nd Class', style: 'mixed' });
    }
    
    // Add sector range if sectors are available at current stop
    this.addSectorRangeToLegend();
    
    // Add no-passage indicator if present
    if (allWagons.some(wagon => wagon.noAccessToPrevious || wagon.noAccessToNext)) {
      this.legendWagonTypes.push({ 
        label: 'No passage between cars', 
        svgUrl: this.getNoPassageSvgUrl() 
      });
    }
  }
  
  /**
   * Adds sector range item to legend if sectors are available at current stop
   */
  private addSectorRangeToLegend(): void {
    if (!this.trainFormation || 
        !this.trainFormation.stops || 
        this.trainFormation.stops.length === 0) {
      return;
    }
    
    // Only show sector range if current stop has sectors
    if (!this.trainFormation.stops[this.currentStopIndex].hasSectors) {
      return;
    }
    
    // Get all unique sectors from the sections (excluding N/A)
    const sectors = this.trainFormation.sections
      .map(section => section.sector)
      .filter(sector => sector && sector !== 'N/A');
    
    if (sectors.length === 0) {
      return;
    }
    
    // Sort sectors alphabetically
    sectors.sort();
    
    // Get first and last sector for range display
    const firstSector = sectors[0];
    const lastSector = sectors[sectors.length - 1];
    
    // Add sector range if valid sectors exist
    if (firstSector && lastSector) {
      this.legendWagonTypes.push({
        label: 'Platform sectors',
        svgUrl: this.getSectorSvgUrl(firstSector),
        endSvgUrl: firstSector !== lastSector ? this.getSectorSvgUrl(lastSector) : undefined,
        isRange: true
      });
    }
  }
  
  /**
   * Updates accessibility legend items based on what's present in the formation
   * @param allWagons Array of all wagons to check for accessibility features
   */
  private updateAccessibility(allWagons: TrainWagon[]): void {
    this.legendAccessibility = [];
    
    // Add low floor entry if present
    if (allWagons.some(wagon => wagon.attributes.some(attr => ['NF', 'KW'].includes(attr.code)))) {
      this.legendAccessibility.push({ 
        label: 'Low Floor Entry', 
        svgUrl: this.getLowFloorEntryUrl() 
      });
    }
    
    // Add entry with steps for non-locomotive wagons without low floor entry
    if (allWagons.some(wagon => 
      wagon.type !== 'locomotive' && 
      !wagon.attributes.some(attr => ['NF', 'KW'].includes(attr.code))
    )) {
      this.legendAccessibility.push({ 
        label: 'Entry with Steps', 
        svgUrl: this.getEntryWithStepsUrl() 
      });
    }
  }
  
  /**
   * Updates facility legend items based on what's present in the formation
   * @param allWagons Array of all wagons to check for facilities
   */
  private updateFacilities(allWagons: TrainWagon[]): void {
    this.legendFacilities = [];
    
    // Map of attribute codes to their pictogram URLs and labels
    const facilitiesMap: { [key: string]: { label: string, url: string } } = {
      'BHP': { label: 'Wheelchair Spaces', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/wheelchair.svg' },
      'VH': { label: 'Bike Hooks', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/bike-hooks.svg' },
      'VR': { label: 'Bike Reservation Required', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/bike-hooks-reservation.svg' },
      'BZ': { label: 'Business Zone', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/business.svg' },
      'FZ': { label: 'Family Zone', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/family-zone.svg' },
      'LA': { label: 'Luggage Space', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/lugage.svg' },
      'WR': { label: 'Restaurant', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/restaurant.svg' },
      'WLS': { label: 'Couchette', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/couchette.svg' },
      'KW': { label: 'Stroller Space', url: 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/stroller.svg' },
    };
    
    // Collect all unique attribute codes that are in the facilities map
    const presentFacilities = new Set<string>();
    
    // Check for each facility, excluding restaurant in unserviced cars
    allWagons.forEach(wagon => {
      wagon.attributes.forEach(attr => {
        if (facilitiesMap[attr.code]) {
          // Skip restaurant attributes for unserviced wagons
          if (attr.code === 'WR' && 
              wagon.statusCodes && 
              wagon.statusCodes.includes('Open but unserviced')) {
            return;
          }
          presentFacilities.add(attr.code);
        }
      });
    });
    
    // Add each present facility to the legend
    Array.from(presentFacilities).forEach(code => {
      const facility = facilitiesMap[code];
      this.legendFacilities.push({
        label: facility.label,
        svgUrl: facility.url
      });
    });
  }
} 