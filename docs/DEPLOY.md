# Deployment Guide — Tiffin Tracker

Because Tiffin Tracker is a static Progressive Web App (PWA), you can host it for free on any modern static CDN.

> [!IMPORTANT]
> A valid HTTPS connection is required for Service Workers and PWA installation to function. All the hosting methods below provide free, automatic SSL certificates.

---

## Option 1: GitHub Pages (Easiest & Free)

1. Fork or push this repository to your GitHub account (`username/Tiffin-Tracker`).
2. Go to your repository on GitHub.
3. Click on **Settings** ➜ **Pages** (under the "Code and automation" sidebar).
4. Under **Build and deployment**:
   - **Source:** Select `Deploy from a branch`
   - **Branch:** Select `master` (or `main`), and folder `/ (root)`
5. Click **Save**.
6. Within 60 seconds, your site will be live at:  
   `https://<username>.github.io/Tiffin-Tracker/`

---

## Option 2: Vercel (1-Click Deployment)

1. Sign up or log into [Vercel](https://vercel.com).
2. Click **Add New...** ➜ **Project**.
3. Import your `Tiffin-Tracker` GitHub repository.
4. Keep the default settings:
   - **Framework Preset:** `Other`
   - **Build Command:** *(Leave empty)*
   - **Output Directory:** `.` *(Root)*
5. Click **Deploy**.
6. Your app is live with automatic global CDN caching and SSL.

---

## Option 3: Cloudflare Pages

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** ➜ **Create application** ➜ **Pages** ➜ **Connect to Git**.
3. Select your repository.
4. Set **Build settings**:
   - **Framework preset:** `None`
   - **Build command:** *(Leave empty)*
   - **Build output directory:** `/`
5. Click **Save and Deploy**.

---

## Verifying PWA Installation

Once deployed to HTTPS:
1. Open your live URL on an Android phone (Chrome) or iPhone (Safari).
2. **Android:** Tap the three dots menu ➜ **Install app** or **Add to Home screen**.
3. **iOS:** Tap the Share button (square with arrow) ➜ **Add to Home Screen**.
4. The app will launch in standalone full-screen mode like a native app.
