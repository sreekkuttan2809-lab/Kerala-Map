// KERALA WARD MAP PRO - MERGED VERSION
// Integrates "Google Maps Pro" UI/Navigation with Legacy Ward/Election Data

// --- GLOBAL VARIABLES ---
let map = null;
let currentLayer = null;
let geoJsonData = null;
let currentDistrict = null;
let currentType = null;
let currentBody = null;
let userLocation = null;
let wardMetadata = {};

// Navigation Globals
let userMarker, destMarker, routingControl, currentTileLayer;
let userPos = [10.8505, 76.2711]; // Default center
let destPos = null;
let isNavigating = false;
let currentVehicle = 'car';
let currentRouteInstructions = [];
let currentStepIndex = 0;
let locationWatchId = null;
let currentSpeed = 0; // m/s from GPS
let routeTotalDistance = 0; // meters
let routeTotalTime = 0; // seconds
let routeCoordinates = []; // full route polyline coords
let lastRouteRecalc = 0; // timestamp of last recalculation
let userPannedAway = false; // user moved map manually during nav

// Location tracking mode: 'off' | 'follow' | 'heading'
let locationMode = 'off';

// Tile Layers
const tileLayers = {
    standard: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    hybrid: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
};

// Election Globals
let isElectionMode = false;
let electionData = null;
let electionBodyWinners = null;
const ELECTION_COLORS = {
    'NDA': '#ff9900',
    'UDF': '#6d9eeb',
    'LDF': '#dd7e6b',
    'OTH': '#d5a6bd',
    'TIE': '#cccccc'
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 App initializing...');

    // Init Map first
    initMap();

    // Load Data
    checkConnection();
    loadWardMetadata();
    loadGeoJsonData();

    // Setup UI Interactions
    setupSelectors();
    setupDrawerInteractions();
});

function initMap() {
    console.log('🗺️ Initializing Map...');
    // Use new settings: zoomControl false, etc.
    map = L.map('mapContainer', {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        tap: false
    }).setView([10.8505, 76.2711], 8);

    // Default Layer
    changeMapLayer('standard');

    // Custom GPS Marker
    const iconHtml = `<div class="gps-container"><div class="gps-cone" id="gps-cone"></div><div class="gps-dot"></div></div>`;
    userMarker = L.marker(userPos, {
        icon: L.divIcon({ className: '', html: iconHtml, iconSize: [40, 40], iconAnchor: [20, 20] }),
        zIndexOffset: 1000
    }).addTo(map);

    // Scale Control
    L.control.scale({ position: 'bottomright' }).addTo(map);

    // Tracking & Orientation
    startRealTimeTracking();
    initDeviceOrientation();

    // Map Click Handler (General vs Polygon)
    map.on('click', (e) => {
        if (!isNavigating) {
            selectLocation(e.latlng.lat, e.latlng.lng);
        }
    });

    console.log('✅ Map initialized');
}

// --- DATA LOADING (LEGACY LOGIC PRESERVED) ---

function normalizeName(val) {
    if (!val) return "";
    let s = String(val).toUpperCase().trim();
    if (s === 'KASARAGOD') return 'KASARGOD';
    if (s === 'THIRUVANATHAPURAM') return 'THIRUVANANTHAPURAM';
    s = s.replace(/\s+GRAMA\s+PANCHAYAT$/i, '')
        .replace(/\s+GRAMA\s+PANCHAYATH$/i, '')
        .replace(/\s+PANCHAYAT$/i, '')
        .replace(/\s+PANCHAYATH$/i, '')
        .replace(/\s+MUNICIPALITY$/i, '')
        .replace(/\s+CORPORATION$/i, '');
    return s;
}

function loadWardMetadata() {
    fetch('data/wardMetadata.json')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            wardMetadata = data;
            setupSelectors();
        })
        .catch(() => {
            console.warn('⚠️ using fallback metadata...');
            fetch('data/district_localbody_mapping.json')
                .then(r => r.json())
                .then(data => {
                    const temp = {};
                    for (const [district, bodies] of Object.entries(data)) {
                        temp[district] = {};
                        temp[district]['Local Body'] = bodies.map(b => b.LocalBody).sort();
                    }
                    wardMetadata = temp;
                    setupSelectors();
                });
        });
}

function loadGeoJsonData() {
    setButtonsLoading(true);
    fetch('data/KL_Wards.geojson')
        .then(r => r.json())
        .then(data => {
            geoJsonData = data;
            console.log('✅ GeoJSON loaded:', data.features.length);

            // Metadata Fallback
            if (Object.keys(wardMetadata).length === 0) populateMetadataFromGeoJSON(data);

            setButtonsLoading(false);
            updateStatus('✓ Data Ready');
        })
        .catch(e => {
            console.error(e);
            updateStatus('❌ Data Error');
            setButtonsLoading(false);
        });
}

function populateMetadataFromGeoJSON(data) {
    const tempMetadata = {};
    const wardCounts = {};
    data.features.forEach((feature) => {
        const props = feature.properties;
        const district = props.District;
        const lsgd = props.LSGD;
        const type = props.Lsgd_Type;
        if (!district || !lsgd || !type) return;

        const normalizedType = type.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        if (!tempMetadata[district]) tempMetadata[district] = {};
        if (!tempMetadata[district][normalizedType]) tempMetadata[district][normalizedType] = new Set();
        tempMetadata[district][normalizedType].add(lsgd);
        wardCounts[`${district}|${normalizedType}|${lsgd}`] = (wardCounts[`${district}|${normalizedType}|${lsgd}`] || 0) + 1;
    });

    const finalMetadata = {};
    Object.keys(tempMetadata).forEach(district => {
        finalMetadata[district] = {};
        Object.keys(tempMetadata[district]).forEach(type => {
            const bodies = Array.from(tempMetadata[district][type]).sort();
            finalMetadata[district][type] = bodies.filter(body => wardCounts[`${district}|${type}|${body}`] > 0);
            if (finalMetadata[district][type].length === 0) delete finalMetadata[district][type];
        });
        if (Object.keys(finalMetadata[district]).length === 0) delete finalMetadata[district];
    });
    wardMetadata = finalMetadata;
    setupSelectors();
}

// --- ELECTION DATA PROCESSING & UI ---

function loadElectionData() {
    return new Promise((resolve, reject) => {
        // Show loading state
        const legend = document.getElementById('electionLegend');
        if (legend) legend.innerHTML = '<div class="text-xs text-center text-gray-500">Loading results...</div>';

        Papa.parse('data/Kerala_2025_Result.csv', {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                processElectionData(results.data);
                updateElectionLegend();
                resolve();
            },
            error: function (err) {
                console.error("CSV Parse Error:", err);
                if (legend) legend.innerHTML = '<div class="text-xs text-center text-red-500">Failed to load data</div>';
                reject(err);
            }
        });
    });
}

