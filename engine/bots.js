'use strict';
// บอทแบบ rule-based หลายนิสัย ใช้เฉพาะข้อมูลตลาดที่เปิดเผยแล้ว + สต๊อกของตัวเอง
const { rngFor, pickWeighted } = require('./rng');
const { clearingObservations, ewmaClearing, publicHistory } = require('./market');

function styleRatio(style, rng, info, capRatio, roundsLeft) {
  const r = rng();
  const clear = info ? info.ratio : null;
  let x;
  switch (style) {
    case 'undercut': x = 0.86 + 0.12 * r; break;
    case 'fair': x = 0.98 + 0.12 * r; break;
    case 'premium': x = 1.18 + 0.25 * r; break;
    case 'saver': x = 1.08 + 0.2 * r; break;
    case 'opportunist':
      if (info && info.lastUnfilled) x = capRatio * (0.9 + 0.1 * r);
      else x = clear ? clear * (0.96 + 0.08 * r) : 1.02 + 0.15 * r;
      break;
    case 'adaptive': x = clear ? clear * (0.9 + 0.08 * r) : 1.0 + 0.1 * r; break;
    default: x = 0.8 + 0.7 * r; // random
  }
  if (roundsLeft <= 2 && style !== 'premium' && style !== 'random') x *= 0.95; // เร่งระบายของช่วงท้าย
  return Math.max(0.6, Math.min(x, capRatio * 1.05));
}

function qtyFraction(style, roundsLeft, appearProb) {
  if (roundsLeft <= 1) return 1;
  const opportunities = Math.max(1, roundsLeft * appearProb);
  let f = 1 / opportunities;
  if (style === 'undercut') f *= 1.6;
  if (style === 'saver') f *= 0.5;
  if (style === 'premium') f *= 1.2;
  return Math.min(1, f);
}

/** คืนรายการข้อเสนอของบอทหนึ่งตัวในรอบปัจจุบัน */
function botOffers(game, team) {
  const cfg = game.config;
  const round = game.round;
  const buyers = game.buyers[round - 1];
  const rng = rngFor(cfg.seed, 'bot', round, team.id);
  const roundsLeft = cfg.rounds - round + 1;
  const capRatio = cfg.priceCapPct / 100;
  const rows = publicHistory(game, team.id);
  const info = ewmaClearing(clearingObservations(rows, cfg.priceCapPct));
  const pastRounds = Math.max(1, round - 1);
  const offers = [];

  for (const [sku, stock] of Object.entries(team.stock)) {
    if (stock <= 0) continue;
    const bs = buyers.filter((b) => b.sku === sku);
    if (!bs.length) continue;
    if (team.botStyle === 'saver' && roundsLeft > 2 && rng() < 0.45) continue; // รอขายรอบหลัง
    const seen = rows.filter((r) => r.sku === sku).length;
    const appear = round > 1 ? Math.min(1, Math.max(0.25, seen / pastRounds)) : 0.6;
    let qty = Math.round(stock * qtyFraction(team.botStyle, roundsLeft, appear) + rng() * 0.8);
    qty = Math.max(1, Math.min(stock, qty));
    const ratio = styleRatio(team.botStyle, rng, info[sku], capRatio, roundsLeft);
    // เลือกผู้ซื้อแบบถ่วงน้ำหนักตามจำนวนที่ต้องการ (ผู้ซื้อที่ต้องการมากมีโอกาสถูกเลือกมาก)
    const buyer = pickWeighted(rng, bs, bs.map((b) => b.demand));
    const minPrice = Math.ceil(buyer.ref * cfg.priceFloorPct / 100);
    offers.push({ buyerId: buyer.id, qty, price: Math.max(minPrice, Math.round(buyer.ref * ratio)) });
  }
  return offers;
}

module.exports = { botOffers };
