// KERALA WARD MAPS - FIXED VERSION WITH PROPER GEOJSON HANDLING

let map = null;
let currentLayer = null;
let geoJsonData = null;
let currentDistrict = null;
let currentType = null;
let currentBody = null;
let userLocation = null;
let wardMetadata = {}; // Will be populated dynamically from GeoJSON
// Location marker variables (used by locator features)
let locationMarker = null;
let locationAccuracyCircle = null;
let locationZoomHandler = null;

const fallbackMetadata = {
    "Thiruvanathapuram": {
        "Grama Panchayat": ["Amboori", "Anad", "Andoorkonam", "Anjuthengu", "Aruvikkara"],
        "Municipality": ["Thiruvananthapuram"],
        "Corporation": ["Thiruvananthapuram"]
    },
    "Kollam": {
        "Grama Panchayat": ["Adeoor", "Aernam", "Akaparambu"],
        "Municipality": ["Kollam", "Kottarakkara"]
    },
    "Alappuzha": {
        "Grama Panchayat": ["Ala", "Ambalappuzha"],
        "Municipality": ["Alappuzha", "Kayamkulam"]
    },
    "Kottayam": {
        "Grama Panchayat": ["Kallissery", "Kammanam"],
        "Municipality": ["Kottayam"]
    },
    "Pathanamthitta": {
        "Municipality": ["Pathanamthitta"]
    },
    "Idukki": {
        "District Panchayat": ["Idukki"]
    },
    "Ernakulam": {
        "Corporation": ["Kochi"],
        "Municipality": ["Ernakulam", "Kodungalloor"],
        "District Panchayat": ["Ernakulam"]
    },
    "Thrissur": {
        "Municipality": ["Thrissur"]
    },
    "Palakkad": {
        "Municipality": ["Palakkad"]
    },
    "Malappuram": {
        "Municipality": ["Malappuram"]
    },
    "Kozhikode": {
        "Corporation": ["Kozhikode"],
        "Municipality": ["Kozhikode"]
    },
    "Wayanad": {
        "District Panchayat": ["Wayanad"]
    },
    "Kannur": {
        "Municipality": ["Kannur"]
    },
    "Kasaragod": {
        "Municipality": ["Kasaragod"]
    }
};

// INIT
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 App initializing...');
    checkConnection();
    
    // Load wardMetadata from mapping file first
    loadWardMetadata();
    
    loadGeoJsonData();
    // setupSelectors() will be called after data loads
    setupMapButtons();
});

// LOAD WARD METADATA FROM MAPPING FILE
function loadWardMetadata() {
    console.log('📖 Loading ward metadata from mapping file...');
    
    fetch('data/district_localbody_mapping.json')
        .then(r => r.json())
        .then(data => {
            // Convert mapping format to wardMetadata format
            const tempMetadata = {};
            
            for (const [district, bodies] of Object.entries(data)) {
                tempMetadata[district] = {};
                
                bodies.forEach(body => {
                    const type = body.Type || 'Grama Panchayat';
                    
                    if (!tempMetadata[district][type]) {
                        tempMetadata[district][type] = [];
                    }
                    
                    tempMetadata[district][type].push(body.LocalBody);
                });
                
                // Sort each type's local bodies
                Object.keys(tempMetadata[district]).forEach(type => {
                    tempMetadata[district][type].sort();
                });
            }
            
            wardMetadata = tempMetadata;
            console.log('✅ Ward metadata loaded:', Object.keys(wardMetadata).length, 'districts');
            
            // Initialize selectors with mapping data
            setupSelectors();
        })
        .catch(e => {
            console.warn('⚠️ Could not load mapping file, will use GeoJSON data:', e.message);
            // Will be populated from GeoJSON
        });
}

// CHECK CONNECTION
function checkConnection() {
    const statusText = document.getElementById('statusText');
    const statusBar = document.getElementById('statusBar');
    const isOnline = navigator.onLine;
    
    if (statusText && statusBar) {
        statusText.textContent = isOnline ? '✓ Online - Live satellite view' : '⚪ Offline';
        statusBar.className = 'status-bar ' + (isOnline ? 'online' : 'offline');
    }
}

