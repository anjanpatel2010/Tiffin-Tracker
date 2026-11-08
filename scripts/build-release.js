/**
 * Tiffin Tracker - Fail-Safe Release Automation Pipeline
 * 
 * Enforces automatic semantic version increments on every build.
 * Updates Gradle, Java, JSON manifests, and Web assets in a single transaction.
 * 
 * Usage:
 *   node scripts/build-release.js          (Auto-detects bump type: minor or patch)
 *   node scripts/build-release.js patch    (e.g. 5.3.8 -> 5.3.9)
 *   node scripts/build-release.js minor    (e.g. 5.3.8 -> 5.4.0)
 *   node scripts/build-release.js major    (e.g. 5.3.8 -> 6.0.0)
 *   node scripts/build-release.js 5.4.0    (Explicit target version)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

// 1. Read Current Version
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  console.error(`[Error] Invalid current semver in package.json: ${currentVersion}`);
  process.exit(1);
}

let [_, major, minor, patch] = match.map(Number);

// 2. Determine Bump Type & New Version
const arg = (process.argv[2] || '').trim().toLowerCase();
let targetVersion = '';

if (arg === 'major') {
  targetVersion = `${major + 1}.0.0`;
} else if (arg === 'minor') {
  targetVersion = `${major}.${minor + 1}.0`;
} else if (arg === 'patch') {
  targetVersion = `${major}.${minor}.${patch + 1}`;
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  targetVersion = arg;
} else {
  // Automatic bump: inspect git log to decide minor vs patch
  let gitLogs = '';
  try {
    gitLogs = execSync('git log -n 5 --oneline', { cwd: rootDir, encoding: 'utf8' });
  } catch (e) {}

  const isFeature = /feat|feature|redesign|refactor|backend|fcm/i.test(gitLogs);
  if (isFeature) {
    targetVersion = `${major}.${minor + 1}.0`;
    console.log(`[Auto-Version] Detected feature/refactor commits. Selecting MINOR bump.`);
  } else {
    targetVersion = `${major}.${minor}.${patch + 1}`;
    console.log(`[Auto-Version] Selecting PATCH bump.`);
  }
}

// FAIL-SAFE: Enforce strictly increasing version
const parseSemver = (v) => v.split('.').map(Number);
const [curMaj, curMin, curPat] = parseSemver(currentVersion);
const [tgtMaj, tgtMin, tgtPat] = parseSemver(targetVersion);

const isNewer =
  tgtMaj > curMaj ||
  (tgtMaj === curMaj && tgtMin > curMin) ||
  (tgtMaj === curMaj && tgtMin === curMin && tgtPat > curPat);

if (!isNewer) {
  console.error(`\n❌ [FAIL-SAFE BLOCKED] Cannot build version v${targetVersion} because it is not newer than current v${currentVersion}!`);
  console.error(`Every build must increment the version so update popups trigger properly.\n`);
  process.exit(1);
}

const versionCode = tgtMaj * 10000 + tgtMin * 100 + tgtPat;
const apkFilename = `Tiffin-Tracker-v${targetVersion}.apk`;
const releaseDate = new Date().toISOString().split('T')[0];

console.log('======================================================================');
console.log(`  🚀 TIFFIN TRACKER RELEASE PIPELINE: v${currentVersion} ➔ v${targetVersion}`);
console.log(`  VersionCode: ${versionCode} | Target APK: ${apkFilename}`);
console.log('======================================================================\n');

// 3. Step: Syntax Checks
console.log('[1/7] Running pre-build syntax checks...');
execSync('node -c www/app.js && node -c www/sw.js && node -c www/updater.js && node -c functions/index.js', {
  cwd: rootDir,
  stdio: 'inherit'
});
console.log('  ✓ JavaScript syntax valid.');

// 4. Step: Update Manifests & Source Files
console.log('[2/7] Updating version strings across project...');

// A. package.json
pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// B. version.json & www/version.json
const updateVersionManifest = (filePath) => {
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Archive previous version to history
    if (!data.history) data.history = [];
    if (data.version && data.version !== targetVersion) {
      data.history.unshift({
        version: data.version,
        versionCode: data.versionCode,
        releaseDate: data.releaseDate || releaseDate,
        releaseNotes: data.releaseNotes || []
      });
      // Keep last 10 releases in manifest
      if (data.history.length > 10) data.history = data.history.slice(0, 10);
    }

    data.version = targetVersion;
    data.versionCode = versionCode;
    data.releaseDate = releaseDate;
    data.apkFilename = apkFilename;
    data.downloadUrl = `https://github.com/anjanpatel2010/Tiffin-Tracker/raw/master/${apkFilename}`;
    data.githubReleaseUrl = 'https://github.com/anjanpatel2010/Tiffin-Tracker/releases';
    data.message = `Tiffin Tracker v${targetVersion} is now available!`;
    data.releaseNotes = [
      `Admin Approval Option: Require approval before new members join flat`,
      `Instant Admin Popup Alert: 1-Tap Approve/Decline notification banner with audio chime`,
      `Live Waiting Screen: Real-time admission for new roommates once approved`,
      `Secure Firebase Cloud Messaging & Firestore two-way real-time synchronization`
    ];

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
};
updateVersionManifest(path.join(rootDir, 'version.json'));
updateVersionManifest(path.join(rootDir, 'www', 'version.json'));

// C. android/app/build.gradle
const gradlePath = path.join(rootDir, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${targetVersion}"`);
  fs.writeFileSync(gradlePath, gradle, 'utf8');
}

// D. MainActivity.java
const mainActivityPath = path.join(rootDir, 'android/app/src/main/java/com/tiffin/tracker/MainActivity.java');
if (fs.existsSync(mainActivityPath)) {
  let mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
  mainActivity = mainActivity.replace(/crashlytics\.setCustomKey\("app_version",\s*"[^"]+"\)/, `crashlytics.setCustomKey("app_version", "${targetVersion}")`);
  fs.writeFileSync(mainActivityPath, mainActivity, 'utf8');
}

// E. www/app.js
const appJsPath = path.join(rootDir, 'www/app.js');
if (fs.existsSync(appJsPath)) {
  let appJs = fs.readFileSync(appJsPath, 'utf8');
  appJs = appJs.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${targetVersion}';`);
  appJs = appJs.replace(/const apkUrl = 'https:\/\/github\.com\/anjanpatel2010\/Tiffin-Tracker\/raw\/master\/[^']+';/, `const apkUrl = 'https://github.com/anjanpatel2010/Tiffin-Tracker/raw/master/${apkFilename}';`);
  fs.writeFileSync(appJsPath, appJs, 'utf8');
}

// F. www/updater.js
const updaterPath = path.join(rootDir, 'www/updater.js');
if (fs.existsSync(updaterPath)) {
  let updater = fs.readFileSync(updaterPath, 'utf8');
  updater = updater.replace(/const CURRENT_VERSION = '[^']+';/, `const CURRENT_VERSION = '${targetVersion}';`);
  fs.writeFileSync(updaterPath, updater, 'utf8');
}

// G. www/index.html
const indexHtmlPath = path.join(rootDir, 'www/index.html');
if (fs.existsSync(indexHtmlPath)) {
  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  indexHtml = indexHtml.replace(/styles\.css\?v=[\d\.]+/g, `styles.css?v=${targetVersion}`);
  indexHtml = indexHtml.replace(/<span id="updateVersionTag"[^>]*>v[\d\.]+<\/span>/, `<span id="updateVersionTag" class="morphe-chip-latest">v${targetVersion}</span>`);
  indexHtml = indexHtml.replace(/\.js\?v=[\d\.]+/g, `.js?v=${targetVersion}`);
  fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
}

// H. www/sw.js
const swPath = path.join(rootDir, 'www/sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/const CACHE_NAME = 'tiffin-tracker-v[\d\.]+';/, `const CACHE_NAME = 'tiffin-tracker-v${targetVersion}';`);
  sw = sw.replace(/\?v=[\d\.]+/g, `?v=${targetVersion}`);
  fs.writeFileSync(swPath, sw, 'utf8');
}

// I. scripts/test-apk.ps1 & run-on-emulator.bat
const testApkPath = path.join(rootDir, 'scripts/test-apk.ps1');
if (fs.existsSync(testApkPath)) {
  let testApk = fs.readFileSync(testApkPath, 'utf8');
  testApk = testApk.replace(/Tiffin-Tracker-v[\d\.]+\.apk/g, apkFilename);
  fs.writeFileSync(testApkPath, testApk, 'utf8');
}
console.log('  ✓ Updated all 11 version references.');

// 5. Step: Sync Capacitor Web Assets
console.log('[3/7] Syncing web assets to Android via Capacitor...');
execSync('npx cap sync android', { cwd: rootDir, stdio: 'inherit' });
console.log('  ✓ Capacitor Android sync complete.');

// 6. Step: Purge Old Standalone APKs from Root
console.log('[4/7] Cleaning old APK files from root directory...');
const rootFiles = fs.readdirSync(rootDir);
rootFiles.forEach(file => {
  if (/^Tiffin-Tracker-v.*\.apk$/i.test(file)) {
    fs.unlinkSync(path.join(rootDir, file));
    console.log(`  - Removed previous APK: ${file}`);
  }
});

// 7. Step: Compile Native Android Release APK
console.log('[5/7] Compiling Android Release APK via Gradle...');
const androidDir = path.join(rootDir, 'android');
const gradlewCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
execSync(`${gradlewCmd} assembleRelease`, { cwd: androidDir, stdio: 'inherit' });
console.log('  ✓ Gradle build successful.');

// 8. Step: Copy and Verify Output APK
console.log('[6/7] Staging new standalone APK...');
const builtApkPath = path.join(androidDir, 'app/build/outputs/apk/release/app-release.apk');
const targetApkPath = path.join(rootDir, apkFilename);

if (!fs.existsSync(builtApkPath)) {
  console.error(`[Error] Built APK not found at ${builtApkPath}`);
  process.exit(1);
}

fs.copyFileSync(builtApkPath, targetApkPath);
const stats = fs.statSync(targetApkPath);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

if (stats.size < 1000000) {
  console.error(`[Error] Built APK is suspiciously small (${stats.size} bytes). Build may be corrupted.`);
  process.exit(1);
}
console.log(`  ✓ Successfully created ${apkFilename} (${sizeMb} MB)`);

// 9. Step: Summary
console.log('\n======================================================================');
console.log(`  🎉 RELEASE BUILD SUCCESSFUL: v${targetVersion} (Code ${versionCode})`);
console.log(`  📦 Standalone APK: ${targetApkPath}`);
console.log(`  📄 Manifest: ${path.join(rootDir, 'version.json')}`);
console.log(`  📝 Changelog: ${path.join(rootDir, 'docs/CHANGELOG.md')}`);
console.log('======================================================================\n');
