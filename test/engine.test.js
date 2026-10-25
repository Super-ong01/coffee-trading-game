'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../engine/game');
const { scoreLines } = require('../engine/scoring');
const { advise } = require('../engine/advisor');
const { buildSummary } = require('../engine/summary');
const { publicHistory } = require('../engine/market');

/** เกมควบคุมได้: คนจริง n ทีม ไม่มีบอท ผู้ซื้อ 1 ราย SKU เดียว */
function controlled(n, { demand = 10, ref = 1000, stock = 10, cfg = {} } = {}) {
  const g = G.createGame({ humans: n, bots: 0, rounds: 3, buyersPerRound: 1, fillEmptyWithBots: false, skus: [{ id: 'X', name: 'กาแฟ X', ref }], stockMode: 'single', stockPerTeam: stock, ...cfg });
  const teams = [];
  for (let i = 0; i < n; i++) teams.push(G.addHuman(g, 'T' + i));
  G.startGame(g, 0);
  for (const b of g.buyers.flat()) b.demand = demand;
  return { g, teams, buyer: () => G.currentBuyers(g)[0] };
}

test('matching: ผู้ซื้อเลือกราคาต่ำก่อน และขายบางส่วนได้', () => {
  const { g, teams, buyer } = controlled(3, { demand: 10 });
  const b = buyer();
  G.submitOffers(g, teams[0].id, [{ buyerId: b.id, qty: 6, price: 1300 }]);
  G.submitOffers(g, teams[1].id, [{ buyerId: b.id, qty: 6, price: 1100 }]);
  G.submitOffers(g, teams[2].id, [{ buyerId: b.id, qty: 6, price: 1200 }]);
  const res = G.closeRound(g);
  const o = Object.fromEntries(res.buyers[0].offers.map((x) => [x.teamName, x]));
  assert.equal(o.T1.sold, 6);
  assert.equal(o.T2.sold, 4);
  assert.equal(o.T2.reason, 'partial');
  assert.equal(o.T0.sold, 0);
  assert.equal(o.T0.reason, 'outbid');
  assert.equal(res.buyers[0].soldQty, 10);
});

test('ไม่ซื้อเกิน demand และไม่ขายเกินสต๊อก / สต๊อกไม่ติดลบ', () => {
  const { g, teams, buyer } = controlled(2, { demand: 3, stock: 5 });
  assert.throws(() => G.submitOffers(g, teams[0].id, [{ buyerId: buyer().id, qty: 6, price: 1000 }]), /สต๊อก/);
  G.submitOffers(g, teams[0].id, [{ buyerId: buyer().id, qty: 5, price: 1000 }]);
  G.submitOffers(g, teams[1].id, [{ buyerId: buyer().id, qty: 5, price: 1000 }]);
  const res = G.closeRound(g);
  assert.equal(res.buyers[0].soldQty, 3);
  const totalSold = res.buyers[0].offers.reduce((a, o) => a + o.sold, 0);
  assert.equal(totalSold, 3);
  for (const t of g.teams) assert.ok(t.stock.X >= 0);
});

test('ราคาเกินเพดานขายไม่ได้', () => {
  const { g, teams, buyer } = controlled(1, { cfg: { priceCapPct: 150 } });
  G.submitOffers(g, teams[0].id, [{ buyerId: buyer().id, qty: 2, price: 1600 }]);
  const res = G.closeRound(g);
  assert.equal(res.buyers[0].offers[0].reason, 'over_cap');
  assert.equal(g.teams[0].stock.X, 10);
});

test('คู่แข่งไม่เสนอขาย → ขายแพงได้ภายใต้เพดาน', () => {
  const { g, teams, buyer } = controlled(2, { demand: 5 });
  G.submitOffers(g, teams[0].id, [{ buyerId: buyer().id, qty: 5, price: 1450 }]);
  G.submitOffers(g, teams[1].id, [], true); // ไม่ขาย
  const res = G.closeRound(g);
  assert.equal(res.buyers[0].offers[0].sold, 5);
  assert.equal(g.teams[0].score, 225); // 45% × 5
  assert.equal(g.submitted[teams[1].id], 'skip');
});

test('ราคาถูกสุดไม่ได้แปลว่าคะแนนมากสุดเสมอ', () => {
  const { g, teams, buyer } = controlled(2, { demand: 10 });
  G.submitOffers(g, teams[0].id, [{ buyerId: buyer().id, qty: 5, price: 900 }]);  // ถูกสุด
  G.submitOffers(g, teams[1].id, [{ buyerId: buyer().id, qty: 5, price: 1300 }]);
  G.closeRound(g);
  assert.ok(g.teams[1].score > g.teams[0].score);
  assert.ok(g.teams[0].score < 0);
});