// LOAD GEOJSON - WITH DEBUGGING
function loadGeoJsonData() {
    console.log('📦 Fetching GeoJSON...');
    const startTime = performance.now();
    
    fetch('data/KL_Wards.geojson')
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => {
            const loadTime = (performance.now() - startTime).toFixed(2);
            geoJsonData = data;
            console.log(`✅ GeoJSON loaded in ${loadTime}ms:`, data.features?.length, 'features');
            
            if (data.features && data.features[0]) {
                const sampleProps = data.features[0].properties;
                console.log('📋 Sample feature properties:', Object.keys(sampleProps || {}));
                console.log('📋 Sample feature:', JSON.stringify(sampleProps, null, 2).substring(0, 200));
            }
            
            // Extract metadata dynamically from GeoJSON
            console.log('🔄 Extracting metadata from GeoJSON...');
            const tempMetadata = {};
            const wardCounts = {}; // Track ward count per local body
            
            data.features.forEach((feature) => {
                const props = feature.properties;
                const district = props.District;
                const lsgd = props.LSGD;
                const type = props.Lsgd_Type;
                
                if (!district || !lsgd || !type) {
                    return;
                }
                
                // Normalize type name (handle case variations)
                const normalizedType = type.charAt(0).toUpperCase() + type.slice(1);
                
                if (!tempMetadata[district]) {
                    tempMetadata[district] = {};
                }
                
                if (!tempMetadata[district][normalizedType]) {
                    tempMetadata[district][normalizedType] = new Set();
                }
                
                tempMetadata[district][normalizedType].add(lsgd);
                
                // Track ward counts
                const key = `${district}|${normalizedType}|${lsgd}`;
                wardCounts[key] = (wardCounts[key] || 0) + 1;
            });
            
            // Convert Sets to sorted arrays and remove empty entries
            const finalMetadata = {};
            Object.keys(tempMetadata).forEach(district => {
                finalMetadata[district] = {};
                
                Object.keys(tempMetadata[district]).forEach(type => {
                    const bodies = Array.from(tempMetadata[district][type]).sort();
                    
                    // Filter to only include bodies with actual wards
                    finalMetadata[district][type] = bodies.filter(body => {
                        const key = `${district}|${type}|${body}`;
                        const count = wardCounts[key] || 0;
                        if (count === 0) {
                            console.warn(`⚠️ Empty body: ${district} > ${type} > ${body} (${count} wards)`);
                        }
                        return count > 0;
                    });
                    
                    // Remove type if no bodies with wards
                    if (finalMetadata[district][type].length === 0) {
                        delete finalMetadata[district][type];
                    }
                });
                
                // Remove district if no types with bodies
                if (Object.keys(finalMetadata[district]).length === 0) {
                    delete finalMetadata[district];
                }
            });
            
            wardMetadata = finalMetadata;
            console.log('✅ Metadata extracted:', Object.keys(wardMetadata).length, 'districts');
            
            // Reinitialize selectors with new metadata
            setupSelectors();
            
            // Update UI to show data is loaded
            const statusText = document.getElementById('statusText');
            if (statusText) {
                statusText.textContent = '✓ Data loaded - ' + (data.features?.length || 0).toLocaleString() + ' wards ready';
            }
        })
        .catch(e => {
            console.error('❌ GeoJSON error:', e);
            console.error('Stack:', e.stack);
            const statusText = document.getElementById('statusText');
            if (statusText) {
                statusText.textContent = '❌ Error loading data';
            }
            alert('⚠️ Error loading KL_Wards.geojson from public/data/\n\nError: ' + e.message + '\n\nCheck:\n1. File exists at public/data/KL_Wards.geojson\n2. File is valid GeoJSON\n3. Server is running on port 3000');
        });
}

// SETUP SELECTORS
function setupSelectors() {
    const districtSelect = document.getElementById('districtSelect');
    const typeContainer = document.getElementById('typeButtonsContainer');
    const bodySelect = document.getElementById('bodySelect');
    const viewMapBtn = document.getElementById('viewMapBtn');
    
    // Clear existing options
    districtSelect.innerHTML = '<option value="">-- Choose District --</option>';
    bodySelect.innerHTML = '<option value="">-- Choose Local Body --</option>';
    typeContainer.innerHTML = '';
    
    // Populate districts
    Object.keys(wardMetadata).sort().forEach(district => {
        const option = document.createElement('option');
        option.value = district;
        option.text = district;
        districtSelect.appendChild(option);
    });
    
    // District change
    districtSelect.addEventListener('change', function() {
        currentDistrict = this.value;
        currentType = null;
        currentBody = null;
        
        typeContainer.innerHTML = '';
        bodySelect.innerHTML = '<option value="">-- Select Type First --</option>';
        bodySelect.disabled = true;
        viewMapBtn.disabled = true;
        
        if (!currentDistrict) return;
        
        const types = Object.keys(wardMetadata[currentDistrict]);
        types.forEach(type => {
            const btn = document.createElement('button');
            btn.className = 'type-btn';
            btn.type = 'button';
            btn.textContent = type;
            btn.onclick = function(e) {
                e.preventDefault();
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                currentType = type;
                currentBody = null;
                
                bodySelect.innerHTML = '<option value="">-- Select Body --</option>';
                wardMetadata[currentDistrict][type].forEach(body => {
                    const opt = document.createElement('option');
                    opt.value = body;
                    opt.text = body;
                    bodySelect.appendChild(opt);
                });
                
                bodySelect.disabled = false;
                viewMapBtn.disabled = true;
            };
            typeContainer.appendChild(btn);
        });
    });
    
    // Body change
    bodySelect.addEventListener('change', function() {
        currentBody = this.value;
        viewMapBtn.disabled = !currentBody;
    });
    
    // View map
    viewMapBtn.onclick = function(e) {
        e.preventDefault();
        if (currentDistrict && currentType && currentBody) {
            console.log('🗺️ Opening:', currentDistrict, '>', currentType, '>', currentBody);
            showMap();
        }
    };
}

