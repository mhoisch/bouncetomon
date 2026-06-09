const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = 30000;
const DB_FILE = path.join(__dirname, 'aces.json');

// ── Persistent database ──
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('DB load error:', e.message);
  }
  return {
    startDate: '2026-06-07T08:01:00Z',
    totalAces: 0,
    players: {
      sinner:   { aces: 0 },
      djokovic: { aces: 0 },
      alcaraz:  { aces: 0 },
      zverev:   { aces: 0 },
      fritz:    { aces: 0 },
    },
    log: []
  };
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

let db = loadDB();
console.log(`🐒 Loaded DB — total aces since epoch: ${db.totalAces}`);

// ── Player config ──
const PLAYERS = {
  sinner:   { names: ['sinner', 'j. sinner', 'jannik sinner'],     lastAces: 0, inMatch: false },
  djokovic: { names: ['djokovic', 'n. djokovic', 'novak djokovic'], lastAces: 0, inMatch: false },
  alcaraz:  { names: ['alcaraz', 'c. alcaraz', 'carlos alcaraz'],   lastAces: 0, inMatch: false },
  zverev:   { names: ['zverev', 'a. zverev', 'alexander zverev'],   lastAces: 0, inMatch: false },
  fritz:    { names: ['fritz', 't. fritz', 'taylor fritz'],         lastAces: 0, inMatch: false },
};

// ── HTTP server ──
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const file = path.join(__dirname, 'index.html');
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) { res.writeHead(500); res.end('Error loading page'); return; }
      const token = process.env.MAPBOX_TOKEN || '';
      const injected = data.replace(
        'window.__mapboxToken__; // injected by server',
        `'${token}'; // injected by server`
      );
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(injected);
    });
  } else if (req.url === '/state') {
    // Client fetches this on load to get full persistent state
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db));
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', totalAces: db.totalAces }));
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ── WebSocket server ──
const wss = new WebSocket.Server({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

wss.on('connection', ws => {
  console.log('Client connected. Total:', wss.clients.size);
  // Send full persistent state to new visitor
  ws.send(JSON.stringify({ type: 'state', db }));
});

// ── Tennis data polling ──
async function pollMatches() {
  try {
    const res = await fetch('https://api.sofascore.com/api/v1/sport/tennis/events/live', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.sofascore.com/',
      },
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const events = data.events || [];
    let anyLive = false;
    let dbChanged = false;

    for (const [key, player] of Object.entries(PLAYERS)) {
      const match = events.find(e => {
        const h = (e.homeTeam?.name || '').toLowerCase();
        const a = (e.awayTeam?.name || '').toLowerCase();
        return player.names.some(n => h.includes(n) || a.includes(n));
      });

      if (match) {
        anyLive = true;
        player.inMatch = true;
        const isHome = player.names.some(n => (match.homeTeam?.name || '').toLowerCase().includes(n));
        const aceCount = isHome
          ? (match.homeScore?.aces ?? 0)
          : (match.awayScore?.aces ?? 0);

        const diff = aceCount - player.lastAces;
        if (diff > 0) {
          console.log(`🎾 ${key} hit ${diff} ace(s)!`);
          for (let i = 0; i < diff; i++) {
            const now = new Date().toISOString();
            const tournament = match.tournament?.name || 'ATP Tour';

            // Save to persistent DB
            db.totalAces++;
            db.players[key].aces++;
            db.log.push({ player: key, tournament, time: now });
            dbChanged = true;

            broadcast({ type: 'ace', player: key, tournament });
          }
          player.lastAces = aceCount;
        }

        broadcast({ type: 'status', player: key, inMatch: true, tournament: match.tournament?.name || 'ATP' });
      } else {
        if (player.inMatch) player.lastAces = 0;
        player.inMatch = false;
        broadcast({ type: 'status', player: key, inMatch: false });
      }
    }

    if (dbChanged) saveDB(db);
    broadcast({ type: 'poll', anyLive });
    console.log(`[${new Date().toISOString()}] Poll done. Live: ${anyLive} | Total aces: ${db.totalAces}`);

  } catch (err) {
    console.error('Poll error:', err.message);
    broadcast({ type: 'error', message: err.message });
  }
}

server.listen(PORT, () => {
  console.log(`🐒 BounceToMonkey running on port ${PORT}`);
  console.log(`📊 Total aces in DB: ${db.totalAces}`);
  pollMatches();
  setInterval(pollMatches, POLL_INTERVAL);
});
