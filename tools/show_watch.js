const fs = require('fs');
const path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const regex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let last = null; while ((m = regex.exec(s)) !== null) last = m[1];
if (!last) { console.error('no inline script'); process.exit(2); }
const idx = last.indexOf('watchPosition(');
if (idx === -1) { console.log('watchPosition not found'); process.exit(0); }
const start = Math.max(0, idx-120);
const end = Math.min(last.length, idx+600);
const part = last.slice(start,end);
console.log('---watch snippet---');
console.log(part);
console.log('---end snippet---');
// print char codes for detailed inspection
console.log('---char codes---');
for(let i=0;i<part.length;i++){
	const code=part.charCodeAt(i);
	if(i<300) process.stdout.write((code<100? ' ': '') + code + (i%40===39 ? '\n' : ' '));
}
console.log('\n---done codes---');
