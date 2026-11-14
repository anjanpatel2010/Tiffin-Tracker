const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.resolve(__dirname, '../docs/logo-candidates');

// --------------------------------------------------------------------------
// CONCEPT 7: "The Cylindrical Precision Dabba" (2.5D Modern Luxury)
// Tactile, premium, recognizable:
// - 3 stacked cylindrical stainless tiers with glowing emerald/cyan seams
// - Sleek top domed lid with brushed chrome finish
// - Arch carrier handle and authentic brass locking clasps
// --------------------------------------------------------------------------
const svg7 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="c7_bg" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="60%" stop-color="#080d1a" />
      <stop offset="100%" stop-color="#020408" />
    </radialGradient>
    <linearGradient id="c7_border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(0, 245, 160, 0.45)" />
      <stop offset="50%" stop-color="rgba(0, 212, 255, 0.2)" />
      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.05)" />
    </linearGradient>

    <!-- Chrome / Steel Gradient -->
    <linearGradient id="c7_steel" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#334155" />
      <stop offset="25%" stop-color="#64748b" />
      <stop offset="50%" stop-color="#f8fafc" />
      <stop offset="75%" stop-color="#94a3b8" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>

    <!-- Emerald Glow Seam -->
    <linearGradient id="c7_emerald" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00d26a" />
      <stop offset="50%" stop-color="#00f5a0" />
      <stop offset="100%" stop-color="#00d4ff" />
    </linearGradient>

    <!-- Cyan Glow Base -->
    <linearGradient id="c7_cyan" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="50%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#00f5a0" />
    </linearGradient>

    <!-- Brass / Gold Hardware -->
    <linearGradient id="c7_gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>

    <radialGradient id="c7_glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00f5a0" stop-opacity="0.2" />
      <stop offset="65%" stop-color="#00d4ff" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <filter id="c7_shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000000" flood-opacity="0.85" />
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#00f5a0" flood-opacity="0.2" />
    </filter>
  </defs>

  <rect width="512" height="512" rx="128" fill="url(#c7_bg)" />
  <rect x="2" y="2" width="508" height="508" rx="126" fill="none" stroke="url(#c7_border)" stroke-width="2" />

  <circle cx="256" cy="270" r="170" fill="url(#c7_glow)" />

  <g filter="url(#c7_shadow)">
    <!-- Top Carrier Handle (Forms the top of 'T') -->
    <path d="M 186 142 C 186 80, 326 80, 326 142" fill="none" stroke="url(#c7_steel)" stroke-width="18" stroke-linecap="round" />
    <!-- Handle Brackets -->
    <circle cx="186" cy="142" r="9" fill="url(#c7_gold)" />
    <circle cx="326" cy="142" r="9" fill="url(#c7_gold)" />

    <!-- TIER 1 (Top Container - Breakfast / Chai) -->
    <!-- Cylinder Body -->
    <path d="M 166 182 L 166 210 C 166 226, 346 226, 346 210 L 346 182 Z" fill="url(#c7_emerald)" />
    <!-- Cylinder Top Lid (Ellipse) -->
    <ellipse cx="256" cy="182" rx="90" ry="24" fill="url(#c7_steel)" />
    <ellipse cx="256" cy="182" rx="86" ry="21" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.4" />

    <!-- TIER 2 (Middle Container - Lunch / Main Mess) -->
    <!-- Cylinder Body -->
    <path d="M 152 244 L 152 278 C 152 296, 360 296, 360 278 L 360 244 Z" fill="url(#c7_emerald)" />
    <!-- Cylinder Top Rim (Ellipse) -->
    <ellipse cx="256" cy="244" rx="104" ry="26" fill="url(#c7_steel)" />
    <ellipse cx="256" cy="244" rx="100" ry="23" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.4" />

    <!-- TIER 3 (Bottom Container - Dinner Feast) -->
    <!-- Cylinder Body -->
    <path d="M 138 312 L 138 350 C 138 372, 374 372, 374 350 L 374 312 Z" fill="url(#c7_cyan)" />
    <!-- Cylinder Top Rim (Ellipse) -->
    <ellipse cx="256" cy="312" rx="118" ry="28" fill="url(#c7_steel)" />
    <ellipse cx="256" cy="312" rx="114" ry="25" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.35" />

    <!-- Vertical Brass Locking Clasp on Left & Right -->
    <path d="M 132 200 L 132 340" stroke="url(#c7_gold)" stroke-width="8" stroke-linecap="round" />
    <circle cx="132" cy="200" r="6" fill="url(#c7_gold)" />
    <circle cx="132" cy="340" r="6" fill="url(#c7_gold)" />

    <path d="M 380 200 L 380 340" stroke="url(#c7_gold)" stroke-width="8" stroke-linecap="round" />
    <circle cx="380" cy="200" r="6" fill="url(#c7_gold)" />
    <circle cx="380" cy="340" r="6" fill="url(#c7_gold)" />

    <!-- Center Latch Spine (Forms the vertical stem of T) -->
    <path d="M 256 126 L 256 368" stroke="url(#c7_gold)" stroke-width="12" stroke-linecap="round" />
    <!-- Center Jewel Rivet -->
    <circle cx="256" cy="268" r="10" fill="#fef08a" />
    <circle cx="256" cy="268" r="5" fill="#080d1a" />
  </g>
