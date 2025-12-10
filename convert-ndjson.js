const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inputFile = path.join(__dirname, 'public', 'data', 'KL_Wards.geojson');
const outputFile = path.join(__dirname, 'public', 'data', 'KL_Wards_converted.geojson');

console.log('🔄 Converting NDJSON to GeoJSON FeatureCollection...');
console.log('Input:', inputFile);
console.log('Output:', outputFile);

const writeStream = fs.createWriteStream(outputFile);
let lineCount = 0;
let firstLine = true;

writeStream.write('{"type":"FeatureCollection","features":[');

const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity
});

rl.on('line', (line) => {
    if (line.trim()) {
        try {
            const feature = JSON.parse(line);
            
            if (!firstLine) {
                writeStream.write(',');
            }
            writeStream.write(JSON.stringify(feature));
            firstLine = false;
            lineCount++;
            
            if (lineCount % 10000 === 0) {
                console.log(`  Processed ${lineCount} features...`);
            }
        } catch (e) {
            console.error(`Error parsing line ${lineCount + 1}:`, e.message);
        }
    }
});

rl.on('close', () => {
    console.log(`✅ Parsed ${lineCount} features`);
    console.log('💾 Writing to file...');
    
    writeStream.write(']}');
    writeStream.end();
    
    writeStream.on('finish', () => {
        const stats = fs.statSync(outputFile);
        console.log(`✅ Conversion complete!`);
        console.log(`   Features: ${lineCount}`);
        console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    });
});

rl.on('error', (err) => {
    console.error('Error reading file:', err);
});

writeStream.on('error', (err) => {
    console.error('Error writing file:', err);
});
