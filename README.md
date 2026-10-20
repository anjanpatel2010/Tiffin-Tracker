# 🍱 Tiffin Tracker

> **A shared mess & tiffin expense tracker built for roommates and flat groups.**

[![Live App](https://img.shields.io/badge/Live_App-tiffintracker--xi.vercel.app-emerald?style=for-the-badge&logo=vercel)](https://tiffintracker-xi.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-purple.svg)](manifest.json)
[![Pure Vanilla JS](https://img.shields.io/badge/Stack-Vanilla_JS_%2B_CSS-yellow.svg)](#technology-stack)

---

## 🌐 Live Web App

👉 **[https://tiffintracker-xi.vercel.app](https://tiffintracker-xi.vercel.app)**

---

## 📱 Installing on Mobile as an App (PWA)

Tiffin Tracker is a Progressive Web App (PWA). It runs offline, opens in standalone full-screen mode, and does not require an app store download.

### 🤖 Android (Google Chrome)
1. Open **[https://tiffintracker-xi.vercel.app](https://tiffintracker-xi.vercel.app)** in Chrome.
2. Tap the three dots (**⋮**) in the top-right corner.
3. Tap **Install app** (or **Add to Home screen**).
4. Tap **Install**. The Tiffin Tracker icon will appear on your phone's home screen and app drawer.

### 🍎 iOS / iPhone (Safari)
1. Open **[https://tiffintracker-xi.vercel.app](https://tiffintracker-xi.vercel.app)** in Safari.
2. Tap the **Share** button (box with an upward arrow at the bottom).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top-right corner. It will launch full-screen like a native iOS app.

---

## 📌 The Problem

Living in a shared flat, PG, or hostel with daily tiffin delivery always creates month-end confusion:
- *“Did you eat dinner on the 12th when you stayed late at the office?”*
- *“Who had the tiffin when a roommate was out of town?”*
- *“What is our total owed to the cook, and who pays how much?”*
- *“Who consumed how many packets of milk this month?”*

Spreadsheets on phones are clumsy, generic split apps don't handle recurring lunch/dinner options, and pen-and-paper diaries lead to billing disputes. 

**Tiffin Tracker** provides an open-source, zero-data-leak ledger that runs directly in your browser.

---

## 🚀 How It Works (Step-by-Step)

```
+--------------------------------------------------------------+
| 1. Admin Creates Group -> Generates Room Code (e.g., #TF-402) |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| 2. Setup Provider & Rates (Cook's UPI, Half/Full/Sp rates)    |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| 3. Flatmates Join -> Admin Notified -> 1-Tap Approval         |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| 4. Daily Attendance & Menu Voting (Lunch/Dinner: H/F/Sp/Off) |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| 5. Month-End Settlement (Printable Invoice, CSV & UPI QR)    |
+--------------------------------------------------------------+
```

1. **Step 1: Admin Creates Flat Group**  
   The flat admin opens the app, enters their Name, Mobile Number, Flat Name (e.g. *Flat 402*), and sets an Admin Security PIN. The app generates a 6-character room code (e.g., `TF-402`).

2. **Step 2: Configure Provider & Rates**  
   In Settings, configure your cook's Name, Mobile, and UPI ID, plus per-meal pricing (Half, Full, Special) and milk packet rates. Changing rates creates a month-scoped snapshot so past months are never altered.

3. **Step 3: Flatmates Knock & Admin Approves**  
   Roommates click the invite link or enter the Room Code. The Admin receives a real-time notification in the app header and approves them with a single tap.

4. **Step 4: Daily Meal Logging & Menu Voting**  
   Flatmates tap **Off**, **Half**, **Full**, or **Special** for lunch and dinner. If the cook asks for today's dish choice, launch a quick Menu Poll and send a 1-click WhatsApp order.

5. **Step 5: Statement, Invoicing & Direct UPI Settlement**  
   At month-end, click **Print / PDF Statement** for an official itemized bill or **Export CSV** for Excel. Flatmates scan the provider's dynamic UPI QR code or tap the UPI payment link to settle directly.

---

## ✨ Features

### 🍱 1-Tap Meal Logger
- Mobile-first interface with day-by-day navigation.
- Universal meal slots: **Off (₹0)**, **Half**, **Full**, and **Special Diet**.
- Live cost tally for today's meals.

### 📊 Dynamic Master Spreadsheet
- Calendar overview of all 31 days with 2 clean columns per roommate (**Lunch** and **Dinner**).
- No clumsy extra columns: Special diet meals are handled inside the meal slot toggles.
- Click any cell to cycle status: `Off ➜ Half ➜ Full ➜ Special ➜ Off`.
- Search through sabzi history to find when specific dishes were served.

### 🗳️ Daily Menu Voting Poll
- Poll flatmates on today's sabzi choices.
- Flatmates cast votes and specify portion preferences.
- 1-tap WhatsApp summary pre-formatted to message the cook directly.

### 🥛 Amul Milk Tracker
- Track shared milk consumption separately from meal orders.
- Custom member selector, packet quantity toggles (0.5, 1, 2 pkts), and monthly cost totals.

### 📄 Professional Printable Invoice & Clean CSV
- **Printable PDF Statement:** Clean, A4-optimized printable document with Billed To, Cook UPI details, rate snapshot, member meal counts, and total flat due.
- **CSV Export:** UTF-8 BOM spreadsheet with member summaries and full 31-day meal attendance matrix compatible with Excel and Google Sheets.

### 💳 Direct Provider UPI Settlement
- Dynamic QR code generation for the cook's UPI VPA.
- Roommate dropdown automatically loads their exact monthly total into the payment intent.
- 1-click launch in GPay, PhonePe, or Paytm.

---

## 🛠️ Technology Stack

- **Core:** Pure Vanilla JavaScript (ES6+), HTML5 semantic markup, CSS3 design system.
- **Zero Dependencies:** No React, Vue, or Webpack runtime overhead — instant first paint.
- **PWA & Offline:** Service Worker (`sw.js`) and Web Manifest (`manifest.json`).
- **Storage:** Local-first with multi-tenant room isolation.
- **Hosting:** Static CDN (Vercel, GitHub Pages) — **₹0/month infrastructure cost**.

---

## 💻 Local Development Setup

No build step or `npm install` required:

```bash
# 1. Clone the repository
git clone https://github.com/anjanpatel2010/Tiffin-Tracker.git
cd Tiffin-Tracker

# 2. Serve locally with Python
python -m http.server 8080

# 3. Or serve with Node
npx serve .
```

Open `http://localhost:8080` in your browser.

---

## 📁 Repository Structure

```
Tiffin-Tracker/
├── index.html        # Main single-page web app structure
├── app.js            # Core application state, RoomManager & UI logic
├── styles.css        # Responsive dark-mode design system & print styles
├── sw.js             # Service worker for offline caching and fast loads
├── qr.js             # Client-side QR code generator
├── manifest.json     # PWA mobile installation manifest
├── vercel.json       # Clean URL routing and cache control configuration
├── icon.svg          # High-resolution vector app icon
├── screenshots/      # Application screenshots for documentation
├── ARCHITECTURE.md   # Architectural design, sync model, and data schema
├── DEPLOY.md         # Deployment instructions for Vercel, Cloudflare, etc.
├── CONTRIBUTING.md   # Contribution guidelines and coding standards
└── README.md         # Documentation
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

---

## 👨‍💻 Maintainer

**Anjan Patel**  
- GitHub: [@anjanpatel2010](https://github.com/anjanpatel2010)  
- Repository: [anjanpatel2010/Tiffin-Tracker](https://github.com/anjanpatel2010/Tiffin-Tracker)
