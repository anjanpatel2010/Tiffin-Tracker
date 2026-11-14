const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.resolve(__dirname, '../docs/logo-candidates');

// --------------------------------------------------------------------------
// CONCEPT 4: "The Modernist Dabba Monogram" (Apple / Linear Grade Minimalism)
// Pure, balanced geometry:
// - Precision top arch handle forming the horizontal crossbar of 'T'
// - Three harmonious stadium vessels with subtle inner sheen & glass depth
// - Center vertical platinum locking pillar that grounds the 'T'
// - Subtle golden thali cradle at the bottom
// --------------------------------------------------------------------------
const svg4 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background: Deep Midnight Obsidian with soft radial gradient -->
    <radialGradient id="c4_bg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#0e1726" />
      <stop offset="55%" stop-color="#080d16" />
      <stop offset="100%" stop-color="#030508" />
    </radialGradient>
    
    <!-- Outer Rim Subtle Border -->
    <linearGradient id="c4_border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(0, 245, 160, 0.5)" />
      <stop offset="40%" stop-color="rgba(0, 212, 255, 0.25)" />
      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.05)" />
    </linearGradient>

    <!-- Core Brand Gradients -->
    <linearGradient id="c4_handleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f5a0" />
      <stop offset="50%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#00d4ff" />
    </linearGradient>

    <linearGradient id="c4_tier1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00d26a" />
      <stop offset="100%" stop-color="#00f5a0" />
    </linearGradient>

    <linearGradient id="c4_tier2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f5a0" />
      <stop offset="100%" stop-color="#00d4ff" />
    </linearGradient>

    <linearGradient id="c4_tier3" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00d4ff" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <linearGradient id="c4_gold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>

    <radialGradient id="c4_aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00f5a0" stop-opacity="0.16" />
      <stop offset="60%" stop-color="#00d4ff" stop-opacity="0.04" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- Ambient Shadow -->
    <filter id="c4_dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.75" />
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#00f5a0" flood-opacity="0.2" />
    </filter>
  </defs>

  <!-- App Squircle Base -->
  <rect width="512" height="512" rx="128" fill="url(#c4_bg)" />
  <rect x="2" y="2" width="508" height="508" rx="126" fill="none" stroke="url(#c4_border)" stroke-width="2" />

  <!-- Soft Ambient Glow -->
  <circle cx="256" cy="270" r="165" fill="url(#c4_aura)" />

  <g filter="url(#c4_dropShadow)">
    <!-- 1. The Crown Handle (The Top Bar of "T") -->
    <!-- Architectural arch handle with weighted apex -->
    <path d="M 184 156 C 184 96, 328 96, 328 156" fill="none" stroke="url(#c4_handleGrad)" stroke-width="18" stroke-linecap="round" />
    <!-- Handle Hinges -->
    <circle cx="184" cy="156" r="9" fill="#00f5a0" />
    <circle cx="328" cy="156" r="9" fill="#00d4ff" />

    <!-- 2. The Three Dabba Tiers (Breakfast, Lunch, Dinner & Flatmates) -->
    <!-- Tier 1 (Top / Breakfast) -->
    <rect x="166" y="172" width="180" height="38" rx="19" fill="url(#c4_tier1)" />
    <!-- Specular highlight line -->
    <line x1="184" y1="181" x2="328" y2="181" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.45" />

    <!-- Tier 2 (Middle / Lunch - Widened with rhythmic proportions) -->
    <rect x="146" y="226" width="220" height="44" rx="22" fill="url(#c4_tier2)" />
    <line x1="168" y1="236" x2="344" y2="236" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.4" />

    <!-- Tier 3 (Base / Dinner & Mess Foundation) -->
    <rect x="130" y="286" width="252" height="50" rx="25" fill="url(#c4_tier3)" />
    <line x1="154" y1="298" x2="358" y2="298" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.35" />

    <!-- 3. The Vertical Locking Spine (The Stem of "T") -->
    <!-- Clean, centered pillar locking all tiers together (Zero-Dispute Trust) -->
    <rect x="246" y="136" width="20" height="226" rx="10" fill="#ffffff" />
    
    <!-- Golden Core Pivot Eyelet at top of spine -->
    <circle cx="256" cy="144" r="14" fill="url(#c4_gold)" />
    <circle cx="256" cy="144" r="6" fill="#080d16" />

    <!-- Golden Lock Bolt in center -->
    <circle cx="256" cy="248" r="9" fill="url(#c4_gold)" />
    <circle cx="256" cy="248" r="4" fill="#080d16" />

    <!-- Golden Terminal Rivet at bottom -->
    <circle cx="256" cy="350" r="7" fill="url(#c4_gold)" />

    <!-- 4. The Shared Thali Cradle (Communal Dining Circle at Base) -->
    <path d="M 160 366 C 218 398, 294 398, 352 366" fill="none" stroke="url(#c4_gold)" stroke-width="5" stroke-linecap="round" opacity="0.8" />
  </g>