function processElectionData(rows) {
    electionData = {};
    electionBodyWinners = {};
    electionGlobalStats = { NDA: 0, UDF: 0, LDF: 0, OTH: 0 };
    const seatCounts = {};

    rows.forEach(row => {
        // Robust keys with trimming
        const district = (row['District'] || '').trim();
        const lsgd = (row['LSGI Name'] || '').trim();
        let wardNo = (row['ward_code'] || row['Ward Code'] || '').trim();

        // Handle "G01", "01" -> "1"
        wardNo = String(parseInt(wardNo) || wardNo);

        const rank = parseInt(row['Rank']);
        const front = (row['Front'] || 'OTH').toUpperCase().trim();
        const candidate = row['Candidate Name English'] || row['Candidate'];
        const party = row['Party Name English'] || row['Party'];
        const votes = parseInt(row['Candidate Total_votes'] || row['Votes'] || 0);

        if (!district || !lsgd || !wardNo) return;

        // Init Hierarchy
        if (!electionData[district]) electionData[district] = {};
        if (!electionData[district][lsgd]) electionData[district][lsgd] = {};
        if (!electionData[district][lsgd][wardNo]) {
            electionData[district][lsgd][wardNo] = { candidates: [], winner: null, isTie: false, totalVotes: 0 };
        }

        const wardObj = electionData[district][lsgd][wardNo];
        wardObj.candidates.push({ name: candidate, party, front, votes, rank });
        wardObj.totalVotes += votes;

        // Determine Winner (Rank 1)
        if (rank === 1) {
            // Handle Tie logic if multiple rank 1 exist (rare but possible in data errors or real ties)
            if (wardObj.winner) {
                wardObj.isTie = true;
                wardObj.winner.front = 'TIE';
            } else {
                wardObj.winner = { name: candidate, party, front, votes, rank };

                // Update Global Stats (Ward Counts)
                if (electionGlobalStats[front] !== undefined) electionGlobalStats[front]++;
                else electionGlobalStats.OTH++; // Bucket Indep/Others together

                // Track for Local Body Winner
                if (!seatCounts[district]) seatCounts[district] = {};
                if (!seatCounts[district][lsgd]) seatCounts[district][lsgd] = {};
                const c = seatCounts[district][lsgd];
                c[front] = (c[front] || 0) + 1;
            }
        }
    });

    // Determine Body Winners (Simple Plurality of Wards)
    Object.keys(seatCounts).forEach(dist => {
        electionBodyWinners[dist] = {};
        Object.keys(seatCounts[dist]).forEach(body => {
            const counts = seatCounts[dist][body];
            let max = -1, win = 'TIE';
            Object.entries(counts).forEach(([f, c]) => {
                if (c > max) { max = c; win = f; }
                else if (c === max) win = 'TIE'; // Simple tie break logic
            });
            electionBodyWinners[dist][body] = win;
        });
    });

    console.log('✅ Election Data Processed. Global Stats:', electionGlobalStats);
}

function updateElectionLegend(localBodyName = null) {
    const legend = document.getElementById('electionLegend');
    if (!legend) return;

    // 1. If no local body selected, HIDE legend (as requested)
    if (!currentDistrict || !currentBody) {
        legend.classList.add('hidden');
        return;
    }

    // 2. Calculate Seat Counts for this specific body
    // We can iterate electionData to calculate on the fly for accuracy
    let stats = { NDA: 0, UDF: 0, LDF: 0, IND: 0, OTH: 0 };
    let hasData = false;

    // Use current district/body global vars if arg not passed (or ensure sync)
    // The user requested: "if any independent won show ind ... if any others won show as oth"

    // Find keys
    const dKey = Object.keys(electionData).find(k => normalizeName(k) === normalizeName(currentDistrict));
    if (dKey) {
        const lKey = Object.keys(electionData[dKey]).find(k => normalizeName(k) === normalizeName(currentBody));
        if (lKey) {
            hasData = true;
            Object.values(electionData[dKey][lKey]).forEach(ward => {
                if (ward.winner) {
                    let front = ward.winner.front;
                    // Map unknown fronts to OTH or IND if specific mapping exists
                    if (!['NDA', 'UDF', 'LDF'].includes(front)) {
                        // Heuristic: If front is "IND" or similar
                        if (front === 'IND' || front === 'Independent') stats.IND++;
                        else stats.OTH++;
                    } else {
                        stats[front]++;
                    }
                }
            });
        }
    }

    if (!hasData) {
        legend.classList.add('hidden');
        return;
    }

    // 3. Build HTML Grid dynamically based on what exists
    // Always show big 3? Or only if > 0? User implies: "if independent won show ind"
    // Usually Standard 3 are always shown, extras added.

    let html = `<div class="legend-grid">`;

    // Standard Fronts
    ['NDA', 'UDF', 'LDF'].forEach(front => {
        let colorClass = `text-${front === 'NDA' ? 'orange' : front === 'UDF' ? 'green' : 'red'}`;
        let borderClass = `border-${front === 'NDA' ? 'orange' : front === 'UDF' ? 'green' : 'red'}`;

        html += `
            <div class="legend-cell ${borderClass}">
                <span class="legend-label">${front}</span>
                <span class="legend-value ${colorClass}">${stats[front]}</span>
            </div>
        `;
    });

    // Extras
    if (stats.IND > 0) {
        html += `
            <div class="legend-cell border-gray-400" tyle="border-bottom-color: #6b7280;">
                <span class="legend-label">IND</span>
                <span class="legend-value text-gray-600">${stats.IND}</span>
            </div>`;
    }
    if (stats.OTH > 0) {
        html += `
            <div class="legend-cell border-gray-400" style="border-bottom-color: #6b7280;">
                <span class="legend-label">OTH</span>
                <span class="legend-value text-gray-600">${stats.OTH}</span>
            </div>`;
    }

    html += `</div>`;

    // Add Body Name Header? User didn't ask, but good for context. kept simple as requested.

    legend.innerHTML = html;
    legend.classList.remove('hidden');
}

// --- SELECTORS & UI LOGIC ---

function setButtonsLoading(isLoading) {
    const s = document.getElementById('districtSelect');
    if (s) s.disabled = isLoading;
    const btn = document.getElementById('viewMapBtn');
    if (btn) {
        btn.innerHTML = isLoading ? '<i class="ph ph-spinner animate-spin"></i> Loading...' : '<i class="ph-fill ph-magnifying-glass"></i> Find Wards';
        btn.disabled = isLoading;
    }
}

