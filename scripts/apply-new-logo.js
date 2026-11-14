const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 1. Concept A Full SVG
const svgFull = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="50%" stop-color="#090D16"/>
      <stop offset="100%" stop-color="#030712"/>
    </linearGradient>

    <linearGradient id="tierGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>

    <linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="50%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>

    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="40%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <radialGradient id="ambGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- App Icon Squircle Background -->
  <rect x="0" y="0" width="512" height="512" rx="114" fill="url(#bgGrad1)"/>
  <rect x="1" y="1" width="510" height="510" rx="113" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- Soft Ambient Glow behind tiers -->
  <circle cx="256" cy="270" r="170" fill="url(#ambGlow)"/>

  <!-- TOP HANDLE (Arch forming top of 'T') -->
  <path d="M 180 168 C 180 114, 332 114, 332 168" 
        fill="none" 
        stroke="url(#handleGrad)" 
        stroke-width="22" 
        stroke-linecap="round"/>

  <!-- THREE TIERS (Breakfast, Lunch, Dinner) -->
  <rect x="168" y="196" width="176" height="38" rx="19" fill="url(#tierGrad)"/>
  <line x1="190" y1="202" x2="322" y2="202" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round"/>

  <rect x="146" y="250" width="220" height="42" rx="21" fill="url(#tierGrad)"/>
  <line x1="172" y1="256" x2="340" y2="256" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" stroke-linecap="round"/>

  <rect x="124" y="308" width="264" height="46" rx="23" fill="url(#tierGrad)"/>
  <line x1="154" y1="314" x2="358" y2="314" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round"/>

  <!-- CENTRAL PLATINUM LOCKING SPINE (Stem of 'T') -->
  <rect x="246" y="152" width="20" height="230" rx="10" fill="#FFFFFF"/>
  <rect x="246" y="152" width="20" height="230" rx="10" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1.5"/>

  <!-- GOLDEN BALANCE RIVET (Center of Gravity / Financial Transparency) -->
  <circle cx="256" cy="271" r="16" fill="url(#goldGrad)"/>
  <circle cx="256" cy="271" r="7" fill="#090D16"/>
  <circle cx="256" cy="271" r="3" fill="#FDE68A"/>

  <!-- Sleek Base Cradle Arc (Thali / Communal Plate) -->
  <path d="M 160 382 C 200 404, 312 404, 352 382" 
        fill="none" 
        stroke="url(#goldGrad)" 
        stroke-width="5" 
        stroke-linecap="round"
        opacity="0.85"/>
</svg>`;

// 2. Adaptive Foreground SVG (Transparent background, centered in safe zone)
const svgForeground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="tierGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>

    <linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="50%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>

    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="40%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <radialGradient id="ambGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Centered in 512x512 safe zone -->
  <g transform="translate(0, 0)">
    <!-- Soft Ambient Glow -->
    <circle cx="256" cy="270" r="170" fill="url(#ambGlow)"/>

    <!-- TOP HANDLE -->
    <path d="M 180 168 C 180 114, 332 114, 332 168" 
          fill="none" 
          stroke="url(#handleGrad)" 
          stroke-width="22" 
          stroke-linecap="round"/>

    <!-- THREE TIERS -->
    <rect x="168" y="196" width="176" height="38" rx="19" fill="url(#tierGrad)"/>
    <line x1="190" y1="202" x2="322" y2="202" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round"/>

    <rect x="146" y="250" width="220" height="42" rx="21" fill="url(#tierGrad)"/>
    <line x1="172" y1="256" x2="340" y2="256" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" stroke-linecap="round"/>

    <rect x="124" y="308" width="264" height="46" rx="23" fill="url(#tierGrad)"/>
    <line x1="154" y1="314" x2="358" y2="314" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round"/>

    <!-- CENTRAL PLATINUM LOCKING SPINE -->
    <rect x="246" y="152" width="20" height="230" rx="10" fill="#FFFFFF"/>
    <rect x="246" y="152" width="20" height="230" rx="10" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1.5"/>

    <!-- GOLDEN BALANCE RIVET -->
    <circle cx="256" cy="271" r="16" fill="url(#goldGrad)"/>
    <circle cx="256" cy="271" r="7" fill="#090D16"/>
    <circle cx="256" cy="271" r="3" fill="#FDE68A"/>

    <!-- Base Cradle Arc -->
    <path d="M 160 382 C 200 404, 312 404, 352 382" 
          fill="none" 
          stroke="url(#goldGrad)" 
          stroke-width="5" 
          stroke-linecap="round"
          opacity="0.85"/>
  </g>
</svg>`;

// Circular Mask for ic_launcher_round
const circleMaskSvg = (size) => Buffer.from(`
<svg width="${size}" height="${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#000" />
</svg>
`);