</svg>`;

// --------------------------------------------------------------------------
// CONCEPT 5: "The Continuous Line Dabba" (Linear / Pure Monoline Symbol)
// A single continuous golden-ratio path that sketches:
// - An arched handle that sweeps down into 3 nested stadium loops
// - Ultra-sophisticated, pure vector minimalism
// --------------------------------------------------------------------------
const svg5 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="c5_bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#0a141e" />
      <stop offset="100%" stop-color="#030508" />
    </radialGradient>
    <linearGradient id="c5_stroke" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f5a0" />
      <stop offset="50%" stop-color="#00d4ff" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="c5_border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(0, 245, 160, 0.4)" />
      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.05)" />
    </linearGradient>
    <filter id="c5_glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#00f5a0" flood-opacity="0.35" />
    </filter>
  </defs>

  <rect width="512" height="512" rx="128" fill="url(#c5_bg)" />
  <rect x="2" y="2" width="508" height="508" rx="126" fill="none" stroke="url(#c5_border)" stroke-width="2" />

  <g filter="url(#c5_glow)">
    <!-- Top Carrier Arch -->
    <path d="M 176 148 C 176 80, 336 80, 336 148" fill="none" stroke="url(#c5_stroke)" stroke-width="16" stroke-linecap="round" />

    <!-- Tier 1 Stadium Contour -->
    <rect x="162" y="168" width="188" height="42" rx="21" fill="none" stroke="url(#c5_stroke)" stroke-width="14" />
    <!-- Tier 2 Stadium Contour -->
    <rect x="142" y="228" width="228" height="48" rx="24" fill="none" stroke="url(#c5_stroke)" stroke-width="14" />
    <!-- Tier 3 Stadium Contour -->
    <rect x="124" y="294" width="264" height="54" rx="27" fill="none" stroke="url(#c5_stroke)" stroke-width="14" />

    <!-- Central Vertical Stem of T (Solid Luminous Pillar) -->
    <rect x="247" y="132" width="18" height="236" rx="9" fill="#ffffff" />
    
    <!-- Central Pivot Dot -->
    <circle cx="256" cy="252" r="10" fill="#f59e0b" />
    <circle cx="256" cy="252" r="4" fill="#0a141e" />
  </g>
</svg>`;

// --------------------------------------------------------------------------
// CONCEPT 6: "The Iconic Dabba Shield" (Modern Emblem / App Icon Benchmark)
// - Bold, high-contrast, recognizable at 16px and on Android Home Screen
// - Three solid tiers with subtle dark glassmorphic separation
// - Integrated 'T' monogram in negative space + vibrant gold latch
// --------------------------------------------------------------------------
const svg6 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="c6_bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1320" />
      <stop offset="100%" stop-color="#020408" />
    </linearGradient>
    <linearGradient id="c6_border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(0, 245, 160, 0.45)" />
      <stop offset="100%" stop-color="rgba(0, 212, 255, 0.1)" />
    </linearGradient>
    <linearGradient id="c6_emerald" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f5a0" />
      <stop offset="100%" stop-color="#00b86b" />
    </linearGradient>
    <linearGradient id="c6_cyan" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="c6_handle" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>
    <linearGradient id="c6_gold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="50%" stop-color="#eab308" />
      <stop offset="100%" stop-color="#a16207" />
    </linearGradient>
    <filter id="c6_glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.8" />
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#00f5a0" flood-opacity="0.25" />
    </filter>
  </defs>

  <rect width="512" height="512" rx="128" fill="url(#c6_bg)" />
  <rect x="2" y="2" width="508" height="508" rx="126" fill="none" stroke="url(#c6_border)" stroke-width="2" />

  <!-- Ambient Backdrop Glow -->
  <circle cx="256" cy="270" r="160" fill="#00f5a0" opacity="0.08" filter="blur(40px)" />

  <g filter="url(#c6_glow)">
    <!-- Top Carrier Handle (Forming the T-Crossbar) -->
    <path d="M 190 144 C 190 84, 322 84, 322 144" fill="none" stroke="url(#c6_handle)" stroke-width="20" stroke-linecap="round" />

    <!-- Dabba Body: Monolithic Unified 3-Tier Silhouette -->
    <!-- Tier 1 -->
    <rect x="160" y="160" width="192" height="54" rx="20" fill="url(#c6_emerald)" />
    <!-- Tier 2 -->
    <rect x="144" y="224" width="224" height="58" rx="20" fill="url(#c6_emerald)" />
    <!-- Tier 3 -->
    <rect x="128" y="292" width="256" height="64" rx="22" fill="url(#c6_cyan)" />

    <!-- Left & Right Tension Clips (Authentic Indian Dabba Clasps) -->
    <rect x="116" y="200" width="10" height="110" rx="5" fill="url(#c6_handle)" />
    <circle cx="121" cy="200" r="6" fill="url(#c6_handle)" />
    <rect x="386" y="200" width="10" height="110" rx="5" fill="url(#c6_handle)" />
    <circle cx="391" cy="200" r="6" fill="url(#c6_handle)" />

    <!-- Central Golden Locking Bar ('T' Central Spine) -->
    <rect x="245" y="120" width="22" height="252" rx="11" fill="url(#c6_gold)" />
    <circle cx="256" cy="120" r="14" fill="url(#c6_gold)" />
    <circle cx="256" cy="120" r="6" fill="#0b1320" />
    <circle cx="256" cy="253" r="8" fill="#fef08a" />
  </g>
</svg>`;

async function buildRefinedConcepts() {
  fs.writeFileSync(path.join(outDir, 'concept4-modernist-monogram.svg'), svg4, 'utf8');
  fs.writeFileSync(path.join(outDir, 'concept5-monoline.svg'), svg5, 'utf8');
  fs.writeFileSync(path.join(outDir, 'concept6-iconic-shield.svg'), svg6, 'utf8');

  await sharp(Buffer.from(svg4)).png().toFile(path.join(outDir, 'concept4-modernist-monogram.png'));
  await sharp(Buffer.from(svg5)).png().toFile(path.join(outDir, 'concept5-monoline.png'));
  await sharp(Buffer.from(svg6)).png().toFile(path.join(outDir, 'concept6-iconic-shield.png'));

  console.log('✓ Successfully rendered Concepts 4, 5, 6 to docs/logo-candidates');
}

buildRefinedConcepts().catch(err => console.error(err));