function updateStatus(msg) {
    const el = document.getElementById('statusText');
    if (el) el.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> ${msg}`;
}

function setupSelectors() {
    const districtSelect = document.getElementById('districtSelect');
    const typeContainer = document.getElementById('typeButtonsContainer');
    const bodySelect = document.getElementById('bodySelect');
    const viewMapBtn = document.getElementById('viewMapBtn');
    const viewElectionBtn = document.getElementById('viewElectionBtn');
    const autoBtn = document.getElementById('autoDetectLocationBtn');

    if (!districtSelect) return;

    // Reset
    districtSelect.innerHTML = '<option value="">-- Choose District --</option>';
    bodySelect.innerHTML = '<option value="">-- Select Type First --</option>';
    typeContainer.innerHTML = '';

    // Populate Districts
    Object.keys(wardMetadata).sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.text = d;
        districtSelect.appendChild(opt);
    });

    // Events
    districtSelect.onchange = function () {
        currentDistrict = this.value;
        currentType = null;
        currentBody = null;
        typeContainer.innerHTML = '';
        bodySelect.innerHTML = '<option value="">-- Select Type First --</option>';
        bodySelect.disabled = true;

        if (!currentDistrict || !wardMetadata[currentDistrict]) return;

        const types = Object.keys(wardMetadata[currentDistrict]).sort();
        types.forEach(type => {
            const btn = document.createElement('button');
            btn.className = 'type-btn';
            btn.textContent = type;
            btn.onclick = (e) => {
                e.preventDefault();
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentType = type;
                currentBody = null;

                bodySelect.innerHTML = '<option value="">-- Select Body --</option>';
                wardMetadata[currentDistrict][type].forEach(b => {
                    const o = document.createElement('option');
                    o.value = b; o.text = b;
                    bodySelect.appendChild(o);
                });
                bodySelect.disabled = false;
            };
            typeContainer.appendChild(btn);
        });
    };

    bodySelect.onchange = function () {
        currentBody = this.value;
    };

    if (viewMapBtn) {
        viewMapBtn.onclick = function () {
            if (currentDistrict && currentType && currentBody) {
                toggleDrawer(); // Close drawer
                isElectionMode = false;
                drawWards();
                fitMapToWards();
                populateWardsList();
            }
        };
    }

    if (viewElectionBtn) {
        viewElectionBtn.onclick = async function () {
            isElectionMode = !isElectionMode;
            const toggle = document.getElementById('electionToggleSwitch');
            const legend = document.getElementById('electionLegend');

            if (isElectionMode) {
                if (toggle) toggle.classList.add('active');
                legend.classList.remove('hidden');

                if (!electionData) await loadElectionData();
                drawElectionMap();
            } else {
                if (toggle) toggle.classList.remove('active');
                legend.classList.add('hidden');

                drawWards();
                populateWardsList();
            }
        };
    }

    if (autoBtn) {
        autoBtn.onclick = function () {
            // toggleDrawer(); // Don't close drawer if we want to show info there? Or maybe close it to show map then open.
            // Let's close it to show the movement
            // toggleDrawer(); 
            centerOnUser();
            checkUserLocationInWards(userPos[0], userPos[1]);
        };
    }
}


function drawWards() {
    if (currentLayer) map.removeLayer(currentLayer);

    // Filter
    const wards = geoJsonData.features.filter(f => {
        const p = f.properties;
        return normalizeName(p.District) === normalizeName(currentDistrict) &&
            normalizeName(p.LSGD) === normalizeName(currentBody) &&
            normalizeName(p.Lsgd_Type) === normalizeName(currentType);
    });

    if (wards.length === 0) return;

    currentLayer = L.geoJSON(wards, {
        style: { color: '#FFD700', weight: 3, opacity: 1, dashArray: '5,5', fillColor: '#FFD700', fillOpacity: 0.1 },
        onEachFeature: (feature, layer) => {
            const p = feature.properties;
            const wardNo = p.Ward_No || p.WardNumber || '?';
            const wardName = p.Ward_Name || p.WardName || p.ward_name || 'Unknown';
            const label = `Ward ${wardNo}: ${wardName}`;
            layer.bindTooltip(label, { permanent: false, direction: 'center', className: 'font-semibold text-sm' });

            layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                startDisplayWardDetails(feature.properties, true); // True = From Map
                map.fitBounds(layer.getBounds(), { padding: [50, 50] });
            });
            layer.on('mouseover', function () { this.setStyle({ color: '#ff5722', fillOpacity: 0.3 }); });
            layer.on('mouseout', function () {
                if (!isElectionMode) this.setStyle({ color: '#FFD700', fillOpacity: 0.1 });
                else this.setStyle(styleElectionWard(feature));
            });
        }
    }).addTo(map);
}

function drawElectionMap() {
    if (currentLayer) map.removeLayer(currentLayer);

    // FIX: Only draw if a specific body is selected to avoid highlighting the whole state
    if (!currentDistrict || !currentBody) {
        console.log('Hub: Election map requested but no body selected. Waiting for selection.');
        return;
    }

    let features = geoJsonData.features.filter(f =>
        normalizeName(f.properties.District) === normalizeName(currentDistrict) &&
        normalizeName(f.properties.LSGD) === normalizeName(currentBody)
    );

    if (features.length === 0) return;

    currentLayer = L.geoJSON({ type: 'FeatureCollection', features: features }, {
        renderer: L.canvas(),
        style: styleElectionWard,
        onEachFeature: (feature, layer) => {
            const p = feature.properties;
            const wardNo = p.Ward_No || p.WardNumber || '?';
            const wardName = p.Ward_Name || p.WardName || p.ward_name || 'Unknown';
            const label = `Ward ${wardNo}: ${wardName}`;
            layer.bindTooltip(label, { permanent: false, direction: 'center', className: 'font-semibold text-sm' });

            layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                startDisplayWardDetails(feature.properties, true); // True = From Map
            });
            // Add hover effect for election map too?
            layer.on('mouseover', function () { this.setStyle({ weight: 3, color: '#333' }); });
            layer.on('mouseout', function () { this.setStyle(styleElectionWard(feature)); });
        }
    }).addTo(map);

    if (currentBody) fitMapToWards();
}

function styleElectionWard(feature) {
    let color = '#eeeeee';

    if (electionData) {
        const dist = normalizeName(feature.properties.District);
        const lsgd = normalizeName(feature.properties.LSGD);
        const wardNo = String(feature.properties.Ward_No || '');

        // Find keys
        const dKey = Object.keys(electionData).find(k => normalizeName(k) === dist);
        if (dKey) {
            const lKey = Object.keys(electionData[dKey]).find(k => normalizeName(k) === lsgd);
            if (lKey) {
                // Try to find ward result
                let wData = electionData[dKey][lKey][wardNo];
                if (!wData) {
                    const wKey = Object.keys(electionData[dKey][lKey]).find(k => parseInt(k) === parseInt(wardNo));
                    if (wKey) wData = electionData[dKey][lKey][wKey];
                }

                if (wData && wData.winner) {
                    color = ELECTION_COLORS[wData.winner.front] || ELECTION_COLORS.OTH;
                    if (wData.isTie) color = ELECTION_COLORS.TIE;
                }
            }
        }
    }

    return { fillColor: color, weight: 1, opacity: 1, color: 'white', fillOpacity: 0.7 };
}


// --- MAP UTILS ---

function fitMapToWards() {
    if (currentLayer && currentLayer.getBounds().isValid()) {
        map.fitBounds(currentLayer.getBounds(), { padding: [50, 50] });
    }
}

function checkConnection() {
    const isOnline = navigator.onLine;
    const txt = document.getElementById('statusText');
    if (txt) txt.innerHTML = isOnline ?
        '<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online' :
        '<span class="w-2 h-2 rounded-full bg-gray-500"></span> Offline';
}
window.addEventListener('online', checkConnection);
window.addEventListener('offline', checkConnection);


// --- NEW GOOGLE MAPS PRO UI LOGIC ---

// 1. Navigation & GPS
function startRealTimeTracking() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) {
        const Geolocation = window.Capacitor.Plugins.Geolocation;

        // Ensure permissions are granted
        Geolocation.requestPermissions().then((permissionStatus) => {
            if (permissionStatus.location !== 'granted') {
                console.warn('Geolocation permission denied');
                return;
            }

            Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
                if (err) {
                    console.error('Watch position error:', err);
                    return;
                }
                if (!pos) return;

                const { latitude, longitude } = pos.coords;
                currentSpeed = pos.coords.speed || 0;
                const distMoved = userPos ? map.distance(userPos, [latitude, longitude]) : 1000;
                userPos = [latitude, longitude];

                if (userMarker) userMarker.setLatLng(userPos);

                if (isNavigating) monitorProgress();
                else if (locationMode !== 'off') map.setView(userPos, map.getZoom(), { animate: true });

                // Auto-detect ward if we have data
                if (geoJsonData && (distMoved > 50 || !currentBody)) {
                    checkUserLocationInWards(latitude, longitude);
                }
            }).then(id => {
                locationWatchId = id;
            });
        });
    } else if ("geolocation" in navigator) {
        locationWatchId = navigator.geolocation.watchPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            currentSpeed = pos.coords.speed || 0;
            const distMoved = userPos ? map.distance(userPos, [latitude, longitude]) : 1000;
            userPos = [latitude, longitude];

            if (userMarker) userMarker.setLatLng(userPos);

            if (isNavigating) monitorProgress();
            else if (locationMode !== 'off') map.setView(userPos, map.getZoom(), { animate: true });

            // Auto-detect ward if we have data
            if (geoJsonData && (distMoved > 50 || !currentBody)) {
                checkUserLocationInWards(latitude, longitude);
            }
        }, null, { enableHighAccuracy: true });
    }
}

// POINT IN POLYGON ALGORITHM
function isPointInPolygon(point, vs) {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function checkUserLocationInWards(lat, lng) {
    let foundFeature = null;

    if (geoJsonData && geoJsonData.features) {
        for (const feature of geoJsonData.features) {
            if (!feature.geometry || !feature.geometry.coordinates) continue;
            const geomType = feature.geometry.type;
            const coords = feature.geometry.coordinates;
            let isInside = false;

            if (geomType === 'Polygon') {
                isInside = isPointInPolygon([lng, lat], coords[0]);
            } else if (geomType === 'MultiPolygon') {
                for (const polygon of coords) {
                    if (isPointInPolygon([lng, lat], polygon[0])) {
                        isInside = true;
                        break;
                    }
                }
            }

            if (isInside) {
                foundFeature = feature;
                break;
            }
        }
    }

    if (foundFeature) {
        const props = foundFeature.properties;
        const newBody = props.LSGD;
        const newDist = props.District;

        if (normalizeName(currentBody) !== normalizeName(newBody)) {
            console.log('📍 Auto-Detected Local Body:', newBody);

            currentDistrict = newDist;
            currentBody = newBody;
            currentType = props.Lsgd_Type;

            const dSelect = document.getElementById('districtSelect');
            if (dSelect && dSelect.value !== currentDistrict) {
                dSelect.value = currentDistrict;
            }

            const bSelect = document.getElementById('bodySelect');
            if (bSelect) {
                bSelect.innerHTML = `<option value="${currentBody}">${currentBody}</option>`;
                bSelect.disabled = false;
            }

            // Update Types
            const typeContainer = document.getElementById('typeButtonsContainer');
            if (typeContainer) {
                typeContainer.innerHTML = '';
                // Optional: ideally logic checks metadata to populate all types for district
                // For now, simpler:
                const btn = document.createElement('button');
                btn.className = 'type-btn active';
                btn.textContent = currentType;
                typeContainer.appendChild(btn);
            }

            if (isElectionMode) drawElectionMap();
            else drawWards();

            populateWardsList();

            const info = document.getElementById('wardInfo');
            if (info) info.innerText = `Entered ${currentBody} (${currentType})`;
        }
    }
}

// --- DEVICE ORIENTATION (cone rotation only — NO map pane rotation) ---
let _compassRAF = null;
let _lastHeading = null;
let _orientationHandler = null;
let _orientationListenerId = null;

function initDeviceOrientation() {
    const handleRotate = (heading) => {
        if (heading == null || heading === false) return;
        if (_lastHeading !== null && Math.abs(heading - _lastHeading) < 2) return;
        _lastHeading = heading;

        if (_compassRAF) return;
        _compassRAF = requestAnimationFrame(() => {
            _compassRAF = null;
            const cone = document.getElementById('gps-cone');
            if (cone) cone.style.transform = `rotate(${heading}deg)`;
            // NO map pane rotation — eliminates all flickering
        });
    };

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Motion) {
        window.Capacitor.Plugins.Motion.addListener('orientation', (event) => {
            handleRotate(event.alpha);
        }).then(listener => { _orientationListenerId = listener; });
    } else if (window.DeviceOrientationEvent) {
        _orientationHandler = (e) => {
            handleRotate(e.webkitCompassHeading || e.alpha);
        };
        window.addEventListener('deviceorientationabsolute', _orientationHandler, true);
        window.addEventListener('deviceorientation', _orientationHandler, true);
    }
}

// --- 3-STATE LOCATION TOGGLE (off → follow → heading) ---
async function toggleLocationMode() {
    // Request permission on iOS
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch (e) { }
    }

    const btn = document.getElementById('compass-mode-btn');
    const cone = document.getElementById('gps-cone');

    if (locationMode === 'off') {
        locationMode = 'follow';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 256 256"><path fill="#1a73e8" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88m0-160a72 72 0 1 0 72 72a72.08 72.08 0 0 0-72-72m0 128a56 56 0 1 1 56-56a56.06 56.06 0 0 1-56 56"/></svg>`;
        btn.classList.add('bg-blue-50');
        if (cone) cone.style.display = 'none';
        map.setView(userPos, 17, { animate: true });
    } else if (locationMode === 'follow') {
        locationMode = 'heading';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 256 256"><path fill="#1a73e8" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88m44.25-121.56l-29.6 66.59a8 8 0 0 1-4.66 4.66l-66.59 29.6a8 8 0 0 1-10.4-10.4l29.6-66.59a8 8 0 0 1 4.66-4.66l66.59-29.6a8 8 0 0 1 10.4 10.4M146.42 128l-23 10.21l-10.21 23l23-10.21l10.21-23Z"/></svg>`;
        if (cone) cone.style.display = 'block';
        map.setView(userPos, 18, { animate: true });
    } else {
        locationMode = 'off';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 256 256"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88m0-160a72 72 0 1 0 72 72a72.08 72.08 0 0 0-72-72m0 128a56 56 0 1 1 56-56a56.06 56.06 0 0 1-56 56"/></svg>`;
        btn.classList.remove('bg-blue-50');
        if (cone) cone.style.display = 'none';
    }
}

// Keep the old name working for the HTML onclick
function toggleCompassMode() { toggleLocationMode(); }

function centerOnUser() {
    map.setView(userPos, Math.max(map.getZoom(), 16), { animate: true });
}

// --- NAVIGATION SYSTEM (Google Maps-like) ---

function showRoutePreview() {
    if (!destPos) { alert('Please select a destination first.'); return; }
    // Show a quick route overview before starting
    updateRoute(true); // true = preview mode
}

function startNav() {
    if (!destPos) { alert('Please select a destination first.'); return; }

    isNavigating = true;
    userPannedAway = false;
    currentStepIndex = 0;
    closeWardDetails();
    _pushState('navigation');

    document.getElementById('search-container').classList.add('hidden');
    document.getElementById('turn-instruction').classList.remove('hidden');
    document.getElementById('nav-header').classList.remove('hidden');

    // Show re-center button listener
    map.on('dragstart', _onUserPan);

    const recenterBtn = document.getElementById('nav-recenter-btn');
    if (recenterBtn) recenterBtn.classList.add('hidden');

    updateRoute(false);
    map.setView(userPos, 18, { animate: true });
}

function _onUserPan() {
    if (!isNavigating) return;
    userPannedAway = true;
    const recenterBtn = document.getElementById('nav-recenter-btn');
    if (recenterBtn) recenterBtn.classList.remove('hidden');
}

function recenterNav() {
    userPannedAway = false;
    const recenterBtn = document.getElementById('nav-recenter-btn');
    if (recenterBtn) recenterBtn.classList.add('hidden');
    map.setView(userPos, 18, { animate: true });
}

function updateRoute(isPreview) {
    if (routingControl) map.removeControl(routingControl);
    lastRouteRecalc = Date.now();

    routingControl = L.Routing.control({
        waypoints: [L.latLng(userPos), L.latLng(destPos)],
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: currentVehicle === 'walk' ? 'foot' : 'driving'
        }),
        lineOptions: {
            styles: [
                { color: '#185ABC', weight: 10, opacity: 0.5 },
                { color: '#4285F4', weight: 6, opacity: 1 }
            ]
        },
        createMarker: () => null,
        addWaypoints: false,
        fitSelectedRoutes: !!isPreview,
        show: false
    }).on('routesfound', (e) => {
        const route = e.routes[0];
        routeTotalDistance = route.summary.totalDistance; // meters
        routeTotalTime = route.summary.totalTime; // seconds
        routeCoordinates = route.coordinates;

        const mins = Math.round(routeTotalTime / 60);
        const distKm = (routeTotalDistance / 1000).toFixed(1);

        ['car', 'bus', 'walk'].forEach(v => {
            const el = document.getElementById(`eta-${v}`);
            if (el) el.innerText = mins + 'm';
        });

        // Update nav info bar
        _updateNavInfo(routeTotalDistance, routeTotalTime);

        currentRouteInstructions = route.instructions.map(step => ({
            ...step,
            latLng: route.coordinates[step.index]
        }));

        if (currentRouteInstructions.length > 0) {
            const dist = map.distance(userPos, currentRouteInstructions[0].latLng);
            updateTurnUI(currentRouteInstructions[0], dist);
        }
    }).addTo(map);
}

function _updateNavInfo(remainDist, remainTime) {
    const bar = document.getElementById('nav-info-bar');
    if (!bar) return;
    bar.classList.remove('hidden');

    const etaDate = new Date(Date.now() + remainTime * 1000);
    const etaStr = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const distStr = remainDist > 1000 ? (remainDist / 1000).toFixed(1) + ' km' : Math.round(remainDist) + ' m';
    const minsStr = Math.round(remainTime / 60);

    bar.innerHTML = `
        <div class="nav-info-eta">${etaStr}</div>
        <div class="nav-info-middle">
            <div class="nav-info-time">${minsStr} min</div>
            <div class="nav-info-dist">${distStr}</div>
        </div>
        <div class="nav-info-speed">${currentSpeed > 0 ? Math.round(currentSpeed * 3.6) + ' km/h' : '—'}</div>
    `;
}

function updateTurnUI(step, distance) {
    const textEl = document.getElementById('turn-text');
    const subEl = document.getElementById('turn-subtext');
    const distEl = document.getElementById('turn-distance');
    const iconEl = document.getElementById('turn-icon');
    if (!textEl) return;

    textEl.innerText = step.text || 'Proceed to route';
    distEl.innerText = distance > 1000 ? (distance / 1000).toFixed(1) + ' km' : Math.round(distance) + ' m';

    // Show speed
    if (currentSpeed > 0) {
        subEl.innerText = Math.round(currentSpeed * 3.6) + ' km/h';
    } else {
        subEl.innerText = '';
    }

    // Smart icon mapping
    const t = (step.text || '').toLowerCase();
    let iconClass = 'ph-fill ph-arrow-up';
    if (t.includes('destination') || t.includes('arrive')) iconClass = 'ph-fill ph-flag-checkered';
    else if (t.includes('sharp left') || t.includes('u-turn left')) iconClass = 'ph-fill ph-arrow-u-down-left';
    else if (t.includes('sharp right') || t.includes('u-turn right')) iconClass = 'ph-fill ph-arrow-u-down-right';
    else if (t.includes('slight left') || t.includes('bear left')) iconClass = 'ph-fill ph-arrow-bend-left-up';
    else if (t.includes('slight right') || t.includes('bear right')) iconClass = 'ph-fill ph-arrow-bend-right-up';
    else if (t.includes('left')) iconClass = 'ph-fill ph-arrow-u-up-left';
    else if (t.includes('right')) iconClass = 'ph-fill ph-arrow-u-up-right';
    else if (t.includes('roundabout')) iconClass = 'ph-fill ph-arrows-clockwise';
    else if (t.includes('u-turn')) iconClass = 'ph-fill ph-arrow-u-down-left';
    else if (t.includes('straight') || t.includes('continue')) iconClass = 'ph-fill ph-arrow-up';
    else if (t.includes('merge')) iconClass = 'ph-fill ph-git-merge';

    iconEl.className = iconClass;
}

function monitorProgress() {
    if (!currentRouteInstructions.length || !isNavigating) return;

    // --- Auto-follow ---
    if (!userPannedAway) {
        map.setView(userPos, Math.max(map.getZoom(), 17), { animate: true, duration: 0.5 });
    }

    // --- Update current step ---
    const currentStep = currentRouteInstructions[currentStepIndex];
    if (!currentStep) return;

    const distToTurn = map.distance(userPos, currentStep.latLng);
    updateTurnUI(currentStep, distToTurn);

    // --- Auto-advance step ---
    if (distToTurn < 25 && currentStepIndex < currentRouteInstructions.length - 1) {
        currentStepIndex++;
        // Haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(100);
    }

    // --- Off-route detection (recalc if >100m from nearest route point) ---
    if (routeCoordinates.length > 0) {
        let minDist = Infinity;
        // Sample every 5th coordinate for performance
        for (let i = 0; i < routeCoordinates.length; i += 5) {
            const d = map.distance(userPos, routeCoordinates[i]);
            if (d < minDist) minDist = d;
            if (d < 30) break; // close enough, stop searching
        }
        if (minDist > 100 && (Date.now() - lastRouteRecalc) > 10000) {
            console.log('📍 Off-route detected, recalculating...');
            updateRoute(false);
        }
    }

    // --- Update remaining distance/time estimate ---
    const distToDest = map.distance(userPos, destPos);
    const speedForCalc = currentSpeed > 1 ? currentSpeed : (currentVehicle === 'walk' ? 1.4 : 8.3);
    const estTimeRemaining = distToDest / speedForCalc;
    _updateNavInfo(distToDest, estTimeRemaining);

    // --- Arrival detection ---
    if (distToDest < 30) {
        _onArrival();
    }
}

function _onArrival() {
    isNavigating = false;

    const turnEl = document.getElementById('turn-text');
    const iconEl = document.getElementById('turn-icon');
    const distEl = document.getElementById('turn-distance');
    const subEl = document.getElementById('turn-subtext');

    if (turnEl) turnEl.innerText = 'You have arrived!';
    if (iconEl) iconEl.className = 'ph-fill ph-flag-checkered';
    if (distEl) distEl.innerText = '';
    if (subEl) subEl.innerText = 'Your destination is nearby';

    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    setTimeout(() => {
        exitNavigation();
    }, 4000);
}

function exitNavigation() {
    isNavigating = false;
    userPannedAway = false;
    map.off('dragstart', _onUserPan);

    document.getElementById('search-container').classList.remove('hidden');
    document.getElementById('turn-instruction').classList.add('hidden');
    document.getElementById('nav-header').classList.add('hidden');
    const infoBar = document.getElementById('nav-info-bar');
    if (infoBar) infoBar.classList.add('hidden');
    const recenterBtn = document.getElementById('nav-recenter-btn');
    if (recenterBtn) recenterBtn.classList.add('hidden');

    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    routeCoordinates = [];
    currentRouteInstructions = [];

    map.setView(userPos, 16, { animate: true });
}

function setVehicle(type) {
    currentVehicle = type;
    document.querySelectorAll('.vehicle-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`v-${type}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (isNavigating) updateRoute(false);
}


