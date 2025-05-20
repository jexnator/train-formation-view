/**
 * @fileoverview Train Formation Service SKI+ Train Formation Visualization
 * 
 * This service is responsible for:
 * - Fetching train formation data from the OpenTransportData.swiss API
 * - Parsing wagon attributes, types, and sectors for visual representation
 * - Processing formation string tokens into visualization-friendly data structures
 * - Managing the current state of the visualization (selected stop, error states, loading status)
 * 
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, combineLatest } from 'rxjs';
import { catchError, tap, finalize, map, switchMap } from 'rxjs/operators';
import { ApiResponse, SearchParams, TrainVisualization, TrainWagon, TrainSection, WagonAttribute } from '../models/formation.model';
import { formatDate } from '@angular/common';
import { environment } from '../../environments/environment';
import { OccupancyService } from './occupancy.service';
import { FareClass } from '../models/occupancy.model';

/**
 * Interface for API error information
 */
export interface ApiError {
  statusCode: number;
  message: string;
  technicalDetails?: string;
}

/**
 * Formation String Token Types for parser
 */
enum TokenType {
  SECTOR, 
  FICTITIOUS_WAGON,
  BRACKET_OPEN, 
  BRACKET_CLOSE, 
  PARENTHESIS_OPEN, 
  PARENTHESIS_CLOSE, 
  COMMA,
  BACKSLASH,
  VEHICLE,
  UNKNOWN
}

/**
 * Token for parsing formation strings
 */
interface FormationToken {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Wagon Status Types
 */
enum WagonStatus {
  CLOSED = 'Closed',
  GROUP_BOARDING = 'Group boarding',
  RESERVED_FOR_TRANSIT = 'Reserved for transit',
  UNSERVICED = 'Open but unserviced'
}

/**
 * Core service for handling train formation data with improved parsing logic
 */
@Injectable({
  providedIn: 'root'
})
export class FormationService {
  private apiUrl = 'https://api.opentransportdata.swiss/formations_full';
  private apiKey = environment.apiKey;
  
  // State management via BehaviorSubjects
  private currentFormationSubject = new BehaviorSubject<TrainVisualization | null>(null);
  currentFormation$ = this.currentFormationSubject.asObservable();

  private currentStopIndexSubject = new BehaviorSubject<number>(0);
  currentStopIndex$ = this.currentStopIndexSubject.asObservable();
  
  private currentErrorSubject = new BehaviorSubject<ApiError | null>(null);
  currentError$ = this.currentErrorSubject.asObservable();
  
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();
  
  // Cache for the last API response
  private lastApiResponse: ApiResponse | null = null;

  constructor(
    private http: HttpClient,
    private occupancyService: OccupancyService
  ) {}

  /**
   * Fetches train formation data from the API
   * @param params Search parameters for the API request
   * @returns Observable with the API response
   */
  getFormation(params: SearchParams): Observable<ApiResponse> {
    this.currentErrorSubject.next(null);
    this.currentFormationSubject.next(null);
    this.loadingSubject.next(true);
    
    // Convert date to proper format if needed
    let operationDate = params.operationDate;
    if (typeof params.operationDate === 'object') {
      operationDate = formatDate(params.operationDate as Date, 'yyyy-MM-dd', 'en-US');
    }
    
    const httpParams = new HttpParams()
      .set('evu', params.evu)
      .set('operationDate', operationDate)
      .set('trainNumber', params.trainNumber)
      .set('includeOperationalStops', params.includeOperationalStops !== undefined ? 
        params.includeOperationalStops.toString() : 'false');

    return this.http.get<ApiResponse>(this.apiUrl, {
      params: httpParams,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    }).pipe(
      tap(response => {
        this.lastApiResponse = response;
      }),
      switchMap(response => {
        // Get occupancy data if available
        return combineLatest([
          this.occupancyService.getTrainOccupancy(
            response.trainMetaInformation.toCode,
            response.trainMetaInformation.trainNumber.toString(),
            operationDate
          ),
          Promise.resolve(response)
        ]);
      }),
      map(([occupancyData, response]) => {
        this.processFormationData(response, occupancyData);
        return response;
      }),
      catchError((error: HttpErrorResponse) => {
        this.handleApiError(error, params);
        return throwError(() => error);
      }),
      finalize(() => {
        this.loadingSubject.next(false);
      })
    );
  }

  /**
   * Get current loading status
   * @returns Current loading state
   */
  isLoading(): boolean {
    return this.loadingSubject.value;
  }

  /**
   * Manually set loading status
   * @param loading New loading state
   */
  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  /**
   * Updates the selected stop and refreshes visualization
   * @param index Index of the stop to select
   */
  updateSelectedStop(index: number): void {
    if (!this.lastApiResponse || index < 0 || 
        index >= this.lastApiResponse.formationsAtScheduledStops.length) {
      return;
    }
    
    this.currentStopIndexSubject.next(index);

    // Get occupancy data again for the new stop
    const operationDate = this.lastApiResponse.journeyMetaInformation.operationDate;
    const trainNumber = this.lastApiResponse.trainMetaInformation.trainNumber.toString();
    const operatorId = this.lastApiResponse.trainMetaInformation.toCode;

    this.occupancyService.getTrainOccupancy(operatorId, trainNumber, operationDate)
      .subscribe(occupancyData => {
        this.processFormationData(this.lastApiResponse!, occupancyData, index);
      });
  }

