@echo off
setlocal enabledelayedexpansion
title Tiffin Tracker - 1-Click Emulator Launcher and Installer

echo ======================================================================
echo          TIFFIN TRACKER - 1-CLICK EMULATOR RUNNER
echo ======================================================================
echo.

:: 1. Define Paths
set "SDK_DIR=%LOCALAPPDATA%\Android\Sdk"
set "ADB=%SDK_DIR%\platform-tools\adb.exe"
set "EMULATOR=%SDK_DIR%\emulator\emulator.exe"
set "PROJECT_DIR=%~dp0"
set "APK=%PROJECT_DIR%Tiffin-Tracker-v5.2.1-release.apk"

if not exist "%APK%" (
    set "APK=%PROJECT_DIR%Tiffin-Tracker-v5.2.1.apk"
)

if not exist "%ADB%" (
    echo [ERROR] ADB not found at %ADB%
    pause
    exit /b 1
)

if not exist "%APK%" (
    echo [ERROR] APK file not found at %APK%
    echo Please make sure the APK is built.
    pause
    exit /b 1
)

:: 2. Check if a device/emulator is already online
echo [*] Checking connected Android devices...
for /f "tokens=1,2" %%A in ('"%ADB%" devices') do (
    if "%%B"=="device" (
        set "ACTIVE_DEVICE=%%A"
        echo [+] Found active online device: %%A
        goto :DeviceReady
    )
)

:: 3. Check for offline / stuck emulators
echo [*] Checking for offline or stuck emulators...
for /f "tokens=1,2" %%A in ('"%ADB%" devices') do (
    if "%%B"=="offline" (
        echo [!] Detected offline emulator %%A. Resetting ADB connection...
        "%ADB%" reconnect offline >nul 2>&1
        ping 127.0.0.1 -n 3 >nul
    )
)

:: Re-check after reconnect
for /f "tokens=1,2" %%A in ('"%ADB%" devices') do (
    if "%%B"=="device" (
        set "ACTIVE_DEVICE=%%A"
        echo [+] Device reconnected: %%A
        goto :DeviceReady
    )
)

:: 4. If no device, launch the emulator
echo [*] Launching Android Emulator...
if not exist "%EMULATOR%" (
    echo [ERROR] Emulator executable not found at %EMULATOR%
    pause
    exit /b 1
)

set "AVD_NAME="
for /f "delims=" %%V in ('"%EMULATOR%" -list-avds') do (
    if not defined AVD_NAME set "AVD_NAME=%%V"
)

if not defined AVD_NAME (
    set "AVD_NAME=Pixel_10"
)

echo [*] Starting AVD: !AVD_NAME! (with clean cold-boot)...
start "" "%EMULATOR%" -avd !AVD_NAME! -no-snapshot-load

echo [*] Waiting for emulator to connect to ADB...
"%ADB%" wait-for-device

:DeviceReady
echo [+] Device connected!
echo [*] Waiting for Android system to finish booting (this may take a few moments)...

:WaitBoot
ping 127.0.0.1 -n 3 >nul
for /f "delims=" %%I in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set "BOOT=%%I"
if not "!BOOT!"=="1" (
    goto :WaitBoot
)

echo [+] Android system is fully booted and ready!
echo.
echo [*] Installing Tiffin Tracker APK (%APK%)...
"%ADB%" install -r -d "%APK%"
if errorlevel 1 (
    echo.
    echo [!] Standard install returned an error. Retrying with direct push...
    "%ADB%" push "%APK%" /data/local/tmp/app.apk >nul
    "%ADB%" shell pm install -r -d /data/local/tmp/app.apk
)

echo.
echo [*] Launching Tiffin Tracker on your emulator screen...
"%ADB%" shell am start -n com.tiffin.tracker/.MainActivity >nul

echo.
echo ======================================================================
echo    SUCCESS! Tiffin Tracker is now installed and running!
echo ======================================================================
echo.
echo Press any key to close this window...
pause >nul
exit /b 0
