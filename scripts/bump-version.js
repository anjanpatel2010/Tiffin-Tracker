const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const targetVersion = process.argv[2];

if (!targetVersion) {
  console.error('Usage: node scripts/bump-version.js <new-version> (e.g. 5.3.9)');
  process.exit(1);
}

const semverMatch = targetVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!semverMatch) {
  console.error('Invalid version format. Expected X.Y.Z, got:', targetVersion);
  process.exit(1);
}

const major = parseInt(semverMatch[1], 10);
const minor = parseInt(semverMatch[2], 10);
const patch = parseInt(semverMatch[3], 10);
const versionCode = major * 10000 + minor * 100 + patch;
const apkFilename = `Tiffin-Tracker-v${targetVersion}.apk`;

console.log(`Bumping Tiffin Tracker to v${targetVersion} (versionCode: ${versionCode})...`);

// 1. package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prevVersion = pkg.version;
pkg.version = targetVersion;
if (pkg.scripts && pkg.scripts['build:apk']) {
  pkg.scripts['build:apk'] = pkg.scripts['build:apk'].replace(/Tiffin-Tracker-v[\d\.]+(-release)?\.apk/g, apkFilename);
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`✓ Updated package.json`);

// 2. version.json & www/version.json
const updateVersionJson = (filePath) => {
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.version = targetVersion;
    data.versionCode = versionCode;
    data.releaseDate = new Date().toISOString().split('T')[0];
    data.apkFilename = apkFilename;
    data.downloadUrl = `https://github.com/anjanpatel2010/Tiffin-Tracker/raw/master/${apkFilename}`;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✓ Updated ${path.relative(rootDir, filePath)}`);
  }
};
updateVersionJson(path.join(rootDir, 'version.json'));
updateVersionJson(path.join(rootDir, 'www', 'version.json'));

// 3. android/app/build.gradle
const gradlePath = path.join(rootDir, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${targetVersion}"`);
  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log(`✓ Updated android/app/build.gradle`);
}

// 4. MainActivity.java
const mainActivityPath = path.join(rootDir, 'android/app/src/main/java/com/tiffin/tracker/MainActivity.java');
if (fs.existsSync(mainActivityPath)) {
  let mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
  mainActivity = mainActivity.replace(/crashlytics\.setCustomKey\("app_version",\s*"[^"]+"\)/, `crashlytics.setCustomKey("app_version", "${targetVersion}")`);
  fs.writeFileSync(mainActivityPath, mainActivity, 'utf8');
  console.log(`✓ Updated MainActivity.java`);
}

// 5. www/app.js
const appJsPath = path.join(rootDir, 'www/app.js');
if (fs.existsSync(appJsPath)) {
  let appJs = fs.readFileSync(appJsPath, 'utf8');
  appJs = appJs.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${targetVersion}';`);
  appJs = appJs.replace(/const apkUrl = 'https:\/\/github\.com\/anjanpatel2010\/Tiffin-Tracker\/raw\/master\/[^']+';/, `const apkUrl = 'https://github.com/anjanpatel2010/Tiffin-Tracker/raw/master/${apkFilename}';`);
  fs.writeFileSync(appJsPath, appJs, 'utf8');
  console.log(`✓ Updated www/app.js`);
}

// 6. www/updater.js
const updaterPath = path.join(rootDir, 'www/updater.js');
if (fs.existsSync(updaterPath)) {
  let updater = fs.readFileSync(updaterPath, 'utf8');
  updater = updater.replace(/const CURRENT_VERSION = '[^']+';/, `const CURRENT_VERSION = '${targetVersion}';`);
  fs.writeFileSync(updaterPath, updater, 'utf8');
  console.log(`✓ Updated www/updater.js`);
}

// 7. www/index.html
const indexHtmlPath = path.join(rootDir, 'www/index.html');
if (fs.existsSync(indexHtmlPath)) {
  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  indexHtml = indexHtml.replace(/styles\.css\?v=[\d\.]+/g, `styles.css?v=${targetVersion}`);
  indexHtml = indexHtml.replace(/<span id="updateVersionTag"[^>]*>v[\d\.]+<\/span>/, `<span id="updateVersionTag" class="morphe-chip-latest">v${targetVersion}</span>`);
  indexHtml = indexHtml.replace(/\.js\?v=[\d\.]+/g, `.js?v=${targetVersion}`);
  fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
  console.log(`✓ Updated www/index.html`);
}

// 8. www/sw.js
const swPath = path.join(rootDir, 'www/sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/const CACHE_NAME = 'tiffin-tracker-v[\d\.]+';/, `const CACHE_NAME = 'tiffin-tracker-v${targetVersion}';`);
  sw = sw.replace(/\?v=[\d\.]+/g, `?v=${targetVersion}`);
  fs.writeFileSync(swPath, sw, 'utf8');
  console.log(`✓ Updated www/sw.js`);
}

// 9. scripts/test-apk.ps1
const testApkPath = path.join(rootDir, 'scripts/test-apk.ps1');
if (fs.existsSync(testApkPath)) {
  let testApk = fs.readFileSync(testApkPath, 'utf8');
  testApk = testApk.replace(/Tiffin-Tracker-v[\d\.]+(-release)?\.apk/g, apkFilename);
  fs.writeFileSync(testApkPath, testApk, 'utf8');
  console.log(`✓ Updated scripts/test-apk.ps1`);
}

console.log(`🎉 Version bump to v${targetVersion} complete!`);
