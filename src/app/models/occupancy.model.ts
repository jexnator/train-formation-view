/**
 * @fileoverview Data models for SKI+ Train Occupancy Forecast
 * 
 * This file contains all interfaces for:
 * - Occupancy data structures from ZIP files
 * - Processed occupancy information for visualization
 * - Enums for occupancy levels and fare classes
 */

/**
 * Occupancy level enum matching API values
 */
export enum OccupancyLevel {
  MANY_SEATS = 'manySeatsAvailable',
  FEW_SEATS = 'fewSeatsAvailable',
  STANDING_ONLY = 'standingRoomOnly'
}

/**
 * Fare class enum matching API values
 */
export enum FareClass {
  FIRST = 'firstClass',
  SECOND = 'secondClass'
}

/**
 * Expected occupancy for a specific fare class
 */
export interface ExpectedOccupancy {
  fareClass: FareClass;
  occupancyLevel: OccupancyLevel;
}

/**
 * Train section with occupancy information
 */
export interface OccupancySection {
  departureDayShift: number;
  departureStationId: string;
  departureStationName: string;
  departureTime: string;
  destinationStationId: string;
  destinationStationName: string;
  expectedDepartureOccupancies: ExpectedOccupancy[];
}

/**
 * Train occupancy information
 */
export interface TrainOccupancy {
  trainNumber: string;
  journeyRef: string;
  lineRef: string;
  sections: OccupancySection[];
}

/**
 * Complete occupancy data for an operator
 */
export interface OperatorOccupancy {
  operatorRef: string;
  opDate: string;
  lastUpdated: string;
  timeToLive: number;
  dataSource: string;
  version: string;
  trains: TrainOccupancy[];
}

/**
 * Occupancy visualization data for UI
 */
export interface OccupancyVisualization {
  level: OccupancyLevel;
  icon: string;
  label: string;
}

/**
 * Mapping of occupancy levels to visualization data
 */
export const OCCUPANCY_VISUALIZATION: { [key in OccupancyLevel]: OccupancyVisualization } = {
  [OccupancyLevel.MANY_SEATS]: {
    level: OccupancyLevel.MANY_SEATS,
    icon: 'low-occupancy',
    label: 'Many seats available'
  },
  [OccupancyLevel.FEW_SEATS]: {
    level: OccupancyLevel.FEW_SEATS,
    icon: 'middle-occupancy',
    label: 'Few seats available'
  },
  [OccupancyLevel.STANDING_ONLY]: {
    level: OccupancyLevel.STANDING_ONLY,
    icon: 'high-occupancy',
    label: 'Standing room only'
  }
}; 