  /**
   * Clears current error state
   */
  clearError(): void {
    this.currentErrorSubject.next(null);
  }

  /**
   * Processes API response into visualization data structure
   * @param response API response data
   * @param occupancyData Optional occupancy data
   * @param stopIndex Optional index of stop to process (defaults to 0)
   */
  private processFormationData(response: ApiResponse, occupancyData: any = null, stopIndex: number = 0): void {
    if (!response || !response.formationsAtScheduledStops || 
        response.formationsAtScheduledStops.length === 0) {
      this.currentFormationSubject.next(null);
      return;
    }

    // Map all stops in the journey
    const stops = response.formationsAtScheduledStops.map(formationStop => {
      const stop = formationStop.scheduledStop;
      const formationString = formationStop.formationShort.formationShortString;
      
      // Better detection of sectors - check for @ markers or \@X patterns
      const hasSectors = formationString.includes('@') || /\\@[A-Z]/.test(formationString);
      
      return {
        name: stop.stopPoint.name,
        uic: stop.stopPoint.uic,
        arrivalTime: stop.stopTime.arrivalTime,
        departureTime: stop.stopTime.departureTime,
        track: stop.track,
        hasSectors: hasSectors
      };
    });

    // Find the first stop with a non-null name
    let firstValidStopIndex = stopIndex;
    if (stopIndex === 0) {
      const validStopIndex = stops.findIndex(stop => stop.name !== null);
      if (validStopIndex >= 0) {
        firstValidStopIndex = validStopIndex;
      }
    }

    // Set current stop index
    this.currentStopIndexSubject.next(firstValidStopIndex);
    
    // Get current stop formation data
    const currentFormationStop = response.formationsAtScheduledStops[firstValidStopIndex];
    const formationString = currentFormationStop.formationShort.formationShortString;
    
    // Parse formation string
    const sections = this.parseFormationString(formationString);

    // Add occupancy data if available
    if (occupancyData) {
      const currentStop = stops[firstValidStopIndex];
      const nextStop = stops[firstValidStopIndex + 1];

      if (currentStop && nextStop) {
        sections.forEach(section => {
          section.wagons.forEach(wagon => {
            // Add occupancy data for each class
            if (wagon.classes.includes('1')) {
              const firstClassOccupancy = this.occupancyService.getOccupancyVisualization(
                occupancyData,
                FareClass.FIRST,
                currentStop.name,
                nextStop.name
              );
              if (firstClassOccupancy) {
                wagon.firstClassOccupancy = {
                  icon: firstClassOccupancy.icon,
                  label: firstClassOccupancy.label
                };
              }
            }

            if (wagon.classes.includes('2')) {
              const secondClassOccupancy = this.occupancyService.getOccupancyVisualization(
                occupancyData,
                FareClass.SECOND,
                currentStop.name,
                nextStop.name
              );
              if (secondClassOccupancy) {
                wagon.secondClassOccupancy = {
                  icon: secondClassOccupancy.icon,
                  label: secondClassOccupancy.label
                };
              }
            }
          });
        });
      }
    }

    // Build the visualization data structure
    const trainVisualization: TrainVisualization = {
      trainNumber: response.trainMetaInformation.trainNumber.toString(),
      operationDate: response.journeyMetaInformation.operationDate,
      evu: response.trainMetaInformation.toCode,
      currentStop: currentFormationStop.scheduledStop.stopPoint.name,
      stops: stops,
      sections: sections
    };
    
    this.currentFormationSubject.next(trainVisualization);
  }