// SHOW MAP SCREEN (Google Maps style - side-by-side)
function showMap() {
    document.getElementById('loadingSpinner').classList.remove('hidden');
    setTimeout(() => {
        // GOOGLE MAPS STYLE: Keep selector visible, show map beside it
        document.getElementById('selectorScreen').classList.add('active');
        document.getElementById('mapScreen').classList.add('active');
        document.getElementById('loadingSpinner').classList.add('hidden');
        if (!map) {
            initMap();
        }
        setTimeout(() => {
            drawWards();
            updateInfo();
            fitMapToWards();
        }, 500);
    }, 300);
}


// INITIALIZE MAP
function initMap() {
    console.log('🗺️ Creating Leaflet map...');
    const center = [10.8505, 76.2711];
    
    map = L.map('mapContainer').setView(center, 8);
    
    // SATELLITE LAYER (Default)
    const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
            attribution: '© Esri',
            maxZoom: 18,
            minZoom: 6,
            className: 'leaflet-tile'
        }
    ).addTo(map);
    
    // STREET LAYER
    const streetLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }
    );
    
    // HYBRID LAYER
    const hybridLayer = L.tileLayer(
        'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        {
            attribution: '© Google',
            maxZoom: 20
        }
    );
    
    // Layer control
    L.control.layers(
        {
            '🛰️ Satellite': satelliteLayer,
            '🗺️ Street Map': streetLayer,
            '🖼️ Hybrid': hybridLayer
        },
        null,
        { position: 'topright' }
    ).addTo(map);
    
    // Scale
    L.control.scale({ position: 'bottomright' }).addTo(map);
    
    console.log('✅ Map initialized');
}

