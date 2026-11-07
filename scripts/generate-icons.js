const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgSource = path.resolve(__dirname, '../www/icon.svg');
const resDir = path.resolve(__dirname, '../android/app/src/main/res');

const sizes = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 }
];

async function generate() {
  for (const s of sizes) {
    const targetDir = path.join(resDir, s.folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Standard square launcher
    await sharp(svgSource)
      .resize(s.size, s.size)
      .png()
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    // Round launcher
    await sharp(svgSource)
      .resize(s.size, s.size)
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));

    // Foreground for adaptive icons
    await sharp(svgSource)
      .resize(s.size, s.size)
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));

    console.log(`Generated ${s.folder} (${s.size}x${s.size})`);
  }

  console.log('All Android launcher icons generated successfully!');
}

generate().catch(console.error);
