const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = 30000; // 30 seconds

// ── Player config ──
const PLAYERS = {
  sinner:   { names: ['sinner', 'j. sinner', 'jannik sinner'],     lastAces: 0, inMatch: false },
  djokovic: { names: ['djokovic', 'n. djokovic', 'novak djokovic'], lastAces: 0, inMatch: false },
  alcaraz:  { names: ['alcaraz', 'c. alcaraz', 'carlos alcaraz'],   lastAces: 0, inMatch: false },
  zverev:   { names: ['zverev', 'a. zverev', 'alexander zverev'],   lastAces: 0, inMatch: false },
};

// ── HTTP server — serves index.html ──
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const file = path.join(__dirname, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(500); res.end('Error loading page'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', players: PLAYERS }));
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
  // Send current state to new visitor
  ws.send(JSON.stringify({ type: 'state', players: Object.fromEntries(
    Object.entries(PLAYERS).map(([k, v]) => [k, { inMatch: v.inMatch, lastAces: v.lastAces }])
  )}));
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
          console.log(`🎾 ${key} hit ${diff} ace(s)! Total: ${aceCount}`);
          for (let i = 0; i < diff; i++) {
            broadcast({ type: 'ace', player: key, tournament: match.tournament?.name || 'ATP' });
          }
          player.lastAces = aceCount;
        }

        broadcast({ type: 'status', player: key, inMatch: true, tournament: match.tournament?.name || 'ATP' });
      } else {
        if (player.inMatch) {
          // Match just ended — reset ace counter for next match
          player.lastAces = 0;
        }
        player.inMatch = false;
        broadcast({ type: 'status', player: key, inMatch: false });
      }
    }

    broadcast({ type: 'poll', anyLive });
    console.log(`[${new Date().toISOString()}] Poll complete. Live matches: ${anyLive}`);

  } catch (err) {
    console.error('Poll error:', err.message);
    broadcast({ type: 'error', message: err.message });
  }
}

// ── Start polling ──
server.listen(PORT, () => {
  console.log(`🐒 BounceToMonkey server running on port ${PORT}`);
  pollMatches(); // immediate first poll
  setInterval(pollMatches, POLL_INTERVAL);
});
