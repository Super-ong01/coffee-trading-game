'use strict';
// เครื่องยนต์เกม (pure logic ไม่มี I/O) ใช้ได้ทั้งบนเซิร์ฟเวอร์และในเทสต์
const crypto = require('crypto');
const { normalizeConfig, BOT_STYLES, BOT_STYLE_TH } = require('./config');
const { rngFor, pickWeighted, shuffle } = require('./rng');
const { percentageDiff, teamScore, totalStock, round2 } = require('./scoring');
const { botOffers } = require('./bots');
const { publicHistory, pct } = require('./market');

const BOT_NAMES = ['ดอยช้าง', 'แม่แตง', 'ปางขอน', 'ห้วยแม่', 'ดอยตุง', 'วาวี', 'ขุนลาว', 'บ่อเกลือ', 'ม่อนแจ่ม', 'บ้านรักไทย',
  'ดอยสะเก็ด', 'แม่จัน', 'เวียงป่าเป้า', 'ปางมะผ้า', 'แม่สลอง', 'ดอยปุย', 'แม่กำปอง', 'บ่อสวก', 'ภูทับเบิก', 'ชุมพร'];

class GameError extends Error {}

function createGame(configInput) {
  return {
    config: normalizeConfig(configInput),
    phase: 'lobby', // lobby | bidding | results | ended
    round: 0,
    teams: [],
    buyers: [],       // buyers[roundIndex] = [{id,name,sku,skuName,ref,demand}]
    offers: {},       // teamId -> [{buyerId, qty, price}]  (ซ่อนจนปิดรอบ)
    submitted: {},    // teamId -> 'offer' | 'skip'
    results: [],
    endsAt: null,
    pausedRemainingMs: null,
    version: 1,
    createdAt: Date.now(),
  };
}

function updateConfig(game, input) {
  if (game.phase !== 'lobby') throw new GameError('ตั้งค่าได้เฉพาะก่อนเริ่มเกม');
  game.config = normalizeConfig({ ...game.config, ...input });
  const humans = game.teams.filter((t) => t.type === 'human');
  if (humans.length > game.config.humans) game.config.humans = humans.length;
}

const newToken = () => crypto.randomBytes(16).toString('hex');

