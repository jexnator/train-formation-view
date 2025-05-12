import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SbbIconModule } from '@sbb-esta/angular/icon';
import { SbbLoadingIndicatorModule } from '@sbb-esta/angular/loading-indicator';
import { SbbAlertModule } from '@sbb-esta/angular/alert';
import { SbbTooltipModule } from '@sbb-esta/angular/tooltip';
import { FormationService, ApiError } from '../../services/formation.service';
import { TrainVisualization, TrainWagon, TrainSection, WagonAttribute } from '../../models/formation.model';
import { Subscription } from 'rxjs';
import { formatDate } from '@angular/common';

/**
 * @fileoverview Train formation visualization component for SKI+ application
 * 
 * This component handles the visualization of train formations including:
 * - Interactive sector-based train composition rendering
 * - Wagon class and attribute display
 * - Stop selection and navigation
 * - Dynamic scaling and positioning for precise visualization
 * - Tooltip information for wagons and connections
 * 
 * The visualization uses SVG elements with absolute positioning for
 * pixel-perfect rendering of train car formations with sector boundaries.
 */

/**
 * Constants for precise positioning and layout
 * These values are critical for proper wagon alignment and must remain consistent
 */
const WAGON_WIDTH = 100; // Width in pixels for each wagon
const CONNECTOR_WIDTH = 10; // Width in pixels for connectors between wagons
const TOTAL_WAGON_UNIT = WAGON_WIDTH + CONNECTOR_WIDTH; // 110px per wagon+connector unit

/**
 * Component for visualizing train formations with sectors and wagons
 */
@Component({
  selector: 'app-train-formation',
  standalone: true,
  imports: [
    CommonModule, 
    SbbIconModule, 
    SbbLoadingIndicatorModule, 
    SbbAlertModule, 
    SbbTooltipModule
  ],
  templateUrl: './train-formation.component.html',
  styleUrl: './train-formation.component.scss'
})
export class TrainFormationComponent implements OnInit, OnDestroy {
  /** Current train formation visualization data */
  trainFormation: TrainVisualization | null = null;
  
  /** Index of the currently selected stop in the journey */
  selectedStopIndex = 0;
  
  /** Flag indicating whether data is currently being loaded */
  loading = false;
  
  /** Current API error message if a request failed */
  apiError: ApiError | null = null;
  
  /** Flag indicating if a search has been performed (controls initial display) */
  hasSearched = false;
  
  /** Collection of subscriptions for cleanup */
  private subscriptions: Subscription[] = [];
  
  constructor(private formationService: FormationService) {}
  
