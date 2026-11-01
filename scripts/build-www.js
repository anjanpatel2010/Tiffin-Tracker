const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.join(rootDir, 'www');

if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

const filesToCopy = [
  'index.html',
  'styles.css',
  'app.js',
  'qr.js',
  'updater.js',
  'native-bridge.js',
  'icon.svg',
  'icon.png',
  'icon-192.png',
  'manifest.json',
  'version.json'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(wwwDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> www/`);
  } else {
    console.warn(`Warning: ${file} not found!`);
  }
});

console.log('WWW build directory successfully populated.');