function addHuman(game, rawName) {
  if (game.phase !== 'lobby') throw new GameError('เกมเริ่มแล้ว เข้าร่วมใหม่ไม่ได้ (ถ้าเคยเข้าแล้วให้รีเฟรชหน้าเดิม)');
  const name = String(rawName || '').trim().slice(0, 24);
  if (!name) throw new GameError('กรุณาใส่ชื่อทีม');
  const humans = game.teams.filter((t) => t.type === 'human');
  if (humans.length >= game.config.humans) throw new GameError(`ที่นั่งคนจริงเต็มแล้ว (${game.config.humans} ที่)`);
  if (game.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new GameError('ชื่อนี้มีคนใช้แล้ว');
  game.nextHumanNo = (game.nextHumanNo || 0) + 1;
  const team = { id: 'H' + game.nextHumanNo, name, type: 'human', token: newToken(), stock: {}, startStock: {}, lines: [], score: 0 };
  game.teams.push(team);
  game.version++;
  return team;
}

function removeTeam(game, teamId) {
  if (game.phase !== 'lobby') throw new GameError('ลบทีมได้เฉพาะก่อนเริ่มเกม');
  game.teams = game.teams.filter((t) => t.id !== teamId);
  game.version++;
}

function assignStock(game) {
  const cfg = game.config;
  const ids = cfg.skus.map((s) => s.id);
  for (const t of game.teams) {
    const rng = rngFor(cfg.seed, 'stock', t.id);
    const k = cfg.stockMode === 'single' ? 1 : cfg.skusPerTeam;
    const chosen = shuffle(rng, ids).slice(0, k);
    const stock = {};
    let left = cfg.stockPerTeam;
    chosen.forEach((sku, i) => {
      const remainingSlots = chosen.length - i - 1;
      const q = i === chosen.length - 1 ? left : Math.max(1, Math.min(left - remainingSlots, Math.round(left / (chosen.length - i) + (rng() - 0.5) * 2)));
      stock[sku] = q;
      left -= q;
    });
    t.stock = stock;
    t.startStock = { ...stock };
  }
}

function generateBuyers(game) {
  const cfg = game.config;
  const rng = rngFor(cfg.seed, 'buyers');
  const supply = {};
  for (const s of cfg.skus) supply[s.id] = 0;
  for (const t of game.teams) for (const [k, v] of Object.entries(t.stock)) supply[k] += v;
  const skus = cfg.skus.filter((s) => supply[s.id] > 0);
  const weights = skus.map((s) => supply[s.id]);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const slots = cfg.rounds * cfg.buyersPerRound;
  game.buyers = [];
  for (let r = 1; r <= cfg.rounds; r++) {
    const list = [];
    for (let b = 1; b <= cfg.buyersPerRound; b++) {
      const sku = pickWeighted(rng, skus, weights);
      const expectedSlots = slots * (supply[sku.id] / totalW);
      const base = (supply[sku.id] * cfg.demandRatio) / expectedSlots;
      const demand = Math.max(1, Math.round(base * (0.6 + 0.8 * rng())));
      list.push({ id: `R${r}B${b}`, name: `ผู้ซื้อ #${b}`, sku: sku.id, skuName: sku.name, ref: sku.ref, demand });
    }
    game.buyers.push(list);
  }
}

function startGame(game, now = Date.now()) {
  if (game.phase !== 'lobby') throw new GameError('เกมเริ่มไปแล้ว');
  const cfg = game.config;
  const humans = game.teams.filter((t) => t.type === 'human');
  const emptySeats = Math.max(0, cfg.humans - humans.length);
  if (cfg.requireFullSeats && emptySeats > 0) throw new GameError(`ผู้เล่นยังเข้าไม่ครบ (${humans.length}/${cfg.humans} คน) รออีก ${emptySeats} คน หรือลดจำนวนที่นั่งคนจริงในหน้าตั้งค่า`);
  const botCount = cfg.bots + (cfg.fillEmptyWithBots ? emptySeats : 0);
  if (humans.length + botCount < 1) throw new GameError('ต้องมีอย่างน้อย 1 ทีม');
  const styleRng = rngFor(cfg.seed, 'styles');
  let styles = [];
  while (styles.length < botCount) styles = styles.concat(shuffle(styleRng, BOT_STYLES));
  game.teams = humans;
  for (let i = 0; i < botCount; i++) {
    const nm = BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? ' ' + (Math.floor(i / BOT_NAMES.length) + 1) : '');
    game.teams.push({ id: 'B' + String(i + 1).padStart(2, '0'), name: 'บอท ' + nm, type: 'bot', botStyle: styles[i], stock: {}, startStock: {}, lines: [], score: 0 });
  }
  assignStock(game);
  generateBuyers(game);
  game.round = 0;
  beginRound(game, now);
}

function beginRound(game, now) {
  game.round += 1;
  game.phase = 'bidding';
  game.offers = {};
  game.submitted = {};
  game.endsAt = now + game.config.roundSeconds * 1000;
  game.pausedRemainingMs = null;
  for (const t of game.teams) {
    if (t.type !== 'bot') continue;
    game.offers[t.id] = botOffers(game, t);
    game.submitted[t.id] = game.offers[t.id].length ? 'offer' : 'skip';
  }
  game.version++;
}

function currentBuyers(game) {
  return game.round >= 1 ? game.buyers[game.round - 1] || [] : [];
}