  /**
   * Initializes component by subscribing to formation service observables
   * for formation data, selected stop, error states, and loading status
   */
  ngOnInit(): void {
    // Subscribe to formation data changes
    this.subscriptions.push(
      this.formationService.currentFormation$.subscribe(formation => {
        this.trainFormation = formation;
        
        // Maintain search state even when result is null
        if (formation === null) {
          // Only maintain hasSearched=true if we've already done a search
          if (this.hasSearched) {
            this.hasSearched = true;
          }
        } else {
          this.hasSearched = true;
        }
      })
    );
    
    // Subscribe to stop index changes
    this.subscriptions.push(
      this.formationService.currentStopIndex$.subscribe(index => {
        this.selectedStopIndex = index;
      })
    );
    
    // Subscribe to API error updates
    this.subscriptions.push(
      this.formationService.currentError$.subscribe(error => {
        this.apiError = error;
        
        // If an error is returned, we've performed a search
        if (error) {
          this.hasSearched = true;
        }
      })
    );
    
    // Subscribe to loading status
    this.subscriptions.push(
      this.formationService.loading$.subscribe(isLoading => {
        this.loading = isLoading;
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
   * Updates the selected stop to display its formation
   * @param index Index of the stop to select
   */
  selectStop(index: number): void {
    this.formationService.updateSelectedStop(index);
  }
  
  /**
   * Dismisses the current error alert and resets search state
   */
  dismissError(): void {
    this.formationService.clearError();
    this.apiError = null;
    // Hide the entire component when error is dismissed
    this.hasSearched = false;
  }
  
  /**
   * Determines appropriate alert type based on error status code
   * @param statusCode HTTP status code from the error
   * @returns SBB alert component type (error, warning, or info)
   */
  getAlertType(statusCode: number): string {
    if (statusCode >= 500) {
      return 'error';
    } else if (statusCode === 404) {
      return 'warning';
    } else {
      return 'info';
    }
  }
  
  /**
   * Get direction icon for wagon
   * @param wagon The wagon to get icon for
   * @returns Icon identifier string
   */
  getDirectionIcon(wagon: TrainWagon): string {
    return '';
  }
  
  /**
   * Get CSS classes for a wagon based on its properties
   * @param wagon The wagon to get classes for
   * @returns Array of CSS class names
   */
  getWagonClasses(wagon: TrainWagon): string[] {
    const classes = ['train-wagon'];
    if (wagon.type === 'locomotive') {
      classes.push('locomotive');
    }
    if (wagon.noAccessToPrevious || wagon.noAccessToNext) {
      classes.push('no-access');
    }
    
    // Add status-based classes
    if (wagon.statusCodes && wagon.statusCodes.length > 0) {
      if (wagon.statusCodes.includes('Closed')) {
        classes.push('wagon-closed');
      }
      if (wagon.statusCodes.includes('Reserved for transit')) {
        classes.push('wagon-reserved');
      }
      if (wagon.statusCodes.includes('Open but unserviced')) {
        classes.push('wagon-unserviced');
      }
    }
    
    return classes;
  }
  
  /**
   * Get CSS class for a sector
   * @param section The train section to get class for
   * @returns CSS class string for the sector
   */
  getSectorClasses(section: TrainSection): string {
    return `sector-${section.sector.toLowerCase()}`;
  }
  
  /**
   * Format a date string or Date object to localized format
   * @param date Date to format
   * @returns Formatted date string in dd.MM.yyyy format
   */
  formatDate(date: string | Date): string {
    if (!date) return '';
    return formatDate(date, 'dd.MM.yyyy', 'en-US');
  }
  
  /**
   * Group wagon attributes for better display
   * @param attributes List of wagon attributes
   * @returns Grouped attributes for UI display
   */
  getAttributeGroups(attributes: WagonAttribute[]): {icon: string, label: string}[][] {
    // Group attributes by type for better display
    const accessibilityAttrs = attributes.filter(attr => 
      ['BHP', 'NF', 'KW'].includes(attr.code));
    
    const serviceAttrs = attributes.filter(attr => 
      ['BZ', 'FZ'].includes(attr.code));
    
    const bikeAttrs = attributes.filter(attr => 
      ['VH', 'VR'].includes(attr.code));
    
    const otherAttrs = attributes.filter(attr => 
      !['BHP', 'NF', 'KW', 'BZ', 'FZ', 'VH', 'VR'].includes(attr.code));
    
    // Build groups based on what's available
    const groups: WagonAttribute[][] = [];
    if (accessibilityAttrs.length > 0) groups.push(accessibilityAttrs);
    if (serviceAttrs.length > 0) groups.push(serviceAttrs);
    if (bikeAttrs.length > 0) groups.push(bikeAttrs);
    if (otherAttrs.length > 0) groups.push(otherAttrs);
    
    return groups as {icon: string, label: string}[][];
  }
  
  /**
   * Calculate sector width with absolute precision
   * @param section Train section to calculate width for
   * @returns Width in pixels
   */
  getSectorWidth(section: TrainSection): number {
    const totalWagons = section.wagons.length;
    
    if (totalWagons === 0) {
      return 0;
    }
    
    // Each sector consists of:
    // 1. All its wagons (each WAGON_WIDTH)
    // 2. All internal connectors between its wagons (each CONNECTOR_WIDTH or LOCOMOTIVE_CONNECTOR_WIDTH)
    
    // For N wagons, we have (N-1) internal connectors
    const wagonWidth = totalWagons * WAGON_WIDTH;
    
    // Count how many locomotive connectors we have in this section
    let locomotiveConnectors = 0;
    for (let i = 0; i < section.wagons.length - 1; i++) {
      // A connector is a locomotive connector if either wagon at either end is a locomotive
      if (section.wagons[i].type === 'locomotive' || section.wagons[i+1].type === 'locomotive') {
        locomotiveConnectors++;
      }
    }
    
    // Calculate the total connector width with adjusted locomotive connectors
    const regularConnectors = (totalWagons - 1) - locomotiveConnectors;
    const connectorWidth = (regularConnectors * CONNECTOR_WIDTH) + (locomotiveConnectors * CONNECTOR_WIDTH);
    
    // Exactly match the entire space occupied by wagons and their connectors
    return wagonWidth + connectorWidth;
  }
  
  /**
   * Get class for wagon connection based on passage access
   * @param wagon The current wagon
   * @param nextWagon The next wagon (or null if last)
   * @returns CSS class string for the connection
   */
  getWagonConnectionClass(wagon: TrainWagon, nextWagon: TrainWagon | null): string {
    if (!nextWagon) {
      return '';
    }
    
    return (wagon.noAccessToNext || nextWagon.noAccessToPrevious) ? 'no-access' : '';
  }
  
  /**
   * Get inline style object for wagon connections
   * @returns Style object with consistent dimensions
   */
  getWagonConnectionStyle(): object {
    // All connectors MUST have identical dimensions
    return {
      'height': '50px', // Match height of wagons
      'width': `${CONNECTOR_WIDTH}px` // Exact connector width
    };
  }
  
  /**
   * Calculate the position of sector label with perfect centering
   * @param section Train section to position label for
   * @returns Style object with position properties
   */
  getSectorLabelStyle(section: TrainSection): object {
    const wagons = section.wagons.length;
    
    if (wagons === 0) {
      return { 'visibility': 'hidden' };
    }
    
    // Calculate the position of this sector
    const sectorPosition = this.getSectorPosition(section);
    
    // Exact center calculation based on sector width
    const sectorWidth = this.getSectorWidth(section);
    const centerPosition = sectorPosition + (sectorWidth / 2);
    
    // Position is always exact center - no approximations
    return { 
      'left': `${centerPosition}px`, 
      'transform': 'translateX(-50%)',
      'z-index': '5'  // Ensure the label is above boundaries
    };
  }
  
  /**
   * Calculate position for sector highlights (precision critical)
   * @param section Train section to calculate position for
   * @returns Position in pixels
   */
  getSectorPosition(section: TrainSection): number {
    const allSections = this.trainFormation!.sections;
    const sectionIndex = allSections.indexOf(section);
    
    // If it's the first section, position is always 1px (to account for padding)
    if (sectionIndex === 0) {
      return 1;
    }
    
    // Count exactly how many wagons come before this section
    let wagonsBeforeSection = 0;
    let locomotivesBefore = 0;
    
    for (let i = 0; i < sectionIndex; i++) {
      wagonsBeforeSection += allSections[i].wagons.length;
      
      // Count locomotives before this section for connector adjustments
      for (let j = 0; j < allSections[i].wagons.length - 1; j++) {
        // A connector is a locomotive connector if either wagon at either end is a locomotive
        if (allSections[i].wagons[j].type === 'locomotive' || 
            (j+1 < allSections[i].wagons.length && allSections[i].wagons[j+1].type === 'locomotive')) {
          locomotivesBefore++;
        }
      }
    }
    
    // Calculate exact position with adjusted locomotive connectors:
    // (total wagons before * WAGON_WIDTH) + 
    // ((regular connectors * CONNECTOR_WIDTH) + (locomotive connectors * LOCOMOTIVE_CONNECTOR_WIDTH))
    const connectorsBefore = Math.max(0, wagonsBeforeSection - 1);
    const regularConnectorsBefore = connectorsBefore - locomotivesBefore;
    const connectorWidth = (regularConnectorsBefore * CONNECTOR_WIDTH) + (locomotivesBefore * CONNECTOR_WIDTH);
    
    // Adding 1px to account for the container padding
    return (wagonsBeforeSection * WAGON_WIDTH) + connectorWidth + 1;
  }
  
  /**
   * Get flat list of all wagons across all sectors
   * @returns Array of all wagons in order
   */
  getAllWagons(): TrainWagon[] {
    if (!this.trainFormation) {
      return [];
    }
    
    // Extract all wagons from all sections into a flat list
    return this.trainFormation.sections.reduce((wagons, section) => {
      return wagons.concat(section.wagons);
    }, [] as TrainWagon[]);
  }
  
  /**
   * Get previous wagon from the flat list
   * @param currentIndex Current wagon index
   * @returns Previous wagon or undefined
   */
  getPreviousWagon(currentIndex: number): TrainWagon {
    const allWagons = this.getAllWagons();
    return allWagons[currentIndex - 1];
  }
  
  /**
   * Get next wagon from the flat list
   * @param currentIndex Current wagon index
   * @returns Next wagon or undefined
   */
  getNextWagon(currentIndex: number): TrainWagon {
    const allWagons = this.getAllWagons();
    return allWagons[currentIndex + 1];
  }

  /**
   * Get sector boundary type for improved visualization
   * @param section Train section to check boundary for
   * @param isLeft Whether to check left or right boundary
   * @returns CSS class string for the boundary
   */
  getSectorBoundaryClass(section: TrainSection, isLeft: boolean): string {
    const allSections = this.trainFormation!.sections;
    const sectionIndex = allSections.indexOf(section);
    
    if (isLeft) {
      return sectionIndex === 0 ? 'boundary-start' : 'boundary-middle';
    } else {
      return sectionIndex === allSections.length - 1 ? 'boundary-end' : 'boundary-middle';
    }
  }

  /**
   * Calculate precise sector boundary position
   * @param sectionIndex Index of the section
   * @returns Position in pixels
   */
  getSectorBoundaryPosition(sectionIndex: number): number {
    const allSections = this.trainFormation!.sections;
    let position = 0;
    
    // If it's the first sector, there's no left boundary
    if (sectionIndex === 0) {
      return 0;
    }
    
    // For all previous sectors, sum their widths
    for (let i = 0; i < sectionIndex; i++) {
      const section = allSections[i];
      const wagons = section.wagons.length;
      
      // Add the width of all wagons in this sector
      position += wagons * WAGON_WIDTH;
      
      // Add the width of all internal connections in this sector
      position += (wagons - 1) * CONNECTOR_WIDTH;
    }
    
    // Now we're at the exact start of the connector between sectors
    // Add half the connector width to be exactly in the middle
    position += CONNECTOR_WIDTH / 2;
    
    return position;
  }

  /**
   * Calculate exact sector boundary position with precise adjustments
   * @param sectionIndex Index of the section
   * @returns Position in pixels
   */
  getExactSectorBoundaryPosition(sectionIndex: number): number {
    if (sectionIndex <= 0) return 1; // Start at 1px to ensure full visibility
    
    const allSections = this.trainFormation!.sections;
    
    // Count total wagons before this sector index
    let totalPreviousWagons = 0;
    let totalLocomotivesBefore = 0;
    
    for (let i = 0; i < sectionIndex; i++) {
      totalPreviousWagons += allSections[i].wagons.length;
      
      // Count locomotives in previous sections
      for (let j = 0; j < allSections[i].wagons.length - 1; j++) {
        // A connector is a locomotive connector if either wagon at either end is a locomotive
        if (allSections[i].wagons[j].type === 'locomotive' || 
            (j+1 < allSections[i].wagons.length && allSections[i].wagons[j+1].type === 'locomotive')) {
          totalLocomotivesBefore++;
        }
      }
    }
    
    // The sector boundary position is:
    // (Number of wagons × wagon width) + 
    // ((Number of regular connectors × connector width) + (Number of locomotive connectors × locomotive connector width))
    const wagonPart = totalPreviousWagons * WAGON_WIDTH;
    const totalConnectorsBefore = totalPreviousWagons - 1;
    const regularConnectorsBefore = totalConnectorsBefore - totalLocomotivesBefore;
    const connectorPart = (regularConnectorsBefore * CONNECTOR_WIDTH) + (totalLocomotivesBefore * CONNECTOR_WIDTH);
    
    // Exact boundary position in the middle of the connector between sectors
    // Adding 1px to ensure proper alignment with the container padding
    return wagonPart + connectorPart + (CONNECTOR_WIDTH / 2) + 1;
  }

  /**
   * Calculate total width of all wagons and connectors for horizontal line
   * @returns Total width in pixels
   */
  getTotalTrainWidth(): number {
    if (!this.trainFormation) {
      return 0;
    }
    
    // Count total wagons
    const totalWagons = this.getAllWagons().length;
    
    if (totalWagons === 0) {
      return 0;
    }
    
    // Count total locomotives for connector width adjustments
    let totalLocomotives = 0;
    const allWagons = this.getAllWagons();
    for (let i = 0; i < allWagons.length - 1; i++) {
      // A connector is a locomotive connector if either wagon at either end is a locomotive
      if (allWagons[i].type === 'locomotive' || allWagons[i+1].type === 'locomotive') {
        totalLocomotives++;
      }
    }
    
    // Total width = (Number of wagons × wagon width) + (Connector width adjustments)
    // For N wagons we have (N-1) connectors
    const totalConnectors = totalWagons - 1;
    const regularConnectors = totalConnectors - totalLocomotives;
    const connectorWidth = (regularConnectors * CONNECTOR_WIDTH) + (totalLocomotives * CONNECTOR_WIDTH);
    
    // Adding 2px (1px padding on each side) to ensure proper alignment
    return (totalWagons * WAGON_WIDTH) + connectorWidth + 2;
  }

  /**
   * Calculate the midpoint of a sector based on boundary positions
   * @param sectionIndex Index of the section
   * @returns Midpoint position in pixels
   */
  getSectorMidpoint(sectionIndex: number): number {
    const allSections = this.trainFormation!.sections;
    
    // For first section, get position between start and first boundary
    if (sectionIndex === 0) {
      const rightBoundary = this.getExactSectorBoundaryPosition(1);
      return (1 + rightBoundary) / 2; // 1px is the left boundary
    }
    
    // For last section, get position between last boundary and end
    if (sectionIndex === allSections.length - 1) {
      const leftBoundary = this.getExactSectorBoundaryPosition(sectionIndex);
      const totalWidth = this.getTotalTrainWidth() - 1; // -1 for right boundary
      return (leftBoundary + totalWidth) / 2;
    }
    
    // For middle sections, get position between its boundaries
    const leftBoundary = this.getExactSectorBoundaryPosition(sectionIndex);
    const rightBoundary = this.getExactSectorBoundaryPosition(sectionIndex + 1);
    
    return (leftBoundary + rightBoundary) / 2;
  }

  /**
   * Check if wagon is the first in the train
   * @param index Wagon index
   * @returns true if first wagon
   */
  isFirstWagon(index: number): boolean {
    return index === 0;
  }

  /**
   * Check if wagon is the last in the train
   * @param index Wagon index
   * @returns true if last wagon
   */
  isLastWagon(index: number): boolean {
    const allWagons = this.getAllWagons();
    return index === allWagons.length - 1;
  }

  /**
   * Check if the wagon needs a sloped left edge
   * @param wagon The wagon to check
   * @param index Wagon index
   * @returns true if sloped left edge needed
   */
  needsSlopedLeftEdge(wagon: TrainWagon, index: number): boolean {
    // If this is the first wagon and not a locomotive, it needs a sloped left edge
    if (this.isFirstWagon(index) && wagon.type !== 'locomotive') {
      return true;
    }
    
    // If the wagon has no access to previous wagon (but isn't the first one), it needs a sloped left edge
    // Don't apply this to locomotives
    if (!this.isFirstWagon(index) && wagon.noAccessToPrevious && wagon.type !== 'locomotive') {
      return true;
    }
    
    return false;
  }

  /**
   * Check if the wagon needs a sloped right edge
   * @param wagon The wagon to check
   * @param index Wagon index
   * @returns true if sloped right edge needed
   */
  needsSlopedRightEdge(wagon: TrainWagon, index: number): boolean {
    // If this is the last wagon and not a locomotive, it needs a sloped right edge
    if (this.isLastWagon(index) && wagon.type !== 'locomotive') {
      return true;
    }
    
    // If the wagon has no access to next wagon (but isn't the last one), it needs a sloped right edge
    // Don't apply this to locomotives
    if (!this.isLastWagon(index) && wagon.noAccessToNext && wagon.type !== 'locomotive') {
      return true;
    }
    
    return false;
  }

  /**
   * Get the SVG URL for a sector pictogram from GitHub
   * @param sector The sector letter (A, B, C, etc.)
   * @returns URL to the sector SVG on GitHub
   */
  getSectorSvgUrl(sector: string): string {
    // Handle N/A or empty sectors
    if (!sector || sector === 'N/A') {
      return '';
    }
    
    // Convert to lowercase to match filenames
    const sectorLetter = sector.toLowerCase();
    
    // Return the raw GitHub URL for the sector SVG
    return `https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/sector-${sectorLetter}.svg`;
  }

  /**
   * Get the SVG URL for the no-passage icon from GitHub
   * @returns URL to the no-passage SVG on GitHub
   */
  getNoPassageSvgUrl(): string {
    return 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/icons/no-passage.svg';
  }

  /**
   * Get the SVG URL for the entry icon based on wagon attributes
   * @param wagon The wagon to check for low floor entry attribute
   * @returns URL to the appropriate entry SVG on GitHub
   */
  getEntryIconUrl(wagon: TrainWagon): string {
    if (this.hasLowFloorEntry(wagon)) {
      return 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/icons/low-floor-entry.svg';
    } else {
      return 'https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/icons/entry-with-steps.svg';
    }
  }

  /**
   * Check if a wagon has the low floor entry attribute
   * @param wagon The wagon to check
   * @returns true if the wagon has low floor entry
   */
  hasLowFloorEntry(wagon: TrainWagon): boolean {
    return wagon.attributes.some(attr => ['NF', 'KW'].includes(attr.code));
  }

  /**
   * Get the SVG URL for an attribute pictogram
   * @param attributeCode The attribute code to map to a pictogram
   * @returns URL to the appropriate pictogram SVG on GitHub
   */
  getAttributePictogramUrl(attributeCode: string): string {
    const pictogramMap: { [key: string]: string } = {
      'BHP': 'wheelchair.svg',
      'VH': 'bike-hooks.svg',
      'VR': 'bike-hooks-reservation.svg',
      'BZ': 'business.svg',
      'FZ': 'family-zone.svg',
      'LA': 'lugage.svg',
      'WR': 'restaurant.svg',
      'WLS': 'couchette.svg',
      'KW': 'stroller.svg',
    };
    
    const pictogram = pictogramMap[attributeCode] || '';
    if (!pictogram) return '';
    
    return `https://raw.githubusercontent.com/jexnator/train-view-svg-library/main/pictos/${pictogram}`;
  }

  /**
   * Filter which attributes should be displayed as pictograms
   * @param wagon The wagon to get pictogram attributes for
   * @returns Array of attribute codes that should be shown as pictograms
   */
  getWagonPictogramAttributes(wagon: TrainWagon): string[] {
    // Get attribute codes that should be shown as pictograms
    const displayableCodes = [
      'BHP', 'VH', 'VR', 'BZ', 'FZ', 'LA', 'WR', 'WLS', 'KW'
    ];
    
    // Don't show restaurant pictogram (WR) when wagon is unserviced
    let filteredCodes = displayableCodes;
    if (wagon.statusCodes && wagon.statusCodes.includes('Open but unserviced')) {
      filteredCodes = displayableCodes.filter(code => code !== 'WR');
    }
    
    // Filter the wagon attributes to include only those we want to display as pictograms
    // This excludes NF (low floor) as it's already shown as an entry icon
    return wagon.attributes
      .filter(attr => filteredCodes.includes(attr.code))
      .map(attr => attr.code);
  }

  /**
   * Check if the wagon has any pictogram attributes to display
   * @param wagon The wagon to check
   * @returns true if the wagon has pictogram attributes
   */
  hasWagonPictograms(wagon: TrainWagon): boolean {
    return this.getWagonPictogramAttributes(wagon).length > 0;
  }

  /**
   * Get attribute label by its code
   * @param wagon The wagon containing the attributes
   * @param attrCode The attribute code to look up
   * @returns The label of the attribute or empty string if not found
   */
  getAttributeLabelByCode(wagon: TrainWagon, attrCode: string): string {
    const attribute = wagon.attributes.find(attr => attr.code === attrCode);
    return attribute ? attribute.label : '';
  }
}
