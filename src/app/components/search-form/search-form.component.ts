import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SbbButtonModule } from '@sbb-esta/angular/button';
import { SbbFormFieldModule } from '@sbb-esta/angular/form-field';
import { SbbInputModule } from '@sbb-esta/angular/input';
import { SbbSelectModule } from '@sbb-esta/angular/select';
import { SbbDatepickerModule } from '@sbb-esta/angular/datepicker';
import { SbbIconModule } from '@sbb-esta/angular/icon';
import { SbbTooltipModule } from '@sbb-esta/angular/tooltip';
import { CommonModule } from '@angular/common';
import { formatDate } from '@angular/common';
import { FormationService } from '../../services/formation.service';
import { SearchParams } from '../../models/formation.model';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

/**
 * @fileoverview Search form component for SKI+ Train Formation Visualization
 * 
 * This component provides:
 * - Input fields for searching train formations by company, date and train number
 * - Form validation and error handling
 * - Automatic scrolling to results after successful search
 * - Integration with SBB Angular UI components (form fields, datepicker, buttons)
 * 
 * The component communicates with the FormationService to fetch train formation data
 * from the OpenTransportData.swiss API.
 */
@Component({
  selector: 'app-search-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SbbButtonModule,
    SbbFormFieldModule,
    SbbInputModule,
    SbbSelectModule,
    SbbDatepickerModule,
    SbbIconModule,
    SbbTooltipModule
  ],
  templateUrl: './search-form.component.html',
  styleUrl: './search-form.component.scss'
})
export class SearchFormComponent implements OnInit, OnDestroy {
  /** Reference to the search form element for scroll positioning */
  @ViewChild('searchFormContent', { static: false }) searchFormContent?: ElementRef;
  
  /** Reactive form group for search parameters */
  searchForm!: FormGroup;
  
  /** Loading state for disabling the search button */
  loading = false;
  
  /** Collection of subscriptions for cleanup */
  private subscriptions: Subscription[] = [];
  
  /** Flag indicating if train formation data is available */
  private trainFormationReady = false;
  
  /** Flag indicating if an error occurred during API request */
  private hasError = false;
  
  /** Available railway companies for dropdown selection */
  evuOptions = [
    { value: 'BLSP', label: 'BLS' },
    { value: 'SBBP', label: 'SBB' },
    { value: 'MBC', label: 'MBC' },
    { value: 'OeBB', label: 'OeBB' },
    { value: 'RhB', label: 'RhB' },
    { value: 'SOB', label: 'SOB' },
    { value: 'THURBO', label: 'THURBO' },
    { value: 'TPF', label: 'TPF' },
    { value: 'TRN', label: 'TRN' },
    { value: 'VDBB', label: 'VDBB' },
    { value: 'ZB', label: 'ZB' }
  ];
  
  constructor(
    private fb: FormBuilder,
    private formationService: FormationService
  ) {}
  
  /** Date limits for the datepicker (today to today+3 days) */
  minDate = new Date();
  maxDate = new Date();

  /**
   * Initializes the search form and subscribes to service updates
   * Sets default values and configures form validation
   */
  ngOnInit() {
    // Configure datepicker range (today to 3 days in future)
    this.maxDate.setDate(this.minDate.getDate() + 3);
    
    // Format today's date for the date input
    const todayFormatted = formatDate(this.minDate, 'yyyy-MM-dd', 'en-US');
    
    // Create form with validation
    this.searchForm = this.fb.group({
      evu: ['SBBP', Validators.required],
      operationDate: [todayFormatted, [Validators.required]],
      trainNumber: ['2167', [Validators.required, Validators.pattern('[0-9]*')]]
    });
    
    // Subscribe to loading status for button state management
    this.subscriptions.push(
      this.formationService.loading$.subscribe(isLoading => {
        this.loading = isLoading;
        
        // Scroll to results when loading completes successfully
        if (!isLoading && this.trainFormationReady && !this.hasError) {
          this.scrollToTrainFormation();
          this.trainFormationReady = false; // Reset for next search
        }
      })
    );
    
    // Monitor formation data availability
    this.subscriptions.push(
      this.formationService.currentFormation$.subscribe(formation => {
        this.trainFormationReady = formation !== null;
      })
    );
    
    // Monitor error state
    this.subscriptions.push(
      this.formationService.currentError$.subscribe(error => {
        this.hasError = error !== null;
      })
    );
  }
  
  /**
   * Performs cleanup by unsubscribing from all subscriptions
   * to prevent memory leaks when component is destroyed
   */
  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  /**
   * Handles form submission and triggers API search request
   * Formats data and passes parameters to formation service
   */
  onSearch() {
    if (this.searchForm.valid) {
      // Format the date and prepare search parameters
      const formValue = this.searchForm.value;
      const params: SearchParams = {
        evu: formValue.evu,
        operationDate: formatDate(formValue.operationDate, 'yyyy-MM-dd', 'en-US'),
        trainNumber: formValue.trainNumber,
        includeOperationalStops: false
      };
      
      // Call the formation service to fetch data
      this.loading = true;
      this.formationService.getFormation(params)
        .pipe(
          finalize(() => {
            this.loading = false;
          })
        )
        .subscribe({
        next: (response) => {
            // Handle successful response
            this.hasError = false;
            this.trainFormationReady = true;
        },
        error: (error) => {
            // Handle error
            this.hasError = true;
            this.trainFormationReady = false;
        }
      });
    }
  }
  
  /**
   * Scrolls to the train formation component after successful search
   * Uses fixed offset to ensure proper positioning with the header
   */
  private scrollToTrainFormation() {
    // Delay the scroll slightly to ensure DOM updates are complete
    setTimeout(() => {
      requestAnimationFrame(() => {
        const trainFormation = document.querySelector('app-train-formation');
        if (!trainFormation) return;

        // Use fixed offset for reliable positioning with fixed header
        const offsetFromTop = -78;
        const elementPosition = trainFormation.getBoundingClientRect().top;
        const offsetPosition = window.pageYOffset + elementPosition + offsetFromTop;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      });
    }, 100); // Small delay to ensure DOM is ready
  }
}
