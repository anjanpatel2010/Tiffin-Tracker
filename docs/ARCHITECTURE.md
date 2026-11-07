# Architecture & Design Philosophy — Tiffin Tracker

A deliberately lean, high-performance architecture built for zero-cost operation, instant offline readiness, and tamper-resistant tracking for flatmates.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Tiffin Tracker PWA                              │
│                                                                        │
│   ┌─────────────────────┐   ┌──────────────────┐   ┌───────────────┐   │
│   │   Daily Logger &    │   │  WhatsApp Menu   │   │  Master Sheet │   │
│   │    Meal Records     │   │   Voting Poll    │   │  & Analytics  │   │
│   └──────────┬──────────┘   └────────┬─────────┘   └───────┬───────┘   │
│              │                       │                     │           │
│              ▼                       ▼                     ▼           │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │            App State Engine & Rate Snapshotter                 │   │
│   │    (Month-Scoped Ledgers · Active Rates · Activity Log)        │   │
│   └──────────────────────┬─────────────────────────────────────────┘   │
│                          │                                             │
└──────────────────────────┼─────────────────────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   ┌──────────────────┐        ┌──────────────────┐
   │ LocalStorage /   │        │ Room Sync Engine │
   │ Offline Cache    │        │ (Multi-Device)   │
   └──────────────────┘        └──────────────────┘
```

---

## 1. Core Design Principles

### A. Zero Infrastructure Cost (₹0/month Forever)
Unlike heavy apps that require dedicated application servers, Redis caches, or paid SMS gateways:
- All computational logic (expense splitting, ledger aggregation, rate calculations) runs directly on the client.
- The app can be hosted for free on GitHub Pages, Cloudflare Pages, or Vercel Hobby tier.

### B. Local-First & Offline Resilience
- **Service Worker (`sw.js`):** Intercepts network requests and caches the entire shell (HTML, CSS, JS, fonts, icons).
- If the phone loses internet or Wi-Fi drops while logging dinner, the app remains 100% operational.
- Changes are committed immediately to local browser storage and queued for background broadcast.

### C. Month-Scoped Rate Snapshots
One of the most critical bugs in expense apps is modifying a rate (e.g. tiffin price increases from ₹80 to ₹90) and accidentally recalculating past months.
- Tiffin Tracker scopes each month's ledger into its own independent storage key (`tiffin_tracker_ledger_{YEAR}_{MONTH}`).
- Inside each ledger, a **rate snapshot object** (`rates: { half, full, special, amulPacket }`) is permanently frozen for that month.
- Editing pricing rates in November updates November's rates only — October's historical ledger remains 100% untouched.

---

## 2. Room Synchronization & Identity Model

### Frictionless Room Codes
Instead of forcing every roommate to download an app from an app store, create an account, verify an email, or pay for SMS OTPs:
1. Flatmates enter a shared **Room Code** (or open a direct room link).
2. The user selects their active identity from the room profile list.
3. Every state change (meal toggle, sabji update, poll vote) is broadcasted to connected flatmates.

### Administrative Authority ("Danger Zone")
- Regular actions (marking attendance, voting on sabji) are open to all roommates for maximum speed.
- Irreversible destructive actions (such as erasing an entire month's ledger) are gated by an **Admin Password Prompt**.
- Every destructive or administrative action is stamped into the **Activity Log** with the author's identity and timestamp.

---

## 3. Data Schema

Each month's state is modeled as an atomic JSON structure:

```json
{
  "version": 4,
  "year": 2026,
  "month": 10,
  "lastModified": "2026-10-20T12:00:00.000Z",
  "rates": {
    "half": 80,
    "full": 110,
    "special": 90,
    "amulPacket": 35
  },
  "provider": {
    "name": "Sandhya Tiwari",
    "upi": "sandhyatiwari0205@oksbi",
    "phone": "+91 98765 43210"
  },
  "amulMembers": ["anjan", "saurabh"],
  "days": {
    "1": {
      "day": 1,
      "dayOfWeek": "Thursday",
      "sabzi": "Paneer Butter Masala",
      "meals": {
        "anjan": { "lunch": "full", "dinner": "full" },
        "saurabh": { "lunch": "full", "dinner": "off" }
      },
      "amul": {
        "anjan": 1,
        "saurabh": 0
      }
    }
  },
  "activePoll": null,
  "pollHistory": [],
  "auditLog": [
    {
      "id": "log_1792410944545_a1b2",
      "timestamp": 1792410944545,
      "timeFormatted": "19 Oct, 05:25 pm",
      "author": "Anjan",
      "action": "Updated Rates",
      "details": "Half: ₹80, Full: ₹110, Special: ₹90, Milk: ₹35"
    }
  ]
}
```

---

## 4. Why Pure Vanilla JS?

Frameworks like React or Angular add 100KB–300KB of runtime overhead, require complex compilation pipelines, and frequently break dependencies over time.

By writing pure semantic HTML5, modern vanilla JavaScript (ES6+), and CSS custom properties:
- **Zero build steps:** Modify a line in `app.js` and refresh.
- **Zero vulnerability alerts:** No npm security advisories or abandoned packages.
- **Sub-50ms boot times:** Instant rendering even on budget mobile phones and spotty 3G/4G connections.
