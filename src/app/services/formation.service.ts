/**
 * @fileoverview Train Formation Service - Core processing logic for the SKI+ Train Formation Visualization
 * 
 * This service is responsible for:
 * - Fetching train formation data from the OpenTransportData.swiss API
 * - Processing complex formation string formats into visualization-friendly data structures
 * - Handling different railway operators (SBB, BLS) with their specific formation notations
 * - Managing the current state of the visualization (selected stop, error states, loading status)
 * - Parsing wagon attributes, types, and sectors for visual representation
 * 
 * The service handles various formation string formats with complex parsing logic,
 * including sector-based formations, nested groups, and different notation styles
 * used by Swiss railway operators.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, map, tap, finalize } from 'rxjs/operators';
import { ApiResponse, SearchParams, TrainVisualization, TrainWagon, TrainSection, WagonAttribute } from '../models/formation.model';
import { formatDate } from '@angular/common';
import { environment } from '../../environments/environment';

/**
 * Interface for API error information
 * 
 * @interface ApiError
 * @property {number} statusCode - HTTP status code or custom error code
 * @property {string} message - User-friendly error message to display in the UI
 * @property {string} [technicalDetails] - Optional technical details for debugging
 */
export interface ApiError {
  statusCode: number;
  message: string;
  technicalDetails?: string;
}

/**
 * Core service for handling train formation data
 * 
 * This service is responsible for:
 * - Communicating with the OpenTransportData API to fetch formation data
 * - Processing and parsing complex formation string notations
 * - Managing the current state (selected train, stop, errors)
 * - Providing observable streams of formation data to components
 * 
 * The service handles different railway operators with specialized parsers
 * for various formation string formats.
 */
@Injectable({
  providedIn: 'root'
})
export class FormationService {
  private apiUrl = 'https://api.opentransportdata.swiss/formations_full';
  private apiKey = environment.apiKey; // Get API key from environment configuration
  private currentFormationSubject = new BehaviorSubject<TrainVisualization | null>(null);
  currentFormation$ = this.currentFormationSubject.asObservable();

  private currentStopIndexSubject = new BehaviorSubject<number>(0);
  currentStopIndex$ = this.currentStopIndexSubject.asObservable();
  
  // Error handling
  private currentErrorSubject = new BehaviorSubject<ApiError | null>(null);
  currentError$ = this.currentErrorSubject.asObservable();
  
  // Loading status
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();
  