// 3. Search & Drawer
function setupDrawerInteractions() {
    const searchInput = document.getElementById('search-input');
    const searchTrigger = document.getElementById('search-trigger');

    if (searchTrigger) {
        searchTrigger.onclick = () => searchLocation(searchInput.value);
    }
    if (searchInput) {
        searchInput.onkeyup = (e) => { if (e.key === 'Enter') searchLocation(e.target.value); };
    }
}

// --- ANDROID BACK BUTTON & HISTORY STATE MANAGEMENT ---
let _historyStates = []; // Track our pushed states

function _pushState(stateName) {
    history.pushState({ appState: stateName }, '');
    _historyStates.push(stateName);
}

function _popOurState() {
    if (_historyStates.length > 0) {
        _historyStates.pop();
    }
}

// Handle Android hardware back button
window.addEventListener('popstate', function (e) {
    const state = _historyStates[_historyStates.length - 1];

    if (state === 'wardDetails') {
        _popOurState();
        closeWardDetails(true); // true = from popstate, don't call history.back
    } else if (state === 'drawer') {
        _popOurState();
        _closeDrawerDirect();
    } else if (state === 'navigation') {
        _popOurState();
        exitNavigation();
    }
    // If no state, the browser's default back behavior takes over (which is fine)
});

function _closeDrawerDirect() {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer) {
        drawer.classList.add('-translate-x-full');
    }
    if (overlay) {
        overlay.classList.remove('opacity-100', 'pointer-events-auto');
        overlay.classList.add('opacity-0', 'pointer-events-none');
    }
    // Also reset to main view if details were open
    const mainView = document.getElementById('drawer-main-view');
    const detailsView = document.getElementById('drawer-details-view');
    if (detailsView && !detailsView.classList.contains('hidden')) {
        detailsView.classList.add('hidden');
        if (mainView) mainView.classList.remove('hidden');
    }
}