/** ตรวจและบันทึกข้อเสนอ  offers=[] หรือ skip=true = ไม่ขายรอบนี้ */
function submitOffers(game, teamId, offers, skip = false) {
  if (game.phase !== 'bidding') throw new GameError('ตอนนี้ไม่ได้อยู่ในช่วงเสนอราคา');
  if (game.pausedRemainingMs != null) throw new GameError('เกมหยุดชั่วคราว รอผู้จัดกดเล่นต่อ');
  const team = game.teams.find((t) => t.id === teamId);
  if (!team) throw new GameError('ไม่พบทีม');
  const cfg = game.config;
  const buyers = currentBuyers(game);
  const clean = [];
  if (!skip) {
    if (!Array.isArray(offers)) throw new GameError('รูปแบบข้อมูลไม่ถูกต้อง');
    const usedBuyer = new Set();
    const perSku = {};
    for (const o of offers) {
      const qty = Math.floor(Number(o.qty));
      if (!qty) continue; // จำนวน 0 = ไม่เสนอให้ผู้ซื้อรายนี้
      const buyer = buyers.find((b) => b.id === o.buyerId);
      if (!buyer) throw new GameError('ไม่พบผู้ซื้อ ' + o.buyerId);
      if (usedBuyer.has(buyer.id)) throw new GameError(`เสนอให้ ${buyer.name} ได้ครั้งเดียวต่อรอบ`);
      usedBuyer.add(buyer.id);
      if (qty < 0) throw new GameError('จำนวนต้องไม่ติดลบ');
      const price = Math.round(Number(o.price));
      if (!Number.isFinite(price) || price <= 0) throw new GameError(`ราคาให้ ${buyer.name} ไม่ถูกต้อง`);
      const minP = Math.ceil(buyer.ref * cfg.priceFloorPct / 100);
      if (price < minP) throw new GameError(`ราคาต่ำสุดที่เสนอได้คือ ${minP} บาท (${cfg.priceFloorPct}% ของราคากลาง)`);
      if (price > buyer.ref * 5) throw new GameError('ราคาสูงเกินไป');
      perSku[buyer.sku] = (perSku[buyer.sku] || 0) + qty;
      clean.push({ buyerId: buyer.id, qty, price });
    }
    for (const [sku, q] of Object.entries(perSku)) {
      const have = team.stock[sku] || 0;
      if (q > have) {
        const nm = cfg.skus.find((s) => s.id === sku)?.name || sku;
        throw new GameError(`${nm}: เสนอรวม ${q} ${cfg.unitName} แต่มีในสต๊อกแค่ ${have}`);
      }
    }
  }
  game.offers[teamId] = clean;
  game.submitted[teamId] = clean.length ? 'offer' : 'skip';
  game.version++;
  return clean;
}

function humansReady(game) {
  const humans = game.teams.filter((t) => t.type === 'human');
  return { total: humans.length, ready: humans.filter((t) => game.submitted[t.id]).length };
}

/** ปิดรอบ: จับคู่ซื้อขาย หักสต๊อก คิดคะแนน */
function closeRound(game) {
  if (game.phase !== 'bidding') throw new GameError('ไม่มีรอบที่เปิดอยู่');
  const cfg = game.config;
  const buyers = currentBuyers(game);
  const teamById = Object.fromEntries(game.teams.map((t) => [t.id, t]));
  const before = Object.fromEntries(game.teams.map((t) => [t.id, t.score]));
  const res = { round: game.round, buyers: [], teamDeltas: {} };

  for (const b of buyers) {
    const tieRng = rngFor(cfg.seed, 'tie', game.round, b.id);
    const cap = b.ref * cfg.priceCapPct / 100;
    const offers = [];
    for (const [teamId, list] of Object.entries(game.offers)) {
      for (const o of list) {
        if (o.buyerId !== b.id) continue;
        offers.push({ teamId, teamName: teamById[teamId].name, qty: o.qty, price: o.price, sold: 0, reason: null });
      }
    }
    // tie-break แบบสุ่มด้วย seed (คงที่ต่อ seed/รอบ/ผู้ซื้อ ไม่ขึ้นกับลำดับการส่ง)
    offers.sort((x, y) => (x.teamId < y.teamId ? -1 : 1));
    offers.forEach((o) => (o.tie = tieRng()));
    const eligible = offers.filter((o) => o.price <= cap).sort((x, y) => x.price - y.price || x.tie - y.tie);
    let left = b.demand;
    for (const o of eligible) {
      const s = Math.min(o.qty, left);
      o.sold = s;
      left -= s;
    }
    const filled = eligible.filter((o) => o.sold > 0);
    const marginal = filled.length ? filled[filled.length - 1].price : null;
    for (const o of offers) {
      if (o.price > cap) o.reason = 'over_cap';
      else if (o.sold === o.qty) o.reason = 'sold';
      else if (o.sold > 0) o.reason = 'partial';
      else if (marginal != null && o.price === marginal) o.reason = 'tie_lost';
      else o.reason = 'outbid';
      delete o.tie;
    }
    const soldQty = b.demand - left;
    const revenue = filled.reduce((a, o) => a + o.price * o.sold, 0);
    res.buyers.push({
      buyerId: b.id, name: b.name, sku: b.sku, skuName: b.skuName, ref: b.ref, demand: b.demand,
      offers, offersCount: offers.length, offeredQty: offers.reduce((a, o) => a + o.qty, 0),
      soldQty,
      minSoldPrice: filled.length ? Math.min(...filled.map((o) => o.price)) : null,
      maxSoldPrice: filled.length ? Math.max(...filled.map((o) => o.price)) : null,
      avgSoldPrice: soldQty ? revenue / soldQty : null,
    });
    // ตัดสต๊อกและบันทึกรายการขาย
    for (const o of filled) {
      const t = teamById[o.teamId];
      t.stock[b.sku] -= o.sold;
      if (t.stock[b.sku] < 0) throw new Error('inventory negative (bug)');
      t.lines.push({ round: game.round, buyerId: b.id, sku: b.sku, qty: o.sold, price: o.price, ref: b.ref, diff: round2(percentageDiff(o.price, b.ref)) });
    }
  }
  game.results.push(res);
  const isLast = game.round >= cfg.rounds;
  for (const t of game.teams) {
    t.score = teamScore(t, cfg, isLast);
    res.teamDeltas[t.id] = round2(t.score - before[t.id]);
  }
  res.leaderboard = leaderboard(game).map((r) => ({ teamId: r.teamId, rank: r.rank, score: r.score }));
  game.phase = isLast ? 'ended' : 'results';
  game.endsAt = null;
  game.pausedRemainingMs = null;
  game.version++;
  return res;
}

