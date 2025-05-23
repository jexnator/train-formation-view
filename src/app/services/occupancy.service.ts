/**
 * @fileoverview Train Occupancy Service SKI+ Train Occupancy Visualization
 * 
 * This service is responsible for:
 * - Loading pre-processed occupancy data from GitHub Pages
 * - Providing occupancy information for the visualization
 * - Managing cache and data updates
 * 
 * The service handles missing data gracefully and provides occupancy information
 * only when it's available, without generating errors for missing data.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { formatDate } from '@angular/common';
import { 
  OperatorOccupancy, 
  TrainOccupancy, 
  OccupancyLevel,
  FareClass,
  ExpectedOccupancy,
  OCCUPANCY_VISUALIZATION
} from '../models/occupancy.model';

/**
 * Cache entry for occupancy data
 */
interface OccupancyCache {
  data: OperatorOccupancy;
  timestamp: number;
}

/**
 * Mapping of operator codes to their numeric IDs
 */
const OPERATOR_MAPPING: { [key: string]: string } = {
  '11': '11', // SBB/SBBP
  '33': '33', // BLS
  '65': '65', // Südostbahn
  '82': '82', // Zentralbahn
  'SBBP': '11',
  'BLS': '33',
  'SOB': '65',
  'ZB': '82'
};

/**
 * Service for handling train occupancy data
 */
@Injectable({
  providedIn: 'root'
})
export class OccupancyService {
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private readonly MAX_FORECAST_DAYS = 3;
  
  private cache: Map<string, OccupancyCache> = new Map();
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Gets occupancy data for a specific train and operator
   * @param operatorId Operator ID (e.g. "11" for SBB or "SBBP")
   * @param trainNumber Train number
   * @param date Operation date
   * @returns Observable with occupancy data or null if not available
   */
  getTrainOccupancy(
    operatorId: string,
    trainNumber: string,
    date: string | Date
  ): Observable<TrainOccupancy | null> {
    // Map operator code to numeric ID
    const numericOperatorId = OPERATOR_MAPPING[operatorId];
    if (!numericOperatorId) {
      console.debug('Occupancy data not available for operator:', operatorId);
      return of(null);
    }

    const formattedDate = typeof date === 'string' ? date : formatDate(date, 'yyyy-MM-dd', 'en-US');
    
    // Validate date range
    if (!this.isDateValid(formattedDate)) {
      console.debug('Occupancy data not available for date:', formattedDate);
      return of(null);
    }

    // Check cache first
    const cacheKey = this.getCacheKey(numericOperatorId, formattedDate);
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData && this.isCacheValid(cachedData.timestamp)) {
      return of(this.findTrainOccupancy(cachedData.data, trainNumber));
    }

    // Load data if not in cache
    this.loadingSubject.next(true);
    
    // Construct the URL for the pre-processed data
    const dataUrl = `/train-formation-view/data/occupancy/${formattedDate}/operator-${numericOperatorId}.json`;
    
    return this.http.get<OperatorOccupancy>(dataUrl).pipe(
      map(data => {
        // Cache the data
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
        return this.findTrainOccupancy(data, trainNumber);
      }),
      catchError((error: HttpErrorResponse) => {
        // Handle 404 silently - this just means no occupancy data is available
        if (error.status === 404) {
          console.debug('No occupancy data available for:', { operatorId, date: formattedDate });
        } else {
          console.warn('Error fetching occupancy data:', error);
        }
        return of(null);
      }),
      tap(() => this.loadingSubject.next(false))
    );
  }

  /**
   * Gets occupancy visualization data for a specific class and section
   * @param trainOccupancy Train occupancy data
   * @param fareClass Fare class to check
   * @param fromStation Departure station
   * @param toStation Destination station
   * @returns Occupancy visualization data or null if not available
   */
  getOccupancyVisualization(
    trainOccupancy: TrainOccupancy | null,
    fareClass: FareClass,
    fromStation: string,
    toStation: string
  ) {
    if (!trainOccupancy) return null;

    try {
      // Find matching section
      const section = trainOccupancy.sections.find(s => 
        s.departureStationName === fromStation && 
        s.destinationStationName === toStation
      );

      if (!section) return null;

      // Find occupancy for the specified class
      const occupancy = section.expectedDepartureOccupancies.find(o => 
        o.fareClass === fareClass
      );

      if (!occupancy) return null;

      return OCCUPANCY_VISUALIZATION[occupancy.occupancyLevel];
    } catch (error) {
      // Handle any unexpected data structure issues silently
      console.debug('Error processing occupancy data:', error);
      return null;
    }
  }

  /**
   * Checks if the service is currently loading data
   * @returns Current loading state
   */
  isLoading(): boolean {
    return this.loadingSubject.value;
  }

  /**
   * Validates if a date is within the allowed range for occupancy data
   * @param date Date to check
   * @returns True if date is valid
   */
  private isDateValid(date: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const checkDate = new Date(date);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + this.MAX_FORECAST_DAYS);
    
    return checkDate >= today && checkDate <= maxDate;
  }

  /**
   * Generates a cache key for occupancy data
   * @param operatorId Operator ID
   * @param date Operation date
   * @returns Cache key string
   */
  private getCacheKey(operatorId: string, date: string): string {
    return `${operatorId}_${date}`;
  }

  /**
   * Checks if cached data is still valid
   * @param timestamp Cache timestamp
   * @returns True if cache is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /**
   * Finds occupancy data for a specific train
   * @param data Operator occupancy data
   * @param trainNumber Train number to find
   * @returns Train occupancy data or null if not found
   */
  private findTrainOccupancy(
    data: OperatorOccupancy,
    trainNumber: string
  ): TrainOccupancy | null {
    try {
      // Normalize train number for comparison
      const normalizedSearchNumber = this.normalizeTrainNumber(trainNumber);
      return data.trains.find(train => 
        this.normalizeTrainNumber(train.trainNumber) === normalizedSearchNumber
      ) || null;
    } catch (error) {
      console.debug('Error finding train occupancy:', error);
      return null;
    }
  }

  /**
   * Normalizes train number by removing prefixes and leading zeros
   * @param trainNumber Train number to normalize
   * @returns Normalized train number
   */
  private normalizeTrainNumber(trainNumber: string): string {
    try {
      // Remove any non-numeric prefix (e.g., "IC", "IR", "S")
      const numericPart = trainNumber.replace(/^[A-Za-z\s]+/, '');
      
      // Remove leading zeros and convert to string
      return parseInt(numericPart, 10).toString();
    } catch (error) {
      console.debug('Error normalizing train number:', error);
      return trainNumber; // Return original if normalization fails
    }
  }
} 