// DRAW WARD BOUNDARIES
function drawWards() {
    console.log('🎨 Drawing wards for:', currentDistrict, '>', currentType, '>', currentBody);
    
    if (!geoJsonData) {
        console.error('❌ GeoJSON not loaded');
        alert('❌ Ward data not loaded yet. Please wait and try again.');
        return;
    }
    
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }
    
    // FILTER by District, Type, and LSGD name
    let wards = geoJsonData.features.filter(f => {
        const props = f.properties || {};
        
        const district = (props.District || '').toLowerCase().trim();
        const type = (props.Lsgd_Type || '').toLowerCase().trim();
        const lsgd = (props.LSGD || '').toLowerCase().trim();
        
        const matchDistrict = district === currentDistrict.toLowerCase().trim();
        const matchType = type === currentType.toLowerCase().trim();
        const matchLsgd = lsgd === currentBody.toLowerCase().trim();
        
        return matchDistrict && matchType && matchLsgd;
    });
    
    console.log('✅ Found', wards.length, 'wards');
    
    // If no match, provide debugging info
    if (wards.length === 0) {
        console.warn('⚠️ No wards matched the filter');
        console.warn('Looking for:', {
            District: currentDistrict,
            Type: currentType,
            LSGD: currentBody
        });
        
        // Show what's available in this district/type combo
        const available = geoJsonData.features
            .filter(f => {
                const props = f.properties || {};
                const district = (props.District || '').toLowerCase().trim();
                const type = (props.Lsgd_Type || '').toLowerCase().trim();
                
                return district === currentDistrict.toLowerCase().trim() &&
                       type === currentType.toLowerCase().trim();
            })
            .map(f => f.properties.LSGD)
            .filter((val, idx, arr) => arr.indexOf(val) === idx)
            .sort();
        
        console.warn('Available in this district/type:', available);
        
        let errorMsg = `❌ No ward data found for "${currentBody}"\n\n`;
        
        if (available.length > 0) {
            errorMsg += `Available local bodies in ${currentDistrict} (${currentType}):\n\n`;
            errorMsg += available.join(', ');
        } else {
            errorMsg += `No ward data available for ${currentType} in ${currentDistrict}.\n\nTry selecting a different local body type.`;
        }
        
        errorMsg += '\n\n(The local body may exist in the mapping, but ward boundary data is not available for it yet.)';
        
        alert(errorMsg);
        return;
    }
    
    // CREATE LAYER
    currentLayer = L.geoJSON(wards, {
        style: {
            color: '#FFD700',        // YELLOW
            weight: 3,               // Line thickness
            opacity: 1,
            dashArray: '5,5',        // Dashed
            fillColor: '#FFD700',
            fillOpacity: 0.05        // Slight transparent yellow fill
        },
        onEachFeature: function(feature, layer) {
            const props = feature.properties || {};
            const wardName = props.Ward_Name || props.Ward || props.ward || props.name || 'Ward';
            const wardNum = props.Ward_No || props.WardNumber || props.ward_number || props.Number || '';

            // Format label: if ward number available, prefix it
            const label = wardNum ? (String(wardNum).trim() + '. ' + wardName) : wardName;

            // POPUP with ward info (number before name)
            const popupText = '<div style="font-size:12px;"><strong>' + label + '</strong></div>';
            layer.bindPopup(popupText);

            // TOOLTIP shows same formatted label
            layer.bindTooltip(label, {
                permanent: false,
                direction: 'center',
                className: 'leaflet-tooltip'
            });
        }
    }).addTo(map);
    
    console.log('✅ Wards drawn successfully');
}

// UPDATE INFO PANEL
function updateInfo() {
    document.getElementById('wardTitle').textContent = currentBody;
    document.getElementById('wardInfo').textContent = currentDistrict + ' • ' + currentType;
}

// FIT MAP TO BOUNDS
function fitMapToWards() {
    if (!currentLayer) return;
    try {
        const bounds = currentLayer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [80, 80] });
            console.log('✅ Map fitted to wards');
        }
    } catch(e) {
        console.error('Fit error:', e);
    }
}

// MAP BUTTONS
function setupMapButtons() {
    const locateBtn = document.getElementById('locateBtn');
    const backBtn = document.getElementById('backBtn');
    
    if (locateBtn) {
        locateBtn.onclick = function(e) {
            e.preventDefault();
            findMyLocation();
        };
    }
    
    if (backBtn) {
        backBtn.onclick = function(e) {
            e.preventDefault();
            goBackToSelector();
        };
    }
}

