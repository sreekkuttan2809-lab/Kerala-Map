const fs = require('fs');

// Read and parse GeoJSON
const geojsonData = JSON.parse(fs.readFileSync('./public/data/KL_Wards.geojson', 'utf8'));

console.log('\n=== DATA EXTRACTION TEST ===\n');
console.log(`📦 Total features: ${geojsonData.features.length}`);

// Simulate the extraction logic from script.js
const tempMetadata = {};
const wardCounts = {};

geojsonData.features.forEach((feature) => {
    const props = feature.properties;
    const district = props.District;
    const lsgd = props.LSGD;
    const type = props.Lsgd_Type;

    if (!district || !lsgd || !type) {
        return;
    }

    // Normalize: title-case each word to handle inconsistent GeoJSON casing
    const normalizedType = type
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

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

// Convert Sets to arrays
const finalMetadata = {};
Object.keys(tempMetadata).forEach(district => {
    finalMetadata[district] = {};

    Object.keys(tempMetadata[district]).forEach(type => {
        const bodies = Array.from(tempMetadata[district][type]).sort();

        finalMetadata[district][type] = bodies.filter(body => {
            const key = `${district}|${type}|${body}`;
            const count = wardCounts[key] || 0;
            return count > 0;
        });

        if (finalMetadata[district][type].length === 0) {
            delete finalMetadata[district][type];
        }
    });

    if (Object.keys(finalMetadata[district]).length === 0) {
        delete finalMetadata[district];
    }
});

console.log(`\n✅ Final metadata districts: ${Object.keys(finalMetadata).length}`);

// Show first few districts and their data
const districts = Object.keys(finalMetadata).slice(0, 3);
districts.forEach(dist => {
    console.log(`\n📍 ${dist}:`);
    const types = Object.keys(finalMetadata[dist]);
    types.forEach(type => {
        console.log(`  └─ ${type}: ${finalMetadata[dist][type].length} bodies`);
        if (finalMetadata[dist][type].length > 0) {
            console.log(`     ├─ ${finalMetadata[dist][type].slice(0, 2).join(', ')}${finalMetadata[dist][type].length > 2 ? '...' : ''}`);
        }
    });
});

// Check specific issue - Grama Panchayat case
console.log('\n=== CASE SENSITIVITY CHECK ===');
Object.keys(finalMetadata).forEach(dist => {
    const types = Object.keys(finalMetadata[dist]);
    types.forEach(type => {
        if (type.includes('Grama') || type.includes('grama')) {
            console.log(`Found type: "${type}" in ${dist}`);
        }
    });
});

console.log('\n=== ALL TYPES FOUND ===');
const allTypes = new Set();
Object.keys(finalMetadata).forEach(dist => {
    Object.keys(finalMetadata[dist]).forEach(type => {
        allTypes.add(type);
    });
});
Array.from(allTypes).sort().forEach(type => {
    console.log(`  • ${type}`);
});
