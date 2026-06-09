# 🐒 BounceToMonkey

**Every ace hit by Sinner, Djokovic, Alcaraz, Zverev, or Fritz drops a monkey somewhere in Manhattan. Live. Real data. No human involvement.**

Live at → [bouncetomon.onrender.com](https://bouncetomon.onrender.com)

---

## What it does

BounceToMonkey tracks live ATP tennis matches and places a monkey on a Manhattan map every time one of five players hits an ace. Each player has their own color:

- 🔴 Jannik Sinner — red
- 🟢 Novak Djokovic — green
- 🟣 Carlos Alcaraz — purple
- 🔵 Alexander Zverev — blue
- 🟠 Taylor Fritz — orange

Monkeys accumulate permanently from **June 7, 2026**. The total ace count never resets. Click any monkey to see the tournament, date, and time of the ace.

---

## How it works

- `server.js` runs on Render and polls SofaScore every 30 seconds for live match data
- When a new ace is detected it gets saved permanently to `aces.json` and broadcast to every browser via WebSocket
- The browser receives the signal instantly and drops a monkey on a random Manhattan coordinate
- UptimeRobot pings the site every 5 minutes to keep the server always awake so no aces are ever missed

---

## Stack

| Service | Purpose |
|---------|---------|
| [Render](https://render.com) | Hosts and runs the server, free tier |
| [Mapbox](https://mapbox.com) | Real interactive map with streets and POIs |
| [SofaScore](https://sofascore.com) | Live tennis match and ace data |
| [UptimeRobot](https://uptimerobot.com) | Keeps server awake 24/7, free |
| [GitHub](https://github.com/mhoisch/bouncetomon) | Code storage, auto-deploys to Render on every commit |

---

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node.js backend — polls tennis API, saves aces, serves HTML, WebSocket hub |
| `index.html` | Frontend — Mapbox map, monkey rendering, WebSocket client |
| `package.json` | Node dependencies (ws, node-fetch) |
| `aces.json` | Permanent ace database — auto-created on first ace |

---

## Updating the site

1. Make changes here in Claude
2. Drag updated files into this GitHub repo
3. Render auto-redeploys in ~60 seconds
