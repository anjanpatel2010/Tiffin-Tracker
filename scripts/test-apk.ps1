# Android Emulator APK Installer & Runner
$ErrorActionPreference = "Stop"

$SdkPath = "C:\Users\anjan\AppData\Local\Android\Sdk"
$AdbPath = "$SdkPath\platform-tools\adb.exe"
if (-not (Test-Path $AdbPath)) {
    $AdbPath = (Get-Command adb -ErrorAction SilentlyContinue).Source
}

$EmulatorPath = "$SdkPath\emulator\emulator.exe"
$releaseApk = Get-ChildItem -Path (Join-Path $PSScriptRoot "..") -Filter "Tiffin-Tracker-v*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$ApkPath = if ($releaseApk) { $releaseApk.FullName } else { Join-Path $PSScriptRoot "..\Tiffin-Tracker-v5.7.3.apk" }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Tiffin Tracker Emulator Runner" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# 1. Check for running devices
$devices = & $AdbPath devices | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices" }

if (-not $devices) {
    Write-Host "[*] No active emulator detected. Checking configured AVDs..." -ForegroundColor Yellow
    $avds = & $EmulatorPath -list-avds
    if ($avds) {
        $firstAvd = ($avds | Select-Object -First 1).Trim()
        Write-Host "[+] Found AVD: $firstAvd. Booting emulator..." -ForegroundColor Green
        Start-Process -FilePath $EmulatorPath -ArgumentList "-avd `"$firstAvd`""
        
        Write-Host "[*] Waiting for emulator to connect to ADB..." -ForegroundColor Yellow
        & $AdbPath wait-for-device
        Write-Host "[+] Emulator connected!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[!] No Android Virtual Device (AVD) is created yet." -ForegroundColor Red
        Write-Host "Please create one using Android Studio Device Manager (see instructions in chat)." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To open Android Studio:" -ForegroundColor Cyan
        Write-Host "  npx cap open android" -ForegroundColor White
        Exit 1
    }
}

# 2. Install APK
Write-Host "[*] Installing $ApkPath..." -ForegroundColor Cyan
& $AdbPath install -r -d $ApkPath

# 3. Launch App
Write-Host "[*] Launching Tiffin Tracker on emulator..." -ForegroundColor Green
& $AdbPath shell am start -n com.tiffin.tracker/.MainActivity

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " [SUCCESS] Tiffin Tracker is running on emulator!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
