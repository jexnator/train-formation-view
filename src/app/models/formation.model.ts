/**
 * @fileoverview Data models for SKI+ Train Formation Visualization application
 * 
 * This file contains all interfaces for:
 * - API request parameters and responses
 * - Train formation data structures
 * - Stop and station information
 * - Wagon and train section modeling
 * - UI-specific visualization models
 * 
 * The models represent both the raw API data format from OpenTransportData.swiss
 * and the processed structures used for visualization in the application.
 */

/**
 * Parameters for searching train formations through the API
 */
export interface SearchParams {
  /** 
   * Railway company code (EVU = Eisenbahnverkehrsunternehmen) 
   * Examples: "11" for SBB, "33" for BLS
   */
  evu: string;
  
  /** 
   * Date of operation in YYYY-MM-DD format 
   * Can be either a string or Date object that will be formatted
   */
  operationDate: string;
  
  /** Train number including type prefix (e.g. "IC 1", "IR 16", "S1") */
  trainNumber: string;
  
  /** Whether to include technical/operational stops not visible to passengers */
  includeOperationalStops?: boolean;
}

/**
 * Stop point information representing a station
 */
export interface StopPoint {
  /** UIC station code (international unique identifier) */
  uic: number;
  
  /** Station name */
  name: string;
}

/**
 * Arrival and departure times for a stop
 */
export interface StopTime {
  /** Arrival time in ISO format, null for origin stations */
  arrivalTime: string | null;
  
  /** Departure time in ISO format, null for terminal stations */
  departureTime: string | null;
}

/**
 * Track/platform information
 */
export interface Track {
  /** Platform/track number or identifier */
  track: string;
}

/**
 * Short formation information with composition string
 */
export interface FormationShort {
  /** 
   * String representation of the train formation
   * Contains encoded information about wagon order, classes, and sectors
   */
  formationShortString: string;
  
  /** Information about wagon destinations when a train splits at a junction */
  vehicleGoals: VehicleGoal[];
}

/**
 * Information about where vehicle ranges will go when a train splits
 */
export interface VehicleGoal {
  /** Starting position of the vehicle range */
  fromVehicleAtPosition: number;
  
  /** Ending position of the vehicle range */
  toVehicleAtPosition: number;
  
  /** Destination for this range of vehicles */
  destinationStopPoint: StopPoint;
}

/**
 * Information about a scheduled train stop
 */
export interface ScheduledStop {
  /** Station information */
  stopPoint: StopPoint;
  
  /** Modification flags for the stop */
  stopModifications: number;
  
  /** Type of stop (e.g. "commercial", "operational") */
  stopType: string;
  
  /** Arrival and departure times */
  stopTime: StopTime;
  
  /** Platform/track information */
  track: string;
}

/**
 * Formation information for a specific scheduled stop
 */
export interface FormationAtScheduledStop {
  /** Information about the stop */
  scheduledStop: ScheduledStop;
  
  /** Formation data at this stop */
  formationShort: FormationShort;
}

/**
 * Train metadata from the API
 */
export interface TrainMetaInformation {
  /** Numerical train identifier */
  trainNumber: number;
  
  /** 
   * Railway company code for the train operator
   * Examples: "11" for SBB, "33" for BLS
   */
  toCode: string;
  
  /** Service designation (e.g. "daily", "weekdays") */
  runs: string;
}

/**
 * Journey metadata from the API
 */
export interface JourneyMetaInformation {
  /** Date of operation in YYYY-MM-DD format */
  operationDate: string;
  
  /** System journey ID */
  SJYID: string;
}

/**
 * Complete API response from the formations API
 */
export interface ApiResponse {
  /** Type of journey (e.g. "passenger") */
  vehicleJourneyType: string;
  
  /** Timestamp of last data update */
  lastUpdate: string;
  
  /** Journey metadata */
  journeyMetaInformation: JourneyMetaInformation;
  
  /** Train metadata */
  trainMetaInformation: TrainMetaInformation;
  
  /** Formation data for each scheduled stop */
  formationsAtScheduledStops: FormationAtScheduledStop[];
}

/**
 * UI-specific models for visualization
 */

/**
 * Attribute of a train wagon shown in the UI
 */
export interface WagonAttribute {
  /** Short code for the attribute (e.g. "BHP", "VR") */
  code: string;
  
  /** User-friendly label */
  label: string;
  
  /** Icon identifier */
  icon: string;
}

/**
 * Train wagon information for visualization
 */
export interface TrainWagon {
  /** Position of the wagon in the train */
  position: number;
  
  /** Wagon number (may be empty for locomotives or closed wagons) */
  number: string;
  
  /** Type of wagon (e.g. "first-class", "locomotive", "restaurant") */
  type: string;
  
  /** Human-readable label for the wagon type */
  typeLabel: string;
  
  /** Service classes offered in this wagon */
  classes: ('1' | '2')[];
  
  /** Special attributes of this wagon */
  attributes: WagonAttribute[];
  
  /** Whether passengers can't access the previous wagon */
  noAccessToPrevious: boolean;
  
  /** Whether passengers can't access the next wagon */
  noAccessToNext: boolean;
  
  /** Platform sector where this wagon will stop */
  sector: string;
  
  /** Message explaining passage restrictions */
  noAccessMessage?: string;
  
  /** Status codes from the formation string (e.g. Closed, Reserved) */
  statusCodes?: string[];
}

/**
 * Section of a train containing wagons grouped by platform sector
 */
export interface TrainSection {
  /** Platform sector identifier (usually a letter) */
  sector: string;
  
  /** Wagons in this section */
  wagons: TrainWagon[];
}

/**
 * Complete train visualization data for the UI
 */
export interface TrainVisualization {
  /** Train number display (e.g. "IC 1") */
  trainNumber: string;
  
  /** Date of operation */
  operationDate: string;
  
  /** Railway company code */
  evu: string;
  
  /** Name of the currently selected stop */
  currentStop: string;
  
  /** List of all stops in the journey */
  stops: {
    /** Station name */
    name: string;
    
    /** Station UIC code */
    uic: number;
    
    /** Arrival time or null if origin */
    arrivalTime: string | null;
    
    /** Departure time or null if terminal */
    departureTime: string | null;
    
    /** Platform/track information */
    track: string;
    
    /** Whether this stop has sector information */
    hasSectors: boolean;
  }[];
  
  /** Train sections with wagons */
  sections: TrainSection[];
}