async function generateAll() {
  console.log('--- Step 1: Updating Web Assets ---');
  fs.writeFileSync(path.resolve('www/icon.svg'), svgFull, 'utf8');
  await sharp(Buffer.from(svgFull)).resize(512, 512).png().toFile('www/icon.png');
  await sharp(Buffer.from(svgFull)).resize(192, 192).png().toFile('www/icon-192.png');
  console.log('✓ www/icon.svg, www/icon.png, www/icon-192.png updated.');

  console.log('--- Step 2: Updating Android Launcher Background Color ---');
  const bgXmlPath = 'android/app/src/main/res/values/ic_launcher_background.xml';
  fs.writeFileSync(bgXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#090D16</color>
</resources>
`, 'utf8');
  console.log('✓ ic_launcher_background set to #090D16');

  console.log('--- Step 3: Generating Android Launcher Mipmaps ---');
  const densities = [
    { dir: 'mipmap-mdpi', iconSize: 48, fgSize: 108 },
    { dir: 'mipmap-hdpi', iconSize: 72, fgSize: 162 },
    { dir: 'mipmap-xhdpi', iconSize: 96, fgSize: 216 },
    { dir: 'mipmap-xxhdpi', iconSize: 144, fgSize: 324 },
    { dir: 'mipmap-xxxhdpi', iconSize: 192, fgSize: 432 },
  ];

  for (const d of densities) {
    const dirPath = path.resolve('android/app/src/main/res', d.dir);

    // 1. ic_launcher.png (Squircle standard)
    await sharp(Buffer.from(svgFull))
      .resize(d.iconSize, d.iconSize)
      .png()
      .toFile(path.join(dirPath, 'ic_launcher.png'));

    // 2. ic_launcher_round.png (Circular masked)
    const baseCircle = await sharp(Buffer.from(svgFull))
      .resize(d.iconSize, d.iconSize)
      .composite([{
        input: circleMaskSvg(d.iconSize),
        blend: 'dest-in'
      }])
      .png()
      .toFile(path.join(dirPath, 'ic_launcher_round.png'));

    // 3. ic_launcher_foreground.png (Adaptive icon foreground with safe zone)
    await sharp(Buffer.from(svgForeground))
      .resize(d.fgSize, d.fgSize)
      .png()
      .toFile(path.join(dirPath, 'ic_launcher_foreground.png'));

    console.log(`✓ Generated ${d.dir} icons.`);
  }

  console.log('--- Step 4: Generating Splash Screens ---');
  const splashTargets = [
    { path: 'android/app/src/main/res/drawable/splash.png', w: 480, h: 320 },
    { path: 'android/app/src/main/res/drawable-land-hdpi/splash.png', w: 800, h: 480 },
    { path: 'android/app/src/main/res/drawable-land-mdpi/splash.png', w: 480, h: 320 },
    { path: 'android/app/src/main/res/drawable-land-xhdpi/splash.png', w: 1280, h: 720 },
    { path: 'android/app/src/main/res/drawable-land-xxhdpi/splash.png', w: 1600, h: 960 },
    { path: 'android/app/src/main/res/drawable-land-xxxhdpi/splash.png', w: 1920, h: 1280 },
    { path: 'android/app/src/main/res/drawable-port-hdpi/splash.png', w: 480, h: 800 },
    { path: 'android/app/src/main/res/drawable-port-mdpi/splash.png', w: 320, h: 480 },
    { path: 'android/app/src/main/res/drawable-port-xhdpi/splash.png', w: 720, h: 1280 },
    { path: 'android/app/src/main/res/drawable-port-xxhdpi/splash.png', w: 960, h: 1600 },
    { path: 'android/app/src/main/res/drawable-port-xxxhdpi/splash.png', w: 1280, h: 1920 },
  ];

  for (const s of splashTargets) {
    const isPort = s.h >= s.w;
    const logoScale = isPort ? Math.round(s.w * 0.42) : Math.round(s.h * 0.42);

    const logoBuf = await sharp(Buffer.from(svgFull))
      .resize(logoScale, logoScale)
      .png()
      .toBuffer();

    const splashSvg = Buffer.from(`
      <svg width="${s.w}" height="${s.h}">
        <defs>
          <linearGradient id="spBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0F172A"/>
            <stop offset="50%" stop-color="#090D16"/>
            <stop offset="100%" stop-color="#030712"/>
          </linearGradient>
        </defs>
        <rect width="${s.w}" height="${s.h}" fill="url(#spBg)"/>
      </svg>
    `);

    const left = Math.round((s.w - logoScale) / 2);
    const top = Math.round((s.h - logoScale) / 2);

    await sharp(splashSvg)
      .composite([{ input: logoBuf, top, left }])
      .png()
      .toFile(s.path);

    console.log(`✓ Rendered splash: ${s.path} (${s.w}x${s.h})`);
  }

  console.log('\nAll native and web assets generated successfully!');
}

generateAll().catch(console.error);