function toggleDrawer() {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const isOpen = !drawer.classList.contains('-translate-x-full');

    if (isOpen) {
        // Close drawer
        drawer.classList.add('-translate-x-full');
        overlay.classList.remove('opacity-100', 'pointer-events-auto');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        // Pop all our drawer-related states
        while (_historyStates.length > 0) {
            const s = _historyStates[_historyStates.length - 1];
            if (s === 'drawer' || s === 'wardDetails') {
                _popOurState();
                history.back();
            } else {
                break;
            }
        }
    } else {
        // Open drawer
        drawer.classList.remove('-translate-x-full');
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100', 'pointer-events-auto');
        _pushState('drawer');
    }
}

function changeMapLayer(type) {
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));

    const btnId = `btn-${type}`;
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');

    if (currentTileLayer) map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(tileLayers[type], {
        maxZoom: 20,
        subdomains: 'abc' // For some carto tiles
    }).addTo(map);
}

async function searchLocation(query) {
    if (!query) return;
    const loader = document.getElementById('search-loader');
    const list = document.getElementById('search-results');

    loader.classList.remove('hidden');
    list.innerHTML = '';
    list.classList.remove('hidden');

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        const data = await res.json();

        if (data.length === 0) {
            list.innerHTML = '<div class="p-4 text-gray-500 text-center text-sm">No results found</div>';
        } else {
            data.forEach(item => {
                const row = document.createElement('div');
                row.className = 'p-4 border-b flex items-center gap-4 active:bg-gray-100 cursor-pointer hover:bg-gray-50';
                row.innerHTML = `
                    <i class="ph ph-map-pin text-xl text-blue-600"></i>
                    <div class="overflow-hidden">
                        <div class="font-bold truncate text-gray-800 text-left text-sm">${item.display_name.split(',')[0]}</div>
                        <div class="text-xs text-gray-500 truncate text-left">${item.display_name}</div>
                    </div>`;
                row.onclick = () => {
                    list.classList.add('hidden');
                    selectLocation(parseFloat(item.lat), parseFloat(item.lon), item.display_name);
                };
                list.appendChild(row);
            });
        }
    } catch (e) {
        console.error(e);
    }
    loader.classList.add('hidden');
}


