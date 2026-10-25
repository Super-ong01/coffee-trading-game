'use strict';
// เซิร์ฟเวอร์เกม (Node.js ล้วน ไม่ต้องติดตั้งแพ็กเกจเพิ่ม ใช้งานได้แบบออฟไลน์ใน Wi-Fi วงเดียวกัน)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const G = require('./engine/game');
const { normalizeConfig, LEGACY_SKU_IDS, DEFAULT_SKUS } = require('./engine/config');
const { advise } = require('./engine/advisor');
const { buildSummary } = require('./engine/summary');
const { publicHistory } = require('./engine/market');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'game-state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const HOST_PIN = process.env.HOST_PIN || String(crypto.randomInt(1000, 9999));
const FRESH = process.argv.includes('--new');

let game = null;
if (!FRESH && fs.existsSync(STATE_FILE)) {
  try {
    game = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    game.config = normalizeConfig(game.config); // เติมค่าตั้งค่าใหม่ที่ไฟล์เก่ายังไม่มี
    // ห้องรอที่ยังใช้ชนิดกาแฟชุดเก่า → เปลี่ยนเป็นโรบัสต้าเกรด A–G
    if (game.phase === 'lobby' && game.config.skus.every((s) => LEGACY_SKU_IDS.includes(s.id))) game.config.skus = DEFAULT_SKUS;
    console.log('↻ โหลดเกมที่บันทึกไว้ (รอบ ' + game.round + ', สถานะ ' + game.phase + ')  ใช้ "npm run new" เพื่อเริ่มเกมใหม่');
  } catch (e) {
    console.warn('อ่านไฟล์เกมเดิมไม่ได้ เริ่มเกมใหม่', e.message);
  }
}
if (!game) game = G.createGame();

// ---------- persistence ----------
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(game));
      fs.renameSync(STATE_FILE + '.tmp', STATE_FILE);
    } catch (e) { console.error('บันทึกเกมไม่สำเร็จ', e.message); }
  }, 300);
}

// ---------- realtime (Server-Sent Events) ----------
const clients = new Set(); // {res, role, teamId}
function send(c) {
  const now = Date.now();
  const view = c.role === 'host' ? G.hostView(game, now) : G.playerView(game, c.teamId, now);
  if (!view) { c.res.write('event: kicked\ndata: {}\n\n'); return; }
  c.res.write('data: ' + JSON.stringify(view) + '\n\n');
}
function broadcast() {
  for (const c of clients) {
    try { send(c); } catch { /* ignore */ }
  }
}
function changed() { broadcast(); scheduleSave(); }

setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 20000);

// ---------- round timer ----------
setInterval(() => {
  if (game.phase !== 'bidding' || game.pausedRemainingMs != null) return;
  const now = Date.now();
  if (game.config.autoCloseWhenAllReady) {
    const r = G.humansReady(game);
    if (r.total > 0 && r.ready === r.total && game.endsAt - now > 10000) {
      game.endsAt = now + 10000; // ทุกคนส่งแล้ว: นับถอยหลัง 10 วินาที (ยังแก้ไขได้)
      game.version++;
      changed();
    }
  }
  if (now >= game.endsAt) {
    try { G.closeRound(game); console.log('ปิดรอบ ' + game.round + ' (หมดเวลา)'); } catch (e) { console.error(e); }
    changed();
  }
}, 500);

// ---------- helpers ----------
function isLoopback(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
function isHost(req, url) {
  return isLoopback(req) || url.searchParams.get('pin') === HOST_PIN || req.headers['x-host-pin'] === HOST_PIN;
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (ch) => { data += ch; if (data.length > 1e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new G.GameError('JSON ไม่ถูกต้อง')); } });
  });
}
function teamByToken(token) {
  return token ? game.teams.find((t) => t.token && t.token === token) : null;
}
// ซ่อนการ์ดเครือข่ายเสมือน (VirtualBox, VMware, WSL, Hyper-V ฯลฯ) ที่ผู้เล่นใช้เข้าไม่ได้
const VIRTUAL_IF = /virtualbox|vbox|vmware|vmnet|vethernet|hyper-v|wsl|docker|loopback|tailscale|zerotier|hamachi|bluetooth/i;
function lanUrls() {
  const real = [], virtual = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || i.address.startsWith('169.254.')) continue;
      const url = `http://${i.address}:${PORT}`;
      if (VIRTUAL_IF.test(name) || i.address.startsWith('192.168.56.')) virtual.push(url);
      else real.push(url);
    }
  }
  return real.length ? real : virtual;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