</svg>`;

// --------------------------------------------------------------------------
// CONCEPT 8: "The Sacred Thali & Tri-Tier Monogram" (Pure Iconic Minimalism)
// Meaning:
// - A circular golden Thali plate symbolizing flatmate community & 30-day monthly cycle
// - Three perfectly weighted floating horizontal beams forming an iconic Dabba stack
// - Integrated negative-space 'T' monogram and clean upward tracker notch
// - Flawlessly recognizable even at 16x16 favicon size
// --------------------------------------------------------------------------
const svg8 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="c8_bg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#0b1320" />
      <stop offset="60%" stop-color="#060a12" />
      <stop offset="100%" stop-color="#020306" />
    </radialGradient>
    <linearGradient id="c8_border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(0, 245, 160, 0.5)" />
      <stop offset="50%" stop-color="rgba(245, 158, 11, 0.3)" />
      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.05)" />
    </linearGradient>

    <!-- Luminous Emerald-to-Cyan Gradient -->
    <linearGradient id="c8_primary" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f5a0" />
      <stop offset="50%" stop-color="#00d4ff" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>

    <linearGradient id="c8_gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>

    <filter id="c8_shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000000" flood-opacity="0.8" />
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#00f5a0" flood-opacity="0.25" />
    </filter>
  </defs>

  <rect width="512" height="512" rx="128" fill="url(#c8_bg)" />
  <rect x="2" y="2" width="508" height="508" rx="126" fill="none" stroke="url(#c8_border)" stroke-width="2" />

  <!-- Outer Sacred Thali (Communal Plate Circle) -->
  <circle cx="256" cy="256" r="184" fill="none" stroke="rgba(255, 255, 255, 0.06)" stroke-width="12" />
  <circle cx="256" cy="256" r="184" fill="none" stroke="url(#c8_primary)" stroke-width="3" opacity="0.4" stroke-dasharray="12 12" />

  <g filter="url(#c8_shadow)">
    <!-- Top Carrier Arch (Apex of T) -->
    <path d="M 184 148 C 184 86, 328 86, 328 148" fill="none" stroke="url(#c8_primary)" stroke-width="20" stroke-linecap="round" />

    <!-- Tier 1 (Breakfast / Starter Pill) -->
    <rect x="166" y="168" width="180" height="42" rx="21" fill="url(#c8_primary)" />

    <!-- Tier 2 (Lunch / Main Meal Pill) -->
    <rect x="144" y="228" width="224" height="48" rx="24" fill="url(#c8_primary)" />

    <!-- Tier 3 (Dinner / Feast Pill) -->
    <rect x="124" y="294" width="264" height="54" rx="27" fill="url(#c8_primary)" />

    <!-- Vertical Central Spine (Pure Platinum White Pillar of T) -->
    <rect x="246" y="126" width="20" height="240" rx="10" fill="#ffffff" />

    <!-- Central Golden Core Compass (Tracking & Ledger Balance) -->
    <circle cx="256" cy="252" r="16" fill="url(#c8_gold)" />
    <circle cx="256" cy="252" r="11" fill="#0b1320" />
    <circle cx="256" cy="252" r="6" fill="#00f5a0" />
  </g>
</svg>`;

async function buildMoreConcepts() {
  fs.writeFileSync(path.join(outDir, 'concept7-cylindrical-dabba.svg'), svg7, 'utf8');
  fs.writeFileSync(path.join(outDir, 'concept8-sacred-thali.svg'), svg8, 'utf8');

  await sharp(Buffer.from(svg7)).png().toFile(path.join(outDir, 'concept7-cylindrical-dabba.png'));
  await sharp(Buffer.from(svg8)).png().toFile(path.join(outDir, 'concept8-sacred-thali.png'));

  console.log('✓ Successfully rendered Concepts 7 & 8 to docs/logo-candidates');
}

buildMoreConcepts().catch(err => console.error(err));