function nextRound(game, now = Date.now()) {
  if (game.phase !== 'results') throw new GameError('ยังไปรอบถัดไปไม่ได้');
  beginRound(game, now);
}

function pause(game, now = Date.now()) {
  if (game.phase !== 'bidding' || game.pausedRemainingMs != null) return;
  game.pausedRemainingMs = Math.max(0, game.endsAt - now);
  game.version++;
}
function resume(game, now = Date.now()) {
  if (game.pausedRemainingMs == null) return;
  game.endsAt = now + game.pausedRemainingMs;
  game.pausedRemainingMs = null;
  game.version++;
}
function extend(game, seconds, now = Date.now()) {
  if (game.phase !== 'bidding') return;
  if (game.pausedRemainingMs != null) game.pausedRemainingMs += seconds * 1000;
  else game.endsAt = Math.max(game.endsAt, now) + seconds * 1000;
  game.version++;
}

function leaderboard(game) {
  const rows = game.teams.map((t) => ({
    teamId: t.id, name: t.name, type: t.type, score: t.score,
    soldUnits: t.lines.reduce((a, l) => a + l.qty, 0),
    stockLeft: totalStock(t),
  }));
  rows.sort((a, b) => b.score - a.score || b.soldUnits - a.soldUnits || (a.name < b.name ? -1 : 1));
  let rank = 0;
  let prev = null;
  rows.forEach((r, i) => {
    if (!prev || r.score !== prev.score || r.soldUnits !== prev.soldUnits) rank = i + 1;
    r.rank = rank;
    prev = r;
  });
  return rows;
}

const REASON_TH = {
  sold: 'ขายได้ครบ',
  partial: 'ขายได้บางส่วน: ทีมที่ถูกกว่าเติมความต้องการไปก่อน เหลือให้ไม่พอ',
  outbid: 'ขายไม่ได้: ข้อเสนอที่ถูกกว่าเติมความต้องการจนเต็มก่อนถึงคิว',
  tie_lost: 'ขายไม่ได้: ราคาเท่ากับทีมอื่นที่ราคาขอบ แล้วแพ้การจับฉลาก (seed)',
  over_cap: 'ขายไม่ได้: ราคาเกินเพดานที่ผู้ซื้อยอมรับ',
};

/** มุมมองเฉพาะผู้เล่น (ไม่มีข้อมูลลับของทีมอื่น) */
function playerView(game, teamId, now = Date.now()) {
  const cfg = game.config;
  const team = game.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const lb = leaderboard(game);
  const me = lb.find((r) => r.teamId === teamId);
  const last = game.results[game.results.length - 1];
  let lastRound = null;
  if (last && (game.phase === 'results' || game.phase === 'ended' || game.phase === 'bidding')) {
    const mine = [];
    for (const b of last.buyers) {
      const o = b.offers.find((x) => x.teamId === teamId);
      if (o) mine.push({ buyerId: b.buyerId, buyerName: b.name, sku: b.sku, skuName: b.skuName, ref: b.ref, qty: o.qty, price: o.price, pct: pct(o.price, b.ref), sold: o.sold, reason: o.reason, reasonText: REASON_TH[o.reason], diff: round2(percentageDiff(o.price, b.ref)), maxSoldPct: cfg.revealLevel !== 'self' && b.soldQty ? pct(b.maxSoldPrice, b.ref) : null });
    }
    lastRound = { round: last.round, delta: last.teamDeltas[teamId] || 0, offers: mine, rank: last.leaderboard.find((r) => r.teamId === teamId)?.rank };
  }
  return {
    role: 'player',
    phase: game.phase,
    round: game.round,
    rounds: cfg.rounds,
    endsAt: game.endsAt,
    pausedRemainingMs: game.pausedRemainingMs,
    serverNow: now,
    config: publicConfig(cfg),
    team: { id: team.id, name: team.name, stock: team.stock, startStock: team.startStock, score: team.score, rank: me?.rank, lines: team.lines },
    buyers: game.phase === 'bidding' ? currentBuyers(game) : [],
    myOffers: game.offers[teamId] || [],
    submitted: game.submitted[teamId] || null,
    ready: humansReady(game),
    lobby: game.phase === 'lobby' ? { joined: game.teams.filter((t) => t.type === 'human').map((t) => t.name), seats: cfg.humans, bots: cfg.bots } : null,
    lastRound,
    history: publicHistory(game, teamId),
    leaderboard: lb.map((r) => ({ rank: r.rank, name: r.name, type: r.type, score: r.score, soldUnits: r.soldUnits, me: r.teamId === teamId })),
    totalTeams: game.teams.length,
    scoreSeries: game.results.map((r) => r.leaderboard.find((x) => x.teamId === teamId)?.score ?? 0),
    rankSeries: game.results.map((r) => r.leaderboard.find((x) => x.teamId === teamId)?.rank ?? null),
  };
}

