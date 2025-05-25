import { Component, ViewEncapsulation, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { SearchFormComponent } from './components/search-form/search-form.component';
import { TrainFormationComponent } from './components/train-formation/train-formation.component';
import { TrainLegendComponent } from './components/train-legend/train-legend.component';
import { FormationService } from './services/formation.service';
import { Subscription, BehaviorSubject } from 'rxjs';
import { ScrollService } from './services/scroll.service';

/**
 * @fileoverview Root component for the SKI+ Train Formation Visualization application
 * 
 * This component serves as the primary container and orchestrates:
 * - Main application layout with header
 * - Search form for train lookup
 * - Train formation visualization component
 * - Legend component displaying wagon and sector information
 * 
 * The component manages state for showing/hiding the legend based on
 * search results and error conditions.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    HeaderComponent,
    SearchFormComponent,
    TrainFormationComponent,
    TrainLegendComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Application title displayed in the header */
  title = 'Train Formation Visualization';
  
  /** Controls visibility of the legend section (shown only after successful search) */
  showLegend = false;
  
  /** Dynamic bottom spacing height */
  bottomSpacingHeight = '0px';
  
  /** Subject to notify when spacing calculation is complete */
  private spacingReady$ = new BehaviorSubject<boolean>(false);
  
  /** Collection of subscriptions for cleanup on component destruction */
  private subscriptions: Subscription[] = [];
  
  constructor(
    private formationService: FormationService,
    private scrollService: ScrollService
  ) {}
  
  ngAfterViewInit() {
    // Force initial position to anchor point
    const searchForm = document.querySelector('app-search-form');
    if (!searchForm) return;
    
    // Force initial scroll to top
    this.scrollService.scrollToTop();
    
    // Then position search form at anchor
    this.scrollService.scrollToAnchor(searchForm, 'instant');
  }
  
  /**
   * Initializes component and subscribes to formation service observables
   * to manage legend visibility and dynamic spacing based on search results
   */
  ngOnInit(): void {
    // Monitor formation data changes
    this.subscriptions.push(
      this.formationService.currentFormation$.subscribe(formation => {
        // Show legend when formation data is available
        this.showLegend = !!formation;
        
        if (formation) {
          // Reset spacing ready state
          this.spacingReady$.next(false);
          
          // Ensure components are rendered before calculating spacing
          requestAnimationFrame(() => {
            // Initial spacing calculation
            this.calculateDynamicSpacing();
            
            // Double check spacing after a short delay
            setTimeout(() => {
              this.calculateDynamicSpacing();
              
              // Final verification of spacing
              requestAnimationFrame(() => {
                this.calculateDynamicSpacing();
                this.spacingReady$.next(true);
              });
            }, 100);
          });
        } else {
          this.bottomSpacingHeight = '0px';
          this.spacingReady$.next(false);
        }
      })
    );
    
    // Monitor error state
    this.subscriptions.push(
      this.formationService.currentError$.subscribe(error => {
        if (error) {
          this.showLegend = false;
          this.bottomSpacingHeight = '0px';
          this.spacingReady$.next(false);
        }
      })
    );
  }
  
  /**
   * Returns an observable that emits true when spacing calculation is complete
   */
  getSpacingReadyState() {
    return this.spacingReady$.asObservable();
  }
  
  /**
   * Calculates the required bottom spacing based on viewport height
   * to ensure the train formation can always reach the 78px anchor point.
   * Maintains consistent spacing across all viewport sizes.
   */
  private calculateDynamicSpacing() {
    const ANCHOR_POINT = 78; // Fixed header height as anchor point
    const MIN_SPACING = 40; // Minimum spacing to maintain
    
    // Get all relevant elements
    const header = document.querySelector('app-header');
    const searchForm = document.querySelector('app-search-form');
    const trainFormation = document.querySelector('app-train-formation');
    const trainLegend = document.querySelector('app-train-legend');
    const footer = document.querySelector('.footer');
    
    if (!trainFormation || !footer) return;

    // Get viewport dimensions
    const viewportHeight = window.innerHeight;
    
    // Calculate heights of all components
    const headerHeight = header?.getBoundingClientRect().height || 0;
    const searchFormHeight = searchForm?.getBoundingClientRect().height || 0;
    const formationHeight = trainFormation.getBoundingClientRect().height;
    const legendHeight = trainLegend?.getBoundingClientRect().height || 0;
    const footerHeight = footer.getBoundingClientRect().height;

    // Calculate minimum required content height for anchor point positioning
    const minRequiredHeight = ANCHOR_POINT + formationHeight + legendHeight + footerHeight + MIN_SPACING;
    
    // Calculate additional spacing needed
    let requiredSpace = Math.max(
      viewportHeight - minRequiredHeight + ANCHOR_POINT,
      MIN_SPACING
    );
    
    // If viewport is larger than content, ensure enough space to scroll formation to anchor
    if (viewportHeight > minRequiredHeight) {
      const extraSpaceNeeded = viewportHeight - minRequiredHeight;
      requiredSpace = Math.max(requiredSpace, extraSpaceNeeded + MIN_SPACING);
    }
    
    // Apply the calculated spacing
    this.bottomSpacingHeight = `${requiredSpace}px`;
    
    // Notify that spacing calculation is complete
    this.spacingReady$.next(true);
    
    // If this is the first calculation after search, ensure proper scroll position
    if (trainFormation && trainFormation.getBoundingClientRect().top !== ANCHOR_POINT) {
      this.scrollService.scrollToAnchor(trainFormation);
    }
  }
  
  /**
   * Performs cleanup by unsubscribing from all subscriptions
   * to prevent memory leaks when component is destroyed
   */
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.spacingReady$.complete();
  }
}
