# PiggyLedger

A simple allowance and savings-interest tracking tool for parents and kids —
inspired by apps like Greenlight, but with **no real money, no payment rails,
and no login for kids**. It's a modeling and teaching tool: parents record the
cash they actually hand over or set aside, kids see their running balance and
play with "what if I saved" projections.

- **Parents**: add money as it's earned, record spending with a note, set an
  annual interest rate, and automate a recurring allowance — all from
  `parent.html`.
- **Kids**: open a bookmarked link (works great on an Amazon Fire tablet) to
  see their balance and try savings simulator scenarios — no login needed.
- **No payments**: this app never moves real money. It's purely for tracking
  and teaching.

## Quick start

1. Read [`docs/SETUP.md`](docs/SETUP.md) for full GitHub Pages + Firebase
   setup instructions (10 minutes, free).
2. Read [`docs/USAGE.md`](docs/USAGE.md) for day-to-day usage scenarios for
   parents and kids.
3. Everything is plain HTML/CSS/JS with **no build step** — the whole
   `piggyledger/` folder is the deployable site.

## Project structure

```
piggyledger/
├── index.html          Family home page (pick a kid to view)
├── parent.html          Parent dashboard (add/spend money, settings, PIN)
├── kid.html             Kid-facing balance + savings simulator page
├── assets/
│   ├── css/styles.css   Design system + all page styles
│   └── js/
│       ├── financeEngine.js   Pure interest/allowance math (unit tested)
│       ├── familyStore.js     Firestore-backed data layer
│       ├── localStore.js      localStorage-backed demo-mode data layer
│       ├── firebaseConfig.js  Your Firebase project config (edit this)
│       ├── pinAuth.js         Parent PIN hashing/verification helpers
│       ├── ui.js              Shared UI helpers (toasts, formatting, logo)
│       ├── home.js / parent.js / kid.js   Per-page controllers
├── firestore.rules      Firestore security rules (paste into Firebase console)
├── firebase.json         Firebase emulator config (for local testing only)
├── docs/
│   ├── SETUP.md          Step-by-step GitHub Pages + Firebase setup
│   └── USAGE.md          Usage scenarios for parents and kids
└── tests/                 Automated tests (see below)
```

## Running tests locally

The site itself needs no dependencies, but the test suite uses Node's
built-in test runner plus the Firebase emulator for the Firestore-backed
tests:

```bash
npm install
npm run test:logic   # pure finance-math + PIN + localStorage tests, no network
npm run emulator     # in a separate terminal, starts the Firestore emulator
npm run test:store   # Firestore-backed data-layer tests (needs the emulator running)
```

## How data storage works

- **Demo mode** (default, until you configure Firebase): data lives in the
  browser's `localStorage`. Great for trying the app out, but each
  device/browser has its own separate copy.
- **Live mode** (after following `docs/SETUP.md`): data lives in your own
  free Firestore project, scoped to a random per-family ID. Every device
  pointed at the same deployed site sees the same live data.

Both modes share the exact same UI and business logic — switching from demo
to live is just editing one config file, no code changes.
