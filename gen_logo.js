const fs = require('fs');
const b2 = fs.readFileSync('src/2.png').toString('base64');
const b1 = fs.readFileSync('src/1.png').toString('base64');
const out = [
  '// Auto-generated logo data — do not edit manually',
  `export const LOGO_BLUE = 'data:image/png;base64,${b2}';`,
  `export const LOGO_WHITE = 'data:image/png;base64,${b1}';`,
  '',
].join('\n');
fs.writeFileSync('src/logo.ts', out, 'utf8');
console.log('Written', out.length, 'chars to src/logo.ts');
