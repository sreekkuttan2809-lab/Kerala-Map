// Save as: inspect_geojson.js
// Run with: node inspect_geojson.js

const fs = require('fs');

console.log('🔍 Analyzing GeoJSON structure...\n');

try {
    const data = JSON.parse(fs.readFileSync('public/data/KL_Wards.geojson', 'utf8'));
    
    console.log(`✅ File loaded successfully`);
    console.log(`Total features: ${data.features.length}\n`);
    
    // Show properties of first 5 features
    console.log('📋 Sample features and their properties:\n');
    
    for (let i = 0; i < Math.min(5, data.features.length); i++) {
        const feature = data.features[i];
        const props = feature.properties;
        
        console.log(`Feature ${i}:`);
        console.log(`  LocalBody: ${props.LocalBody}`);
        
        // List ALL property names
        console.log(`  Available properties:`);
        Object.keys(props).forEach(key => {
            const val = props[key];
            console.log(`    - ${key}: ${typeof val === 'string' ? val.substring(0, 50) : val}`);
        });
        console.log('');
    }
    
    // Find unique property names
    const allProps = new Set();
    data.features.forEach(f => {
        Object.keys(f.properties).forEach(p => allProps.add(p));
    });
    
    console.log('🔑 All unique property names in GeoJSON:');
    Array.from(allProps).sort().forEach(p => console.log(`  • ${p}`));
    
} catch (error) {
    console.error('❌ Error:', error.message);
}