  // Store the API response to access it when switching stops
  private lastApiResponse: ApiResponse | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Fetches train formation data from the API
   * @param params Search parameters for the API request
   * @returns Observable with the API response
   */
  getFormation(params: SearchParams): Observable<ApiResponse> {
    // Reset error state for new request
    this.currentErrorSubject.next(null);
    
    // Clear the current formation immediately to avoid showing outdated data
    this.currentFormationSubject.next(null);
    
    // Set loading status
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
        this.processFormationData(response);
      }),
      catchError((error: HttpErrorResponse) => {
        // Enhanced error handling
        this.handleApiError(error, params);
        return throwError(() => error);
      }),
      finalize(() => {
        // Reset loading status when API request completes
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
   * Handles API errors with detailed error messages
   * @param error HTTP error response
   * @param params The search parameters that caused the error
   */
  private handleApiError(error: HttpErrorResponse, params: SearchParams): void {
    this.currentFormationSubject.next(null); // Clear data on error
    
    // Log the original error for debugging
    console.error('Original API Error:', error);
    
    let apiError: ApiError;
    
    // Specific error messages based on HTTP status code
    switch (error.status) {
      case 400:
        // Bad Request
        apiError = {
          statusCode: error.status,
          message: 'No train formation data available. Please check your search parameters.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 401:
        // Unauthorized
        apiError = {
          statusCode: error.status,
          message: 'Authentication failed. Please check your API key.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 403:
        // Forbidden
        apiError = {
          statusCode: error.status,
          message: 'Access to this API has been disallowed.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 404:
        // Not Found
        apiError = {
          statusCode: error.status,
          message: 'Train formation data not found. The train might not exist for the specified date.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      case 429:
        // Rate Limit Exceeded
        apiError = {
          statusCode: error.status,
          message: 'Rate limit exceeded. Please wait 1 minute before trying again (maximum 5 requests per minute allowed).',
          technicalDetails: `HTTP ${error.status}: Rate Limit Exceeded`
        };
        break;
        
      case 500:
        // Internal Server Error
        apiError = {
          statusCode: error.status,
          message: 'A server error occurred. Please try again later.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
        
      default:
        // For all other errors show a general user-friendly message
        apiError = {
          statusCode: error.status,
          message: 'No train formation data available. Please check your search parameters.',
          technicalDetails: `HTTP ${error.status}: ${error.message}`
        };
        break;
    }
    
    this.currentErrorSubject.next(apiError);
  }

  /**
   * Processes the API response into visualization-friendly data
   * @param response The API response from the formations API
   */
  private processFormationData(response: ApiResponse): void {
    if (!response || !response.formationsAtScheduledStops || response.formationsAtScheduledStops.length === 0) {
      this.currentFormationSubject.next(null);
      
      // Handle empty API response without HTTP error
      const emptyResponseError: ApiError = {
        statusCode: 204,
        message: 'No train formation data available. Please check your search parameters.',
        technicalDetails: 'The API returned an empty response.'
      };
      this.currentErrorSubject.next(emptyResponseError);
      return;
    }

    // Filter out stops with null names (stops outside Switzerland)
    const validStops = response.formationsAtScheduledStops.filter(stop => 
      stop.scheduledStop.stopPoint.name !== null
    );

    if (validStops.length === 0) {
      this.currentFormationSubject.next(null);
      const noValidStopsError: ApiError = {
        statusCode: 204,
        message: 'No valid stops with names found in Switzerland.',
        technicalDetails: 'All stops in the response have null names.'
      };
      this.currentErrorSubject.next(noValidStopsError);
      return;
    }

    // Process the formation data into a more usable form for the UI
    const trainVis: TrainVisualization = {
      trainNumber: response.trainMetaInformation.trainNumber.toString(),
      operationDate: response.journeyMetaInformation.operationDate,
      evu: response.trainMetaInformation.toCode,
      currentStop: validStops[0].scheduledStop.stopPoint.name,
      stops: validStops.map(stop => ({
        name: stop.scheduledStop.stopPoint.name,
        uic: stop.scheduledStop.stopPoint.uic,
        arrivalTime: stop.scheduledStop.stopTime.arrivalTime,
        departureTime: stop.scheduledStop.stopTime.departureTime,
        track: stop.scheduledStop.track,
        // Add a flag indicating if this stop has sector information
        hasSectors: stop.formationShort?.formationShortString?.includes('@') || false
      })),
      sections: [] // Will be filled based on the selected stop
    };

    // Set the initial visualization
    this.currentFormationSubject.next(trainVis);
    this.currentStopIndexSubject.next(0);
    this.updateSelectedStop(0);
  }

  /**
   * Updates the formation visualization to show the selected stop
   * @param index The index of the stop to show
   */
  updateSelectedStop(index: number): void {
    if (index < 0 || !this.lastApiResponse || index >= this.lastApiResponse.formationsAtScheduledStops.length) {
        console.error("Invalid stop index or missing API response for updateSelectedStop");
        return;
    }
    
    const currentFormation = this.currentFormationSubject.value;
    if (!currentFormation) {
        console.error("Current formation is null in updateSelectedStop");
        return;
    }

    // Get the selected stop from our filtered valid stops list
    if (index >= currentFormation.stops.length) {
        console.error("Selected index is outside the valid stops range");
        return;
    }

    const selectedStop = currentFormation.stops[index];
    currentFormation.currentStop = selectedStop.name;
    
    // Find the corresponding stop data from the original API response
    const stopData = this.lastApiResponse.formationsAtScheduledStops.find(
        stop => stop.scheduledStop.stopPoint.uic === selectedStop.uic
    );
    
    if (!stopData) {
        console.error("Could not find stop data for selected stop");
        currentFormation.sections = [];
        this.currentFormationSubject.next({...currentFormation});
        this.currentStopIndexSubject.next(index);
        return;
    }
    
    const formationString = stopData.formationShort?.formationShortString;
    
    // Update the hasSectors property based on the current formation string
    // This ensures we properly display sectors for each individual stop
    currentFormation.stops[index].hasSectors = formationString?.includes('@') || false;
    
    if (!formationString) {
        console.warn("Formation string is missing for stop:", stopData.scheduledStop.stopPoint.name);
        currentFormation.sections = []; // Set empty sections if string is missing
    } else {
        try {
            console.log("Parsing formation string:", formationString);
            
            // If no sectors are in the formation string, create a default sector
            if (!formationString.includes('@')) {
                console.log("No sectors found in formation string, using default sector");
                currentFormation.sections = this.parseFormationString(formationString);
            } else {
                currentFormation.sections = this.parseFormationString(formationString);
            }
            
            console.log("Parsed sections:", JSON.stringify(currentFormation.sections, null, 2));
            // Add additional debug info
            if (currentFormation.sections.length === 0) {
                console.warn("No sections were parsed from the formation string");
            } else {
                let totalWagons = 0;
                currentFormation.sections.forEach(section => {
                    console.log(`Section ${section.sector} has ${section.wagons.length} wagons`);
                    totalWagons += section.wagons.length;
                    // Log first wagon of each section as a sample
                    if (section.wagons.length > 0) {
                        console.log("Sample wagon:", JSON.stringify(section.wagons[0], null, 2));
                    }
                });
                console.log(`Total wagons parsed: ${totalWagons}`);
            }
        } catch (e) {
            console.error("Error parsing formation string:", e);
            currentFormation.sections = []; // Set empty sections on parsing error
        }
    }
    
    this.currentFormationSubject.next({...currentFormation});
    this.currentStopIndexSubject.next(index);
  }

  /**
   * Clears the current error state
   */
  clearError(): void {
    this.currentErrorSubject.next(null);
  }

  /**
   * Parses a formation string into train sections with wagons
   * @param formationString The raw formation string from the API
   * @returns Array of train sections with wagons
   */
  private parseFormationString(formationString: string): TrainSection[] {
    console.log("Starting to parse formation string:", formationString);
    
    // Direct preprocessing for the family car issue - this handles the specific FA):9 pattern
    // by converting it to a proper FA:9 format before any further processing happens
    const familyCarOrdnrPattern = /FA\):(\d+)(#[A-Za-z;]+)?/g;
    const originalFormationString = formationString;
    formationString = formationString.replace(familyCarOrdnrPattern, "FA:$1$2");
    
    // Log whether preprocessing happened
    if (originalFormationString !== formationString) {
      console.log("Preprocessed formation string to fix family car notation:", formationString);
    }
    
    // Check if this is a BLS formation string (toCode = "33")
    const isBlsVehicle = this.lastApiResponse?.trainMetaInformation?.toCode === "33";
    
    // Create a map to collect wagons by sector
    const sectionsMap = new Map<string, TrainWagon[]>();
    let currentSector = 'N/A'; // Default sector if none specified
    let wagonPositionCounter = 0;
    
    // Check if the string has any sector markers
    const hasSectors = formationString.includes('@');
    
    // For BLS vehicles, always use the special parser, even without sectors
    if (isBlsVehicle) {
        // For BLS formations without sector markers, we need to massage the string
        // to ensure it's correctly processed by our BLS parser
        if (!hasSectors) {
            console.log("BLS formation without sectors - using special handling");
            return this.parseBlsFormationWithoutSectors(formationString);
        }
        return this.parseBlsFormationString(formationString);
    }
    
    if (!hasSectors) {
      // If no sectors, process the entire string as a single bracketed group
      console.log("No sectors found. Processing entire string as a single group with default sector.");
      
      // Look for bracketed groups
      const vehicleGroupMatches = this.findBracketedGroups(formationString, '[', ']');
      
      if (vehicleGroupMatches.length > 0) {
        // Special handling for complex SBB formation with nested parentheses like [(12,2,2,2),(12,2,2,2)]
        for (const groupContent of vehicleGroupMatches) {
          // Strip the outer brackets
          const innerContent = groupContent.substring(1, groupContent.length - 1);
          
          // Check if this contains multiple parenthesized groups
          const nestedGroups = this.findBracketedGroups(innerContent, '(', ')');
          
          // If we have multiple nested groups, handle them specially
          if (nestedGroups.length > 1) {
            console.log(`Found ${nestedGroups.length} nested parenthesized groups in non-sector formation`);
            
            for (const nestedGroup of nestedGroups) {
              // Remove the outer parentheses
              const nestedContent = nestedGroup.substring(1, nestedGroup.length - 1);
              console.log(`Processing nested group: ${nestedContent}`);
              
              // Split by commas and create wagon tokens
              const tokens = nestedContent.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F' && t !== 'X');
              
              console.log(`Found ${tokens.length} tokens in nested group`);
              
              // Process each token, adding back parentheses to first and last token
              for (let i = 0; i < tokens.length; i++) {
                let token = tokens[i];
                
                // Add parentheses to preserve no-passage info
                if (i === 0) {
                  token = '(' + token;
                }
                if (i === tokens.length - 1) {
                  token = token + ')';
                }
                
                if (this.isPotentialWagonToken(token)) {
                  const wagon = this.parseSingleWagonToken(token, currentSector, wagonPositionCounter++);
                  if (wagon) {
                    // Set no-access flags for group boundaries
                    if (i === 0) {
                      wagon.noAccessToPrevious = true;
                    }
                    if (i === tokens.length - 1) {
                      wagon.noAccessToNext = true;
                    }
                    
                    // Add to section map
                    if (!sectionsMap.has(currentSector)) {
                      sectionsMap.set(currentSector, []);
                    }
                    
                    sectionsMap.get(currentSector)!.push(wagon);
                  }
                }
              }
            }
          } else {
            // Standard handling for simple vehicle groups
          const wagons = this.parseVehicleGroupContent(innerContent, currentSector, wagonPositionCounter);
          
          if (!sectionsMap.has(currentSector)) {
            sectionsMap.set(currentSector, []);
          }
          
          sectionsMap.get(currentSector)!.push(...wagons);
          wagonPositionCounter += wagons.length;
          }
        }
      } else {
        // If no bracketed groups either, try to process as a simple comma-separated list
        const tokens = formationString.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F' && t !== 'X');
        
        for (const token of tokens) {
          if (this.isPotentialWagonToken(token)) {
            const wagon = this.parseSingleWagonToken(token, currentSector, wagonPositionCounter++);
            if (wagon) {
              if (!sectionsMap.has(currentSector)) {
                sectionsMap.set(currentSector, []);
              }
              
              sectionsMap.get(currentSector)!.push(wagon);
            }
          }
        }
      }
      
      // Create one section for all wagons if no sectors specified
      const sections: TrainSection[] = [];
      if (sectionsMap.has(currentSector) && sectionsMap.get(currentSector)!.length > 0) {
        sections.push({ sector: currentSector, wagons: sectionsMap.get(currentSector)! });
      }
      
      console.log(`Parsed ${sections.length} sections with ${wagonPositionCounter} total wagons in no-sector mode`);
      return sections;
    }
    
    // For complex formations with sectors and nested parenthesized groups, use special handling
    // First check if the formation contains both sectors and nested parentheses
    if (formationString.includes('[') && formationString.includes('(') && formationString.includes(')')) {
        // Extract the bracketed content
        const vehicleGroupMatches = this.findBracketedGroups(formationString, '[', ']');
        if (vehicleGroupMatches.length > 0) {
            // Get the content inside the brackets
            const originalBracketContent = vehicleGroupMatches[0].substring(1, vehicleGroupMatches[0].length - 1);
            const bracketWithoutMarkers = originalBracketContent.replace(/@[A-Z]/g, ''); // version with sector markers removed
            
            console.log(`Original bracketed content: ${originalBracketContent}`);
            console.log(`Bracket content without sector markers: ${bracketWithoutMarkers}`);
            
            // Find the position of the bracketed group in the original string
            const bracketStartPos = formationString.indexOf('[');
            
            // Special handling for cases like "(LK,1:20,2:19#VH,2):18#VH"
            // where an ordnr number like ":18" follows a closing parenthesis
            // Check for this pattern and fix it before regular processing
            let processedBracketContent = originalBracketContent;
            const hasOrdnrAfterClosingParen = /\):[0-9]+/.test(processedBracketContent);
            if (hasOrdnrAfterClosingParen) {
                console.log("Detected special pattern with ordnr after closing parenthesis");
                
                // Check for patterns like "FA):9" specifically to ensure we don't lose family car numbers
                const familyCarOrdnrMatches = [...processedBracketContent.matchAll(/FA\):(\d+)(#[A-Za-z;]+)?/g)];
                if (familyCarOrdnrMatches.length > 0) {
                    console.log(`Found ${familyCarOrdnrMatches.length} family car patterns with ordnr after parenthesis`);
                    for (const match of familyCarOrdnrMatches) {
                        const fullMatch = match[0];          // e.g., "FA):9#VH;NF"
                        const ordnr = match[1];              // e.g., "9"
                        const attributes = match[2] || '';   // e.g., "#VH;NF"
                        
                        // Replace with a notation the parser will understand
                        const matchPos = match.index;
                        if (matchPos !== undefined) {
                            const replacement = `FA:${ordnr}${attributes}`;
                            
                            // Replace just this occurrence 
                            const before = processedBracketContent.substring(0, matchPos);
                            const after = processedBracketContent.substring(matchPos + fullMatch.length);
                            processedBracketContent = before + replacement + after;
                            
                            console.log(`Replaced family car pattern "${fullMatch}" with "${replacement}"`);
                        }
                    }
                }
                
                // Find patterns like "):18" and handle them
                const ordnrAfterClosingMatches = [...processedBracketContent.matchAll(/\):([0-9]+)(#[A-Za-z;]+)?/g)];
                if (ordnrAfterClosingMatches.length > 0) {
                    for (const match of ordnrAfterClosingMatches) {
                        const fullMatch = match[0];          // e.g., "):18#VH"
                        const ordnr = match[1];              // e.g., "18"
                        const attributes = match[2] || '';   // e.g., "#VH"
                        
                        // Find what's before the closing parenthesis
                        const matchPos = match.index;
                        if (matchPos) {
                            // Look for the last token before the "):ordnr" pattern
                            let startPos = matchPos;
                            while (startPos > 0 && processedBracketContent[startPos] !== ',') {
                                startPos--;
                            }
                            if (processedBracketContent[startPos] === ',') startPos++; // Skip the comma
                            
                            const tokenBefore = processedBracketContent.substring(startPos, matchPos + 1); // e.g., "2)"
                            
                            // Check if this is a simple class number
                            const simpleClassMatch = tokenBefore.match(/^([12])\)$/);
                            if (simpleClassMatch) {
                                // Replace the token with the correct wagon number format
                                const classDigit = simpleClassMatch[1];
                                const replacement = `${classDigit}:${ordnr}${attributes}`;
                                
                                // Now update the processedContent
                                const before = processedBracketContent.substring(0, startPos);
                                const after = processedBracketContent.substring(matchPos + fullMatch.length);
                                processedBracketContent = before + replacement + after;
                                
                                console.log(`Rewritten "${tokenBefore}${fullMatch}" as "${replacement}"`);
                            }
                        }
                    }
                }
                
                // Log the processed content
                console.log(`Preprocessed content: ${processedBracketContent}`);
            }
            
            // Check if it has nested parenthesized groups
            const nestedGroups = this.findBracketedGroups(processedBracketContent, '(', ')');
            if (nestedGroups.length > 1) {
                console.log(`Found complex formation with sectors and nested parenthesized groups`);
                
                // First, extract the initial sector from the formation string
                // This is the sector marked at the beginning of the string (e.g., @C in "@C,...")
                let initialSector = 'N/A';
                const initialSectorMatch = formationString.match(/^@([A-Z])/);
                if (initialSectorMatch && initialSectorMatch[1]) {
                    initialSector = initialSectorMatch[1];
                    console.log(`Extracted initial sector ${initialSector} from formation string`);
                }
                
                // Extract all sector markers and their positions in the entire formation string
                const sectorMarkers: {letter: string, position: number}[] = [];
                let match;
                const sectorRegex = /@([A-Z])/g;
                
                // Create a working copy of the formation string
                let workingString = formationString;
                
                while ((match = sectorRegex.exec(workingString)) !== null) {
                    sectorMarkers.push({
                        letter: match[1],
                        position: match.index
                    });
                }
                
                console.log(`Found ${sectorMarkers.length} sector markers in complex formation`);
                
                // Find the most recent sector before the bracketed content
                // This should be the starting sector for the first group
                let startingSector = initialSector;
                for (const marker of sectorMarkers) {
                    if (marker.position < bracketStartPos) {
                        startingSector = marker.letter;
                        // Don't break - we want the last one before the bracket
                    }
                }
                
                if (startingSector !== initialSector) {
                    console.log(`Found more recent sector ${startingSector} before bracketed content`);
                }
                
                // Extract all sector markers directly from the bracket content
                const bracketSectorMarkers: {letter: string, position: number}[] = [];
                let bracketMatch;
                const bracketSectorRegex = /@([A-Z])/g;
                
                // Reset the regex to ensure we catch all markers
                while ((bracketMatch = bracketSectorRegex.exec(originalBracketContent)) !== null) {
                    bracketSectorMarkers.push({
                        letter: bracketMatch[1],
                        position: bracketMatch.index
                    });
                }
                
                if (bracketSectorMarkers.length > 0) {
                    console.log(`Found ${bracketSectorMarkers.length} sector markers in bracketed content: ${bracketSectorMarkers.map(m => m.letter).join(', ')}`);
                }
                
                // For Vallorbe-style patterns like (2,2,2,12)@B,(2,2,2,12), we need to 
                // explicitly detect which group the @B should apply to
                let sectorBetweenGroups: string | null = null;
                
                // First, find the exact pattern (group)@X in the original content
                if (bracketSectorMarkers.length > 0) {
                    // Examine the original bracket content to see if any sector marker
                    // comes after a closing parenthesis and before another opening parenthesis
                    // This is the critical pattern: (2,2,2,12)@B,(2,2,2,12)
                    
                    let pos = 0;
                    while (pos < originalBracketContent.length) {
                        // Look for a closing parenthesis followed by an @ marker
                        const closeParenPos = originalBracketContent.indexOf(')', pos);
                        if (closeParenPos === -1) break;
                        
                        // Check what's after the closing parenthesis
                        if (closeParenPos + 1 < originalBracketContent.length && 
                            originalBracketContent[closeParenPos + 1] === '@') {
                            // We found a sector marker right after a closing parenthesis
                            // This is the sector-after-parenthesis pattern: (2,2,2,12)@B
                            if (closeParenPos + 2 < originalBracketContent.length) {
                                const sectorLetter = originalBracketContent[closeParenPos + 2];
                                if (/[A-Z]/.test(sectorLetter)) {
                                    sectorBetweenGroups = sectorLetter;
                                    console.log(`*** CRITICAL: Found sector-after-parenthesis pattern - sector ${sectorLetter} after closing parenthesis`);
                                    
                                    // Now check if this is followed by a comma and another group
                                    const nextComma = originalBracketContent.indexOf(',', closeParenPos + 3);
                                    if (nextComma !== -1 && 
                                        nextComma + 1 < originalBracketContent.length && 
                                        originalBracketContent[nextComma + 1] === '(') {
                                        // This confirms we're dealing with the pattern:
                                        // (group)@B,(nextgroup)
                                        console.log(`*** CONFIRMED sector-after-parenthesis pattern: (group)@B,(nextgroup)`);
                                    }
                                }
                            }
                        }
                        pos = closeParenPos + 1;
                    }
                }
                
                // Process each nested group, tracking sector changes
                const allWagons: TrainWagon[] = [];
                let wagonPositionCounter = 0;
                
                // Start with the most recent sector found before the bracket
                let currentSector = startingSector;
                
                // Process each nested group
                for (let groupIndex = 0; groupIndex < nestedGroups.length; groupIndex++) {
                    const nestedGroup = nestedGroups[groupIndex];
                    
                    // Handle the sector-after-parenthesis pattern - change sector for the second group if we found a between-groups marker
                    if (groupIndex === 1 && sectorBetweenGroups !== null) {
                        currentSector = sectorBetweenGroups;
                        console.log(`*** Applied sector-after-parenthesis pattern fix - using sector ${currentSector} for group 2`);
                    }
                    
                    // Remove the outer parentheses
                    const nestedContent = nestedGroup.substring(1, nestedGroup.length - 1);
                    console.log(`Processing nested group ${groupIndex + 1}: ${nestedContent} in sector ${currentSector}`);
                    
                    // Pre-process the content to handle embedded sector markers
                    let processedContent = nestedContent;
                    
                    // Clean the tokens to properly handle embedded sector markers
                    // Split by comma first, then process each token for embedded sectors
                    const rawTokens = processedContent.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F' && t !== 'X');
                    const tokens: string[] = [];
                    
                    // Expand tokens with embedded sector markers into separate tokens
                    for (const rawToken of rawTokens) {
                        // Check for the pattern "something@Sector"
                        const embeddedSectorMatch = rawToken.match(/(.+)@([A-Z])/);
                        if (embeddedSectorMatch && embeddedSectorMatch[1] && embeddedSectorMatch[2]) {
                            // Add the part before the sector marker
                            tokens.push(embeddedSectorMatch[1]);
                            
                            // Add the sector marker as a separate token
                            tokens.push('@' + embeddedSectorMatch[2]);
                            
                            console.log(`Split token with embedded sector: ${rawToken} -> ${embeddedSectorMatch[1]}, @${embeddedSectorMatch[2]}`);
                        } else {
                            // If no embedded sector, add the token as is
                            tokens.push(rawToken);
                        }
                    }
                    
                    console.log(`Processing nested group with ${tokens.length} tokens, starting in sector ${currentSector}`);
                    
                    // Current sector for this token processing
                    let localSector = currentSector;
                    
                    // Process each token
                    for (let i = 0; i < tokens.length; i++) {
                        let token = tokens[i];
                        
                        // Check if this is a sector marker
                        if (token.startsWith('@') && token.length === 2) {
                            localSector = token.substring(1);
                            console.log(`Sector change to ${localSector}`);
                            continue; // Skip to next token
                        }
                        
                        // Add parentheses to mark no-passage
                        if (i === 0) token = '(' + token;
                        
                        // Handle the last token specially if there's content after the closing parenthesis
                        if (i === tokens.length - 1) {
                            token = token + ')';
                        }
                        
                        // Process normal token
                        if (this.isPotentialWagonToken(token)) {
                            console.log(`Processing standard token: "${token}" in sector ${localSector}`);
                            const wagon = this.parseSingleWagonToken(token, localSector, wagonPositionCounter++);
                            if (wagon) {
                                if (i === 0) wagon.noAccessToPrevious = true;
                                if (i === tokens.length - 1) wagon.noAccessToNext = true;
                                allWagons.push(wagon);
                            }
                        }
                    }
                    
                    // Update the current sector for the next group based on the local sector at the end of this group
                    currentSector = localSector;
                    console.log(`Finished processing group ${groupIndex + 1}, current sector is now ${currentSector}`);
                }
                
                // Log the parsed wagons for debugging
                console.log(`Parsed ${allWagons.length} total wagons across all sectors:`);
                allWagons.forEach((wagon, idx) => {
                    console.log(`Wagon ${idx}: ${wagon.type} in sector ${wagon.sector}, class ${wagon.classes.join('/')}`);
                });
                
                // Group wagons by sector
                for (const wagon of allWagons) {
                    const sector = wagon.sector;
                    if (!sectionsMap.has(sector)) {
                        sectionsMap.set(sector, []);
                    }
                    sectionsMap.get(sector)!.push(wagon);
                }
                
                // Create sections in order of first appearance
                const processedSectors = new Set<string>();
                const sections: TrainSection[] = [];
                
                // First, add sectors in the order they're defined in sector markers
                for (const marker of sectorMarkers) {
                    const sector = marker.letter;
                    if (!processedSectors.has(sector) && sectionsMap.has(sector)) {
                        sections.push({ sector, wagons: sectionsMap.get(sector)! });
                        processedSectors.add(sector);
                    }
                }
                
                // Add any remaining sectors that weren't in the formation string
                for (const [sector, wagons] of sectionsMap.entries()) {
                    if (!processedSectors.has(sector)) {
                        sections.push({ sector, wagons });
                    }
                }
                
                // Finalize wagons (update positions, check for no-passage)
                this.finalizeWagons(sections);
                
                // Print the final sections for debugging
                console.log(`Final sections after parsing:`);
                sections.forEach(section => {
                    console.log(`Section ${section.sector}: ${section.wagons.length} wagons`);
                });
                
                console.log(`Finished parsing complex formation with ${sections.length} sections and ${this.countTotalWagons(sections)} total wagons`);
                return sections;
            }
        }
    }

    // Regular processing for strings with sector markers (non-BLS strings)
    // ... rest of the original method ...

    // Regular processing for strings with sector markers (non-BLS strings)
    // Pre-process the string to separate embedded sector markers with commas
    // This ensures that sector markers embedded in tokens (like "2@B" -> "2,@B") are properly separated
    let processedFormationString = formationString;
    const embeddedSectorRegex = /([^@])@([A-Z])/g;
    processedFormationString = processedFormationString.replace(embeddedSectorRegex, "$1,@$2");
    
    if (processedFormationString !== formationString) {
        console.log(`Pre-processed formation string with separated sector markers: ${processedFormationString}`);
    }
    
    // Split the string by sector markers (@)
    const sectorParts = processedFormationString.split('@').filter(part => part.trim() !== '');
    
    console.log(`Found ${sectorParts.length} sector parts`);
    
    // Process each sector part
    for (const part of sectorParts) {
        // The first character should be the sector letter
        if (part.length > 0) {
            const sectorLetter = part[0];
            currentSector = sectorLetter;
    
            // Extract the content after the sector letter
            const sectorContent = part.substring(1).trim();
            console.log(`Processing sector ${sectorLetter} with content: ${sectorContent}`);
            
            // Skip empty sectors
            if (!sectorContent) continue;
            
            // Find any vehicle groups in the sector - use a more robust approach to handle nested brackets
            const vehicleGroupMatches = this.findBracketedGroups(sectorContent, '[', ']');
      
            if (vehicleGroupMatches.length > 0) {
                // Process each found vehicle group
                for (const groupContent of vehicleGroupMatches) {
                    console.log(`Found vehicle group in sector ${sectorLetter}: ${groupContent}`);
                    
                    // Parse wagons within the vehicle group - strip outer brackets
                    const innerContent = groupContent.substring(1, groupContent.length - 1);
                    
                    // Check if this contains multiple parenthesized groups
                    const nestedGroups = this.findBracketedGroups(innerContent, '(', ')');
                    
                    if (nestedGroups.length > 1) {
                        // Similar handling to the non-sector case, but aware of sector changes
                        console.log(`Found ${nestedGroups.length} nested parenthesized groups in sector ${currentSector}`);
                        
                        let localSector = currentSector;
                        
                        for (const nestedGroup of nestedGroups) {
                            // Remove the outer parentheses
                            const nestedContent = nestedGroup.substring(1, nestedGroup.length - 1);
                            console.log(`Processing nested group in sector ${localSector}: ${nestedContent}`);
                            
                            // Split by commas and process tokens, watching for sector changes
                            const tokens = nestedContent.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F' && t !== 'X');
                            
                            for (let i = 0; i < tokens.length; i++) {
                                let token = tokens[i];
                                
                                // Check for embedded sector changes
                                const sectorChangeMatch = token.match(/@([A-Z])/);
                                if (sectorChangeMatch && sectorChangeMatch[1]) {
                                    localSector = sectorChangeMatch[1];
                                    console.log(`Sector change detected in nested group: ${localSector}`);
                                    
                                    // Clean token for processing
                                    token = token.replace(/@[A-Z]/, '').trim();
                                    if (!token) continue; // Skip if empty after removing sector
                                }
                                
                                // Add parentheses for no-passage info
                                if (i === 0) {
                                    token = '(' + token;
                                }
                                if (i === tokens.length - 1) {
                                    token = token + ')';
                                }
                                
                                if (this.isPotentialWagonToken(token)) {
                                    const wagon = this.parseSingleWagonToken(token, localSector, wagonPositionCounter++);
                                    if (wagon) {
                                        // Set no-access flags for group boundaries
                                        if (i === 0) {
                                            wagon.noAccessToPrevious = true;
                                        }
                                        if (i === tokens.length - 1) {
                                            wagon.noAccessToNext = true;
                                        }
                                        
                                        // Add to section map
                                        if (!sectionsMap.has(localSector)) {
                                            sectionsMap.set(localSector, []);
                                        }
                                        
                                        sectionsMap.get(localSector)!.push(wagon);
                                    }
                                }
                            }
                        }
                    } else {
                        // Standard handling for the vehicle group
                    const wagons = this.parseVehicleGroupContent(innerContent, currentSector, wagonPositionCounter);
                    
                        // Add these wagons to the appropriate sectors
                        const wagonsBySector = new Map<string, TrainWagon[]>();
                        
                        // Group wagons by sector (they might have changed sectors during parsing)
                        for (const wagon of wagons) {
                            const wagonSector = wagon.sector || 'N/A';
                            if (!wagonsBySector.has(wagonSector)) {
                                wagonsBySector.set(wagonSector, []);
                    }
                            wagonsBySector.get(wagonSector)!.push(wagon);
                        }
                        
                        // Add wagons to their respective sectors
                        for (const [sector, sectorWagons] of wagonsBySector.entries()) {
                            if (!sectionsMap.has(sector)) {
                                sectionsMap.set(sector, []);
                            }
                            sectionsMap.get(sector)!.push(...sectorWagons);
                        }
                    
                    wagonPositionCounter += wagons.length;
                    }
                }
            }
            
            // Also process any individual wagon tokens outside of the vehicle groups
            // First remove any bracketed groups and then process the remaining content
            let remainingContent = sectorContent;
            for (const group of vehicleGroupMatches) {
                remainingContent = remainingContent.replace(group, ',');
            }
            
            // Special case: Handle the scenario where the sector content contains "[-("
            // First normalize the content to handle leading commas
            const normalizedContent = remainingContent.trim().replace(/^,+/, '');
            
            // Look for the special pattern anywhere in the content
            if (normalizedContent.includes('[-(')) {
                console.log(`Found special pattern [-(... in sector ${sectorLetter}, normalizing content`);
                
                // Find where the pattern starts
                const patternPos = normalizedContent.indexOf('[-(');
                
                // Extract the relevant part after '[-(' up to the first comma
                const relevantPart = normalizedContent.substring(patternPos + 3).split(',')[0];
                const specialFirstToken = '-(' + relevantPart;
                console.log(`Found special first token: ${specialFirstToken}`);
                
                // Process this token directly
                const specialWagon = this.parseSingleWagonToken(specialFirstToken, currentSector, wagonPositionCounter++);
                if (specialWagon) {
                    if (!sectionsMap.has(currentSector)) {
                        sectionsMap.set(currentSector, []);
                    }
                    sectionsMap.get(currentSector)!.push(specialWagon);
                }
                
                // Remove the special token from remaining content
                const beforePattern = normalizedContent.substring(0, patternPos);
                const afterRelevantPart = normalizedContent.substring(patternPos + 3 + relevantPart.length);
                remainingContent = beforePattern + afterRelevantPart;
                
                // If the result starts with a comma or bracket, clean it up
                remainingContent = remainingContent.replace(/^[\[,]+/, '').replace(/^[\[,]+/, '');
                console.log(`Remaining content after processing special token: ${remainingContent}`);
            }
            
            // Split by commas and filter out fictional wagons (F,X)
            const tokens = remainingContent.split(',')
                .map(t => t.trim())
                .filter(t => t !== '' && t !== 'F' && t !== 'X');
            
            console.log(`Processing ${tokens.length} individual wagon tokens in sector ${currentSector}`);
            
            // Special handling for the last token if it has closing brackets attached
            if (tokens.length > 0) {
                const lastToken = tokens[tokens.length - 1];
                const closingBracketsMatch = lastToken.match(/(.+?)([\)\]]+)$/);
                
                if (closingBracketsMatch && closingBracketsMatch[1] && closingBracketsMatch[2]) {
                    // Replace the last token with the clean version
                    const cleanToken = closingBracketsMatch[1];
                    tokens[tokens.length - 1] = cleanToken;
                    
                    console.log(`Cleaned last token with closing brackets: ${lastToken} -> ${cleanToken}`);
                }
            }
            
            // Process each potential wagon token
            for (const token of tokens) {
                // Check for embedded sector changes
                const sectorChangeMatch = token.match(/@([A-Z])/);
                if (sectorChangeMatch && sectorChangeMatch[1]) {
                    currentSector = sectorChangeMatch[1];
                    console.log(`Sector change detected in individual token: ${currentSector}`);
                    
                    // Clean token and process if not empty
                    const cleanToken = token.replace(/@[A-Z]/, '').trim();
                    if (!cleanToken) continue;
                    
                    if (this.isPotentialWagonToken(cleanToken)) {
                        const wagon = this.parseSingleWagonToken(cleanToken, currentSector, wagonPositionCounter++);
                        if (wagon) {
                            if (!sectionsMap.has(currentSector)) {
                                sectionsMap.set(currentSector, []);
                            }
                            
                            sectionsMap.get(currentSector)!.push(wagon);
                        }
                    }
                }
                else if (this.isPotentialWagonToken(token)) {
                    const wagon = this.parseSingleWagonToken(token, currentSector, wagonPositionCounter++);
                    if (wagon) {
                        if (!sectionsMap.has(currentSector)) {
                            sectionsMap.set(currentSector, []);
                        }
                        
                        sectionsMap.get(currentSector)!.push(wagon);
                    }
                }
            }
        }
    }
    
    // Keep the original order of sectors as they appeared in the string (important for visualization)
    // Instead of sorting by letter
    const orderedSectors = sectorParts
        .map(part => part.length > 0 ? part[0] : null)
        .filter((sectorLetter): sectorLetter is string => 
            sectorLetter !== null && sectionsMap.has(sectorLetter))
        .reduce((uniqueSectors, sectorLetter) => {
            if (!uniqueSectors.includes(sectorLetter)) {
                uniqueSectors.push(sectorLetter);
            }
            return uniqueSectors;
        }, [] as string[]);
    
    // Convert map to array of sections in the order they appeared in the formation string
    const sections: TrainSection[] = [];
    
    // First add the ordered sectors we found above
    orderedSectors.forEach(sector => {
        if (sectionsMap.has(sector) && sectionsMap.get(sector)!.length > 0) {
            sections.push({ sector, wagons: sectionsMap.get(sector)! });
        }
    });
    
    // Then add any sectors that were discovered during nested processing but weren't in the original parts
    for (const [sector, wagons] of sectionsMap.entries()) {
        if (!orderedSectors.includes(sector) && wagons.length > 0) {
            sections.push({ sector, wagons });
        }
    }
    
    // Maintain sequential wagon numbering across the entire train and check for cross-sector no-passage
    this.finalizeWagons(sections);
    
    console.log(`Finished parsing ${sections.length} sections with ${this.countTotalWagons(sections)} total wagons`);
    return sections;
  }

  /**
   * Specialized parser for BLS train formations without sector information
   * 
   * This method handles BLS-specific formation strings that lack sector markers.
   * BLS uses a different notation format compared to SBB, requiring special
   * handling to correctly interpret wagon compositions.
   * 
   * @param {string} formationString - The raw formation string from BLS trains without sector markers
   * @returns {TrainSection[]} Processed train sections with properly parsed wagons
   */
  private parseBlsFormationWithoutSectors(formationString: string): TrainSection[] {
    console.log("Parsing BLS formation without sectors");
    
    // Extract all vehicle groups from the string
    const vehicleGroups = this.findBracketedGroups(formationString, '[', ']');
    
    if (vehicleGroups.length === 0) {
        console.warn("No vehicle groups found in BLS formation");
        return [];
    }
    
    // For each vehicle group, extract the individual wagon tokens
    const wagons: TrainWagon[] = [];
    let position = 0;
    
    for (const group of vehicleGroups) {
        // Remove the outer brackets
        const innerContent = group.substring(1, group.length - 1);
        console.log(`Processing BLS vehicle group content: ${innerContent}`);
        
        // First check for the complex pattern with parenthesized list and trailing attributes
        // Example: "(2#VH;NF,2#BHP;NF,12#NF,12#VH;NF,2#VH;NF,2)#VH;NF"
        const complexPatternMatch = innerContent.match(/^\((.+)\)(#[A-Za-z;]+)$/);
        
        if (complexPatternMatch) {
            console.log("Detected complex formation pattern with trailing attributes");
            const wagonListContent = complexPatternMatch[1]; // The comma-separated list inside parentheses
            const trailingAttrs = complexPatternMatch[2]; // The attributes after the closing parenthesis
            
            // Split the wagon list by commas
            const wagonTokens = wagonListContent.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F' && t !== 'X');
            
            console.log(`Found ${wagonTokens.length} individual wagon tokens in parenthesized group`);
            
            // Process each wagon token, adding the trailing attributes if needed
            for (let i = 0; i < wagonTokens.length; i++) {
                let token = wagonTokens[i];
                
                // Add the trailing attributes if the token doesn't already have attributes
                if (!token.includes('#')) {
                    token += trailingAttrs;
                }
                
                // Add parentheses markers to first and last tokens to preserve no-passage info
                if (i === 0) {
                    token = '(' + token;
                }
                if (i === wagonTokens.length - 1) {
                    token += ')';
                }
                
                if (this.isPotentialWagonToken(token)) {
                    const wagon = this.parseSingleWagonToken(token, 'N/A', position++);
                    if (wagon) {
                        // Handle no-access indicators based on parentheses
                        if (i === 0) {
                            wagon.noAccessToPrevious = true;
                        }
                        if (i === wagonTokens.length - 1) {
                            wagon.noAccessToNext = true;
                        }
                        
                        wagons.push(wagon);
                    }
                }
            }
            
            continue; // Skip the rest of the processing for this group
        }
        
        // First strip any trailing attributes that apply to the entire group
        let processedContent = innerContent;
        const trailingAttrMatch = processedContent.match(/#([A-Za-z;]+)$/);
        if (trailingAttrMatch) {
            // Remove the trailing attributes, they'll be added to each wagon later
            const trailingAttrs = trailingAttrMatch[0];
            processedContent = processedContent.substring(0, processedContent.length - trailingAttrs.length);
        }
        
        // Look for inner parentheses groups that need special handling
        const parenthesisGroups = this.findBracketedGroups(processedContent, '(', ')');
        
        if (parenthesisGroups.length > 0) {
            console.log(`Found ${parenthesisGroups.length} parenthesis groups in BLS formation without sectors`);
        }
        
        // Split the content by commas to get individual wagon tokens
        let tokens: string[] = [];
        
        if (processedContent.includes(',')) {
            // If there are commas, split by them
            tokens = processedContent.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F' && t !== 'X');
        } else if (parenthesisGroups.length === 1 && parenthesisGroups[0] === processedContent) {
            // If the entire content is a single parenthesis group, remove the outer parentheses and split by commas
            const innerGroupContent = processedContent.substring(1, processedContent.length - 1);
            tokens = innerGroupContent.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F' && t !== 'X');
            
            // Add back the parentheses to the first and last tokens to preserve no-passage information
            if (tokens.length > 0) {
                tokens[0] = '(' + tokens[0];
                tokens[tokens.length - 1] = tokens[tokens.length - 1] + ')';
            }
        } else {
            // If there are no commas and it's not a single parenthesis group, treat it as a single token
            tokens = [processedContent];
        }
        
        console.log(`Found ${tokens.length} individual wagon tokens in BLS formation without sectors`);
        
        // Add any trailing attributes back to each token if they were present
        if (trailingAttrMatch) {
            tokens = tokens.map(token => {
                // Only add the trailing attributes if the token doesn't already have attributes
                if (!token.includes('#')) {
                    return token + trailingAttrMatch[0];
                }
                return token;
            });
        }
        
        // Process each token as a potential wagon
        for (const token of tokens) {
            if (this.isPotentialWagonToken(token)) {
                const wagon = this.parseSingleWagonToken(token, 'N/A', position++);
                if (wagon) {
                    wagons.push(wagon);
                }
            }
        }
    }
    
    // Create a single section for all wagons
    const sections: TrainSection[] = [];
    if (wagons.length > 0) {
        sections.push({ sector: 'N/A', wagons });
    }
    
    // Finalize the wagons (update positions, check for no-passage)
    this.finalizeWagons(sections);
    
    console.log(`Finished parsing BLS formation without sectors: ${sections.length} sections, ${wagons.length} wagons`);
    return sections;
  }

  /**
   * Specialized parser for BLS train formations with sector information
   * 
   * This method handles BLS-specific formation strings that include sector markers.
   * The BLS notation uses a different format for indicating wagon classes, types,
   * and sector boundaries compared to SBB formations.
   * 
   * @param {string} formationString - The raw formation string from BLS trains with sector markers
   * @returns {TrainSection[]} Processed train sections with wagons grouped by sectors
   */
  private parseBlsFormationString(formationString: string): TrainSection[] {
    console.log("Parsing BLS formation string (special handling)");
    const sectionsMap = new Map<string, TrainWagon[]>();
    let wagonPositionCounter = 0;
    
    // Extract all bracketed vehicle groups first
    const vehicleGroups = this.findBracketedGroups(formationString, '[', ']');
    
    if (vehicleGroups.length === 0) {
        console.warn("No vehicle groups found in BLS formation string");
        return [];
    }
    
    // Extract sector markers and their positions in the string
    const sectorMarkers: {letter: string, position: number}[] = [];
    let match;
    const sectorRegex = /@([A-Z])/g;
    while ((match = sectorRegex.exec(formationString)) !== null) {
        sectorMarkers.push({
            letter: match[1],
            position: match.index
        });
    }
    
    console.log(`Found ${sectorMarkers.length} sector markers in BLS formation string`);
    
    // Process each vehicle group (typically only one in BLS formations)
    for (const groupContent of vehicleGroups) {
        console.log(`Processing BLS vehicle group: ${groupContent}`);
        
        // Get the raw string between the brackets
        const innerGroupContent = groupContent.substring(1, groupContent.length - 1);
        
        // We'll use a more robust approach to handle embedded sector markers
        // by pre-processing the string to separate sector markers from wagon tokens
        
        // 1. First, replace embedded sector markers with a special delimiter
        let processedContent = innerGroupContent;
        const embeddedSectorRegex = /@([A-Z])/g;
        processedContent = processedContent.replace(embeddedSectorRegex, ",@$1,");
        
        // 2. Clean up any potential double commas created by the replacement
        processedContent = processedContent.replace(/,+/g, ',');
        processedContent = processedContent.replace(/^,|,$/g, ''); // Remove leading/trailing commas
        
        console.log(`Processed content with separated sector markers: ${processedContent}`);
        
        // Find the first sector marker before or at the start of the group
        let currentSector = "N/A";
        const groupStartPos = formationString.indexOf(groupContent);
        for (let i = sectorMarkers.length - 1; i >= 0; i--) {
            if (sectorMarkers[i].position <= groupStartPos) {
                currentSector = sectorMarkers[i].letter;
                break;
            }
        }
        
        console.log(`Starting sector before vehicle group: ${currentSector}`);
        
        // Split by commas to get tokens and standalone sector markers
        let tokens = processedContent.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'F');
        
        console.log(`Found ${tokens.length} tokens within vehicle group (including sector markers)`);
        
        // Process each token, which could be a wagon or a sector marker
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Check if this token is a standalone sector marker
            const sectorMarkerMatch = token.match(/^@([A-Z])$/);
            if (sectorMarkerMatch) {
                // Update our current sector
                currentSector = sectorMarkerMatch[1];
                console.log(`Sector change detected to: ${currentSector}`);
                continue; // Skip to next token
            }
            
            // Process this token as a potential wagon
            if (this.isPotentialWagonToken(token)) {
                console.log(`Processing potential BLS wagon token: ${token} in sector ${currentSector}`);
                const wagon = this.parseSingleWagonToken(token, currentSector, wagonPositionCounter++);
                
                if (wagon) {
                    // Make sure we have a container for this sector
                    if (!sectionsMap.has(currentSector)) {
                        sectionsMap.set(currentSector, []);
                    }
                    
                    sectionsMap.get(currentSector)!.push(wagon);
                    console.log(`Added BLS wagon to sector ${currentSector}: ${wagon.type}, classes: ${wagon.classes.join('/')}`);
                }
            } else {
                console.log(`Not a valid wagon token: ${token}`);
            }
        }
    }
    
    // Convert map to ordered array of sections in the order they appear in the formation string
    // This is important for the correct visual order of sectors
    const sections: TrainSection[] = [];
    const processedSectors = new Set<string>();
    
    // Process sectors in the original order they appear in the formation string
    for (const marker of sectorMarkers) {
        const sectorLetter = marker.letter;
        
        // Skip if we've already processed this sector
        if (processedSectors.has(sectorLetter)) continue;
        
        // Add sector with its wagons if there are any
        if (sectionsMap.has(sectorLetter) && sectionsMap.get(sectorLetter)!.length > 0) {
            sections.push({ sector: sectorLetter, wagons: sectionsMap.get(sectorLetter)! });
            processedSectors.add(sectorLetter);
        }
    }
    
    // Then add any sectors without markers (like "N/A") at the end if they have wagons
    for (const [sector, wagons] of sectionsMap.entries()) {
        if (!processedSectors.has(sector) && wagons.length > 0) {
            sections.push({ sector, wagons });
        }
    }
    
    // Finalize positions and check for no-passage
    this.finalizeWagons(sections);
    
    // Debugging output
    const totalWagons = this.countTotalWagons(sections);
    console.log(`Finished parsing BLS formation with ${sections.length} sections and ${totalWagons} wagons`);
    
    if (sections.length > 0) {
        sections.forEach(section => {
            console.log(`Section ${section.sector} has ${section.wagons.length} wagons`);
            section.wagons.forEach(wagon => {
                console.log(`  ${wagon.type} (${wagon.classes.join('/')}), attrs: ${wagon.attributes.map(a => a.code).join(';')}`);
            });
        });
    } else {
        console.warn("No sections or wagons were parsed from the BLS formation string");
    }
    
    return sections;
  }

  private finalizeWagons(sections: TrainSection[]): void {
    let finalPosition = 0;
    let previousWagon: TrainWagon | null = null;
    
    // Create a flat list of all wagons in order
    const allWagons: TrainWagon[] = [];
    sections.forEach(section => {
        section.wagons.forEach(wagon => {
            allWagons.push(wagon);
        });
    });
    
    // Find the locomotive(s) and mark explicit connections
    const locomotives: TrainWagon[] = allWagons.filter(w => w.type === 'locomotive');
    
    // Assign positions and verify cross-section no-access
    allWagons.forEach((wagon, idx) => {
        wagon.position = finalPosition++;
        
        // Check cross-sector no-passage
        if (previousWagon && 
            (previousWagon.noAccessToNext || wagon.noAccessToPrevious)) {
            // Ensure both wagons have the flags set correctly
            previousWagon.noAccessToNext = true;
            wagon.noAccessToPrevious = true;
            
            // Check if either wagon is closed (has the "Closed" status)
            const isPreviousClosed = previousWagon.statusCodes?.includes('Closed') || false;
            const isCurrentClosed = wagon.statusCodes?.includes('Closed') || false;
            
            // Create descriptive no-passage messages
            if (previousWagon.type === 'locomotive') {
                // For locomotive, use specific wording
                previousWagon.noAccessMessage = `No passage between ${isCurrentClosed ? 'closed car' : 'car ' + (wagon.number || wagon.type)} and locomotive`;
                wagon.noAccessMessage = `No passage between ${isCurrentClosed ? 'closed car' : 'car ' + (wagon.number || wagon.type)} and locomotive`;
            } else if (wagon.type === 'locomotive') {
                // For the wagon before locomotive
                previousWagon.noAccessMessage = `No passage between ${isPreviousClosed ? 'closed car' : 'car ' + (previousWagon.number || previousWagon.type)} and locomotive`;
                wagon.noAccessMessage = `No passage between ${isPreviousClosed ? 'closed car' : 'car ' + (previousWagon.number || previousWagon.type)} and locomotive`;
            } else {
                // Regular wagon-to-wagon passage
                const prevDesc = isPreviousClosed ? 'closed car' : 'car ' + (previousWagon.number || previousWagon.type);
                const currDesc = isCurrentClosed ? 'closed car' : 'car ' + (wagon.number || wagon.type);
                
                previousWagon.noAccessMessage = `No passage between ${prevDesc} and ${currDesc}`;
                wagon.noAccessMessage = `No passage between ${prevDesc} and ${currDesc}`;
            }
            
            // Log cross-section no-passage for debugging
            console.log(`No passage between wagon ${previousWagon.number || (isPreviousClosed ? 'Closed' : 'Locomotive')} and ${wagon.number || (isCurrentClosed ? 'Closed' : 'Locomotive')}`);
        }
        
        previousWagon = wagon;
    });
    
    // Special post-processing for locomotives to ensure both sides show no-passage if applicable
    locomotives.forEach(loco => {
        // Find adjacent wagons to the locomotive
        const locoIndex = allWagons.indexOf(loco);
        
        // For locomotives at either end of the train
        if (locoIndex === 0) {
            // Locomotive at the start - check the next wagon
            const nextWagon = allWagons[1];
            if (nextWagon && (loco.noAccessToNext || nextWagon.noAccessToPrevious)) {
                loco.noAccessToNext = true;
                nextWagon.noAccessToPrevious = true;
                
                // Check if the next wagon is closed
                const isNextClosed = nextWagon.statusCodes?.includes('Closed') || false;
                const nextDesc = isNextClosed ? 'closed car' : 'car ' + (nextWagon.number || nextWagon.type);
                
                loco.noAccessMessage = `No passage between ${nextDesc} and locomotive`;
                nextWagon.noAccessMessage = `No passage between ${nextDesc} and locomotive`;
            }
        } else if (locoIndex === allWagons.length - 1) {
            // Locomotive at the end - check the previous wagon
            const prevWagon = allWagons[locoIndex - 1];
            if (prevWagon && (loco.noAccessToPrevious || prevWagon.noAccessToNext)) {
                loco.noAccessToPrevious = true;
                prevWagon.noAccessToNext = true;
                
                // Check if the previous wagon is closed
                const isPrevClosed = prevWagon.statusCodes?.includes('Closed') || false;
                const prevDesc = isPrevClosed ? 'closed car' : 'car ' + (prevWagon.number || prevWagon.type);
                
                loco.noAccessMessage = `No passage between ${prevDesc} and locomotive`;
                prevWagon.noAccessMessage = `No passage between ${prevDesc} and locomotive`;
            }
        } else {
            // Locomotive in the middle - check both sides
            
            // Check next wagon
            const nextWagon = allWagons[locoIndex + 1];
            if (nextWagon && (loco.noAccessToNext || nextWagon.noAccessToPrevious)) {
                loco.noAccessToNext = true;
                nextWagon.noAccessToPrevious = true;
                
                // Check if the next wagon is closed
                const isNextClosed = nextWagon.statusCodes?.includes('Closed') || false;
                const nextDesc = isNextClosed ? 'closed car' : 'car ' + (nextWagon.number || nextWagon.type);
                
                loco.noAccessMessage = `No passage between ${nextDesc} and locomotive`;
                nextWagon.noAccessMessage = `No passage between ${nextDesc} and locomotive`;
            }
            
            // Check previous wagon
            const prevWagon = allWagons[locoIndex - 1];
            if (prevWagon && (loco.noAccessToPrevious || prevWagon.noAccessToNext)) {
                loco.noAccessToPrevious = true;
                prevWagon.noAccessToNext = true;
                
                // Check if the previous wagon is closed
                const isPrevClosed = prevWagon.statusCodes?.includes('Closed') || false;
                const prevDesc = isPrevClosed ? 'closed car' : 'car ' + (prevWagon.number || prevWagon.type);
                
                // Only override message if it wasn't set above
                if (!loco.noAccessMessage) {
                    loco.noAccessMessage = `No passage between ${prevDesc} and locomotive`;
                }
                prevWagon.noAccessMessage = `No passage between ${prevDesc} and locomotive`;
            }
            
            // If locomotive has no passage on both sides, create a clearer message
            if (loco.noAccessToPrevious && loco.noAccessToNext) {
                loco.noAccessMessage = 'No passage through locomotive';
            }
        }
    });
  }
    
  private countTotalWagons(sections: TrainSection[]): number {
    return sections.reduce((count, section) => count + section.wagons.length, 0);
  }

  /**
   * Helper method to find all balanced bracket-enclosed groups in a string
   * Handles nested brackets correctly
   */
  private findBracketedGroups(str: string, openBracket: string, closeBracket: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let startIndex = -1;
    
    for (let i = 0; i < str.length; i++) {
        if (str[i] === openBracket) {
            if (depth === 0) {
                startIndex = i;
            }
            depth++;
        } else if (str[i] === closeBracket) {
            depth--;
            if (depth === 0 && startIndex !== -1) {
                result.push(str.substring(startIndex, i + 1));
                startIndex = -1;
            }
        }
    }
    
    return result;
  }

  /**
   * Parses the content inside a vehicle group, handling various special patterns
   * @param groupContent Content inside a vehicle group (without outer brackets)
   * @param currentTopLevelSector Current sector letter
   * @param startPosition Starting position for wagon numbering
   * @returns Array of parsed train wagons
   */
  private parseVehicleGroupContent(groupContent: string, currentTopLevelSector: string, startPosition: number): TrainWagon[] {
    const wagons: TrainWagon[] = [];
    let position = startPosition;
    let currentSector = currentTopLevelSector;
    
    console.log(`Parsing vehicle group content: ${groupContent}`);
    
    // Special handling for groups that start with "-(something"
    if (groupContent.match(/^-\(/)) {
      // Create a special token for the first part: -(1
      const firstStatus = groupContent.charAt(0); // Get the status character '-'
      
      // Important fix: make sure we get ALL tokens in the closed section
      // Look for the first closing paren that's not matched with an opening one
      let endIndex = -1;
      let parenCount = 0;
      
      for (let i = 1; i < groupContent.length; i++) {
        if (groupContent[i] === '(') parenCount++;
        else if (groupContent[i] === ')') {
          if (parenCount === 0) {
            endIndex = i;
            break;
          }
          parenCount--;
        }
      }
      
      // If we couldn't find a closing paren, just take until first comma
      const relevantPart = endIndex > 0 ? 
                         groupContent.substring(2, endIndex) : 
                         groupContent.substring(2).split(',')[0];
      
      console.log(`Special opening section has content: "${relevantPart}"`);
      
      // The relevant part might contain multiple tokens that need to be processed separately
      const firstSectionTokens = relevantPart.split(',').map(t => t.trim()).filter(t => t !== '');
      
      for (let i = 0; i < firstSectionTokens.length; i++) {
        let token = firstSectionTokens[i];
        
        // Check for sector markers in these tokens
        const sectorMarkerMatch = token.match(/@([A-Z])/);
        if (sectorMarkerMatch) {
          // Handle token with sector change
          const parts = token.split('@');
          
          // Process part before the sector marker
          if (parts[0] && this.isPotentialWagonToken(parts[0])) {
            const specialToken = (i === 0 ? firstStatus + '(' : '') + parts[0];
            console.log(`Processing special token with sector: ${specialToken}`);
            
            const wagon = this.parseSingleWagonToken(specialToken, currentSector, position++);
            if (wagon) {
              if (i === 0) wagon.noAccessToPrevious = true;
              wagons.push(wagon);
            }
          }
          
          // Update the current sector
          currentSector = sectorMarkerMatch[1];
          console.log(`Updated sector to ${currentSector} in special section`);
          
          // Process any content after the sector marker
          if (parts.length > 1 && parts[1].length > 1) { // Skip the sector letter itself
            const afterSectorPart = parts[1].substring(1);
            if (this.isPotentialWagonToken(afterSectorPart)) {
              const specialToken = afterSectorPart;
              console.log(`Processing part after sector marker: ${specialToken}`);
              
              const wagon = this.parseSingleWagonToken(specialToken, currentSector, position++);
              if (wagon) {
                wagons.push(wagon);
              }
            }
          }
          
          continue;
        }
        
        // For tokens without sector markers
        const specialToken = (i === 0 ? firstStatus + '(' : '') + token;
        console.log(`Processing special token: ${specialToken}`);
        
        const wagon = this.parseSingleWagonToken(specialToken, currentSector, position++);
        if (wagon) {
          if (i === 0) wagon.noAccessToPrevious = true;
          wagons.push(wagon);
        }
      }
      
      // Modify the groupContent to remove this first special section
      const remainingContent = endIndex > 0 ? 
                             groupContent.substring(endIndex + 1) : 
                             groupContent.substring(2 + relevantPart.length);
      
      // If the remainder starts with a comma, remove it
      groupContent = remainingContent.startsWith(',') ? 
                     remainingContent.substring(1) : 
                     remainingContent;
      
      console.log(`Remaining content after handling special opening section: ${groupContent}`);
    }
    
    // Special handling for the middle-closed-section case: Check for a closed section in the middle of the content
    // Pattern like "2):7,-(2,-2@A,-2,-2,-W1,-1,-1)"
    const closedSectionMatch = groupContent.match(/,(-\()/);
    if (closedSectionMatch && closedSectionMatch.index !== undefined) {
      const splitPos = closedSectionMatch.index;
      console.log(`Found closed section in the middle at position ${splitPos}`);
      
      // Process the content before the closed section normally
      const beforeContent = groupContent.substring(0, splitPos);
      console.log(`Processing content before closed section: ${beforeContent}`);
      
      // Process content before the closed section
      const beforeWagons = this.processNormalGroupContent(beforeContent, currentSector, position);
      wagons.push(...beforeWagons);
      position += beforeWagons.length;
      
      // Now process the closed section part
      const afterContent = groupContent.substring(splitPos + 1); // Skip the comma
      console.log(`Processing closed section part: ${afterContent}`);
      
      // Create a special token for the status character
      const firstStatus = afterContent.charAt(0); // Should be '-'
      
      // Find where the closed section ends
      let endIndex = -1;
      let parenCount = 0;
      
      for (let i = 1; i < afterContent.length; i++) {
        if (afterContent[i] === '(') parenCount++;
        else if (afterContent[i] === ')') {
          if (parenCount === 0) {
            endIndex = i;
            break;
          }
          parenCount--;
        }
      }
      
      // Extract the content of the closed section
      const relevantPart = endIndex > 0 ?
                          afterContent.substring(2, endIndex) :
                          afterContent.substring(2).split(',')[0];
      
      console.log(`Closed section in the middle has content: "${relevantPart}"`);
      
      // Process each token in the closed section
      const closedSectionTokens = relevantPart.split(',').map(t => t.trim()).filter(t => t !== '');
      
      for (let i = 0; i < closedSectionTokens.length; i++) {
        let token = closedSectionTokens[i];
        
        // Check for sector markers
                const sectorMarkerMatch = token.match(/@([A-Z])/);
                if (sectorMarkerMatch) {
          // Handle token with sector change
          const parts = token.split('@');
                    
          // Process part before the sector marker
                    if (parts[0] && this.isPotentialWagonToken(parts[0])) {
            const specialToken = (i === 0 ? firstStatus + '(' : '') + parts[0];
            console.log(`Processing closed section token with sector: ${specialToken}`);
            
            const wagon = this.parseSingleWagonToken(specialToken, currentSector, position++);
            if (wagon) {
              if (i === 0) wagon.noAccessToPrevious = true;
              wagons.push(wagon);
            }
          }
          
          // Update the current sector
                    currentSector = sectorMarkerMatch[1];
          console.log(`Updated sector to ${currentSector} in closed section`);
          
          // Process any content after the sector marker
          if (parts.length > 1 && parts[1].length > 1) {
            const afterSectorPart = parts[1].substring(1);
            if (this.isPotentialWagonToken(afterSectorPart)) {
              const specialToken = afterSectorPart;
              console.log(`Processing part after sector marker in closed section: ${specialToken}`);
              
              const wagon = this.parseSingleWagonToken(specialToken, currentSector, position++);
              if (wagon) {
                wagons.push(wagon);
              }
                        }
                    }
                    
                    continue;
                }
                
        // For tokens without sector markers
        const specialToken = (i === 0 ? firstStatus + '(' : '') + token;
        console.log(`Processing closed section token: ${specialToken}`);
        
        const wagon = this.parseSingleWagonToken(specialToken, currentSector, position++);
                    if (wagon) {
          if (i === 0) wagon.noAccessToPrevious = true;
                        wagons.push(wagon);
                    }
                }
      
      // Check for any remaining content after the closed section
      if (endIndex > 0 && endIndex + 1 < afterContent.length) {
        const afterClosedSection = afterContent.substring(endIndex + 1);
        if (afterClosedSection.length > 0 && afterClosedSection !== ')') {
          console.log(`Processing content after closed section: ${afterClosedSection}`);
          
          // Remove leading comma if present
          const cleanAfterContent = afterClosedSection.startsWith(',') ?
                                  afterClosedSection.substring(1) :
                                  afterClosedSection;
          
          // Process the remaining content
          const afterWagons = this.processNormalGroupContent(cleanAfterContent, currentSector, position);
          wagons.push(...afterWagons);
        }
      }
      
      // We've handled everything in this special case
        return wagons;
    }
    
    // First check for any pattern with ordnr after closing parenthesis in the full content
    // This is a special case that needs to be handled before splitting
    const fullContentOrdnrMatches = [...groupContent.matchAll(/([A-Z]+)\):(\d+)(#[A-Za-z;]+)?/g)];
    if (fullContentOrdnrMatches.length > 0) {
      console.log(`Found ${fullContentOrdnrMatches.length} special patterns with ordnr after closing parenthesis in full content`);
      for (const match of fullContentOrdnrMatches) {
        const fullMatch = match[0];        // e.g., "FA):9#VH;NF"
        const wagonType = match[1];        // e.g., "FA"
        const ordnr = match[2];            // e.g., "9"
        const attributes = match[3] || ''; // e.g., "#VH;NF"
        
        // Find position in content to avoid affecting other tokens
        const matchPosition = match.index;
        if (matchPosition !== undefined) {
          console.log(`Found special pattern at position ${matchPosition}: ${fullMatch}`);
          
          // Create a combined token that won't be split during comma splitting
          const replacementToken = `${wagonType}:${ordnr}${attributes}`;
          
          // Replace only this occurrence
          const beforeMatch = groupContent.substring(0, matchPosition);
          const afterMatch = groupContent.substring(matchPosition + fullMatch.length);
          groupContent = beforeMatch + replacementToken + afterMatch;
          
          console.log(`Preprocessed content by replacing "${fullMatch}" with "${replacementToken}"`);
        }
      }
    }
    
    // If we've reached here, process the remaining content normally
    const normalWagons = this.processNormalGroupContent(groupContent, currentSector, position);
    wagons.push(...normalWagons);
    
        return wagons;
    }
  
  // Helper method to process normal group content without special patterns
  private processNormalGroupContent(content: string, startingSector: string, startPosition: number): TrainWagon[] {
    const wagons: TrainWagon[] = [];
    let position = startPosition;
    let currentSector = startingSector;
    
    // First perform a preprocessing step to handle special patterns
    // like "2):20#VR" which are not properly split by commas
    const specialPattern = /(\d+\):\d+[#;][A-Z;]+)/g;
    let processedContent = content;
    const specialMatches = content.match(specialPattern);
    
    if (specialMatches) {
      specialMatches.forEach(match => {
        // Replace the pattern with a version that has an explicit comma
        // E.g., "2):20#VR" -> "2),20#VR"
        const fixed = match.replace(/\):/, '),');
        processedContent = processedContent.replace(match, fixed);
      });
      console.log(`Pre-processed content: ${processedContent}`);
    }
    
    // Also look for patterns where there's something like "2):20" without attributes
    const simpleSpecialPattern = /(\d+\):\d+)(?![#;][A-Z])/g;
    const simpleSpecialMatches = processedContent.match(simpleSpecialPattern);
    
    if (simpleSpecialMatches) {
      simpleSpecialMatches.forEach(match => {
        // Replace the pattern similarly
        const fixed = match.replace(/\):/, '),');
        processedContent = processedContent.replace(match, fixed);
      });
      console.log(`Pre-processed content after simple patterns: ${processedContent}`);
    }
    
    // Special handling for unprocessed "2):" patterns that might remain
    const remainingUnprocessedPattern = /(\d+\)):(?!,)/g;
    const remainingMatches = processedContent.match(remainingUnprocessedPattern);
    
    if (remainingMatches) {
      remainingMatches.forEach(match => {
        // Insert comma after the closing parenthesis
        const fixed = match.replace(/\):/, '),');
        processedContent = processedContent.replace(match, fixed);
      });
      console.log(`Final pre-processed content: ${processedContent}`);
    }
    
    // Handle last element with closing parenthesis properly 
    // For cases like "1):1" at the end of a group without a comma
    const lastClosingPattern = /(\d+):\d+\)$/;
    const lastClosingMatch = processedContent.match(lastClosingPattern);
    if (lastClosingMatch) {
      // Ensure there's no missing token by adding a comma before the closing parenthesis
      const fixed = processedContent.replace(/(\d+:\d+)\)$/, "$1),");
      processedContent = fixed;
      console.log(`Processed content after fixing last closing token: ${processedContent}`);
    }
    
    // Fix pattern where there's something like "1:2,1):1" at the end
    const endGroupPattern = /,(\d+):\d+\)$/;
    const endGroupMatch = processedContent.match(endGroupPattern);
    if (endGroupMatch) {
      // Move the closing parenthesis after the last number to ensure it's captured
      const fixed = processedContent.replace(/,(\d+):(\d+)\)$/, ",$1:$2),");
      processedContent = fixed;
      console.log(`Processed content after fixing end group token: ${processedContent}`);
    }
    
    // Special case for patterns like "2):7#FZ" at the end 
    const complexOrdnrPattern = /(\d+)\):(\d+)(#[A-Z;]+)?\)$/;
    const complexOrdnrMatch = processedContent.match(complexOrdnrPattern);
    if (complexOrdnrMatch) {
      // Ensure we capture the last wagon by separating the closing parenthesis
      let fixed = processedContent;
      if (complexOrdnrMatch[3]) { // With attributes
        fixed = processedContent.replace(/(\d+)\):(\d+)(#[A-Z;]+)\)$/, "$1):$2$3),");
      } else { // Without attributes
        fixed = processedContent.replace(/(\d+)\):(\d+)\)$/, "$1):$2),");
      }
      processedContent = fixed;
      console.log(`Processed content after fixing complex ordnr pattern: ${processedContent}`);
    }
    
    // Simplify our approach - split by commas and handle each token
    const tokens = processedContent.split(',').map(t => t.trim()).filter(t => t !== '');
    
    console.log(`Parsing vehicle group with ${tokens.length} tokens in sector ${currentSector}`);
    
    // Track parentheses for no-access markings
    let openParenthesesIndex = -1;
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        // Check if it's a nested sector marker (standalone or embedded)
        if (token.startsWith('@') && token.length === 2) {
            currentSector = token[1]; // Extract the sector letter (e.g., '@C' -> 'C')
            console.log(`Found nested sector: ${currentSector}`);
            continue; // Skip to next token
        }
        
        // Also check for embedded sector markers in the middle of the token
        const embeddedSectorMatch = token.match(/@([A-Z])/);
        if (embeddedSectorMatch && !token.startsWith('@')) {
            // Update sector but keep processing this token (may contain a wagon)
            currentSector = embeddedSectorMatch[1];
            console.log(`Found embedded sector marker in token: ${token}, changing to sector ${currentSector}`);
            
            // Create a clean token without the sector marker
            const cleanToken = token.replace(/@[A-Z]/, '').trim();
            
            // Skip if the token is now empty
            if (!cleanToken) continue;
            
            // Process the cleaned token as a potential wagon
            if (this.isPotentialWagonToken(cleanToken)) {
                const wagon = this.parseSingleWagonToken(cleanToken, currentSector, position++);
                if (wagon) {
                    wagons.push(wagon);
                }
            }
            
            continue; // Continue to next token since we've handled this one
        }
        
        // Skip fictional wagons
        if (token === 'F' || token === 'X') {
            continue;
      }
      
        // Check if this token starts a no-access group
        if (token.startsWith('(')) {
            openParenthesesIndex = wagons.length; // Store index where no-access group starts
        }
        
        // Special check for tokens with isolated numbers that might be wagon numbers
        // These can appear after a pattern like "2):"
        const isolatedNumberMatch = token.match(/^(\d+)(?:#.*)?$/);
        if (isolatedNumberMatch && i > 0 && tokens[i-1].endsWith(')') && !tokens[i-1].includes(',')) {
            console.log(`Found isolated number token: ${token} after ${tokens[i-1]}`);
            // This is likely a wagon number after a closing parenthesis
            // Create a synthetic token that combines class info from the previous token
            const prevToken = tokens[i-1];
            const classMatch = prevToken.match(/(\d+)\)/);
            if (classMatch) {
                const classNumber = classMatch[1];
                const syntheticToken = `${classNumber}:${isolatedNumberMatch[1]}${token.includes('#') ? token.substring(token.indexOf('#')) : ''}`;
                console.log(`Created synthetic token: ${syntheticToken}`);
                
                // Parse this synthetic token instead
                const wagon = this.parseSingleWagonToken(syntheticToken, currentSector, position++);
                if (wagon) {
                    // Set no-access flags based on the previous token
                    if (openParenthesesIndex >= 0) {
                        // Mark start of no-access group
                        if (openParenthesesIndex < wagons.length) {
                            wagons[openParenthesesIndex].noAccessToPrevious = true;
                        }
                        // Mark this wagon as end of no-access group
                        wagon.noAccessToNext = true;
                        openParenthesesIndex = -1; // Reset the marker
                    }
                    wagons.push(wagon);
                }
                
                continue; // Skip to next token, we've handled this one
            }
        }
        
        // Handle special case of parentheses wrapping multiple tokens
        if (token.startsWith('(') && !token.endsWith(')')) {
            let groupToken = token;
            let j = i;
            
            // Keep adding tokens until we find the closing parenthesis
            while (!groupToken.endsWith(')') && j < tokens.length - 1) {
                j++;
                groupToken += ',' + tokens[j];
            }
            
            // If we combined multiple tokens, update the counter
            if (j > i) {
                // Process the combined token
                const wagon = this.parseSingleWagonToken(groupToken, currentSector, position++);
                if (wagon) {
                    wagons.push(wagon);
                }
                i = j; // Skip the tokens we've just processed
                continue;
            }
        }
        
        // Parse the token as a wagon
        if (this.isPotentialWagonToken(token)) {
            const wagon = this.parseSingleWagonToken(token, currentSector, position++);
            if (wagon) {
                // Special handling for parentheses in token (no-access markers)
                if (token.endsWith(')') && openParenthesesIndex >= 0) {
                    // Mark start of no-access group
                    if (openParenthesesIndex < wagons.length) {
                        wagons[openParenthesesIndex].noAccessToPrevious = true;
                    }
                    // Mark end of no-access group
                    wagon.noAccessToNext = true;
                    openParenthesesIndex = -1; // Reset the marker
                }
                
                wagons.push(wagon);
            }
        }
    }
    
    return wagons;
  }

  /**
   * Parses a single wagon token into a structured TrainWagon object
   * 
   * This method handles the complex logic of parsing a single wagon token string
   * from the formation data, extracting information about:
   * - Wagon type (locomotive, coach, control car, etc.)
   * - Wagon class (first, second, or both)
   * - Special wagon attributes (bicycle storage, restaurant, etc.)
   * - Wagon number/position
   * - Accessibility information
   * 
   * The method supports various notation formats used by different railway operators.
   * 
   * @param {string} token - The wagon token string to parse
   * @param {string} sector - The sector this wagon belongs to
   * @param {number} position - The position index of this wagon in the train
   * @returns {TrainWagon|null} A structured wagon object or null if parsing failed
   */
  private parseSingleWagonToken(token: string, sector: string, position: number): TrainWagon | null {
    // Basic check again
    if (!token || token === 'F' || token === 'X' || !this.isPotentialWagonToken(token)) {
        return null;
    }

    // Check if this is a BLS formation
    const isBlsVehicle = this.lastApiResponse?.trainMetaInformation?.toCode === "33";

    // Log token being processed
    console.log(`Processing wagon token: "${token}" in sector ${sector} ${isBlsVehicle ? '(BLS format)' : ''}`);
    
    // Special handling for patterns like "2):18#VH" where the actual wagon number comes after the closing parenthesis
    const complexPatternMatch = token.match(/(\d+)\):(\d+)/);
    if (complexPatternMatch && complexPatternMatch[2]) {
        console.log(`Detected complex pattern with ordnr after closing parenthesis: ${token}`);
        // For tokens like "2):18#VH", "18" is the actual wagon number, not "2"
    }

    // Special case for tokens with both status indicator and opening parenthesis like "-(1"
    const hasStatusAndParenthesis = token.match(/^[->=\%]\(/);
    let noAccessToPrevious = false;
    
    // Extract status first (before we clean the token for parsing)
    const statusCodes = this.parseWagonStatus(token);
    
    // Check if token has status indicator at the beginning (-, >, =, %)
    const hasStatusPrefix = token.match(/^[->=\%]/);
    let cleanToken = token;
    
    if (hasStatusAndParenthesis) {
        // Remove the status indicator but preserve the opening parenthesis info
        cleanToken = token.substring(1); // Keep the parenthesis
        noAccessToPrevious = true;
    }
    // If token has regular status prefix, extract the token without the status
    else if (hasStatusPrefix) {
        cleanToken = token.substring(1);
    }

    // Clean up token for parsing by removing parentheses for analysis
    // but track if there was an opening parenthesis for no-access flags
    if (!hasStatusAndParenthesis) {
        noAccessToPrevious = cleanToken.startsWith('(');
    }
    const noAccessToNext = cleanToken.endsWith(')');
    
    // Now remove parentheses for content analysis
    cleanToken = cleanToken.replace(/^\(+|\)+$/g, '');
    
    // For tokens with embedded attributes like "2#NF", make sure to extract the class/number correctly
    const attrSeparatorIndex = cleanToken.indexOf('#');
    let tokenClassPart = cleanToken;
    
    if (attrSeparatorIndex > 0) {
        tokenClassPart = cleanToken.substring(0, attrSeparatorIndex);
    }
    
    // Special handling for BLS tokens to extract class information
    let classes: ('1' | '2')[] = [];
    
    if (isBlsVehicle) {
        // For BLS, extract class directly from the token prefix - check multiple patterns
        if (cleanToken.startsWith('1#') || cleanToken.match(/^1[;:]/)) {
            classes.push('1');
        } else if (cleanToken.startsWith('2#') || cleanToken.match(/^2[;:]/)) {
            classes.push('2');
        } else if (cleanToken.startsWith('12#') || cleanToken.match(/^12[;:]/)) {
            // In BLS formations, '12' means 1st class
            classes.push('1');
        } else {
            // Try to extract the number before any attribute markers
            const prefixMatch = cleanToken.match(/^(\d+)(?:#|;|$)/);
            if (prefixMatch) {
                const prefix = prefixMatch[1];
                if (prefix === '1') classes.push('1');
                else if (prefix === '2') classes.push('2');
                else if (prefix === '12') classes.push('1'); // BLS uses 12 for first class
            }
        }
    } else {
        // For SBB/Other EVUs, handle special cases:
        // - When the number is "12" and it's just that number (not a car number)
        // For SBB, standalone "12" typically represents a 1st class coach, not mixed class
        if (cleanToken === '12') {
            classes.push('1');
        } else if (cleanToken === '1') {
            classes.push('1');
        } else if (cleanToken === '2') {
            classes.push('2');
        } else if (tokenClassPart === '1') {
            classes.push('1');
        } else if (tokenClassPart === '2') {
            classes.push('2');
        } else if (tokenClassPart === '12') {
            classes.push('1');
        }
    }
    
    // Extract details
    const wagonType = this.determineWagonType(cleanToken);
    
    // Only use standard class determination if we haven't determined classes yet
    if (classes.length === 0) {
        classes = this.determineWagonClasses(cleanToken);
    }
    
    // For BLS vehicles, if still no class found, use the wagon type as fallback
    if (isBlsVehicle && classes.length === 0) {
        // Assign class based on wagon type
        if (wagonType === 'first-class') classes.push('1');
        else if (wagonType === 'second-class') classes.push('2');
        else if (wagonType === 'mixed') classes.push('1'); // In BLS, 'mixed' is typically first class
        else classes.push('2'); // Default to 2nd class for BLS if nothing else matches
    }
    
    // For SBB/Other EVUs, if no class found but we have a simple number token, use that
    if (!isBlsVehicle && classes.length === 0) {
        if (/^1\d*$/.test(cleanToken)) classes.push('1');
        else if (/^2\d*$/.test(cleanToken)) classes.push('2');
        else if (/^12\d*$/.test(cleanToken)) classes.push('1'); // Treat "12" as 1st class for SBB
    }
    
    const attributes = this.parseWagonAttributes(cleanToken);
    
    // Extract wagon number for SBB cases
    let ordnr = null;
    
    if (!isBlsVehicle) {
        // Special handling for family car patterns
        if (wagonType === 'family') {
            // Check various family car patterns for ordnr
            if (cleanToken.match(/FA:\d+/)) {
                // Format: "FA:9"
                const familyMatch = cleanToken.match(/FA:(\d+)/);
                if (familyMatch && familyMatch[1]) {
                    ordnr = familyMatch[1];
                    console.log(`Extracted ordnr ${ordnr} from family car token ${cleanToken} using FA: pattern`);
                }
            }
            else if (cleanToken.match(/FA\):\d+/)) {
                // Format: "FA):9"
                const familyMatch = cleanToken.match(/FA\):(\d+)/);
                if (familyMatch && familyMatch[1]) {
                    ordnr = familyMatch[1];
                    console.log(`Extracted ordnr ${ordnr} from family car token ${cleanToken} using FA): pattern`);
                }
            }
            else if (cleanToken.match(/FA\d+/)) {
                // Format: "FA9"
                const familyMatch = cleanToken.match(/FA(\d+)/);
                if (familyMatch && familyMatch[1]) {
                    ordnr = familyMatch[1];
                    console.log(`Extracted ordnr ${ordnr} from family car token ${cleanToken} using FA{n} pattern`);
                }
            }
            // This is a special case where the preprocessed token now has format "FA:9"
            else if (cleanToken.match(/FA:(\d+)/)) {
                const familyMatch = cleanToken.match(/FA:(\d+)/);
                if (familyMatch && familyMatch[1]) {
                    ordnr = familyMatch[1];
                    console.log(`Extracted ordnr ${ordnr} from preprocessed family car token ${cleanToken}`);
                }
            }
        }
        
        // If we haven't found an ordnr yet, continue with standard processing
        if (!ordnr) {
            // First check for pattern "2):18#VH" where 18 is the number, not 2
            if (complexPatternMatch && complexPatternMatch[2]) {
                ordnr = complexPatternMatch[2];
                console.log(`Using ordnr ${ordnr} from complex pattern after closing parenthesis`);
            } else {
                // First, determine if this is a simple class token (1, 2, 12) or if it has a real wagon number
                const hasOrdnrFormat = cleanToken.includes(':') || /\d+:\d+/.test(cleanToken) || /\d+\):\d+/.test(cleanToken);
                const isSimpleClassToken = /^(1|2|12)$/.test(cleanToken); 
                const hasAttributeWithClass = cleanToken.includes('#') && /^(1|2|12)/.test(cleanToken); // Like "2#NF"
                
                // Check if we're in a formation that uses wagon numbers or just class markers
                const hasWagonNumbers = this.determineIfFormationHasWagonNumbers();
                
                if (hasOrdnrFormat) {
                    // Standard format with explicit wagon number: extract it
                    ordnr = this.extractOrdnr(cleanToken, true); // Pass true to skip formation check
                    console.log(`Extracted ordnr ${ordnr} from token with explicit format`);
                } else if (isSimpleClassToken && hasWagonNumbers) {
                    // For simple class tokens like "1", "2", "12" - only use as wagon number
                    // if the formation appears to use wagon numbers
                    ordnr = cleanToken;
                    console.log(`Using class ${cleanToken} as wagon number (formation has wagon numbers)`);
                } else if (hasAttributeWithClass) {
                    // For formats like "2#NF", use the class as wagon number only if formation has wagon numbers
                    if (hasWagonNumbers) {
                        const prefix = cleanToken.substring(0, cleanToken.indexOf('#'));
                        ordnr = prefix;
                        console.log(`Extracted ${prefix} as wagon number from attribute token ${cleanToken}`);
                    } else {
                        console.log(`Token ${cleanToken} has attributes but is in a formation without wagon numbers`);
                    }
                } else {
                    // For other formats, try standard extraction
                    // Make sure to pass true for skipFormationCheck to avoid recursive calls
                    ordnr = this.extractOrdnr(cleanToken, true);
                    if (ordnr) {
                        console.log(`Extracted ordnr ${ordnr} through standard extraction`);
                    }
                }
                
                // For standalone class numbers like "1", "2", "12", we should set ordnr to null
                // if we don't have explicit wagon numbers in the formation
                if (isSimpleClassToken && !hasWagonNumbers) {
                    console.log(`Treating ${cleanToken} as class-only (no wagon number)`);
                    ordnr = null;
                }
            }
        }
    }

    // Log the extracted info
    if (ordnr) {
        console.log(`Final wagon number ${ordnr} from token "${token}"`);
    } else {
        console.log(`No wagon number for token "${token}" (${isBlsVehicle ? 'Expected for BLS' : 'Class-only token'})`);
    }
    
    // Log the class and attributes for debugging
    console.log(`Wagon type: ${wagonType}, Classes: ${classes.join('/')}, Attributes: ${attributes.map(a => a.code).join(';')}`);

    // Check if this is a closed wagon (has the "-" status indicator)
    const isClosed = statusCodes.includes('Closed');
    
    // For closed wagons, don't display wagon numbers as they're likely just class indicators
    const finalNumber = isClosed ? '' : (wagonType === 'locomotive' ? '' : (ordnr || ''));

    return {
        position: position, // Temporary position, will be finalized
        number: finalNumber, // Don't show numbers for locomotives or closed wagons
        type: wagonType,
        typeLabel: this.getTypeLabel(wagonType),
        classes,
        attributes,
        noAccessToPrevious,
        noAccessToNext,
        sector: sector,
        noAccessMessage: '', // Will be filled in during post-processing
        statusCodes: statusCodes // Add status codes to the wagon data
    };
  }

/**
 * Determines if the current formation string appears to use explicit wagon numbers
 * This helps distinguish between formations that use simple class markers (1,2,12)
 * versus formations that have actual wagon numbers
 */
private determineIfFormationHasWagonNumbers(): boolean {
    // If there's no API response or formation string, assume no wagon numbers
    if (!this.lastApiResponse || 
        !this.lastApiResponse.formationsAtScheduledStops || 
        this.lastApiResponse.formationsAtScheduledStops.length === 0) {
        return false;
    }
    
    // Get the current stop's formation string
    const currentStopIndex = this.currentStopIndexSubject.value;
    if (currentStopIndex < 0 || currentStopIndex >= this.lastApiResponse.formationsAtScheduledStops.length) {
        return false;
    }
    
    const formationString = this.lastApiResponse.formationsAtScheduledStops[currentStopIndex].formationShort?.formationShortString;
    if (!formationString) {
        return false;
    }
    
    // Check if the formation is for a BLS train - they don't use wagon numbers
    const isBlsVehicle = this.lastApiResponse.trainMetaInformation?.toCode === "33";
    if (isBlsVehicle) {
        return false;
    }
    
    // Log formation string for debugging
    console.log(`Checking if formation has wagon numbers: "${formationString}"`);
    
    // Patterns that definitely indicate explicit wagon numbers
    const hasExplicitOrdnr = /\d+:\d+/.test(formationString); // Format like "1:20"
    const hasParenOrdnr = /\d+\):\d+/.test(formationString);  // Format like "2):8" 
    
    // Immediately return true if we have explicit wagon numbers
    if (hasExplicitOrdnr || hasParenOrdnr) {
        console.log("Formation has explicit wagon numbers (format n:nn)");
        return true;
    }
    
    // Common SBB formation patterns WITHOUT wagon numbers:
    // 1. Class-only pattern (e.g., 1,2,2,1,12)
    const simpleClassPattern = /^(?:\[)?(?:@[A-Z],)?(?:(1|2|12)(?:,|@[A-Z])?)+(?:\])?$/;
    // 2. Class with sectors (e.g., @A,1,2,2@B,12)
    const classSectorsPattern = /^@[A-Z],(?:(1|2|12)(?:,|@[A-Z])?)+$/;
    // 3. Classes in nested parenthesis with sectors (e.g., @A,[(2,2@B,2,12),(2@C,2,2,12)])
    const complexClassPattern = 
        /^@[A-Z],(?:F,)*\[\((1|2|12)(?:,(?:1|2|12))*(?:@[A-Z](?:,(?:1|2|12))*)*\),\((1|2|12)(?:,(?:1|2|12))*(?:@[A-Z](?:,(?:1|2|12))*)*\)\](?:,F)*$/;
    
    if (simpleClassPattern.test(formationString) || 
        classSectorsPattern.test(formationString) ||
        complexClassPattern.test(formationString)) {
        console.log("Formation matches known SBB pattern without wagon numbers");
        return false;
    }
    
    // Specific check for patterns like [(2,2@B,2,12),(2#NF@C,2#NF,2#BHP;VH;KW;NF,12)#NF]
    // This is a common ICN pattern that uses only class numbers, not wagon numbers
    const bracketedContent = this.extractBracketContent(formationString);
    if (bracketedContent) {
        // Check for patterns with two nested parenthesized groups with just class indicators and attributes
        const nestedGroups = this.findBracketedGroups(bracketedContent, '(', ')');
        const hasJustClassIndicators = nestedGroups.length >= 2 && 
            nestedGroups.every(group => 
                // For each group, check if it contains only class numbers and no explicit ordnr format
                !/\d+:\d+/.test(group) && 
                !/\d+\):\d+/.test(group) &&
                // Must contain 1, 2, or 12 as standalone tokens
                /(?:^|\()(?:1|2|12)(?:,|$|\))/.test(group)
            );
        
        if (hasJustClassIndicators) {
            console.log("Formation has nested groups with only class indicators (ICN pattern)");
            return false;
        }
    }
    
    // Check for patterns with attributes but no explicit wagon numbers
    if (formationString.includes('#')) {
        // Count how many tokens with attributes we have vs. explicit ordnr
        const attrMarkerMatches = formationString.match(/\d+#[A-Za-z;]+/g) || [];
        const hasMultipleAttrMarkers = attrMarkerMatches.length > 1;
        
        // If we have multiple tokens with attributes but no ordnr, it's likely a formation without wagon numbers
        if (hasMultipleAttrMarkers && !hasExplicitOrdnr && !hasParenOrdnr) {
            console.log("Formation has multiple tokens with attributes but no explicit wagon numbers");
            return false;
        }
    }
    
    // Check for ICE/TGV patterns (no bracketed content, just a sequence of 1,2 tokens)
    if (!formationString.includes('[') && 
        (formationString.match(/(?:^|,)(1|2)(?:$|,)/g)?.length || 0) > 3) {
        console.log("Formation likely an ICE/TGV pattern with only class indicators");
        return false;
    }
    
    // Default to assuming there are wagon numbers if we can't determine otherwise
    // This maintains backward compatibility with existing behavior
    console.log("Could not definitively determine if formation has wagon numbers, defaulting to false");
    // For safety, default to no wagon numbers since we couldn't definitively identify them
    return false;
}

/**
 * Helper method to extract content inside the outermost square brackets
 */
private extractBracketContent(str: string): string | null {
    const match = str.match(/\[(.*)\]/);
    return match ? match[1] : null;
  }
  
  private isPotentialWagonToken(token: string): boolean {
    // Skip empty tokens and obvious non-wagon tokens
    if (!token || token === 'F' || token === 'X' || token === ',') return false;
    
    // Avoid matching sector markers
    if (token.startsWith('@') && token.length === 2) return false;
    
    // Special case for tokens with both status indicator and opening parenthesis like "-(1"
    if (token.match(/^[->=\%]\(/)) {
      // This is a token with both a status indicator and an opening parenthesis
      // Remove both the status indicator and the parenthesis for checking
      const cleanToken = token.substring(2);
      return this.isPotentialWagonToken(cleanToken);
    }
    
    // Handle tokens that start with status indicators (-, >, =, %)
    // but preserve the token information for further processing
    if (token.match(/^[->=\%]/)) {
      const tokenWithoutStatus = token.substring(1);
      
      // Special cases that should always be considered wagons with status
      if (tokenWithoutStatus.match(/^(W1|W2|WR|LK|FA|WL|CC)/)) {
        return true;
      }
      
      // Recursively check if the token without status is a potential wagon token
      return this.isPotentialWagonToken(tokenWithoutStatus);
    }
    
    // Check if this is a BLS formation string
    const isBlsVehicle = this.lastApiResponse?.trainMetaInformation?.toCode === "33";
    
    // For BLS tokens, use more lenient pattern matching
    if (isBlsVehicle) {
        // BLS tokens often have format like "2#VH;NF" or "12#NF"
        if (token.includes('#')) return true;
        
        // Handle numbers with common class codes
        if (/^\d+$/.test(token) || /^\d+\)$/.test(token)) return true;
        
        // Handle type codes with special attention to "12" as a first-class indicator in BLS
        const cleanToken = token.replace(/[()#->=%;:]/g, '');
        if (/^(1|2|12|LK|WR|W1|W2|D|K|CC|FA|WL)/.test(cleanToken)) return true;
        
        return false;
    }

    // For SBB: Check for standalone numbers which can represent wagon numbers or classes
    if (/^(1|2|12)$/.test(token)) return true;
    if (/^\(?(1|2|12)\)?$/.test(token)) return true;
    
    // Handle tokens with attributes like "2#NF" 
    if (/^[12]#/.test(token) || /^12#/.test(token)) return true;
    
    // Special case for standalone numbers after preprocessing of patterns like "2):20"
    if (/^\d+$/.test(token)) return true;
    
    // Check for class:number pattern (which definitely indicates a wagon) - now with optional closing parentheses
    if (token.match(/\d+:\d+\)?/)) return true;
    
    // Special case for patterns like "1):1" (closing parenthesis inside the token)
    if (token.match(/\d+\):\d+/)) return true;
    
    // Special case for the end of reversed formation (Basel case) where there might be "2):7#FZ"
    if (token.match(/\d+\):\d+#[A-Z;]+/)) return true;
    
    // Check for common wagon type indicators
    const cleanToken = token.replace(/[()#->=%;:]/g, '');
    
    // Expanded type pattern - includes all possible wagon codes
    return /LK|W[RL]|CC|FA|(?:^|[^A-Za-z0-9])1(?:$|[^A-Za-z0-9])|(?:^|[^A-Za-z0-9])2(?:$|[^A-Za-z0-9])|12|D|K/.test(cleanToken);
  }

  private extractOrdnr(token: string, skipFormationCheck: boolean = false): string | null {
    // Check for the complex pattern "digit):number" first
    // This handles cases like "2):18#VH" where 18 is the actual wagon number
    const complexMatch = token.match(/\d+\):(\d+)/);
    if (complexMatch && complexMatch[1]) {
        console.log(`Extracting ordnr ${complexMatch[1]} from complex pattern ${token}`);
        return complexMatch[1]; 
    }
    
    // Special case for family car with format "FA:9"
    const familyCarMatch = token.match(/FA:(\d+)/);
    if (familyCarMatch && familyCarMatch[1]) {
        return familyCarMatch[1];
    }
    
    // Special case for reversed formation with format "FA):9"
    const reversedFamilyCarMatch = token.match(/FA\):(\d+)(?:#[A-Za-z;]+)?/);
    if (reversedFamilyCarMatch && reversedFamilyCarMatch[1]) {
        return reversedFamilyCarMatch[1];
    }
    
    // Handle case where the token ends with a number and a closing parenthesis (1:1))
    const ordnrWithClosingMatch = token.match(/(\d+):(\d+)\)+$/);
    if (ordnrWithClosingMatch && ordnrWithClosingMatch[2]) {
        return ordnrWithClosingMatch[2];
    }
    
    // Regular case: extract from format like "1:20" or "2:8"
    const ordnrMatch = token.match(/(\d+):(\d+)/);
    if (ordnrMatch) {
        // ordnrMatch[1] is the class (1 or 2), ordnrMatch[2] is the actual wagon number
        return ordnrMatch[2]; // Return just the wagon number
    }
    
    // Special case for "2):20" pattern (closing parenthesis before colon)
    // This handles cases like "2):18#VH" where the wagon number appears after the closing parenthesis
    const closingParenOrdnrMatch = token.match(/\d+\):(\d+)/);
    if (closingParenOrdnrMatch && closingParenOrdnrMatch[1]) {
        console.log(`Found special pattern with ordnr ${closingParenOrdnrMatch[1]} after closing parenthesis`);
        return closingParenOrdnrMatch[1];
    }
    
    // Skip extraction for tokens with attribute markers but no explicit ordnr format
    // like "2#NF" - this should not be considered a wagon number
    if (token.includes('#') && !token.includes(':')) {
        return null;
    }
    
    // Special case for standalone numbers that might be wagon numbers,
    // but only if the formation indicates it uses explicit wagon numbers
    // Use skipFormationCheck to avoid recursive calls
    if (/^\d+$/.test(token)) {
        if (skipFormationCheck || this.determineIfFormationHasWagonNumbers()) {
        return token;
        }
    }
    
    return null;
  }

  private determineWagonType(wagonPart: string): string {
    // Check if this is a BLS formation
    const isBlsVehicle = this.lastApiResponse?.trainMetaInformation?.toCode === "33";
  
    // Normalize the token for analysis
    const cleanPart = wagonPart.replace(/[()#->=%;:]/g, ''); // Remove symbols but keep digits
    
    // For non-BLS tokens with #NF, #BHP, etc., extract the class part before the # 
    if (!isBlsVehicle && wagonPart.includes('#')) {
        const classMatch = wagonPart.match(/^(\d+)#/);
        if (classMatch && classMatch[1]) {
            const classDigit = classMatch[1];
            if (classDigit === '1') return 'first-class';
            if (classDigit === '2') return 'second-class';
            if (classDigit === '12') return 'first-class'; // In SBB, "12" typically represents 1st class
        }
    }
    
    // For BLS, the token prefix usually indicates the class directly
    if (isBlsVehicle) {
        // Extract the first part of the token (before any attributes)
        const prefixMatch = wagonPart.match(/^(\d+)(?:#|;|$)/);
        if (prefixMatch) {
            const prefix = prefixMatch[1];
            if (prefix === '1') return 'first-class';
            if (prefix === '2') return 'second-class';
            if (prefix === '12') return 'first-class'; // BLS uses 12 for first class
        }
        
        // Also check at word boundaries
        if (/\b1\b/.test(cleanPart) && !/\b2\b/.test(cleanPart)) return 'first-class';
        if (/\b2\b/.test(cleanPart) && !/\b1\b/.test(cleanPart)) return 'second-class';
        if (/\b12\b/.test(cleanPart)) return 'first-class'; // BLS uses 12 for first class
    }
    
    // First check for specific type codes
    if (cleanPart.includes('LK')) return 'locomotive';
    if (cleanPart.includes('WR') || cleanPart.includes('W1') || cleanPart.includes('W2')) return 'restaurant';
    if (cleanPart.includes('CC')) return 'sleeper';
    if (cleanPart.includes('WL')) return 'sleeper';
    // Check for family car in multiple formats
    if (cleanPart.includes('FA') || wagonPart.includes('FA:') || wagonPart.includes('FA):')) return 'family';
    
    // Check for class indicators - we need to be careful with word boundaries
    if (cleanPart.includes('12')) {
        // Check for BLS-specific interpretation of "12" code
        if (isBlsVehicle) {
            return 'first-class';
        } else {
            return 'mixed';
        }
    }
    
    // Extract class information from the ordnr format (e.g., "1:20" or "2:8")
    const ordnrMatch = wagonPart.match(/(\d+):(\d+)/);
    if (ordnrMatch && ordnrMatch[1]) {
        const classNumber = ordnrMatch[1];
        if (classNumber === '1') return 'first-class';
        if (classNumber === '2') return 'second-class';
    }
    
    // Handle "2):20" format (closing parenthesis before colon)
    const closingParenOrdnrMatch = wagonPart.match(/(\d+)\):/);
    if (closingParenOrdnrMatch && closingParenOrdnrMatch[1]) {
        const classNumber = closingParenOrdnrMatch[1];
        if (classNumber === '1') return 'first-class';
        if (classNumber === '2') return 'second-class';
    }
    
    // Look for standalone "1" - not part of other codes
    const hasClass1 = /(?:^|[^A-Za-z0-9])1(?:$|[^A-Za-z0-9])/.test(cleanPart);
    // Look for standalone "2" - not part of other codes
    const hasClass2 = /(?:^|[^A-Za-z0-9])2(?:$|[^A-Za-z0-9])/.test(cleanPart);
    
    if (hasClass1 && !hasClass2) return 'first-class';
    if (hasClass2 && !hasClass1) return 'second-class';
    
    if (cleanPart.includes('D')) return 'luggage';
    if (cleanPart.includes('K')) return 'no-class';
    
    // Default for BLS if nothing else matched
    if (isBlsVehicle) return 'second-class';
    
    return 'unknown';
  }

  private determineWagonClasses(wagonPart: string): ('1' | '2')[] {
    const classes: ('1' | '2')[] = [];
    
    // Check if this is a BLS formation
    const isBlsVehicle = this.lastApiResponse?.trainMetaInformation?.toCode === "33";
    
    // Family cars are always 2nd class
    if (wagonPart.includes('FA:') || wagonPart.includes('FA):') || wagonPart.match(/\bFA\b/)) {
        classes.push('2');
        return classes;
    }
    
    // For tokens with attributes like "2#NF", extract the class part
    if (wagonPart.includes('#')) {
        const classMatch = wagonPart.match(/^(\d+)#/);
        if (classMatch && classMatch[1]) {
            const classDigit = classMatch[1];
            if (classDigit === '1') {
                classes.push('1');
                return classes;
            }
            if (classDigit === '2') {
                classes.push('2');
                return classes;
            }
            if (classDigit === '12') {
                // For BLS, 12 means first class only
                if (isBlsVehicle) {
                    classes.push('1');
                } else {
                    // For SBB, 12 typically means 1st class only
                    classes.push('1');
                }
                return classes;
            }
        }
    }
    
    // For BLS, try to extract class directly from token prefix
    if (isBlsVehicle) {
        if (wagonPart.startsWith('1#') || wagonPart.match(/^1[;:]/)) {
            classes.push('1');
            return classes;
        } else if (wagonPart.startsWith('2#') || wagonPart.match(/^2[;:]/)) {
            classes.push('2');
            return classes;
        } else if (wagonPart.startsWith('12#') || wagonPart.match(/^12[;:]/)) {
            classes.push('1'); // BLS uses 12 for first class
            return classes;
        } else {
            // Try to extract number at the start of the token
            const prefixMatch = wagonPart.match(/^(\d+)(?:#|;|$)/);
            if (prefixMatch) {
                const prefix = prefixMatch[1];
                if (prefix === '1') {
                    classes.push('1');
                    return classes;
                } else if (prefix === '2') {
                    classes.push('2');
                    return classes;
                } else if (prefix === '12') {
                    classes.push('1'); // BLS uses 12 for first class
                    return classes;
                }
            }
        }
    }
    
    // First check for the explicit class number in the ordnr format (e.g., "1:20" = 1st class)
    const ordnrMatch = wagonPart.match(/(\d+):(\d+)/);
    if (ordnrMatch && ordnrMatch[1]) {
        const classNumber = ordnrMatch[1];
        if (classNumber === '1') classes.push('1');
        if (classNumber === '2') classes.push('2');
    }
    
    // Check for format with closing parenthesis "2):20"
    const closingParenOrdnrMatch = wagonPart.match(/(\d+)\):/);
    if (closingParenOrdnrMatch && closingParenOrdnrMatch[1]) {
        const classNumber = closingParenOrdnrMatch[1];
        if (classNumber === '1') classes.push('1');
        if (classNumber === '2') classes.push('2');
    }
    
    // If no class found yet, check other patterns
    if (classes.length === 0) {
        const cleanPart = wagonPart.replace(/[()#->=%;:]/g, '');
        
        if (cleanPart.includes('12')) {
            // For BLS vehicles (toCode = 33), "12" means 1st class only
            if (isBlsVehicle) {
                classes.push('1');
            } else {
                // For other EVUs like SBB, "12" typically means 1st class, not mixed
                classes.push('1');
            }
        } else {
            // Look for standalone "1" or "2" not part of other codes
            const hasClass1 = /(?:^|[^A-Za-z0-9])1(?:$|[^A-Za-z0-9])/.test(cleanPart);
            const hasClass2 = /(?:^|[^A-Za-z0-9])2(?:$|[^A-Za-z0-9])/.test(cleanPart);
            
            if (hasClass1) classes.push('1');
            if (hasClass2) classes.push('2');
            
            // Check for restaurant cars with class indicators
            if (cleanPart.includes('W1')) classes.push('1');
            if (cleanPart.includes('W2')) classes.push('2');
        }
        
        // Assign class based on type if still no class found
        if (classes.length === 0) {
            const type = this.determineWagonType(wagonPart);
            if (type === 'first-class') classes.push('1');
            else if (type === 'second-class') classes.push('2');
            else if (type === 'mixed') {
                // For BLS vehicles, treat "mixed" as 1st class only
                if (isBlsVehicle) {
                    classes.push('1');
                } else {
                    // For SBB, typically mixed means 1st class
                    classes.push('1');
                }
            }
            else if (type === 'restaurant') {
                // For restaurants, assume both classes unless specified
                classes.push('1', '2');
            }
            else if (type === 'family') {
                // Family cars are always 2nd class
                classes.push('2');
            }
        }
    }
    
    // For BLS trains, if we still haven't determined a class, default to 2nd class
    if (isBlsVehicle && classes.length === 0) {
        classes.push('2');
    }
    
    return classes;
  }

  private parseWagonAttributes(wagonPart: string): WagonAttribute[] {
    const attributes: WagonAttribute[] = [];
    const attributeMap: {[key: string]: {label: string, icon: string}} = {
      'BHP': { label: 'Wheelchair Spaces', icon: 'kom:wheelchair-small' },
      'BZ': { label: 'Business Zone', icon: 'kom:business-small' },
      'FZ': { label: 'Family Zone', icon: 'kom:family-small' },
      'KW': { label: 'Stroller Platform', icon: 'kom:baby-stroller-small' },
      'NF': { label: 'Low Floor Entry', icon: 'kom:barrier-free-small' },
      'VH': { label: 'Bike Hooks', icon: 'kom:bicycle-small' },
      'VR': { label: 'Bike Reservation Required', icon: 'kom:bicycle-place-small' }
    };
    
    const typeAttributeMap: {[key: string]: {label: string, icon: string, code: string}} = {
        'locomotive': { label: 'Locomotive', icon: '', code: 'LK'}, // Icon handled by style
        'restaurant': { label: 'Restaurant', icon: 'kom:restaurants-small', code: 'WR' }, // WR, W1, W2 map here
        'sleeper': { label: 'Sleeper/Couchette', icon: 'kom:bed-small', code: 'WL_CC' }, // WL, CC map here
        'family': { label: 'Family Car', icon: 'kom:family-small', code: 'FA' },
        'luggage': { label: 'Luggage Van', icon: 'kom:suitcase-small', code: 'D' },
        'no-class': { label: 'No Class Coach', icon: 'kom:circle-information-small', code: 'K' }
    };

    // Check for family car in multiple ways
    // 1. Check for FA: prefix 
    if (wagonPart.match(/FA:/)) {
        attributes.push({ code: 'FA', label: 'Family Car', icon: 'kom:family-small' });
    }
    // 2. Check for FA): pattern (reversed train formation)
    else if (wagonPart.match(/FA\):/)) {
        attributes.push({ code: 'FA', label: 'Family Car', icon: 'kom:family-small' });
    }
    // 3. Check for standalone FA token or preprocessed FA:9 pattern
    else if (wagonPart.match(/\bFA\b/) || wagonPart.match(/FA:\d+/)) {
        attributes.push({ code: 'FA', label: 'Family Car', icon: 'kom:family-small' });
    }

    // Extract attributes from any #... section - handle all patterns
    const attrPatterns = [
        /#([A-Z;]+)/g,       // Standard #BHP;BZ;NF pattern
        /;([A-Z]+)(?=[;#]|$)/g  // Semicolon separated like ;BZ;NF
    ];
    
    // Collect all attribute codes from the token
    const foundAttributes = new Set<string>();
    
    // Process the standard #ATTR;ATTR pattern
    let attrMatches = wagonPart.match(/#([^);,]+)/g);
    if (attrMatches) {
        for (const match of attrMatches) {
            const attributesString = match.substring(1); // Remove the # prefix
            const attrs = attributesString.split(';');
            
            attrs.forEach(attrCode => {
                const code = attrCode.trim();
                if (code) {
                    foundAttributes.add(code);
                }
            });
        }
    }
    
    // Process semicolon separated attributes without # (like in ;BZ;NF)
    attrMatches = wagonPart.match(/;([A-Z]+)(?=[;#]|$)/g);
    if (attrMatches) {
        for (const match of attrMatches) {
            const code = match.substring(1); // Remove the semicolon
            if (code) {
                foundAttributes.add(code);
            }
        }
    }
    
    // Handle edge case with trailing semicolon in pattern like #BHP;
    const trailingAttrMatch = wagonPart.match(/#([A-Z]+);(?=[,)]|$)/);
    if (trailingAttrMatch && trailingAttrMatch[1]) {
        foundAttributes.add(trailingAttrMatch[1]);
    }
    
    // Add all found attributes to the result
    for (const code of foundAttributes) {
        if (attributeMap[code]) {
            attributes.push({ ...attributeMap[code], code });
        } else {
            console.debug(`Unknown attribute code: ${code}`);
        }
    }
    
    // Add attribute based on determined type (avoiding duplicates)
    const wagonType = this.determineWagonType(wagonPart);
    const typeAttr = typeAttributeMap[wagonType];
    if (typeAttr && !attributes.some(a => a.code === typeAttr.code)) {
        // Don't add locomotive attribute itself, just use typeLabel
        if (wagonType !== 'locomotive') { 
            attributes.push({ code: typeAttr.code, label: typeAttr.label, icon: typeAttr.icon });
        }
    }
    
    // Handle special combo types like W1/W2 explicitly if needed
    if (wagonPart.includes('W1') || wagonPart.includes('W2')) {
        const restaurantAttr = typeAttributeMap['restaurant'];
        if (!attributes.some(a => a.code === restaurantAttr.code)) {
            attributes.push({ ...restaurantAttr });
        }
    }
    
    return attributes;
  }

  private getTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
        'locomotive': 'Locomotive',
        'first-class': '1st Class Coach',
        'second-class': '2nd Class Coach',
        'mixed': '1st/2nd Class Coach',
        'restaurant': 'Restaurant Car',
        'sleeper': 'Sleeper/Couchette Car',
        'family': '2nd Class Coach',
        'luggage': 'Luggage Van',
        'no-class': 'No Class Coach',
        'unknown': 'Coach'
    };
    return labels[type] || 'Coach';
  }

  private parseWagonStatus(token: string): string[] {
    const statuses: string[] = [];
    const statusMap: {[key: string]: string} = {
        '-': 'Closed', 
        '>': 'Open for boarding groups',
        '=': 'Reserved for transit',
        '%': 'Open but unserviced'
    };
    
    // Look for status characters at the beginning of token or after brackets/commas
    if (token.match(/^[->=\%]/)) {
        const statusChar = token.charAt(0);
        if (statusMap[statusChar]) {
            statuses.push(statusMap[statusChar]);
        }
    }
    
    // Check for status characters inside the token after brackets or commas
    const innerStatusMatch = token.match(/[\(\[,]+([->=\%]+)/);
    if (innerStatusMatch && innerStatusMatch[1]) {
        for (const char of innerStatusMatch[1]) {
            if (statusMap[char]) {
                statuses.push(statusMap[char]);
    }
        }
    }
    
    return statuses;
  }

  private getStoredApiResponse(): ApiResponse | null {
    return this.lastApiResponse;
  }
}