test('สูตรคะแนน A/B/C และกรณีต่ำกว่าราคากลาง', () => {
  const lines = [{ qty: 2, price: 1200, ref: 1000 }, { qty: 4, price: 900, ref: 1000 }];
  assert.equal(scoreLines(lines, 'A', 'negative'), 10);
  assert.equal(scoreLines(lines, 'B', 'negative'), 0);   // 20×2 − 10×4
  assert.equal(scoreLines(lines, 'C', 'negative'), 5);
  assert.equal(scoreLines(lines, 'A', 'zero'), 20);
  assert.equal(scoreLines(lines, 'B', 'zero'), 40);
  assert.equal(scoreLines(lines, 'C', 'zero'), 10);
  assert.equal(scoreLines([], 'C', 'negative'), 0);
});

test('ราคาเท่ากัน: tie-break ด้วย seed ให้ผลเหมือนเดิมทุกครั้ง', () => {
  const run = () => {
    const { g, teams, buyer } = controlled(3, { demand: 4 });
    for (const t of teams) G.submitOffers(g, t.id, [{ buyerId: buyer().id, qty: 4, price: 1100 }]);
    return G.closeRound(g).buyers[0].offers.map((o) => o.teamName + ':' + o.sold + ':' + o.reason).join(',');
  };
  const a = run();
  assert.equal(a, run());
  assert.match(a, /tie_lost/);
});

function fullGame(seed, humanAction) {
  const g = G.createGame({ humans: 2, bots: 48, seed });
  const h = [G.addHuman(g, 'A'), G.addHuman(g, 'B')];
  G.startGame(g, 0);
  while (g.phase !== 'ended') {
    for (const t of h) humanAction(g, t);
    G.closeRound(g);
    if (g.phase === 'results') G.nextRound(g, 0);
  }
  return g;
}
const simpleHuman = (g, t) => {
  const team = g.teams.find((x) => x.id === t.id);
  const offers = [];
  const used = {};
  for (const b of G.currentBuyers(g)) {
    const left = (team.stock[b.sku] || 0) - (used[b.sku] || 0);
    if (left > 0) { offers.push({ buyerId: b.id, qty: 1, price: Math.round(b.ref * 1.15) }); used[b.sku] = (used[b.sku] || 0) + 1; }
  }
  G.submitOffers(g, t.id, offers, !offers.length);
};

test('seed เดียวกัน + การกระทำเดียวกัน = ผลเหมือนกัน; ครบ 15 รอบแล้วจบเกม', () => {
  const a = fullGame('s1', simpleHuman);
  const b = fullGame('s1', simpleHuman);
  assert.equal(a.phase, 'ended');
  assert.equal(a.results.length, 15);
  assert.deepEqual(G.leaderboard(a).map((r) => [r.name, r.score]), G.leaderboard(b).map((r) => [r.name, r.score]));
  const c = fullGame('s2', simpleHuman);
  assert.notDeepEqual(G.leaderboard(a).map((r) => r.score), G.leaderboard(c).map((r) => r.score));
});

test('ทั้งเกม 50 ทีม: ไม่ขายเกินสต๊อก/ความต้องการ และสต๊อกไม่ติดลบ', () => {
  const g = fullGame('inv', simpleHuman);
  assert.equal(g.teams.length, 50);
  for (const res of g.results) for (const b of res.buyers) {
    assert.ok(b.soldQty <= b.demand);
    for (const o of b.offers) assert.ok(o.sold <= o.qty);
  }
  for (const t of g.teams) {
    const start = Object.values(t.startStock).reduce((a, x) => a + x, 0);
    const sold = t.lines.reduce((a, l) => a + l.qty, 0);
    const left = Object.values(t.stock).reduce((a, x) => a + x, 0);
    assert.equal(start, 10);
    assert.equal(start, sold + left);
    for (const v of Object.values(t.stock)) assert.ok(v >= 0);
  }
});

test('จำนวนคนจริง/บอทตั้งได้, ต้องเข้าครบก่อนเริ่ม, หรือเลือกเติมบอทได้', () => {
  const g0 = G.createGame({ humans: 3, bots: 47 });
  G.addHuman(g0, 'a'); G.addHuman(g0, 'b');
  assert.throws(() => G.startGame(g0, 0), /ยังเข้าไม่ครบ/); // ค่าเริ่มต้น: ต้องเข้าครบก่อน
  G.addHuman(g0, 'c');
  G.startGame(g0, 0);
  assert.equal(g0.teams.length, 50);
  const g = G.createGame({ humans: 5, bots: 45, requireFullSeats: false });
  G.addHuman(g, 'หนึ่ง'); G.addHuman(g, 'สอง');
  G.startGame(g, 0);
  assert.equal(g.teams.length, 50);
  assert.equal(g.teams.filter((t) => t.type === 'human').length, 2);
  const g2 = G.createGame({ humans: 1, bots: 10, requireFullSeats: false, fillEmptyWithBots: false });
  G.startGame(g2, 0);
  assert.equal(g2.teams.length, 10);
  const g3 = G.createGame({ humans: 1, bots: 3 });
  G.addHuman(g3, 'x');
  assert.throws(() => G.addHuman(g3, 'y'), /เต็ม/);
});