function serveFile(res, file) {
  const p = path.join(PUBLIC_DIR, file);
  if (!p.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // pages
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, 'player.html');
    if (req.method === 'GET' && p === '/host') {
      if (!isHost(req, url)) { res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<p style="font-family:sans-serif">หน้าผู้จัดเปิดได้จากเครื่องเซิร์ฟเวอร์ หรือใส่ ?pin=รหัสที่แสดงในหน้าต่างเซิร์ฟเวอร์</p>'); }
      return serveFile(res, 'host.html');
    }
    if (req.method === 'GET' && p.startsWith('/static/')) return serveFile(res, p.slice(8));
    if (req.method === 'GET' && p === '/guide') return serveFile(res, 'guide.html');
    if (req.method === 'GET' && p === '/tutorial') return serveFile(res, 'tutorial.html');
    if (req.method === 'GET' && p === '/api/config') { const { seed, ...cfg } = game.config; return json(res, 200, cfg); }

    // realtime
    if (p === '/events') {
      let c;
      if (url.searchParams.get('role') === 'host') {
        if (!isHost(req, url)) return json(res, 403, { error: 'host only' });
        c = { role: 'host' };
      } else {
        const t = teamByToken(url.searchParams.get('token'));
        if (!t) return json(res, 401, { error: 'ไม่พบทีม กรุณาเข้าร่วมใหม่' });
        c = { role: 'player', teamId: t.id };
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      c.res = res;
      clients.add(c);
      send(c);
      req.on('close', () => clients.delete(c));
      return;
    }

    if (req.method === 'GET' && p === '/api/info') {
      return json(res, 200, { phase: game.phase, urls: lanUrls(), port: PORT, seats: game.config.humans, joined: game.teams.filter((t) => t.type === 'human').length });
    }
    if (req.method === 'POST' && p === '/api/join') {
      const body = await readBody(req);
      const t = G.addHuman(game, body.name);
      console.log('+ ผู้เล่นเข้าร่วม: ' + t.name);
      changed();
      return json(res, 200, { token: t.token, teamId: t.id, name: t.name });
    }
    if (req.method === 'GET' && p === '/api/me') {
      const t = teamByToken(url.searchParams.get('token'));
      if (!t) return json(res, 401, { error: 'ไม่พบทีม' });
      return json(res, 200, G.playerView(game, t.id));
    }
    if (req.method === 'POST' && p === '/api/offers') {
      const body = await readBody(req);
      const t = teamByToken(body.token);
      if (!t) return json(res, 401, { error: 'ไม่พบทีม' });
      const offers = G.submitOffers(game, t.id, body.offers, !!body.skip);
      changed();
      return json(res, 200, { ok: true, offers, skip: !offers.length });
    }
    if (req.method === 'GET' && p === '/api/advice') {
      const t = teamByToken(url.searchParams.get('token'));
      if (!t) return json(res, 401, { error: 'ไม่พบทีม' });
      const adv = advise({ config: game.config, round: game.round, rounds: game.config.rounds, phase: game.phase, stock: t.stock, history: publicHistory(game, t.id), buyers: game.phase === 'bidding' ? G.currentBuyers(game) : [], profile: url.searchParams.get('profile') });
      return json(res, 200, adv);
    }
    if (req.method === 'GET' && p === '/api/summary') {
      const t = teamByToken(url.searchParams.get('token'));
      if (!t) return json(res, 401, { error: 'ไม่พบทีม' });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(buildSummary(game, t.id));
    }

    // host actions
    if (p.startsWith('/api/host/')) {
      if (!isHost(req, url)) return json(res, 403, { error: 'เฉพาะผู้จัด' });
      const action = p.slice('/api/host/'.length);
      if (req.method === 'GET' && action === 'export.csv') {
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="coffee-game-results.csv"' });
        return res.end(G.exportCSV(game));
      }
      if (req.method === 'GET' && action === 'export.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="coffee-game-state.json"' });
        const safe = { ...game, teams: game.teams.map(({ token, ...t }) => t) };
        return res.end(JSON.stringify(safe, null, 2));
      }
      if (req.method === 'GET' && action === 'info') return json(res, 200, { pin: HOST_PIN, urls: lanUrls() });
      if (req.method !== 'POST') return json(res, 404, { error: 'not found' });
      const body = await readBody(req);
      const now = Date.now();
      switch (action) {
        case 'config': G.updateConfig(game, body); break;
        case 'start': G.startGame(game, now); console.log('▶ เริ่มเกม: ' + game.teams.length + ' ทีม'); break;
        case 'close': G.closeRound(game); console.log('ปิดรอบ ' + game.round + ' (ผู้จัดกด)'); break;
        case 'next': G.nextRound(game, now); break;
        case 'pause': G.pause(game, now); break;
        case 'resume': G.resume(game, now); break;
        case 'extend': G.extend(game, Number(body.seconds) || 60, now); break;
        case 'kick': G.removeTeam(game, body.teamId); for (const c of clients) if (c.teamId === body.teamId) { c.res.write('event: kicked\ndata: {}\n\n'); } break;
        case 'reset': game = G.createGame(game.config); console.log('↺ รีเซ็ตเกม'); for (const c of clients) if (c.role === 'player') c.res.write('event: kicked\ndata: {}\n\n'); break;
        default: return json(res, 404, { error: 'unknown action' });
      }
      changed();
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    if (e instanceof G.GameError) return json(res, 400, { error: e.message });
    console.error(e);
    json(res, 500, { error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const urls = lanUrls();
  console.log('');
  console.log('☕  Coffee Trading Game พร้อมแล้ว');
  console.log('──────────────────────────────────────────────');
  console.log('หน้าผู้จัด (เปิดในเครื่องนี้):  http://localhost:' + PORT + '/host');
  console.log('ผู้เล่นใน Wi-Fi เดียวกันเข้าที่:');
  if (urls.length) urls.forEach((u) => console.log('   ' + u));
  else console.log('   (ไม่พบเครือข่าย ตรวจสอบว่าเชื่อมต่อ Wi-Fi แล้ว)');
  console.log('รหัสผู้จัด (ถ้าจะคุมเกมจากเครื่องอื่น): ' + HOST_PIN + '  →  <ลิงก์ด้านบน>/host?pin=' + HOST_PIN);
  console.log('──────────────────────────────────────────────');
  console.log('กด Ctrl+C เพื่อปิดเซิร์ฟเวอร์ (เกมถูกบันทึกอัตโนมัติ)');
});
