# Kerala-Map

Simple dev server and instructions.

Setup and run
```bash
npm install
# optionally set NOMINATIM_EMAIL to your contact email to comply with Nominatim policy
set NOMINATIM_EMAIL=your-email@example.com   # Windows PowerShell
export NOMINATIM_EMAIL=your-email@example.com # Linux / macOS
npm start

# Open http://localhost:3000 in your browser
```

Notes
- The server includes a `/geocode` proxy endpoint that forwards queries to OpenStreetMap Nominatim. The proxy caches results for 60 seconds.
- For production or heavy use, host your own Nominatim instance or use a paid geocoding provider.