// FIND LOCATION
function findMyLocation() {
    console.log('📍 Getting location...');
    
    if (!navigator.geolocation) {
        alert('Geolocation not supported in your browser');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = pos.coords.accuracy;
            
            userLocation = { lat, lng };
            console.log('✓ Location found:', lat, lng, 'Accuracy:', accuracy.toFixed(0) + 'm');
            
            // Center the map to user location (only adjust zoom if map zoom is low)
            const targetZoom = map.getZoom() < 14 ? 16 : map.getZoom();
            map.setView([lat, lng], targetZoom);

            // Remove previous marker/circle/zoom handler if present
            if (locationMarker) {
                try { map.removeLayer(locationMarker); } catch(e) {}
                locationMarker = null;
            }
            if (locationAccuracyCircle) {
                try { map.removeLayer(locationAccuracyCircle); } catch(e) {}
                locationAccuracyCircle = null;
            }
            if (locationZoomHandler && map) {
                map.off('zoomend', locationZoomHandler);
                locationZoomHandler = null;
            }

            // Helper to compute marker pixel radius from zoom
            const baseRadius = 12;
            function computeRadius(zoom) {
                // Scale radius proportionally but clamp
                const r = Math.round(baseRadius * (zoom / 16));
                return Math.max(6, Math.min(24, r));
            }

            // Create pulsing circle marker for location
            locationMarker = L.circleMarker([lat, lng], {
                radius: computeRadius(map.getZoom()),
                fillColor: '#0066ff',
                color: '#003399',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9,
                className: 'user-location-marker'
            }).addTo(map);

            // Ensure marker is above ward layers
            if (locationMarker.setZIndexOffset) locationMarker.setZIndexOffset(1000);

            // Add/update accuracy circle (in meters)
            locationAccuracyCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: '#0066ff',
                weight: 1,
                opacity: 0.25,
                fillColor: '#0066ff',
                fillOpacity: 0.08,
                dashArray: '4,4'
            }).addTo(map);

            // Bind popup with formatted values
            const popupContent = `
                <div style="font-size:12px;">
                    <strong>📍 Your Location</strong><br>
                    <small>Lat: ${lat.toFixed(6)}</small><br>
                    <small>Lng: ${lng.toFixed(6)}</small><br>
                    <small style="color:#666;">Accuracy: ±${Math.round(accuracy)}m</small>
                </div>
            `;
            locationMarker.bindPopup(popupContent).openPopup();

            // Update marker radius on zoom to keep it visually consistent
            locationZoomHandler = function() {
                try {
                    if (locationMarker && locationMarker.setRadius) {
                        locationMarker.setRadius(computeRadius(map.getZoom()));
                    }
                } catch(e) { console.warn('zoom handler error', e); }
            };
            map.on('zoomend', locationZoomHandler);

            // Ensure locate button reflects ready state (if present)
            const locateBtn = document.getElementById('locateBtn');
            if (locateBtn) {
                locateBtn.textContent = '📍 My Location';
                locateBtn.disabled = false;
                locateBtn.style.opacity = '1';
                locateBtn.style.cursor = 'pointer';
            }

            // Calculate distance to nearest ward boundary
            if (currentLayer) {
                calculateNearestWard(lat, lng);
            }
        },
        function(err) {
            console.error('Location error:', err);
            let errorMsg = 'Cannot access location.';
            if (err.code === 1) errorMsg = 'Location access denied. Check browser permissions.';
            if (err.code === 2) errorMsg = 'Location unavailable. Check your internet.';
            if (err.code === 3) errorMsg = 'Location request timed out.';
            alert('⚠️ ' + errorMsg);
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

// CALCULATE DISTANCE TO NEAREST WARD
function calculateNearestWard(userLat, userLng) {
    if (!currentLayer) return;
    
    let minDistance = Infinity;
    let nearestWard = null;
    
    currentLayer.eachLayer(function(layer) {
        if (layer.feature && layer.feature.geometry && layer.feature.geometry.coordinates) {
            // Get polygon bounds center or first coordinate
            let wardLat, wardLng;
            const coords = layer.feature.geometry.coordinates[0];
            if (Array.isArray(coords) && coords[0]) {
                wardLng = coords[0][0];
                wardLat = coords[0][1];
            }
            
            if (wardLat && wardLng) {
                const distance = calculateDistance(userLat, userLng, wardLat, wardLng);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestWard = {
                        name: layer.feature.properties?.Ward_Name || 'Unknown Ward',
                        distance: distance,
                        lat: wardLat,
                        lng: wardLng
                    };
                }
            }
        }
    });
    
    if (nearestWard) {
        const wardPanel = document.getElementById('wardInfoPanel');
        if (wardPanel) {
            const distStr = nearestWard.distance < 1 
                ? (nearestWard.distance * 1000).toFixed(0) + 'm away'
                : nearestWard.distance.toFixed(2) + 'km away';
            
            wardPanel.innerHTML = `
                <h3 style="margin:0 0 10px 0;">📍 Nearest Ward</h3>
                <p style="margin:0 0 5px 0;"><strong>${nearestWard.name}</strong></p>
                <p style="margin:0;color:#666;font-size:12px;">${distStr}</p>
            `;
        }
        console.log('📍 Nearest ward:', nearestWard.name, '-', distStr);
    }
}

// HAVERSINE DISTANCE FORMULA (in kilometers)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// GO BACK (Google Maps style - reset but keep both visible)
function goBackToSelector() {
    // In Google Maps style layout, both screens stay visible
    // Just reset the selectors so user can pick a new one
    const districtSelect = document.getElementById('districtSelect');
    const typeContainer = document.getElementById('typeButtonsContainer');
    const bodySelect = document.getElementById('bodySelect');
    const viewMapBtn = document.getElementById('viewMapBtn');
    
    districtSelect.value = '';
    bodySelect.value = '';
    bodySelect.disabled = true;
    typeContainer.innerHTML = '';
    viewMapBtn.disabled = true;
    
    // Clear current selections
    currentDistrict = null;
    currentType = null;
    currentBody = null;
    
    console.log('🔄 Reset selectors - ready for new selection');
}

// CONNECTION LISTENER
window.addEventListener('online', checkConnection);
window.addEventListener('offline', checkConnection);
