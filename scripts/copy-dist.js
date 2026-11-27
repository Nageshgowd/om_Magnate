// Copies the Angular build to ./public, the folder Vercel serves as static output.
const fs = require('fs');
const src = 'frontend/dist/frontend';
fs.rmSync('public', { recursive: true, force: true });
fs.cpSync(src, 'public', { recursive: true });
console.log('Copied', src, '-> public');
