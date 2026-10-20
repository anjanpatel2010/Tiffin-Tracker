# Contributing to Tiffin Tracker

Thank you for your interest in contributing to **Tiffin Tracker**! We welcome bug reports, design feedback, feature requests, and code contributions from developers of all skill levels.

---

## 🌟 Guiding Principles

Before contributing code, please keep our core architectural tenets in mind:

1. **Keep it Lean (No Framework Bloat):**  
   We intentionally do not use heavy frameworks (React, Angular, Tailwind). Pure semantic HTML, modern ES6+ JavaScript, and clean CSS variables allow this app to boot in under 50ms on any budget phone.
2. **Mobile-First Always:**  
   90% of flatmates will access this app from their mobile phones while eating lunch or standing near the tiffin table. Every new screen or modal must look and feel natural on a 360px–420px mobile viewport.
3. **Preserve Ledger Compatibility:**  
   Never introduce changes that corrupt or wipe existing localStorage keys or past months' stored ledger data.

---

## 💻 Local Development Setup

1. **Fork the repository** on GitHub.
2. **Clone your fork:**
   ```bash
   git clone https://github.com/<your-username>/Tiffin-Tracker.git
   cd Tiffin-Tracker
   ```
3. **Start any local static server:**
   - Python: `python -m http.server 8080`
   - Node: `npx serve .`
   - VS Code: Use the *Live Server* extension.
4. Open `http://localhost:8080` in your browser.

---

## 🛠️ Making Changes & Submitting PRs

1. Create a feature branch with a clear name:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your edits cleanly.
3. Test across both **Desktop** and **Mobile device emulation** (DevTools Ctrl+Shift+M).
4. Verify JavaScript syntax:
   ```bash
   node -c app.js
   ```
5. Commit with a meaningful, conventional commit message:
   ```bash
   git commit -m "feat: add WhatsApp summary export button to billing screen"
   ```
6. Push to your branch and open a **Pull Request** against `master`.

---

## 🐛 Reporting Bugs

Found a bug or calculation mismatch? Please [open an issue](https://github.com/anjanpatel2010/Tiffin-Tracker/issues) with:
- A brief description of the issue.
- Steps to reproduce.
- Your device/browser (e.g. Chrome 120 on Android, Safari on iOS).
- Screenshots if applicable.

---

## 💡 Feature Ideas / Roadmap

Some features actively on the roadmap for community contributions:
- [ ] Push notifications for new WhatsApp polls via Web Push API.
- [ ] Multi-flat / multi-room switching from the top header.
- [ ] Dark / Light theme toggle.
- [ ] CSV/Excel export enhancements for yearly tax and billing audits.