// 4. Ward Details & Sidebar Logic (REPLACED FROM BOTTOM SHEET)

function selectLocation(lat, lng, label = null) {
    destPos = [lat, lng];
    if (destMarker) map.removeLayer(destMarker);

    // Create native marker using Phosphor icon to ensure it loads without network issues
    const markerHtml = `
        <div style="background-color: var(--danger); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2); border: 3px solid white;">
            <i class="ph-fill ph-map-pin" style="font-size: 24px;"></i>
        </div>
        <div style="width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 15px solid var(--danger); margin: -5px auto 0 auto;"></div>`;

    destMarker = L.marker(destPos, {
        icon: L.divIcon({
            className: 'custom-pin',
            html: markerHtml,
            iconSize: [40, 55],
            iconAnchor: [20, 55]
        })
    }).addTo(map);

    map.flyTo(destPos, 16);

    // Check if we clicked on a known ward
    calculateNearestWard(lat, lng);
}

function startDisplayWardDetails(props) {
    // 1. Target Elements in the Sidebar
    const title = document.getElementById('wardTitle');
    const info = document.getElementById('wardInfo');
    const winnerCard = document.getElementById('wardElectionWinner');
    const table = document.getElementById('wardCandidateTable');

    const wardName = props.Ward_Name || 'Unknown Ward';
    const wardNo = String(props.Ward_No || props.WardNumber || '?');
    const district = props.District || '';
    const lsgd = props.LSGD || '';

    if (title) title.innerText = `Ward ${wardNo}: ${wardName}`;
    if (info) info.innerText = `${district} • ${lsgd}`;

    // 2. Clear Previous Data / Loading State
    if (winnerCard) winnerCard.classList.add('hidden');
    if (table) table.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';

    // 3. Find Data
    if (!electionData) {
        if (table) table.innerHTML = '<div class="empty-state">Load "Election Mode" to see results.</div>';
    } else {
        // Robust Key Finding
        let dKey = Object.keys(electionData).find(k => normalizeName(k) === normalizeName(district));
        if (!dKey) dKey = Object.keys(electionData).find(k => k.includes(district) || district.includes(k));

        if (dKey) {
            let lKey = Object.keys(electionData[dKey]).find(k => normalizeName(k) === normalizeName(lsgd));
            if (!lKey) lKey = Object.keys(electionData[dKey]).find(k => k.includes(lsgd) || lsgd.includes(k));

            if (lKey) {
                // Robust Ward finding
                let wKey = Object.keys(electionData[dKey][lKey]).find(k => String(parseInt(k)) === String(parseInt(wardNo)));
                let wData = wKey ? electionData[dKey][lKey][wKey] : null;

                if (wData) {
                    // Populate Winner Card
                    if (wData.winner && winnerCard) {
                        winnerCard.classList.remove('hidden');
                        document.getElementById('wardWinnerName').innerText = wData.winner.name;
                        document.getElementById('wardWinnerParty').innerText = `${wData.winner.party} (${wData.winner.front})`;

                        const color = ELECTION_COLORS[wData.winner.front] || '#9ca3af';
                        winnerCard.style.borderLeftColor = color;
                        // winnerCard.querySelector('.winner-label').style.color = color; // Optional: colored label
                    }

                    // Populate Candidates Table
                    if (table) {
                        let maxVotes = Math.max(...wData.candidates.map(c => c.votes));
                        let html = `<div class="candidates-list">`;

                        wData.candidates.sort((a, b) => b.votes - a.votes).forEach(c => {
                            const percent = ((c.votes / wData.totalVotes) * 100).toFixed(1);
                            const barWidth = ((c.votes / maxVotes) * 100).toFixed(0);
                            const frontColor = ELECTION_COLORS[c.front] || '#e5e7eb';
                            const isWinner = c.rank === 1;

                            // Semantic HTML Structure
                            html += `
                            <div class="candidate-row ${isWinner ? 'is-winner' : ''}">
                                <div class="c-info text-left">
                                    <div class="c-name">
                                        ${c.name}
                                        ${isWinner ? '<i class="ph-fill ph-crown winner-icon"></i>' : ''}
                                    </div>
                                    <div class="c-party">${c.party}</div>
                                </div>
                                <div class="c-stats text-right">
                                    <div class="c-votes">${c.votes}</div>
                                    <div class="c-percent">${percent}%</div>
                                </div>
                                <div class="progress-track">
                                    <div class="progress-fill" style="width: ${barWidth}%; background-color: ${frontColor};"></div>
                                </div>
                            </div>`;
                        });
                        html += `</div>`;
                        table.innerHTML = html;
                    }
                } else {
                    if (table) table.innerHTML = '<div class="empty-state">No election data found for this ward.</div>';
                }
            } else {
                if (table) table.innerHTML = `<div class="empty-state">Data missing for Local Body: ${lsgd}</div>`;
            }
        } else {
            if (table) table.innerHTML = `<div class="empty-state">Data missing for District: ${district}</div>`;
        }
    }

    // 3. Switch Sidebar View & Open Drawer
    const drawer = document.getElementById('side-drawer');
    const mainView = document.getElementById('drawer-main-view');
    const detailsView = document.getElementById('drawer-details-view');

    if (drawer && drawer.classList.contains('-translate-x-full')) {
        drawer.classList.remove('-translate-x-full');
    }

    // Swap Views
    if (mainView) mainView.classList.add('hidden');
    if (detailsView) detailsView.classList.remove('hidden');

    // Update Global State
    if (normalizeName(currentBody) !== normalizeName(lsgd)) {
        currentBody = lsgd;
        currentDistrict = district;
        currentType = props.Lsgd_Type;
        if (isElectionMode) drawElectionMap();
        else drawWards();
    }
}

