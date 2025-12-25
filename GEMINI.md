# Project Context: Kerala Ward Maps

## Project Overview
This is a web application designed to visualize Kerala Ward Maps, likely for Delimitation Commission data. It consists of a **Node.js/Express backend** that serves a static frontend and acts as a proxy for geocoding services. The frontend utilizes **Leaflet** for mapping and **Three.js** for background visual effects.

**Tech Stack:**
*   **Backend:** Node.js, Express
*   **Frontend:** HTML5, CSS3, JavaScript (Vanilla), Leaflet.js, Three.js
*   **Data Processing:** Python (`generate_metadata.py`), Node.js (`convert-ndjson.js`)

## Building and Running

### Prerequisites
*   Node.js and npm installed.
*   Python (for metadata generation scripts, if needed).

### Installation
```bash
npm install
```

### Running the Dev Server
The server runs on port 3000 by default.
```bash
# Optional: Set contact email for Nominatim usage policy
# Windows PowerShell:
# $env:NOMINATIM_EMAIL="your-email@example.com"
# Linux/macOS:
# export NOMINATIM_EMAIL="your-email@example.com"

npm start
```
Access the application at `http://localhost:3000`.

## Key Files and Directories

### Backend
*   **`server.js`**: The main entry point. It sets up the Express server, serves static files from `public/`, and provides a `/geocode` proxy endpoint to `nominatim.openstreetmap.org` to avoid CORS issues and handle caching.
*   **`package.json`**: Dependencies and scripts.

### Frontend (`public/`)
*   **`public/index.html`**: The single-page application structure. Contains the UI for the map, location selection, and navigation overlays.
*   **`public/assets/`**: Contains `script.js` (logic) and `style.css` (styling).
*   **`public/data/`**: Stores GeoJSON files (`KL_Wards.geojson`) and metadata (`wardMetadata.json`).

### Tools & Scripts
*   **`generate_metadata.py`**: Python script to generate metadata from GeoJSON files.
*   **`convert-ndjson.js`**, **`extract-metadata.js`**, **`inspect_geojson.js`**: Utilities for processing and inspecting map data formats.

## Development Conventions
*   **Geocoding:** The frontend should NOT call Nominatim directly. Always use the local `/geocode` proxy to ensure caching and proper User-Agent headers.
*   **Frontend Logic:** The app seems to use a "state" object (`appState`) in the global scope to manage map state, location, and navigation.
*   **Styling:** CSS variables are defined in `index.html` (and likely `style.css`) for theming (e.g., `--primary-color`).
