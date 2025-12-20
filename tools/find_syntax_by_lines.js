const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const s = fs.readFileSync(file, 'utf8');
const regex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let last = null; while ((m = regex.exec(s)) !== null) { last = m[1]; }
if (!last) { console.error('No inline script found'); process.exit(2); }
const lines = last.split('\n');
function tryCompile(code) { try { new Function(code); return true; } catch (e) { return false; } }
let lo = 1, hi = lines.length, badLine = -1;
while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  const part = lines.slice(0, mid).join('\n');
  if (tryCompile(part)) { lo = mid + 1; } else { badLine = mid; hi = mid - 1; }
}
console.log('Approx first failing line in script (1-based):', badLine);
if (badLine !== -1) {
  const start = Math.max(0, badLine - 5);
  const end = Math.min(lines.length, badLine + 5);
  console.log('--- context lines ---');
  for (let i = start; i < end; i++) {
    console.log((i+1)+':', lines[i]);
  }
}
