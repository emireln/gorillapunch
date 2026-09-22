# 🥊 GorillaPunch — Desktop & Launch Readiness Engine

[![Release](https://img.shields.io/github/v/release/emireln/gorillapunch?include_prereleases&style=flat-square&color=7553FF)](https://github.com/emireln/gorillapunch/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=flat-square&logo=windows)](https://github.com/emireln/gorillapunch/releases)
[![License](https://img.shields.io/badge/License-MIT-success?style=flat-square)](LICENSE)

**GorillaPunch Desktop** is a local-first launch readiness platform that answers one critical question: ***Is this web application actually ready to launch?***

Run in-depth browser audits, accessibility checks, Core Web Vitals measurements, and security assessments directly on your machine — with **full support for testing `http://localhost:3000`**, zero cloud execution costs, and complete privacy.

---

## 🚀 Download & Install for Windows

### ⚡ Quick Install (PowerShell)
Run this single command in Windows PowerShell (or Windows Terminal) — no manual browsing required:
```powershell
irm https://gorillapunch.run/install.ps1 | iex
```

### Manual Downloads
* **[Download GorillaPunch Setup (.exe)](https://github.com/emireln/gorillapunch/releases/latest/download/GorillaPunch-Setup.exe)** — *Installer with automatic system tray integration.*
* **[Download Portable Edition (.exe)](https://github.com/emireln/gorillapunch/releases/latest/download/GorillaPunch-portable.exe)** — *Single standalone executable, no installation needed.*

---

## ✨ Key Features

- **⚡ Localhost & Private Staging Audits**: Audit `http://localhost:3000`, `http://127.0.0.1:5173`, Docker containers, and staging servers before pushing code to production.
- **🛡️ 100% Local & Private**: Audits run on your machine using bundled Playwright/Chromium. Zero server secrets, zero cloud credits consumed.
- **🎨 Custom Frameless ChonkUI**: Sleek dark and light theme, custom title bar, Space Grotesk brand typography, and smooth micro-animations.
- **🔔 Windows System Tray & Notifications**: Minimize to the tray, run quick punches from your clipboard, and receive native Windows notifications when scans complete.
- **♿ Automated WCAG Accessibility**: Built-in Axe-core scanner catches accessibility violations directly on the rendered DOM.
- **📊 Core Web Vitals**: Measures LCP (Largest Contentful Paint), CLS (Cumulative Layout Shift), FCP, and TTFB.
- **💻 CLI Runner**: Run audits directly from your command line:
  ```bash
  npx gorillapunch audit http://localhost:3000 --fail-under 80
  ```
- **📁 File & Dev Server Watcher**: Monitors your local project and triggers instant quick health checks when your dev server reloads.

---

## 🛠️ Building from Source

### Prerequisites
- Node.js `22.x` or later
- npm `10.x` or later
- Windows 10/11 (or Linux/macOS for development)

### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/emireln/gorillapunch.git
cd gorillapunch

# 2. Install dependencies
npm install

# 3. Launch Desktop in development mode (with Hot Reload)
npm run desktop:dev

# 4. Run tests
npm test

# 5. Build production Windows installer (.exe)
npm run desktop:package
```

---

## 🔐 Security & Privacy Architecture

The desktop application connects to public web targets using a DNS-pinned, bounded network broker (`src/worker/network.ts`) that protects against malicious redirects.

* **No server-side secrets**: The desktop app never contains backend master keys, Stripe credentials, or private cloud tokens.
* **Local SQLite storage**: Your audit history and reports are stored locally in your user profile (`~/.gorillapunch/history.db`).
* **Cloud Sync (Optional)**: If you choose to log in with a GorillaPunch account, reports are synced via authenticated, row-level-secured Supabase endpoints.

---

## 📄 License

MIT © [GorillaPunch](https://gorillapunch.run)
