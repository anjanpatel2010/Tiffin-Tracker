const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.resolve(__dirname, '../docs/logo-candidates');
const artifactDir = path.resolve('C:/Users/anjan/.gemini/antigravity/brain/1ff563ab-b2f1-4a2d-9242-d37b3189767d');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ============================================================================
// CONCEPT 1: "The Sovereign 'T' Dabba" (Refined Bauhaus / Swiss Tech Monogram)
// Meaning:
// 1. The sweeping arch handle forms the top crossbar of 'T'.
// 2. The vertical spine forms the stem of 'T' - representing transparent tracking.
// 3. Three harmonious stadium tiers represent Breakfast, Lunch, and Dinner.
// 4. Center golden rivet represents the hearth and balanced finances.
// ============================================================================
const svg1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="50%" stop-color="#090D16"/>
      <stop offset="100%" stop-color="#030712"/>
    </linearGradient>

    <!-- Emerald-to-Cyan Tier Gradient -->
    <linearGradient id="tierGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>

    <!-- Handle Gradient -->
    <linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="50%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>

    <!-- Gold Accent Gradient -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="40%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <!-- Subtle Ambient Glow -->
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
  <!-- Top Tier: Morning / Breakfast -->
  <rect x="168" y="196" width="176" height="38" rx="19" fill="url(#tierGrad)"/>
  <!-- Top Tier Specular Edge -->
  <line x1="190" y1="202" x2="322" y2="202" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round"/>

  <!-- Middle Tier: Afternoon / Lunch (Core Meal) -->
  <rect x="146" y="250" width="220" height="42" rx="21" fill="url(#tierGrad)"/>
  <!-- Middle Tier Specular Edge -->
  <line x1="172" y1="256" x2="340" y2="256" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" stroke-linecap="round"/>

  <!-- Bottom Tier: Night / Dinner -->
  <rect x="124" y="308" width="264" height="46" rx="23" fill="url(#tierGrad)"/>
  <!-- Bottom Tier Specular Edge -->
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

// ============================================================================
// CONCEPT 2: "The Interlocking T-Ribbon" (Modern Dual-Entity Harmony)
// Meaning:
// 1. Two sleek geometric ribbons (Roommate 1 & Roommate 2) interlock in 3D space.
// 2. The negative space in the center sculpts the letter 'T'.
// 3. The 3 horizontal bands sculpt the 3-tier tiffin.
// 4. Represents zero-conflict expense splitting and effortless food sharing.
// ============================================================================
const svg2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A0E17"/>
      <stop offset="50%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>

    <!-- Warm Amber / Hearth Gradient (Roommate A) -->
    <linearGradient id="amberRibbon" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FBBF24"/>
      <stop offset="50%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#EA580C"/>
    </linearGradient>

    <!-- Electric Mint / Freshness Gradient (Roommate B) -->
    <linearGradient id="mintRibbon" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="50%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <!-- Central 'T' Glow -->
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#38BDF8" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect x="0" y="0" width="512" height="512" rx="114" fill="url(#bgGrad2)"/>
  <rect x="1" y="1" width="510" height="510" rx="113" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <circle cx="256" cy="265" r="180" fill="url(#coreGlow)"/>

  <!-- TOP HANDLE (Unified Arch) -->
  <path d="M 172 170 C 172 108, 340 108, 340 170" 
        fill="none" 
        stroke="#E2E8F0" 
        stroke-width="20" 
        stroke-linecap="round"/>

  <!-- LEFT WING (Mint - Roommate 1) -->
  <!-- Top Tier Left -->
  <rect x="156" y="200" width="84" height="38" rx="14" fill="url(#mintRibbon)"/>
  <!-- Middle Tier Left -->
  <rect x="134" y="254" width="106" height="42" rx="15" fill="url(#mintRibbon)"/>
  <!-- Bottom Tier Left -->
  <rect x="112" y="312" width="128" height="46" rx="16" fill="url(#mintRibbon)"/>

  <!-- RIGHT WING (Amber - Roommate 2) -->
  <!-- Top Tier Right -->
  <rect x="272" y="200" width="84" height="38" rx="14" fill="url(#amberRibbon)"/>
  <!-- Middle Tier Right -->
  <rect x="272" y="254" width="106" height="42" rx="15" fill="url(#amberRibbon)"/>
  <!-- Bottom Tier Right -->
  <rect x="272" y="312" width="128" height="46" rx="16" fill="url(#amberRibbon)"/>

  <!-- CENTRAL NEGATIVE SPACE BECOMES A VIBRANT STEM FORMING THE 'T' -->
  <rect x="246" y="155" width="20" height="232" rx="10" fill="#FFFFFF"/>

  <!-- CENTRAL EQUILIBRIUM PIVOT -->
  <circle cx="256" cy="275" r="18" fill="#0A0E17"/>
  <circle cx="256" cy="275" r="14" fill="#38BDF8"/>
  <circle cx="256" cy="275" r="6" fill="#FFFFFF"/>
