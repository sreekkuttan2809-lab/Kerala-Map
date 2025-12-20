const express = require('express');
const path = require('path');

const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple in-memory cache for geocode responses
const geocodeCache = new Map();
const GEOCODE_TTL = 60 * 1000; // 60 seconds

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Nominatim proxy endpoint: /geocode?q=...&limit=6
app.get('/geocode', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const limit = parseInt(req.query.limit || '6', 10) || 6;
        if (!q) return res.status(400).json({ error: 'missing query parameter q' });

        const cacheKey = `${q}::${limit}`;
        const now = Date.now();
        const cached = geocodeCache.get(cacheKey);
        if (cached && (now - cached.ts) < GEOCODE_TTL) {
            return res.json(cached.val);
        }

        const email = process.env.NOMINATIM_EMAIL || 'dev@example.com';
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2' +
            '&addressdetails=1' +
            `&q=${encodeURIComponent(q)}` +
            `&limit=${limit}` +
            `&email=${encodeURIComponent(email)}`;

        const r = await fetch(url, {
            headers: {
                'User-Agent': `KeralaWardMaps/1.0 (${email})`,
                'Accept-Language': req.headers['accept-language'] || 'en'
            },
<<<<<<< HEAD
            timeout: 15000
=======
            timeout: 8000
>>>>>>> b3ae1be149947821d0028e4db94511ea721c0326
        });
        if (!r.ok) return res.status(502).json({ error: 'geocode upstream error' });
        const data = await r.json();
        // normalize minimal fields
        const normalized = data.map(item => ({
            place_id: item.place_id,
            display_name: item.display_name,
            lat: item.lat,
            lon: item.lon,
            type: item.type,
            importance: item.importance,
            osm_id: item.osm_id,
            class: item.class
        }));

        geocodeCache.set(cacheKey, { ts: now, val: normalized });
        return res.json(normalized);
    } catch (err) {
        console.error('geocode error', err);
        return res.status(500).json({ error: 'internal error' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
});
