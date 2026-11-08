# Changelog — Tiffin Tracker

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [5.7.0] — 2026-11-08

### Added
- **Admin Approval Option**: Added room-level toggle option in Settings ➜ Room & Members (`Require Admin Approval`) and in flat creation. When enabled, new users require admin confirmation before joining the flat.
- **Admin In-App Popup Notification**: Floating interactive alert banner that pops up on the Admin's screen when any new user knocks, with dual-tone chime, haptic feedback, and 1-tap Approve & Decline actions.
- **Real-Time Waiting Screen**: Joining users view a live waiting screen with animated admission status and auto-entrance once approved by the Admin.
- **Push Notification Integration**: Join requests dispatch high-priority notifications to the Admin's device via Firebase Cloud Functions and Cloud Messaging.

---

## [5.6.0] — 2026-11-07

### Added
- **Real-Time Member Auto-Sync**: Connected Firestore snapshot listener directly to app state and UI, automatically syncing new flatmates across all devices instantly without manual refresh.

---

## [5.4.0] — 2026-11-07

### Added
- **Secure Backend Push Pipeline**: Added Firebase Cloud Functions (`functions/index.js`) and Firestore notification queue (`rooms/{roomCode}/notifications`) allowing flatmate devices to receive real-time FCM pushes without exposing Google Cloud private keys in the client APK.
- **Standalone Server Dispatcher**: Added `scripts/send-fcm-server.js` for testing and running standalone background push listeners without deploying Cloud Functions.
- **Fail-Safe Build Pipeline**: Added `scripts/build-release.js` which automatically enforces version increments (major / minor / patch) on every release build, updating Gradle, Java, JSON, and web assets in a single step.
- **Update Notification Routing**: Tapping any update alert from the notification bar or lockscreen now immediately opens the in-app update card.

### Changed
- **Human-Crafted UI Design System**: Completely eradicated all 10 common AI design tropes:
  - Removed four-point sparkle icons (`✨` / `✦`).
  - Removed multi-color iridescent mesh aura backgrounds (`violet` + `cyan` + `mint`).
  - Replaced radioactive glowing button halos with crisp, tactile elevation shadows.
  - Removed rotating conic fluid voice orbs and pulsing splash rings, replacing them with clean geometric badge icons.
  - Removed AI emoji spam (`⚡`, `🚀`, `🎉`) from all primary action buttons.
  - Adopted a clean, grounded Emerald (`#10b981`) and Deep Slate (`#06090e`) aesthetic.

---

## [5.3.8] — 2026-11-07

### Added
- **Clean Standalone APK**: Removed `-release` suffix; compiled output is strictly named `Tiffin-Tracker-v<version>.apk`.
- **Folder Organization**: Grouped all documentation and screenshots under `docs/`, web assets under `www/`, and utility scripts under `scripts/`.

### Removed
- **Decommissioned Vercel Files**: Deleted `vercel.json`, `_headers`, `.env.example`, and obsolete `api/` serverless functions.
- **Developer Debug Clutter**: Removed developer test buttons and token display from settings.

---

## [5.3.7] — 2026-11-07

### Added
- **Firebase SDK Integration**: Added Firebase Crashlytics for runtime crash reporting, Firebase Performance Monitoring for latency tracking, and Firebase Remote Config for remote feature toggling.
- **Direct APK Sharing**: Flat invites now include direct download links to the GitHub APK release alongside the 4-digit room code.
- **Smart Auto-Fill**: Auto-detects and auto-fills 4-digit room codes from clipboard and URL share links.

---

## [5.3.6] — 2026-11-02

### Added
- **4-Digit Room Codes**: Simplified room IDs to short 4-digit codes for quick flat joining.
- **Real-Time Member Join Sync**: Roommates are immediately notified when a new flatmate joins.
- **Device Profile Locking**: Prevents accidental profile overwrites once joined into a room.

---

## [5.3.5] — 2026-11-01

### Fixed
- **Intro Screen Freeze**: Resolved splash screen looping issues on cold start.
- **Date & Meal Controls**: Restored date navigation controls and daily meal logging.
