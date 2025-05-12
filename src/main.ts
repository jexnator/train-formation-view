/// <reference types="@angular/localize" />

/**
 * @fileoverview Main entry point for the SKI+ Train Formation Visualization application
 * @license Copyright (c) 2025 SKI+ All rights reserved.
 * 
 * This is the application bootstrapping file that:
 * - Initializes the Angular application
 * - Loads the root AppComponent
 * - Applies the configuration from app.config.ts
 * - Sets up error handling for bootstrap failures
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

/**
 * Application entry point
 * Bootstraps the AppComponent with the provided configuration
 */
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
