import { Component, ViewEncapsulation, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { SearchFormComponent } from './components/search-form/search-form.component';
import { TrainFormationComponent } from './components/train-formation/train-formation.component';
import { TrainLegendComponent } from './components/train-legend/train-legend.component';
import { FormationService } from './services/formation.service';
import { Subscription } from 'rxjs';

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
          // Wait for components to render before calculating spacing
          setTimeout(() => {
            this.calculateDynamicSpacing();
          }, 100);
        } else {
          // Reset spacing when no formation is shown
          this.bottomSpacingHeight = '0px';
        }
      })
    );
    
    // Monitor error state
    this.subscriptions.push(
      this.formationService.currentError$.subscribe(error => {
        if (error) {
          this.showLegend = false;
          this.bottomSpacingHeight = '0px';
        }
      })
    );
  }
  
  /**
   * Calculates the required bottom spacing based on viewport height
   * and component heights after search results are displayed
   */
  private calculateDynamicSpacing() {
    const trainFormation = document.querySelector('app-train-formation');
    const trainLegend = document.querySelector('app-train-legend');
    const footer = document.querySelector('.footer');
    
    if (!trainFormation || !footer) return;

    const viewportHeight = window.innerHeight;
    const formationRect = trainFormation.getBoundingClientRect();
    const legendRect = trainLegend?.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    
    // Calculate total content height
    const totalContentHeight = formationRect.height + 
                             (legendRect ? legendRect.height : 0) +
                             footerRect.height;
    
    // Calculate required spacing
    const requiredSpace = Math.max(0, viewportHeight - totalContentHeight);
    this.bottomSpacingHeight = `${requiredSpace}px`;
  }
  
  /**
   * Performs cleanup by unsubscribing from all subscriptions
   * to prevent memory leaks when component is destroyed
   */
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
