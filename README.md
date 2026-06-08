# 🐒 BounceToMonkey

**Live tennis aces → monkeys in Manhattan.**
Every ace by Sinner, Djokovic, Alcaraz, or Zverev drops a monkey on the Manhattan map. In real time.

---

## Deploy to Railway (free, ~5 minutes, no coding)

### Step 1 — GitHub (2 min)
1. Go to [github.com](https://github.com) and sign up free if you don't have an account
2. Click **+** → **New repository** → name it `bouncetomon` → **Create repository**
3. On the next screen click **uploading an existing file**
4. Drag all 4 files from this folder into the upload area:
   - `server.js`
   - `index.html`
   - `package.json`
   - `railway.toml`
5. Click **Commit changes**

### Step 2 — Railway (3 min)
1. Go to [railway.app](https://railway.app) → **Login with GitHub**
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `bouncetomon` repo
4. Railway auto-detects Node.js and deploys — takes about 60 seconds
5. Click **Settings** → **Networking** → **Generate Domain**
6. Your site is live at something like `bouncetomon.up.railway.app`

### Step 3 — Point your domain (optional)
If you own `BounceToMonkey.com`, in Railway go to **Settings → Networking → Custom Domain** and add it. Then in your domain registrar point the DNS to Railway's address.

---

## How it works

- The server polls SofaScore every 30 seconds for live tennis matches
- When it detects a new ace by any of the 4 players, it broadcasts via WebSocket
- Every browser viewing the site instantly gets the signal and drops a monkey
- No CORS issues — the server talks to the API, not the browser

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node.js backend — polls tennis API, serves HTML, WebSocket hub |
| `index.html` | Frontend — Mapbox map, monkey rendering, WebSocket client |
| `package.json` | Dependencies (ws, node-fetch) |
| `railway.toml` | Railway deploy config |
