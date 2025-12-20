const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'index.html');
const s = fs.readFileSync(file, 'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let last = null; while ((m = re.exec(s)) !== null) { last = m[1]; }
if (!last) { console.error('No inline script found'); process.exit(2); }
try {
  // Try to compile the script (without executing) to detect syntax errors
  new Function(last);
  console.log('Script parsed successfully');
} catch (err) {
  console.error('Parse error:', err && err.message);
  console.error(err.stack);
  // Try to find approximate line/column by counting newlines up to error position if possible
}
