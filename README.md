# [SKI+](https://opentransportdata.swiss/en/about-us/) | Swiss Train Formation Visualization

**View the live demo: [Train Formation Viewer](https://jexnator.github.io/train-formation-view/)**

An Angular based frontend to visualize train formations in the Swiss public transport system. Based on [Open Transport Data's Formation Service API](https://opentransportdata.swiss/en/cookbook/formationsdaten/), this frontend displays wagon arrangements, class information, and onboard services for Swiss trains.

The frontend is an exploratory prototype intended to demonstrate a possible use case for the [formation data - full API endpoint](https://api.opentransportdata.swiss/formations_full) and uses the [train-view-svg-library](https://github.com/jexnator/train-view-svg-library), which is licensed separately under CC BY 4.0.

Purpose: The visualization helps passengers locate specific coaches, identify where low-floor entry points are available, and understand the overall formation of trains at different stops along a route.

**Frontend uses partially [SBB Angular Components (Version 19.1.6)](https://angular.app.sbb.ch/)**

## ToC

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API Configuration](#api-configuration)
- [Technical Details](#technical-details)

## Features

- **Search interface** for finding train formations by number, date, and operator (EVU)
- **Interactive visualization** of train compositions, showing:
  - Coach classes (1st/2nd class)
  - Special coach types (restaurant cars, sleeper carriages, family zones)
  - Onboard amenities (bicycle storage, wheelchair spaces, low-floor entry)
  - Coach numbering and sector information
- **Stop selection** to view formation changes throughout the journey
- **Responsive design** for desktop and mobile devices

## Installation

To run the application locally:

```bash
# Clone the repository
git clone https://github.com/jexnator/train-formation-view.git
cd train-formation-view

# Install dependencies
npm install

# Start the development server
npm run start
```

The application will be available at `http://localhost:4200`.

## Usage

1. Enter a train number (e.g., "829", "2167", "66")
2. Select the railway operator (SBB, BLS, etc.)
3. Choose an operation date
4. Click "Search" to fetch and display the train formation

## API Configuration

This application uses the OpenTransportData.swiss API to fetch train formation data. You need an API key to run the application locally:

1. Register at [OpenTransportData.swiss API Manager](https://api-manager.opentransportdata.swiss/)
2. Subscribe to the "Train Formation Service" API
3. Generate an API key
4. Create a `.env` file in the project root with your API key:
   ```
   API_KEY=your_api_key_here
   ```

## Technical Details

The application is built with:

- Angular 19.2.9 (standalone components architecture)
- [SBB Angular Component Library (Version 19.1.6)](https://angular.app.sbb.ch/) for UI components
- TypeScript
- SCSS for styling
- RxJS for reactive programming
- OpenTransportData.swiss API for data retrieval
