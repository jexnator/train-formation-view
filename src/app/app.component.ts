import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
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
export class AppComponent implements OnInit, OnDestroy {
  /** Application title displayed in the header */
  title = 'Train Formation Visualization';
  
  /** Controls visibility of the legend section (shown only after successful search) */
  showLegend = false;
  
  /** Collection of subscriptions for cleanup on component destruction */
  private subscriptions: Subscription[] = [];
  
  constructor(private formationService: FormationService) {}
  
  /**
   * Initializes component and subscribes to formation service observables
   * to manage legend visibility based on search results and errors
   */
  ngOnInit(): void {
    // Monitor formation data changes
    this.subscriptions.push(
      this.formationService.currentFormation$.subscribe(formation => {
        // Show legend when formation data is available
        this.showLegend = !!formation;
      })
    );
    
    // Monitor error state
    this.subscriptions.push(
      this.formationService.currentError$.subscribe(error => {
        if (error) {
          this.showLegend = false;
        }
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
}