function closeWardDetails(fromPopstate = false) {
    const mainView = document.getElementById('drawer-main-view');
    const detailsView = document.getElementById('drawer-details-view');

    if (detailsView) detailsView.classList.add('hidden');
    if (mainView) mainView.classList.remove('hidden');

    // Pop the wardDetails history state (unless we're already in a popstate handler)
    if (!fromPopstate && _historyStates[_historyStates.length - 1] === 'wardDetails') {
        _popOurState();
        history.back();
    }
}

function calculateNearestWard(lat, lng) {
    checkUserLocationInWards(lat, lng);
}

// Populate Wards List for Selection View (Placeholder or existing logic)
function populateWardsList() {
    const list = document.getElementById('allWardsList');
    if (!list) return;

    if (!currentBody) {
        list.innerHTML = '<div class="p-8 text-center text-gray-400 text-sm">Select a Local Body to view wards.</div>';
        return;
    }

    // Get wards for current body
    let bodyWards = [];
    if (geoJsonData && geoJsonData.features) {
        bodyWards = geoJsonData.features.filter(f =>
            normalizeName(f.properties.District) === normalizeName(currentDistrict) &&
            normalizeName(f.properties.LSGD) === normalizeName(currentBody)
        );
    }

    if (bodyWards.length === 0) {
        list.innerHTML = '<div class="p-8 text-center text-gray-400 text-sm">No wards found.</div>';
        return;
    }

    // Sort by Ward Number if possible
    bodyWards.sort((a, b) => {
        const wa = parseInt(a.properties.Ward_No) || 0;
        const wb = parseInt(b.properties.Ward_No) || 0;
        return wa - wb;
    });

    let html = '<div class="divide-y divide-gray-100">';
    bodyWards.forEach(f => {
        const p = f.properties;
        html += `<div class="ward-list-item p-4 cursor-pointer flex justify-between items-center group" onclick="startDisplayWardDetailsByProp(this)">
            <div>
                <div class="font-bold text-gray-800 text-sm">Ward ${p.Ward_No}</div>
                <div class="text-xs text-gray-500">${p.Ward_Name}</div>
            </div>
            <i class="ph-bold ph-caret-right text-gray-300 group-hover:text-blue-500"></i>
            <div class="hidden json-props">${JSON.stringify(p).replace(/"/g, '&quot;')}</div>
        </div>`;
    });
    html += '</div>';
    list.innerHTML = html;
}

