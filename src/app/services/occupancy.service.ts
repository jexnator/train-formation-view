/**
 * @fileoverview Train Occupancy Service SKI+ Train Occupancy Visualization
 * 
 * This service is responsible for:
 * - Downloading and managing occupancy forecast ZIP files
 * - Parsing occupancy data for specific trains and operators
 * - Providing occupancy information for the visualization
 * - Managing cache and data updates
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError, from } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import JSZip from 'jszip';
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
  private readonly ZIP_URL = 'https://data.opentransportdata.swiss/dataset/occupancy-forecast-json-dataset/permalink';
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
   * @returns Observable with occupancy data
   */
  getTrainOccupancy(
    operatorId: string,
    trainNumber: string,
    date: string | Date
  ): Observable<TrainOccupancy | null> {
    // Map operator code to numeric ID
    const numericOperatorId = OPERATOR_MAPPING[operatorId];
    if (!numericOperatorId) {
      console.warn('Unsupported operator:', operatorId);
      return of(null);
    }

    // Normalize train number (remove any prefix like "IC" or "IR" and leading zeros)
    const normalizedTrainNumber = this.normalizeTrainNumber(trainNumber);

    const formattedDate = typeof date === 'string' ? date : formatDate(date, 'yyyy-MM-dd', 'en-US');
    
    // Validate date range
    if (!this.isDateValid(formattedDate)) {
      console.warn('Date out of range for occupancy data:', formattedDate);
      return of(null);
    }

    // Check cache first
    const cacheKey = this.getCacheKey(numericOperatorId, formattedDate);
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData && this.isCacheValid(cachedData.timestamp)) {
      return of(this.findTrainOccupancy(cachedData.data, normalizedTrainNumber));
    }

    // Load data if not in cache
    this.loadingSubject.next(true);
    
    return this.fetchOccupancyData(numericOperatorId, formattedDate).pipe(
      map(data => this.findTrainOccupancy(data, normalizedTrainNumber)),
      catchError(error => {
        console.error('Error fetching occupancy data:', error);
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
   * Fetches occupancy data from the ZIP file
   * @param operatorId Operator ID
   * @param date Operation date
   * @returns Observable with operator occupancy data
   */
  private fetchOccupancyData(
    operatorId: string,
    date: string
  ): Observable<OperatorOccupancy> {
    return this.http.get(this.ZIP_URL, { responseType: 'arraybuffer' }).pipe(
      switchMap(data => from(new JSZip().loadAsync(data))),
      switchMap(zipContent => {
        const filePath = `${date}/operator-${operatorId}.json`;
        const file = zipContent.file(filePath);
        
        if (!file) {
          throw new Error(`Occupancy data not found for operator ${operatorId} on ${date}`);
        }
        
        return from(file.async('string'));
      }),
      map(jsonContent => {
        const occupancyData: OperatorOccupancy = JSON.parse(jsonContent);
        
        // Cache the data
        this.cache.set(this.getCacheKey(operatorId, date), {
          data: occupancyData,
          timestamp: Date.now()
        });
        
        return occupancyData;
      }),
      catchError(error => {
        console.error('Error processing occupancy data:', error);
        return throwError(() => error);
      })
    );
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
    return data.trains.find(train => train.trainNumber === trainNumber) || null;
  }

  /**
   * Normalizes train number by removing prefixes and leading zeros
   * @param trainNumber Train number to normalize
   * @returns Normalized train number
   */
  private normalizeTrainNumber(trainNumber: string): string {
    // Remove any non-numeric prefix (e.g., "IC", "IR", "S")
    const numericPart = trainNumber.replace(/^[A-Za-z\s]+/, '');
    
    // Remove leading zeros and convert to string
    return parseInt(numericPart, 10).toString();
  }
} 