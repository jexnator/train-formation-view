import { Component, ViewEncapsulation, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { SearchFormComponent } from './components/search-form/search-form.component';
import { TrainFormationComponent } from './components/train-formation/train-formation.component';
import { TrainLegendComponent } from './components/train-legend/train-legend.component';
import { FormationService } from './services/formation.service';
import { Subscription, BehaviorSubject } from 'rxjs';

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
  
  constructor(private formationService: FormationService) {}
  
  ngAfterViewInit() {
    // Initial calculation of spacing
    this.calculateDynamicSpacing();
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
          // Wait for next frame to ensure components are rendered
          requestAnimationFrame(() => {
            // Double RAF to ensure all layouts are complete
            requestAnimationFrame(() => {
              this.calculateDynamicSpacing();
              // Final check after a very short delay
              setTimeout(() => {
                this.calculateDynamicSpacing();
                this.spacingReady$.next(true);
              }, 50);
            });
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
   * and component heights after search results are displayed
   */
  private calculateDynamicSpacing() {
    const FIXED_HEADER_HEIGHT = 78;
    
    // Get all relevant elements
    const header = document.querySelector('app-header');
    const searchForm = document.querySelector('app-search-form');
    const trainFormation = document.querySelector('app-train-formation');
    const trainLegend = document.querySelector('app-train-legend');
    const footer = document.querySelector('.footer');
    
    if (!trainFormation || !footer) return;

    const viewportHeight = window.innerHeight;
    
    // Use performance.now() for precise timing if needed
    // const start = performance.now();
    
    // Calculate heights of all components
    const headerHeight = header?.getBoundingClientRect().height || 0;
    const searchFormHeight = searchForm?.getBoundingClientRect().height || 0;
    const formationHeight = trainFormation.getBoundingClientRect().height;
    const legendHeight = trainLegend?.getBoundingClientRect().height || 0;
    const footerHeight = footer.getBoundingClientRect().height;

    // Calculate total content height including margins/padding
    const totalContentHeight = headerHeight + 
                             searchFormHeight +
                             formationHeight +
                             legendHeight +
                             footerHeight +
                             24; // Account for standard gap between components

    // Calculate the optimal spacing, accounting for fixed header
    let requiredSpace = Math.max(0, viewportHeight - totalContentHeight + FIXED_HEADER_HEIGHT);
    
    // Limit the maximum spacing to prevent excessive whitespace
    const maxSpacing = viewportHeight * 0.3;
    requiredSpace = Math.min(requiredSpace, maxSpacing);

    // Only add spacing if we're not already filling the viewport
    if (totalContentHeight < (viewportHeight + FIXED_HEADER_HEIGHT)) {
      this.bottomSpacingHeight = `${requiredSpace}px`;
    } else {
      this.bottomSpacingHeight = '0px';
    }
    
    // console.log('Spacing calculation took:', performance.now() - start, 'ms');
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