function publicConfig(cfg) {
  const { seed, ...rest } = cfg;
  return rest;
}

function hostView(game, now = Date.now()) {
  const cfg = game.config;
  const lb = leaderboard(game);
  return {
    role: 'host',
    phase: game.phase,
    round: game.round,
    rounds: cfg.rounds,
    endsAt: game.endsAt,
    pausedRemainingMs: game.pausedRemainingMs,
    serverNow: now,
    config: cfg,
    humans: game.teams.filter((t) => t.type === 'human').map((t) => ({ id: t.id, name: t.name, submitted: game.submitted[t.id] || null, score: t.score, stock: totalStock(t) })),
    botCount: game.teams.filter((t) => t.type === 'bot').length,
    buyers: currentBuyers(game),
    ready: humansReady(game),
    lastResult: game.results.length ? summarizeResultForHost(game.results[game.results.length - 1]) : null,
    leaderboard: lb.map((r) => ({ ...r, style: r.type === 'bot' ? BOT_STYLE_TH[game.teams.find((t) => t.id === r.teamId).botStyle] : null })),
    roundScores: roundScoreSeries(game),
    history: publicHistory(game, null, 'range'),
  };
}

function summarizeResultForHost(res) {
  return {
    round: res.round,
    buyers: res.buyers.map((b) => ({
      name: b.name, skuName: b.skuName, ref: b.ref, demand: b.demand, soldQty: b.soldQty, offersCount: b.offersCount, offeredQty: b.offeredQty,
      minSoldPct: b.soldQty ? pct(b.minSoldPrice, b.ref) : null, maxSoldPct: b.soldQty ? pct(b.maxSoldPrice, b.ref) : null,
      avgSoldPct: b.soldQty ? pct(b.avgSoldPrice, b.ref) : null,
    })),
  };
}

/** คะแนนสะสมรายรอบของคนจริง (ไว้วาดกราฟบนจอผู้จัด) */
function roundScoreSeries(game) {
  return game.teams.filter((t) => t.type === 'human').map((t) => ({
    name: t.name,
    series: game.results.map((r) => r.leaderboard.find((x) => x.teamId === t.id)?.score ?? 0),
  }));
}

function exportCSV(game) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [['round', 'buyer', 'sku', 'ref_price', 'demand', 'team', 'team_type', 'offer_qty', 'offer_price', 'offer_pct', 'sold_qty', 'result']];
  for (const res of game.results) {
    for (const b of res.buyers) {
      if (!b.offers.length) rows.push([res.round, b.name, b.sku, b.ref, b.demand, '', '', '', '', '', 0, 'no_offers']);
      for (const o of b.offers) {
        const t = game.teams.find((x) => x.id === o.teamId);
        rows.push([res.round, b.name, b.sku, b.ref, b.demand, o.teamName, t?.type, o.qty, o.price, pct(o.price, b.ref), o.sold, o.reason]);
      }
    }
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}

module.exports = {
  GameError, createGame, updateConfig, addHuman, removeTeam, startGame, submitOffers, closeRound, nextRound,
  pause, resume, extend, leaderboard, playerView, hostView, humansReady, currentBuyers, exportCSV, REASON_TH,
};
