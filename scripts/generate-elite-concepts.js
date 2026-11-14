const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.resolve(__dirname, '../docs/logo-candidates');
const artifactDir = path.resolve('C:/Users/anjan/.gemini/antigravity/brain/1ff563ab-b2f1-4a2d-9242-d37b3189767d');

// ============================================================================
// CONCEPT E: "The Origami 'T' Fold" (Hyper-minimalist Silicon Valley Monogram)
// Meaning:
// A single, continuous ribbon folded into 3 layers (Breakfast, Lunch, Dinner),
// while simultaneously rendering an unmistakable modern capital 'T'.
// ============================================================================
const svgE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradE" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B0F19"/>
      <stop offset="50%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#030712"/>
    </linearGradient>

    <linearGradient id="topBarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>

    <linearGradient id="stemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <linearGradient id="goldHearthE" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FCD34D"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="114" fill="url(#bgGradE)"/>
  <rect x="1" y="1" width="510" height="510" rx="113" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- Top Crossbar of 'T' (Smooth Stadium with 3 Integrated Meal Dots) -->
  <rect x="116" y="148" width="280" height="56" rx="28" fill="url(#topBarGrad)"/>
  
  <!-- 3 Integrated Inset Markers inside the Crossbar (Breakfast, Lunch, Dinner) -->
  <circle cx="168" cy="176" r="10" fill="rgba(255,255,255,0.85)"/>
  <circle cx="256" cy="176" r="10" fill="#FCD34D"/>
  <circle cx="344" cy="176" r="10" fill="rgba(255,255,255,0.85)"/>

  <!-- Stem of 'T' - 3 Segmented Tiffin Blocks floating downward -->
  <!-- Middle Tier -->
  <rect x="226" y="224" width="60" height="52" rx="18" fill="url(#topBarGrad)"/>
  <!-- Lower Tier -->
  <rect x="216" y="296" width="80" height="52" rx="18" fill="url(#topBarGrad)"/>
  <!-- Base Anchor Tier -->
  <rect x="200" y="368" width="112" height="52" rx="20" fill="url(#topBarGrad)"/>

  <!-- Connecting Central Spine Line -->
  <line x1="256" y1="204" x2="256" y2="394" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
</svg>`;

// ============================================================================
// CONCEPT F: "The Hearth Bowl Monogram" (Warm, Inviting, Minimalist)
// Meaning:
// A modern dining bowl at the base with 3 rising steam loops that interweave
// to create the letter 'T' - representing warm home meals, warmth, and fellowship.
// ============================================================================
const svgF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradF" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>

    <linearGradient id="hearthGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="50%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="114" fill="url(#bgGradF)"/>
  <rect x="1" y="1" width="510" height="510" rx="113" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- TOP CROSSBAR of 'T' (Handle) -->
  <path d="M 140 160 C 140 160, 256 120, 372 160" fill="none" stroke="url(#hearthGrad)" stroke-width="24" stroke-linecap="round"/>

  <!-- THREE TIER TILES (Breakfast, Lunch, Dinner) -->
  <rect x="176" y="200" width="160" height="40" rx="20" fill="url(#hearthGrad)"/>
  <rect x="152" y="256" width="208" height="42" rx="21" fill="url(#hearthGrad)"/>
  <rect x="128" y="314" width="256" height="46" rx="23" fill="url(#hearthGrad)"/>

  <!-- THE VERTICAL 'T' SPUR -->
  <rect x="246" y="140" width="20" height="240" rx="10" fill="#FFFFFF"/>
  <circle cx="256" cy="277" r="14" fill="#F59E0B"/>
  <circle cx="256" cy="277" r="6" fill="#FFFFFF"/>
</svg>`;

async function run() {
  const extra = [
    { name: 'concept-E-origami-t', svg: svgE },
    { name: 'concept-F-hearth-bowl', svg: svgF }
  ];
  for (const c of extra) {
    const pngPath = path.join(outDir, `${c.name}.png`);
    const artPath = path.join(artifactDir, `${c.name}.png`);
    await sharp(Buffer.from(c.svg)).resize(512, 512).png().toFile(pngPath);
    fs.copyFileSync(pngPath, artPath);
    console.log(`Rendered: ${c.name}.png`);
  }
}
run();
