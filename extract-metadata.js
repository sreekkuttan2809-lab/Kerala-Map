const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'data', 'KL_Wards.geojson');

console.log('📖 Reading GeoJSON file...');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log(`Total features: ${data.features.length}`);

// Extract unique combinations WITH WARD COUNTS
const metadata = {};
const emptyBodies = [];

data.features.forEach((feature) => {
    const props = feature.properties;
    const district = props.District;
    const lsgd = props.LSGD;
    const type = props.Lsgd_Type;
    
    if (!district || !lsgd || !type) {
        return;
    }
    
    if (!metadata[district]) {
        metadata[district] = {};
    }
    
    if (!metadata[district][type]) {
        metadata[district][type] = {};
    }
    
    if (!metadata[district][type][lsgd]) {
        metadata[district][type][lsgd] = 0;
    }
    
    metadata[district][type][lsgd]++;
});

// Convert to array format, filtering out empty entries
const finalMetadata = {};

Object.keys(metadata).forEach(district => {
    finalMetadata[district] = {};
    
    Object.keys(metadata[district]).forEach(type => {
        finalMetadata[district][type] = [];
        
        Object.keys(metadata[district][type]).forEach(lsgd => {
            const count = metadata[district][type][lsgd];
            if (count > 0) {
                finalMetadata[district][type].push(lsgd);
            } else {
                emptyBodies.push(`${district} > ${type} > ${lsgd}`);
            }
        });
        
        finalMetadata[district][type].sort();
    });
});

console.log('\n📋 Generated metadata:');
console.log(JSON.stringify(finalMetadata, null, 2));

if (emptyBodies.length > 0) {
    console.log('\n⚠️ Empty local bodies (no wards):');
    emptyBodies.forEach(body => console.log('  - ' + body));
}

// Save to file
const outputPath = path.join(__dirname, 'wardMetadata.json');
fs.writeFileSync(outputPath, JSON.stringify(finalMetadata, null, 2));
console.log(`\n✅ Saved to: ${outputPath}`);