  /**
   * Handles API errors with detailed error messages
   * @param error HTTP error response
   * @param params The search parameters that caused the error
   */
  private handleApiError(error: HttpErrorResponse, params: SearchParams): void {
    console.error('API Error:', error);
    
    let apiError: ApiError;
    
    switch (error.status) {
      case 400:
        apiError = {
          statusCode: error.status,
          message: 'No train formation data available. Please check your search parameters.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 401:
        apiError = {
          statusCode: error.status,
          message: 'Authentication failed. Please check your API key.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 403:
        apiError = {
          statusCode: error.status,
          message: 'Access to this API has been disallowed.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 404:
        apiError = {
          statusCode: error.status,
          message: 'Train formation data not found. The train might not exist for the specified date.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 429:
        apiError = {
          statusCode: error.status,
          message: 'Rate limit exceeded. Please wait 1 minute before trying again (maximum 5 requests per minute allowed).',
          technicalDetails: `HTTP ${error.status}: Rate Limit Exceeded`
        };
        break;
        
      default:
        apiError = {
          statusCode: error.status || 500,
          message: 'An unexpected error occurred. Please try again later.',
          technicalDetails: error.message
        };
    }
    
    this.currentErrorSubject.next(apiError);
  }

  /**
   * Main parser for formation string formats
   * @param formationString Formation string from API
   * @returns Array of train sections with wagons
   */
  private parseFormationString(formationString: string): TrainSection[] {
    // Quick sanitization of potential issues in the API string
    if (!formationString || formationString.trim() === '') {
      console.warn('Empty formation string received');
      return [];
    }
    
    // Debug logging of input
    console.debug('[FormationService] Parsing formation string:', formationString);
    
    // Check for sector markers in the string
    const hasSectors = formationString.includes('@') || /\\@[A-Z]/.test(formationString);
    console.debug('[FormationService] Formation has sectors:', hasSectors);
    
    // Initialize a map of sectors to wagons for easier management
    const sectorMap: Map<string, TrainWagon[]> = new Map();
    let currentSector = ''; // Default empty sector
    let position = 0;
    
    if (hasSectors) {
      // Split the formation string into logical segments based on the @ sector markers
      const sectorSegments = formationString.split(/(?=@[A-Z])/);
      console.debug(`[FormationService] Found ${sectorSegments.length} sector segments`);
      
      // Process each segment which starts with a sector marker (or might be empty for the first segment)
      for (let i = 0; i < sectorSegments.length; i++) {
        let segment = sectorSegments[i];
        if (!segment.trim()) continue;
        
        console.debug(`[FormationService] Processing segment ${i+1}/${sectorSegments.length}: ${segment.substring(0, 50)}${segment.length > 50 ? '...' : ''}`);
        
        // Extract the sector identifier (should be the first @ followed by a letter)
        const sectorMatch = segment.match(/@([A-Z])/);
        if (sectorMatch) {
          currentSector = sectorMatch[1];
          console.debug(`[FormationService] Found sector: ${currentSector}`);
          
          // If this sector isn't in our map yet, initialize it
          if (!sectorMap.has(currentSector)) {
            sectorMap.set(currentSector, []);
          }
          
          // Remove the sector marker for further parsing
          segment = segment.substring(segment.indexOf(sectorMatch[0]) + 2);
        }
        
        position = this.processSegment(segment, currentSector, position, sectorMap);
      }
    } else {
      // No sectors - process the entire string as a single segment
      // Extract the main vehicle group content (inside the outermost brackets)
      let bracketContent = this.extractBracketContent(formationString, '[', ']');
      
      if (!bracketContent) {
        // If no brackets found, try using the whole string directly (fallback)
        bracketContent = formationString;
      }
      
      // Process the content as a single segment with the default sector
      position = this.processSegment(bracketContent, currentSector, position, sectorMap);
    }
    
    // Convert the sector map to train sections
    const sections: TrainSection[] = [];
    console.debug(`[FormationService] Creating sections from ${sectorMap.size} sectors`);
    
    for (const [sector, wagons] of sectorMap.entries()) {
      if (wagons.length > 0) {
        console.debug(`[FormationService] Creating section for sector ${sector} with ${wagons.length} wagons`);
        sections.push({
          sector,
          wagons: [...wagons]
        });
      } else {
        console.debug(`[FormationService] Skipping empty sector ${sector}`);
      }
    }
    
    console.debug(`[FormationService] Parsed sections: ${sections.length}`);
    sections.forEach((section, i) => {
      console.debug(`[FormationService] Section ${i} (${section.sector}): ${section.wagons.length} wagons`);
    });
    
    return this.finalizeTrainSections(sections);
  }
  
  /**
   * Process a segment of a formation string
   * @param segment Segment to process
   * @param currentSector Current sector identifier
   * @param position Starting position for wagons
   * @param sectorMap Map of sectors to wagons
   * @returns New position after processing
   */
  private processSegment(segment: string, currentSector: string, position: number, sectorMap: Map<string, TrainWagon[]>): number {
    // Process brackets first - they contain the actual wagons
    // We might have multiple bracket groups in a sector segment
    let bracketCount = 0;
    let bracketContent: string | null;
    
    while ((bracketContent = this.extractBracketContent(segment, '[', ']')) !== null) {
      bracketCount++;
      console.debug(`[FormationService] Found bracket group ${bracketCount} in sector ${currentSector}`);
      
      // Parse the wagons from this bracket group
      const wagons = this.parseVehicleGroup(bracketContent, currentSector, position);
      
      if (wagons.length > 0) {
        console.debug(`[FormationService] Added ${wagons.length} wagons to sector ${currentSector}`);
        // Add wagons to the current sector
        const sectorWagons = sectorMap.get(currentSector) || [];
        sectorWagons.push(...wagons);
        sectorMap.set(currentSector, sectorWagons);
        
        // Update position counter for next wagons
        position += wagons.length;
      } else {
        console.debug(`[FormationService] No wagons found in bracket group ${bracketCount}`);
      }
      
      // Remove the processed bracket group from the segment
      const startIdx = segment.indexOf('[');
      const endIdx = segment.indexOf(']', startIdx) + 1;
      segment = segment.substring(0, startIdx) + segment.substring(endIdx);
    }
    
    if (bracketCount === 0) {
      console.debug(`[FormationService] No bracket groups found in segment`);
    }
    
    // Handle any individual tokens outside of brackets
    const tokens = segment.split(/[,\\]/).filter(t => t.trim());
    if (tokens.length > 0) {
      console.debug(`[FormationService] Processing ${tokens.length} individual tokens in sector ${currentSector}`);
      
      tokens.forEach(token => {
        const trimmedToken = token.trim();
        if (trimmedToken === 'F') {
          console.debug(`[FormationService] Skipping fictitious wagon 'F', but incrementing position`);
          position++;
        } else if (this.isPotentialWagonToken(trimmedToken)) {
          console.debug(`[FormationService] Processing individual wagon token: ${trimmedToken}`);
          const wagon = this.parseVehicleToken(trimmedToken, currentSector, position);
          if (wagon) {
            const sectorWagons = sectorMap.get(currentSector) || [];
            sectorWagons.push(wagon);
            sectorMap.set(currentSector, sectorWagons);
            position++;
          }
        } else if (trimmedToken) {
          console.debug(`[FormationService] Ignoring non-wagon token: ${trimmedToken}`);
        }
      });
    }
    
    return position;
  }
  
  /**
   * Splits formation string into tokens for parsing
   * @param formationString String to tokenize
   * @returns Array of formation tokens
   */
  private tokenizeFormationString(formationString: string): FormationToken[] {
    const tokens: FormationToken[] = [];
    let currentToken = '';
    let position = 0;
    
    for (let i = 0; i < formationString.length; i++) {
      const char = formationString[i];
      
      // Handle special characters
      if (char === '@') {
        // Find the entire sector token (e.g., @A)
        let sectorToken = '@';
        if (i + 1 < formationString.length && /[A-Z]/.test(formationString[i + 1])) {
          sectorToken += formationString[++i];
        }
        
        if (currentToken) {
          tokens.push(this.createToken(currentToken, position));
          currentToken = '';
          position++;
        }
        
        tokens.push({
          type: TokenType.SECTOR,
          value: sectorToken,
          position: position++
        });
      } else if (char === '[') {
        if (currentToken) {
          tokens.push(this.createToken(currentToken, position));
          currentToken = '';
          position++;
        }
        
        tokens.push({
          type: TokenType.BRACKET_OPEN,
          value: '[',
          position: position++
        });
      } else if (char === ']') {
        if (currentToken) {
          tokens.push(this.createToken(currentToken, position));
          currentToken = '';
          position++;
        }
        
        tokens.push({
          type: TokenType.BRACKET_CLOSE,
          value: ']',
          position: position++
        });
      } else if (char === '(') {
        if (currentToken) {
          tokens.push(this.createToken(currentToken, position));
          currentToken = '';
          position++;
        }
        
        tokens.push({
          type: TokenType.PARENTHESIS_OPEN,
          value: '(',
          position: position++
        });
      } else if (char === ')') {
        if (currentToken) {
          tokens.push(this.createToken(currentToken, position));
          currentToken = '';
          position++;
        }
        
        tokens.push({
          type: TokenType.PARENTHESIS_CLOSE,
          value: ')',
          position: position++
        });
      } else if (char === ',') {
        if (currentToken) {
          tokens.push(this.createToken(currentToken, position));
          currentToken = '';
          position++;
        }
        
        tokens.push({
          type: TokenType.COMMA,
          value: ',',
          position: position++
        });
      } else if (char === '\\') {
        if (currentToken) {
          tokens.push(this.createToken(currentToken, position));
          currentToken = '';
          position++;
        }
        
        tokens.push({
          type: TokenType.BACKSLASH,
          value: '\\',
          position: position++
        });
        
        // Check if the backslash is followed by a sector marker
        // Like "\@A" which is a common pattern
        if (i + 1 < formationString.length && formationString[i + 1] === '@') {
          // We'll handle @ in the next iteration
          // No need to skip characters here
        }
      } else if (char === 'F' && !currentToken) {
        // Only recognize 'F' as fictitious wagon if it's a standalone token
        tokens.push({
          type: TokenType.FICTITIOUS_WAGON,
          value: 'F',
          position: position++
        });
      } else {
        // Build up multi-character token
        currentToken += char;
      }
    }
    
    // Add any remaining token
    if (currentToken) {
      tokens.push(this.createToken(currentToken, position));
    }
    
    return tokens;
  }
  
  /**
   * Creates a token with proper type identification
   * @param value Token string value
   * @param position Position in token sequence
   * @returns Formation token with type
   */
  private createToken(value: string, position: number): FormationToken {
    if (value.startsWith('@') && value.length > 1) {
      return { type: TokenType.SECTOR, value, position };
    } else if (value === 'F') {
      return { type: TokenType.FICTITIOUS_WAGON, value, position };
    } else if (this.isPotentialWagonToken(value)) {
      return { type: TokenType.VEHICLE, value, position };
    } else {
      return { type: TokenType.UNKNOWN, value, position };
    }
  }
  
  /**
   * Checks if a token could represent a wagon
   * @param token Token to check
   * @returns True if this might be a wagon token
   */
  private isPotentialWagonToken(token: string): boolean {
    // Wagon tokens can start with status characters
    if (token.startsWith('-') || token.startsWith('>') || 
        token.startsWith('=') || token.startsWith('%')) {
      return true;
    }
    
    // Or contain wagon type codes
    const wagonTypes = ['1', '2', '12', 'CC', 'FA', 'WL', 'WR', 
                       'W1', 'W2', 'LK', 'D', 'K', 'X'];
    return wagonTypes.some(type => token.includes(type));
  }
  
  /**
   * Extracts content between matching brackets/parentheses
   * Handles nested brackets correctly
   * @param str String to extract from
   * @param openChar Opening character
   * @param closeChar Closing character
   * @returns Content between matching brackets or null if not found
   */
  private extractBracketContent(str: string, openChar: string, closeChar: string): string | null {
    let depth = 0;
    let start = -1;
    
    for (let i = 0; i < str.length; i++) {
      if (str[i] === openChar) {
        if (depth === 0) {
          start = i + 1;
        }
        depth++;
      } else if (str[i] === closeChar) {
        depth--;
        if (depth === 0 && start !== -1) {
          return str.substring(start, i);
        }
      }
    }
    
    return null;
  }
  
  /**
   * Parses a vehicle group into wagon objects
   * @param groupContent Content inside brackets (without the brackets)
   * @param sector Current sector identifier
   * @param startPosition Starting position for wagons
   * @returns Array of parsed wagon objects
   */
  private parseVehicleGroup(groupContent: string, sector: string, startPosition: number): TrainWagon[] {
    const tokens = this.tokenizeFormationString(groupContent);
    const wagons: TrainWagon[] = [];
    let currentSector = sector;
    let position = startPosition;
    let noAccessToPrevious = false;
    let noAccessToNext = false;
    
    // Check for group-level attributes (e.g. [(...)]#NF)
    const groupAttributesMatch = groupContent.match(/\)[:#](\d+)(?:#([A-Z;]+))?$/);
    const groupAttributes: WagonAttribute[] = [];
    
    if (groupAttributesMatch && groupAttributesMatch[2]) {
      const offerList = groupAttributesMatch[2].split(';');
      
      // Process group-level attributes (will be added to each wagon)
      for (const offer of offerList) {
        const attr = this.getAttributeObject(offer);
        if (attr) {
          groupAttributes.push(attr);
        }
      }
    }
    
    // Check for parentheses structure in the entire group
    // These indicate no-passage between entire vehicle groups
    const hasGroupParenthesis = groupContent.match(/\((.*?)\)/);
    const noAccessAcrossGroups = !!hasGroupParenthesis;
    
    // Process each token into a wagon
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Handle sector changes
      if (token.type === TokenType.SECTOR) {
        const sectorMatch = token.value.match(/@([A-Z])/);
        if (sectorMatch) {
          currentSector = sectorMatch[1];
        }
        continue;
      }
      
      // Skip non-vehicle tokens
      if (token.type !== TokenType.VEHICLE && 
          token.type !== TokenType.FICTITIOUS_WAGON) {
        continue;
      }
      
      // Process vehicle tokens
      const parsedWagon = this.parseVehicleToken(token.value, currentSector, position++);
      if (parsedWagon) {
        // Apply group attributes to individual wagon
        for (const attr of groupAttributes) {
          if (!parsedWagon.attributes.some(a => a.code === attr.code)) {
            parsedWagon.attributes.push(attr);
          }
        }
        
        // Handle no-passage at vehicle group boundaries
        // First wagon in a parenthesis group should have no access to previous wagon
        if (i === 0 && noAccessAcrossGroups && hasGroupParenthesis && hasGroupParenthesis[0].startsWith('(')) {
          parsedWagon.noAccessToPrevious = true;
          parsedWagon.noAccessMessage = 'No passage to the neighbouring coach possible';
        }
        
        // Last wagon in a parenthesis group should have no access to next wagon 
        if (i === tokens.length - 1 && noAccessAcrossGroups && hasGroupParenthesis && hasGroupParenthesis[0].endsWith(')')) {
          parsedWagon.noAccessToNext = true;
          parsedWagon.noAccessMessage = 'No passage to the neighbouring coach possible';
        }
        
        // Additional wagons added to the section
        wagons.push(parsedWagon);
      }
    }
    
    // Return the parsed wagons
    return wagons;
  }
  
  /**
   * Creates a wagon attribute object from a code
   * @param code Attribute code
   * @returns Wagon attribute object
   */
  private getAttributeObject(code: string): WagonAttribute | null {
    const offerMapping: { [key: string]: { label: string; icon: string } } = {
      'BHP': { label: 'Wheelchair Spaces', icon: 'wheelchair' },
      'BZ': { label: 'Business Zone', icon: 'business' },
      'FZ': { label: 'Family Zone', icon: 'family' },
      'KW': { label: 'Stroller Platform', icon: 'stroller' },
      'NF': { label: 'Low Floor Access', icon: 'accessible' },
      'VH': { label: 'Bike Hooks', icon: 'bicycle' },
      'VR': { label: 'Bike Hooks Reservation Required', icon: 'bicycle-reserved' },
      'WL': { label: 'Sleeping compartments', icon: 'sleep' },
      'CC': { label: 'Couchette Compartments', icon: 'couchette' }
    };
    
    if (offerMapping[code]) {
      return {
        code: code,
        label: offerMapping[code].label,
        icon: offerMapping[code].icon
      };
    }
    
    return null;
  }
  
  /**
   * Parses a single vehicle token into a wagon object
   * @param token Vehicle token string
   * @param sector Current sector
   * @param position Position in the train
   * @returns Parsed wagon object or null if invalid
   */
  private parseVehicleToken(token: string, sector: string, position: number): TrainWagon | null {
    // Skip empty tokens
    if (!token || token.trim() === '') {
      return null;
    }
    
    // Extract status characters at the beginning
    const statusCodes = this.parseWagonStatus(token);
    let cleanToken = token;
    
    // Check for parentheses in token to handle no-passage
    const hasOpenParenthesis = token.includes('(');
    const hasCloseParenthesis = token.includes(')');
    
    // Remove status characters for further parsing
    if (token.startsWith('-')) {
      cleanToken = token.substring(1);
    } else if (token.startsWith('>') || token.startsWith('=') || token.startsWith('%')) {
      // Find how many status characters are at the start
      let statusChars = 0;
      while (statusChars < token.length && 
             ['-', '>', '=', '%'].includes(token[statusChars])) {
        statusChars++;
      }
      cleanToken = token.substring(statusChars);
    }
    
    // Keep a copy of the cleaned token with parentheses for no-passage detection
    const cleanTokenWithParentheses = cleanToken;
    
    // If cleanToken starts with a parenthesis, temporarily remove it for class detection
    // but keep the information for no-passage detection
    if (cleanToken.startsWith('(')) {
      cleanToken = cleanToken.substring(1);
    }
    if (cleanToken.endsWith(')')) {
      cleanToken = cleanToken.substring(0, cleanToken.length - 1);
    }
    
    // Extract wagon type information
    const wagonType = this.determineWagonType(cleanToken);
    const typeLabel = this.getTypeLabel(wagonType);
    
    // Extract wagon number if present
    const ordnr = this.extractOrdnr(cleanToken);
    
    // Determine service class(es)
    const classes = this.determineWagonClasses(cleanTokenWithParentheses);
    
    // Parse wagon attributes (e.g., BHP, NF, VH)
    const attributes = this.parseWagonAttributes(cleanToken);
    
    // Determine no-passage flags based on parentheses
    // A token starts with '(' means no access to previous wagon
    // A token ends with ')' means no access to next wagon
    const noAccessToPrevious = cleanTokenWithParentheses.startsWith('(') || token.startsWith('(');
    const noAccessToNext = cleanTokenWithParentheses.endsWith(')') || token.endsWith(')');
    
    return {
      position,
      number: ordnr || '',
      type: wagonType,
      typeLabel,
      classes,
      attributes,
      noAccessToPrevious,
      noAccessToNext,
      sector,
      statusCodes
    };
  }
  
  /**
   * Extracts status information from wagon token
   * @param token Wagon token
   * @returns Array of status descriptions
   */
  private parseWagonStatus(token: string): string[] {
    const statusCodes: string[] = [];
    
    // Check for '-' character which indicates a closed wagon
    // Look for it both at the start of the token AND after special characters like '(' or '@'
    if (token.startsWith('-') || token.includes('(-') || token.includes('@-')) {
      statusCodes.push(WagonStatus.CLOSED);
    } else {
      // Can have multiple status characters (except closed)
      if (token.startsWith('>') || token.includes('>')) {
        statusCodes.push(WagonStatus.GROUP_BOARDING);
      }
      if (token.startsWith('=') || token.includes('=')) {
        statusCodes.push(WagonStatus.RESERVED_FOR_TRANSIT);
      }
      if (token.startsWith('%') || token.includes('%')) {
        statusCodes.push(WagonStatus.UNSERVICED);
      }
    }
    
    return statusCodes;
  }
  
  /**
   * Determines the wagon type from token
   * @param token Clean token (without status characters)
   * @returns Wagon type identifier
   */
  private determineWagonType(token: string): string {
    const typeMapping: { [key: string]: string } = {
      'LK': 'locomotive',
      '1': 'first-class',
      '2': 'second-class',
      '12': 'first-and-second-class',
      'CC': 'couchette',
      'FA': 'second-class', // Family car is always 2nd class
      'FZ': 'second-class', // Family zone is always 2nd class
      'WL': 'sleeper',
      'WR': 'restaurant',
      'W1': 'restaurant-first',
      'W2': 'restaurant-second',
      'D': 'baggage',
      'K': 'classless',
      'X': 'parked'
    };
    
    // Look for exact matches (most specific first)
    for (const [code, type] of Object.entries(typeMapping)) {
      // Match either with colon (:) or hash (#) or comma (,) or end of string
      const regex = new RegExp(`^${code}(?:[:#,]|$)`);
      if (regex.test(token)) {
        return type;
      }
    }
    
    // Special cases for tokens with type code embedded in the middle
    for (const [code, type] of Object.entries(typeMapping)) {
      if (token.includes(code)) {
        return type;
      }
    }
    
    // Default to generic wagon if type can't be determined
    return 'wagon';
  }
  
  /**
   * Gets human-readable label for a wagon type
   * @param type Wagon type identifier
   * @returns User-friendly label
   */
  private getTypeLabel(type: string): string {
    const typeLabels: { [key: string]: string } = {
      'locomotive': 'Locomotive',
      'first-class': '1st Class Coach',
      'second-class': '2nd Class Coach',
      'first-and-second-class': '1st & 2nd Class Coach',
      'couchette': 'Couchette Compartments',
      'sleeper': 'Sleeping compartments',
      'restaurant': '2nd Class Coach',
      'restaurant-first': '1st Class Coach',
      'restaurant-second': '2nd Class Coach',
      'baggage': 'Baggage Car',
      'classless': 'Classless Coach',
      'parked': 'Parked Vehicle',
      'wagon': 'Coach'
    };
    
    return typeLabels[type] || 'Coach';
  }
  
  /**
   * Determines service classes of a wagon
   * @param token Clean token (without status characters)
   * @returns Array of service classes ('1', '2', or both)
   */
  private determineWagonClasses(token: string): ('1' | '2')[] {
    const classes: ('1' | '2')[] = [];
    
    // Special case for family cars (FA) and family zones (FZ) - always 2nd class
    if (token.includes('FA') || token.includes('FZ')) {
      classes.push('2');
      return classes;
    }
    
    // Remove parentheses at the beginning of token for proper class detection
    let cleanToken = token;
    if (cleanToken.startsWith('(')) {
      cleanToken = cleanToken.substring(1);
    }
    if (cleanToken.endsWith(')')) {
      cleanToken = cleanToken.substring(0, cleanToken.length - 1);
    }
    
    // Handle the format 1:N where N is any number (like 1:2 which is a 1st class car)
    const firstClassWithNumber = cleanToken.match(/^1:(\d+)/) || cleanToken.match(/\(1:(\d+)/) || cleanToken.match(/@1:(\d+)/);
    if (firstClassWithNumber) {
      classes.push('1');
      return classes;
    }
    
    // Handle the format 2:N where N is any number (like 2:8 which is a 2nd class car)
    const secondClassWithNumber = cleanToken.match(/^2:(\d+)/) || cleanToken.match(/\(2:(\d+)/) || cleanToken.match(/@2:(\d+)/);
    if (secondClassWithNumber) {
      classes.push('2');
      return classes;
    }
    
    // First class cases - check for markers after common delimiters
    if (cleanToken.startsWith('1') || 
        cleanToken.startsWith('12') || 
        cleanToken.startsWith('W1') || 
        /[,:]1[:#,]/.test(cleanToken) ||
        /\(1[:#,]/.test(cleanToken) ||
        /@1[:#,]/.test(cleanToken)) {
      classes.push('1');
    }
    
    // Second class cases - check for markers after common delimiters
    if (cleanToken.startsWith('2') || 
        cleanToken.startsWith('12') || 
        cleanToken.startsWith('W2') || 
        /[,:]2[:#,]/.test(cleanToken) ||
        /\(2[:#,]/.test(cleanToken) ||
        /@2[:#,]/.test(cleanToken)) {
      classes.push('2');
    }
    
    return classes;
  }
  
  /**
   * Extracts ordinal number (wagon number) from token
   * @param token Clean token (without status characters)
   * @returns Ordinal number or null if not found
   */
  private extractOrdnr(token: string): string | null {
    // Check for ordinal number pattern: either :N or N:N
    const ordnrPatterns = [
      /[,:](\d{1,3})(?:[:#]|$|\)|\])/,  // :N format followed by :, #, end of string, ), or ]
      /(\d{1,3}):(\d{1,3})/           // N:N format
    ];
    
    for (const pattern of ordnrPatterns) {
      const match = token.match(pattern);
      if (match) {
        // For N:N format, take the second number
        return match.length > 2 ? match[2] : match[1];
      }
    }
    
    return null;
  }
  
  /**
   * Parses wagon attributes from token
   * @param token Clean token (without status characters)
   * @returns Array of wagon attributes
   */
  private parseWagonAttributes(token: string): WagonAttribute[] {
    const attributes: WagonAttribute[] = [];
    
    // Check for offer list after # character
    const offerMatch = token.match(/#([A-Z;]+)/);
    
    // Process main wagon type first to add implicit attributes
    // For FA (Family car), always add the family attribute
    if (token.includes('FA') || token.includes('FZ')) {
      attributes.push({
        code: 'FZ',
        label: 'Family Zone',
        icon: 'family'
      });
    }
    
    // For WL (Sleeping Car), add sleeping car attribute
    if (token.includes('WL')) {
      attributes.push({
        code: 'WL',
        label: 'Sleeping compartments',
        icon: 'sleep'
      });
    }
    
    // For CC (Couchette Coach), add couchette attribute
    if (token.includes('CC')) {
      attributes.push({
        code: 'CC',
        label: 'Couchette Compartments',
        icon: 'couchette'
      });
    }
    
    // For Restaurant cars that are not unserviced, add restaurant attribute
    if ((token.includes('WR') || token.includes('W1') || token.includes('W2')) && 
        !token.includes('%')) {
      attributes.push({
        code: 'WR',
        label: 'Restaurant',
        icon: 'restaurant'
      });
    }
    
    // No offers list, return the implicit attributes we've already added
    if (!offerMatch) {
      return attributes;
    }
    
    const offerList = offerMatch[1];
    const offers = offerList.split(';');
    
    const offerMapping: { [key: string]: { label: string; icon: string } } = {
      'BHP': { label: 'Wheelchair Spaces', icon: 'wheelchair' },
      'BZ': { label: 'Business Zone', icon: 'business' },
      'FZ': { label: 'Family Zone', icon: 'family' },
      'KW': { label: 'Stroller Platform', icon: 'stroller' },
      'NF': { label: 'Low Floor Access', icon: 'accessible' },
      'VH': { label: 'Bike Hooks', icon: 'bicycle' },
      'VR': { label: 'Bike Hooks Reservation Required', icon: 'bicycle-reserved' },
      'WL': { label: 'Sleeping compartments', icon: 'sleep' },
      'CC': { label: 'Couchette', icon: 'couchette' }
    };
    
    for (const offer of offers) {
      if (offerMapping[offer]) {
        // Only add if not already added as implicit attribute
        if (!attributes.some(a => a.code === offer)) {
          attributes.push({
            code: offer,
            label: offerMapping[offer].label,
            icon: offerMapping[offer].icon
          });
        }
      }
    }
    
    return attributes;
  }
  
  /**
   * Final processing of train sections to ensure consistency
   * @param sections Raw sections from parsing
   * @returns Finalized train sections
   */
  private finalizeTrainSections(sections: TrainSection[]): TrainSection[] {
    // Filter out sections with no wagons
    const filteredSections = sections.filter(section => section.wagons.length > 0);
    
    // Set connecting wagon borders correctly for entire train
    filteredSections.forEach(section => {
      // First wagon in section should have no access to previous
      // if it's the first wagon in a section (except first section)
      if (section.wagons.length > 0) {
        const firstWagon = section.wagons[0];
        const lastWagon = section.wagons[section.wagons.length - 1];
        
        // Set noAccessMessages for better UX
        section.wagons.forEach(wagon => {
          if (wagon.noAccessToPrevious) {
            wagon.noAccessMessage = 'No passage to previous coach';
          }
          if (wagon.noAccessToNext) {
            wagon.noAccessMessage = 'No passage to next coach';
          }
        });
      }
    });
    
    // Handle cross-section no-passage
    let previousWagon: TrainWagon | null = null;
    let currentPosition = 0;
    
    // Create a flat array of all wagons
    const allWagons: TrainWagon[] = [];
    filteredSections.forEach(section => {
      section.wagons.forEach(wagon => {
        allWagons.push(wagon);
      });
    });
    
    // Process each wagon sequentially
    allWagons.forEach((wagon, index) => {
      // Update position
      wagon.position = currentPosition++;
      
      // Clear status codes for locomotives as it is not necessary to show the status of the locomotive
      if (wagon.type === 'locomotive') {
        wagon.statusCodes = [];
      }
      
      // Check for no-passage between wagons
      if (previousWagon) {
        // Special handling for locomotives - don't show no-passage indicators
        const isCurrentLocomotive = wagon.type === 'locomotive';
        const isPreviousLocomotive = previousWagon.type === 'locomotive';
        
        if ((previousWagon.noAccessToNext || wagon.noAccessToPrevious) && !isCurrentLocomotive && !isPreviousLocomotive) {
          // Ensure both sides are marked for no-passage (except for locomotives)
          previousWagon.noAccessToNext = true;
          wagon.noAccessToPrevious = true;
          
          // Set descriptive messages if not already set (except for locomotives)
          if (!previousWagon.noAccessMessage) {
            previousWagon.noAccessMessage = 'No passage to next coach';
          }
          if (!wagon.noAccessMessage) {
            wagon.noAccessMessage = 'No passage to previous coach';
          }
        } else if (isCurrentLocomotive || isPreviousLocomotive) {
          // Clear no-passage indicators and messages for locomotives
          if (isCurrentLocomotive) {
            wagon.noAccessToPrevious = false;
            wagon.noAccessMessage = undefined;
          }
          if (isPreviousLocomotive) {
            previousWagon.noAccessToNext = false;
            previousWagon.noAccessMessage = undefined;
          }
        }
      }
      
      previousWagon = wagon;
    });
    
    return filteredSections;
  }
  
  /**
   * Gets the stored API response for debug purposes
   * @returns The last API response
   */
  getStoredApiResponse(): ApiResponse | null {
    return this.lastApiResponse;
  }
}