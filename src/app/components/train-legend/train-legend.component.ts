import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SbbIconModule } from '@sbb-esta/angular/icon';
import { FormationService } from '../../services/formation.service';
import { TrainWagon, TrainVisualization } from '../../models/formation.model';
import { Subscription } from 'rxjs';
import { OCCUPANCY_VISUALIZATION } from '../../models/occupancy.model';

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
  
  /** Path to SVG icon */
  svgPath?: string;
  
  /** Additional SVG path for sector range display (end sector) */
  endSvgPath?: string;
  
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
  
  /** Legend items for occupancy levels */
  legendOccupancy: LegendAttribute[] = [];
  
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
      this.legendOccupancy = [];
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

    // Update occupancy information based on current formation
    this.updateOccupancy(allWagons);
  }
  
  /**
   * Returns the path for the no-passage SVG icon
   * @returns Local asset path for no-passage icon
   */
  private getNoPassageSvgPath(): string {
    return 'assets/icons/no-passage.svg';
  }

  /**
   * Returns the path for the low-floor entry SVG icon
   * @returns Local asset path for low-floor entry icon
   */
  private getLowFloorEntryPath(): string {
    return 'assets/icons/low-floor-entry.svg';
  }

  /**
   * Returns the path for the entry-with-steps SVG icon
   * @returns Local asset path for entry with steps icon
   */
  private getEntryWithStepsPath(): string {
    return 'assets/icons/entry-with-steps.svg';
  }

  /**
   * Returns the path for a sector letter SVG icon
   * @param sectorLetter The sector letter to get the icon for
   * @returns Local asset path for sector icon
   */
  private getSectorSvgPath(sectorLetter: string): string {
    if (!sectorLetter || sectorLetter === 'N/A') {
      return '';
    }
    return `assets/pictos/sector-${sectorLetter.toLowerCase()}.svg`;
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
    
    // Add class indicators
    if (allWagons.some(wagon => wagon.classes && wagon.classes.length > 0)) {
      this.legendWagonTypes.push({ label: '1st/2nd Class Coach', style: 'mixed' });
    }
    
    // Add closed coach if present (moved to end, before no-passage)
    if (allWagons.some(wagon => wagon.statusCodes && wagon.statusCodes.includes('Closed'))) {
      this.legendWagonTypes.push({ label: 'Closed Coach', style: 'closed' });
    }
    
    // No longer add sector range to wagon types
    // this.addSectorRangeToLegend();
    
    // Add no-passage indicator if present
    if (allWagons.some(wagon => 
        (wagon.noAccessToPrevious || wagon.noAccessToNext) && wagon.type !== 'locomotive')) {
      this.legendWagonTypes.push({ 
        label: 'No passage between cars', 
        svgPath: this.getNoPassageSvgPath() 
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
        label: 'Low Floor Access', 
        svgPath: this.getLowFloorEntryPath() 
      });
    }
    
    // Add entry with steps for non-locomotive wagons without low floor entry
    if (allWagons.some(wagon => 
      wagon.type !== 'locomotive' && 
      !wagon.attributes.some(attr => ['NF', 'KW'].includes(attr.code))
    )) {
      this.legendAccessibility.push({ 
        label: 'Entry with Steps', 
        svgPath: this.getEntryWithStepsPath() 
      });
    }
  }
  
  /**
   * Updates facility legend items based on what's present in the formation
   * @param allWagons Array of all wagons to check for facilities
   */
  private updateFacilities(allWagons: TrainWagon[]): void {
    this.legendFacilities = [];
    
    // First, add platform sectors if available
    this.addPlatformSectorsToFacilities();
    
    // Map of attribute codes to their pictogram paths and labels
    const facilitiesMap: { [key: string]: { label: string, path: string } } = {
      'BHP': { label: 'Wheelchair Spaces', path: 'assets/pictos/wheelchair.svg' },
      'VH': { label: 'Bike Hooks', path: 'assets/pictos/bike-hooks.svg' },
      'VR': { label: 'Bike Hooks Reservation Required', path: 'assets/pictos/bike-hooks-reservation.svg' },
      'BZ': { label: 'Business Zone', path: 'assets/pictos/business.svg' },
      'FZ': { label: 'Family Zone', path: 'assets/pictos/family-zone.svg' },
      'FA': { label: 'Family Zone', path: 'assets/pictos/family-zone.svg' },
      'LA': { label: 'Luggage Space', path: 'assets/pictos/lugage.svg' },
      'WR': { label: 'Restaurant', path: 'assets/pictos/restaurant.svg' },
      'WL': { label: 'Sleeping compartments', path: 'assets/pictos/sleep.svg' },
      'CC': { label: 'Couchette Compartments', path: 'assets/pictos/couchette.svg' },
      'KW': { label: 'Stroller Platform', path: 'assets/pictos/stroller.svg' }
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
        svgPath: facility.path
      });
    });
  }

  /**
   * Adds platform sectors to the facilities section if available at current stop
   */
  private addPlatformSectorsToFacilities(): void {
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
      this.legendFacilities.push({
        label: 'Platform sectors',
        svgPath: this.getSectorSvgPath(firstSector),
        endSvgPath: firstSector !== lastSector ? this.getSectorSvgPath(lastSector) : undefined,
        isRange: true
      });
    }
  }

  /**
   * Updates occupancy legend items based on what's present in the formation
   * @param allWagons Array of all wagons to check for occupancy information
   */
  private updateOccupancy(allWagons: TrainWagon[]): void {
    this.legendOccupancy = [];

    // Collect all unique occupancy levels present in the formation
    const presentOccupancyLevels = new Set<string>();

    allWagons.forEach(wagon => {
      if (wagon.firstClassOccupancy) {
        presentOccupancyLevels.add(wagon.firstClassOccupancy.icon);
      }
      if (wagon.secondClassOccupancy) {
        presentOccupancyLevels.add(wagon.secondClassOccupancy.icon);
      }
    });

    if (presentOccupancyLevels.size === 0) {
      return;
    }

    // Add only the occupancy levels that are present in the formation
    Object.values(OCCUPANCY_VISUALIZATION).forEach(occupancy => {
      if (presentOccupancyLevels.has(occupancy.icon)) {
        this.legendOccupancy.push({
          label: occupancy.label,
          svgPath: `assets/icons/${occupancy.icon}.svg`
        });
      }
    });
  }
} 