</svg>`;

// ============================================================================
// CONCEPT 3: "The Geometric Bento Monogram" (High-Tech Precision / Stripe/Linear style)
// Meaning:
// 1. An ultra-minimalist, isometric/faceted emblem.
// 2. Pure geometry, zero clutter, instantly recognizable as an app icon.
// 3. High visual weight that looks stunning on dark AMOLED screens and OLED docks.
// ============================================================================
const svg3 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09090B"/>
      <stop offset="50%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#030712"/>
    </linearGradient>

    <!-- Vibrant Electric Gradient -->
    <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="40%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>

    <linearGradient id="goldHearth" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FBBF24"/>
      <stop offset="100%" stop-color="#EA580C"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="512" height="512" rx="114" fill="url(#bgGrad3)"/>
  <rect x="1" y="1" width="510" height="510" rx="113" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>

  <!-- ICONIC 'T' APEX HANDLE -->
  <path d="M 160 174 C 160 102, 352 102, 352 174" 
        fill="none" 
        stroke="url(#neonGradient)" 
        stroke-width="28" 
        stroke-linecap="round"/>

  <!-- THREE UNIFORM SLEEK HORIZONTAL MEAL BARS (Exact Swiss Grid) -->
  <rect x="140" y="208" width="232" height="40" rx="20" fill="url(#neonGradient)"/>
  <rect x="140" y="264" width="232" height="40" rx="20" fill="url(#neonGradient)"/>
  <rect x="140" y="320" width="232" height="40" rx="20" fill="url(#neonGradient)"/>

  <!-- CENTRAL VERTICAL AXIS (The 'T' Pillar & Balance Lock) -->
  <rect x="244" y="160" width="24" height="226" rx="12" fill="#FFFFFF"/>

  <!-- GLOWING GOLDEN RIVET (The Hearth / Tracker Core) -->
  <circle cx="256" cy="284" r="20" fill="#09090B"/>
  <circle cx="256" cy="284" r="14" fill="url(#goldHearth)"/>
  <circle cx="256" cy="284" r="5" fill="#FFFFFF"/>
</svg>`;

// ============================================================================
// CONCEPT 4: "The Minimalist Dabba Seal" (Apple / Circular Emblem Style)
// Meaning:
// 1. Inspired by traditional round Indian tiffins seen from top & side perspective.
// 2. An outer golden circular halo representing the 30-day billing cycle.
// 3. Pure, clean, uncluttered aesthetic.
// ============================================================================
const svg4 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B132B"/>
      <stop offset="50%" stop-color="#1C2541"/>
      <stop offset="100%" stop-color="#0B132B"/>
    </linearGradient>

    <linearGradient id="goldRing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FCD34D"/>
      <stop offset="50%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <linearGradient id="tierGrad4" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="512" height="512" rx="114" fill="url(#bgGrad4)"/>
  <rect x="1" y="1" width="510" height="510" rx="113" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- OUTER COMMUNICATIVE HALO (The 30-Day Cycle / Dining Thali) -->
  <circle cx="256" cy="256" r="186" 
          fill="none" 
          stroke="url(#goldRing)" 
          stroke-width="4" 
          stroke-dasharray="8 12" 
          opacity="0.5"/>

  <!-- TOP HANDLE ARCH -->
  <path d="M 184 172 C 184 116, 328 116, 328 172" 
        fill="none" 
        stroke="url(#tierGrad4)" 
        stroke-width="22" 
        stroke-linecap="round"/>

  <!-- THREE GRADUATED DABBATOP TIERS -->
  <rect x="172" y="198" width="168" height="36" rx="18" fill="url(#tierGrad4)"/>
  <rect x="150" y="250" width="212" height="40" rx="20" fill="url(#tierGrad4)"/>
  <rect x="128" y="306" width="256" height="44" rx="22" fill="url(#tierGrad4)"/>

  <!-- CENTRAL SPINE FORMING 'T' -->
  <rect x="246" y="156" width="20" height="224" rx="10" fill="#FFFFFF"/>

  <!-- GOLDEN CENTER EYELET -->
  <circle cx="256" cy="270" r="16" fill="url(#goldRing)"/>
  <circle cx="256" cy="270" r="7" fill="#0B132B"/>
  <circle cx="256" cy="270" r="3" fill="#FCD34D"/>
</svg>`;

async function run() {
  const concepts = [
    { name: 'concept-A-sovereign-t', svg: svg1 },
    { name: 'concept-B-harmony-ribbon', svg: svg2 },
    { name: 'concept-C-precision-tech', svg: svg3 },
    { name: 'concept-D-sacred-seal', svg: svg4 },
  ];

  for (const c of concepts) {
    const svgPath = path.join(outDir, `${c.name}.svg`);
    const pngPath = path.join(outDir, `${c.name}.png`);
    const artPngPath = path.join(artifactDir, `${c.name}.png`);

    fs.writeFileSync(svgPath, c.svg, 'utf8');
    await sharp(Buffer.from(c.svg))
      .resize(512, 512)
      .png({ quality: 100 })
      .toFile(pngPath);

    fs.copyFileSync(pngPath, artPngPath);
    console.log(`Rendered: ${c.name}.png`);
  }
}

run().catch(console.error);