test('บอทไม่เห็น bid ของรอบปัจจุบัน (ตัดสินใจก่อนคนจริงส่ง และไม่เปลี่ยนตาม)', () => {
  const g = G.createGame({ humans: 1, bots: 20, seed: 'peek' });
  const h = G.addHuman(g, 'me');
  G.startGame(g, 0);
  const botBefore = JSON.stringify(Object.entries(g.offers).filter(([k]) => k !== h.id));
  const b = G.currentBuyers(g)[0];
  const team = g.teams.find((t) => t.id === h.id);
  if (team.stock[b.sku]) G.submitOffers(g, h.id, [{ buyerId: b.id, qty: 1, price: Math.round(b.ref * 0.5) }]);
  assert.equal(JSON.stringify(Object.entries(g.offers).filter(([k]) => k !== h.id)), botBefore);
});

test('มุมมองผู้เล่นไม่มีราคาของทีมอื่นในรอบที่ยังไม่ปิด', () => {
  const g = G.createGame({ humans: 1, bots: 10 });
  const h = G.addHuman(g, 'me');
  G.startGame(g, 0);
  const v = G.playerView(g, h.id);
  const s = JSON.stringify(v);
  assert.ok(!s.includes('"offers":{'));
  assert.equal(v.history.length, 0);
  assert.ok(!('seed' in v.config));
});

test('AI ที่ปรึกษา: ตลาดราคาสูง → แนะนำราคาสูงขึ้น, อยู่ในเพดาน, ใช้ข้อมูลที่เห็นเท่านั้น', () => {
  const cfg = G.createGame({}).config;
  const mk = (ratio) => Array.from({ length: 8 }, (_, i) => ({ round: i + 1, buyerId: 'b' + i, sku: 'ROB-A', ref: 1400, demand: 5, soldQty: 5, unfilled: 0, offersCount: 6, offeredQty: 12, minSoldPct: ratio * 100 - 10, maxSoldPct: ratio * 100, avgSoldPct: ratio * 100 - 5 }));
  const base = { config: cfg, round: 9, rounds: 15, phase: 'results', stock: { 'ROB-A': 6 }, buyers: [], profile: 'balanced' };
  const low = advise({ ...base, history: mk(1.0) });
  const high = advise({ ...base, history: mk(1.35) });
  assert.ok(high.skus[0].recommendPct > low.skus[0].recommendPct);
  assert.ok(high.skus[0].recommendPct <= cfg.priceCapPct);
  assert.equal(high.skus[0].confidence, 'สูง');
  const cons = advise({ ...base, history: mk(1.2), profile: 'conservative' });
  const aggr = advise({ ...base, history: mk(1.2), profile: 'aggressive' });
  assert.ok(cons.skus[0].recommendPct <= aggr.skus[0].recommendPct);
  assert.ok(cons.skus[0].pSell >= aggr.skus[0].pSell);
});

test('AI ที่ปรึกษา: รอบสุดท้ายแนะนำขายหมด และเมื่อไม่มีข้อมูลบอกว่าอิงสมมติฐาน', () => {
  const cfg = G.createGame({}).config;
  const a = advise({ config: cfg, round: 15, rounds: 15, phase: 'bidding', stock: { 'ROB-G': 4 }, history: [], buyers: [{ id: 'R15B1', name: 'ผู้ซื้อ #1', sku: 'ROB-G', ref: 500, demand: 9 }], profile: 'balanced' });
  assert.equal(a.skus[0].qtyNow, 4);
  assert.equal(a.skus[0].perBuyer[0].qty, 4);
  assert.match(a.notes.join(' '), /สมมติฐาน/);
});

test('สรุปข้อมูลสำหรับ AI มีหัวข้อสำคัญครบ', () => {
  const g = fullGame('sum', simpleHuman);
  const txt = buildSummary(g, g.teams.find((t) => t.name === 'A').id);
  for (const s of ['## กติกา', '## สถานะทีมของฉัน', '## ผลตลาดย้อนหลัง', '## ประวัติข้อเสนอของฉัน', 'percentage_diff']) assert.ok(txt.includes(s), s);
  assert.ok(publicHistory(g, null).length === 15 * 6);
});

test('ค่าเริ่มต้น: โรบัสต้าชนิดเดียว 7 เกรด A–G และเกมเล่นจบได้', () => {
  const cfg = G.createGame({}).config;
  assert.deepEqual(cfg.skus.map((s) => s.id), ['ROB-A', 'ROB-B', 'ROB-C', 'ROB-D', 'ROB-E', 'ROB-F', 'ROB-G']);
  assert.ok(cfg.skus.every((s, i, a) => i === 0 || s.ref < a[i - 1].ref)); // A แพงสุด
  const g = fullGame('grades', simpleHuman);
  for (const b of g.buyers.flat()) assert.match(b.sku, /^ROB-[A-G]$/);
  assert.equal(g.phase, 'ended');
});