// Helper for the list click since passing object in HTML onclick is messy
// Helper for the list click since passing object in HTML onclick is messy
window.startDisplayWardDetailsByProp = function (el) {
    const json = el.querySelector('.json-props').textContent;
    const props = JSON.parse(json.replace(/&quot;/g, '"'));
    startDisplayWardDetails(props, false); // List click = false
};

function startDisplayWardDetails(props, isFromMap = false) {
    // 1. Target Elements in the Sidebar
    const title = document.getElementById('wardTitle');
    const info = document.getElementById('wardInfo');
    const winnerCard = document.getElementById('wardElectionWinner');
    const table = document.getElementById('wardCandidateTable');

    const wardName = props.Ward_Name || 'Unknown Ward';
    const wardNo = String(props.Ward_No || props.WardNumber || '?');
    const district = props.District || '';
    const lsgd = props.LSGD || '';

    if (title) title.innerText = `Ward ${wardNo}: ${wardName}`;
    if (info) info.innerText = `${district} • ${lsgd}`;

    // 2. Clear Previous Data / Loading State
    if (winnerCard) winnerCard.classList.add('hidden');
    // Default table to hidden or empty, only show if logic passes
    if (table) table.innerHTML = '';

    // VISIBILITY LOGIC:
    // Only show detailed election data if:
    // 1. We have election data loaded.
    // 2. Election Mode is ON.
    const showDetailedResults = electionData && isElectionMode;

    if (!showDetailedResults) {
        if (table && isElectionMode) {
            // Optional: Hint to user
            table.innerHTML = '<div class="empty-state">Election data not loaded.</div>';
        }
    } else {
        // Show Spinner while we process/find data
        if (table) table.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';

        // Robust Key Finding
        let dKey = Object.keys(electionData).find(k => normalizeName(k) === normalizeName(district));
        if (!dKey) dKey = Object.keys(electionData).find(k => k.includes(district) || district.includes(k));

        if (dKey) {
            let lKey = Object.keys(electionData[dKey]).find(k => normalizeName(k) === normalizeName(lsgd));
            if (!lKey) lKey = Object.keys(electionData[dKey]).find(k => k.includes(lsgd) || lsgd.includes(k));

            if (lKey) {
                // Robust Ward finding
                let wKey = Object.keys(electionData[dKey][lKey]).find(k => String(parseInt(k)) === String(parseInt(wardNo)));
                let wData = wKey ? electionData[dKey][lKey][wKey] : null;

                if (wData) {
                    // Populate Winner Card
                    if (wData.winner && winnerCard) {
                        winnerCard.classList.remove('hidden');
                        document.getElementById('wardWinnerName').innerText = wData.winner.name;
                        document.getElementById('wardWinnerParty').innerText = `${wData.winner.party} (${wData.winner.front})`;

                        const color = ELECTION_COLORS[wData.winner.front] || '#9ca3af';
                        winnerCard.style.borderLeftColor = color;
                    }

                    // Populate Candidates Table
                    if (table) {
                        let maxVotes = Math.max(...wData.candidates.map(c => c.votes));
                        let html = `<div class="candidates-list">`;

                        wData.candidates.sort((a, b) => b.votes - a.votes).forEach(c => {
                            const percent = ((c.votes / wData.totalVotes) * 100).toFixed(1);
                            const barWidth = ((c.votes / maxVotes) * 100).toFixed(0);
                            const frontColor = ELECTION_COLORS[c.front] || '#e5e7eb';
                            const isWinner = c.rank === 1;

                            // Semantic HTML Structure
                            html += `
                            <div class="candidate-row ${isWinner ? 'is-winner' : ''}">
                                <div class="c-info text-left">
                                    <div class="c-name">
                                        ${c.name}
                                        ${isWinner ? '<i class="ph-fill ph-crown winner-icon"></i>' : ''}
                                    </div>
                                    <div class="c-party">${c.party}</div>
                                </div>
                                <div class="c-stats text-right">
                                    <div class="c-votes">${c.votes}</div>
                                    <div class="c-percent">${percent}%</div>
                                </div>
                                <div class="progress-track">
                                    <div class="progress-fill" style="width: ${barWidth}%; background-color: ${frontColor};"></div>
                                </div>
                            </div>`;
                        });
                        html += `</div>`;
                        table.innerHTML = html;
                    }
                } else {
                    if (table) table.innerHTML = '<div class="empty-state">No election data found for this ward.</div>';
                }
            } else {
                if (table) table.innerHTML = `<div class="empty-state">Data missing for Local Body: ${lsgd}</div>`;
            }
        } else {
            if (table) table.innerHTML = `<div class="empty-state">Data missing for District: ${district}</div>`;
        }
    }

    // 3. Switch Sidebar View & Open Drawer
    const drawer = document.getElementById('side-drawer');
    const mainView = document.getElementById('drawer-main-view');
    const detailsView = document.getElementById('drawer-details-view');

    if (drawer && drawer.classList.contains('-translate-x-full')) {
        drawer.classList.remove('-translate-x-full');
        _pushState('drawer');
    }

    // Swap Views
    if (mainView) mainView.classList.add('hidden');
    if (detailsView) detailsView.classList.remove('hidden');
    _pushState('wardDetails');

    // Update Global State
    if (normalizeName(currentBody) !== normalizeName(lsgd)) {
        currentBody = lsgd;
        currentDistrict = district;
        currentType = props.Lsgd_Type;
        if (isElectionMode) drawElectionMap();
        else drawWards();
    }

    // Trigger legend update if standard ward click changed body (optional, but requested behavior implies implicit update)
    if (currentBody) updateElectionLegend(currentBody);
}
