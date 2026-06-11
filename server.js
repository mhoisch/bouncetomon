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
  } else if (req.url === '/ace' && req.method === 'POST') {
    // Browser reports a new ace — persist it
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { player, tournament, count } = JSON.parse(body);
        if (PLAYERS[player]) {
          const n = Number(count) || 1;
          for (let i = 0; i < n; i++) {
            db.totalAces++;
            db.players[player].aces++;
            db.log.push({ player, tournament: tournament || 'ATP Tour', time: new Date().toISOString() });
          }
          saveDB(db);
          console.log(`💾 Persisted ${n} ace(s) for ${player}. Total: ${db.totalAces}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, total: db.totalAces }));
      } catch(e) {
        res.writeHead(400); res.end('Bad request');
      }
    });
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

// ── Tennis data polling via SportDB/Flashscore ──
async function pollMatches() {
  try {
    const SPORTDB_KEY = process.env.SPORTDB_KEY || '';
    
    const res = await fetch('https://api.sportdb.dev/api/flashscore/tennis/live', {
      headers: {
        'X-API-Key': SPORTDB_KEY,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    // Log raw response shape once for debugging
    if (!pollMatches._logged) {
      console.log('SportDB sample:', JSON.stringify(data).slice(0, 500));
      pollMatches._logged = true;
    }

    const events = data.events || data.matches || data.data || data || [];
    const list = Array.isArray(events) ? events : Object.values(events);

    let anyLive = false;
    let dbChanged = false;

    for (const [key, player] of Object.entries(PLAYERS)) {
      const match = list.find(e => {
        const p1 = (e.home_name || e.player1 || e.home || e.player_1 || '').toLowerCase();
        const p2 = (e.away_name || e.player2 || e.away || e.player_2 || '').toLowerCase();
        return player.names.some(n => p1.includes(n) || p2.includes(n));
      });

      if (match) {
        anyLive = true;
        player.inMatch = true;

        const isHome = player.names.some(n =>
          (match.home_name || match.player1 || match.home || '').toLowerCase().includes(n)
        );

        // Try every possible ace field
        const homeAces = match.home_aces ?? match.stats?.home_aces ?? match.statistics?.home_aces ?? 
                         match.score?.home_aces ?? match.home_stats?.aces ?? 0;
        const awayAces = match.away_aces ?? match.stats?.away_aces ?? match.statistics?.away_aces ?? 
                         match.score?.away_aces ?? match.away_stats?.aces ?? 0;
        const aceCount = Number(isHome ? homeAces : awayAces);

        const diff = aceCount - player.lastAces;
        if (diff > 0) {
          console.log(`🎾 ${key} hit ${diff} ace(s)! Total: ${aceCount}`);
          const tournament = match.tournament_name || match.competition || match.league || 'ATP Tour';
          for (let i = 0; i < diff; i++) {
            db.totalAces++;
            db.players[key].aces++;
            db.log.push({ player: key, tournament, time: new Date().toISOString() });
            dbChanged = true;
            broadcast({ type: 'ace', player: key, tournament });
          }
          player.lastAces = aceCount;
        }

        const tournament = match.tournament_name || match.competition || 'ATP Tour';
        broadcast({ type: 'status', player: key, inMatch: true, tournament });
      } else {
        if (player.inMatch) player.lastAces = 0;
        player.inMatch = false;
        broadcast({ type: 'status', player: key, inMatch: false });
      }
    }

    if (dbChanged) saveDB(db);
    broadcast({ type: 'poll', anyLive });
    console.log(`[${new Date().toISOString()}] Poll done. Live: ${anyLive} | Total: ${db.totalAces}`);

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
