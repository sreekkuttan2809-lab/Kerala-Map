const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const s = fs.readFileSync(file, 'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let last = null; while ((m = re.exec(s)) !== null) { last = m[1]; }
if (!last) { console.error('No inline script found'); process.exit(2); }
const src = last;
function tryCompile(code) {
  try { new Function(code); return true; } catch (e) { return false; }
}
let lo = 0, hi = src.length;
let good = 0;
while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  const part = src.slice(0, mid);
  if (tryCompile(part)) { good = mid; lo = mid + 1; } else { hi = mid - 1; }
}
console.log('Last good index:', good);
// Show a window around the failure point
const contextStart = Math.max(0, good - 200);
const contextEnd = Math.min(src.length, good + 200);
const context = src.slice(contextStart, contextEnd);
console.log('--- context ---');
console.log(context);
// Also print line/column by counting newlines up to good
const upto = src.slice(0, good);
const lines = upto.split('\n');
console.log('Approx line number (in script):', lines.length, 'column:', lines[lines.length-1].length+1);
