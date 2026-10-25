'use strict';
// ข้อมูลตลาดที่ "มองเห็นได้จริง" หลังปิดรอบ ตามระดับการเปิดเผยที่ผู้จัดตั้ง
// ทั้งคนจริง บอท และ AI ที่ปรึกษา ใช้ข้อมูลชุดนี้เท่านั้น (ไม่เห็น bid ของรอบปัจจุบัน)

const pct = (price, ref) => Math.round((price / ref) * 1000) / 10;

/** สรุปผู้ซื้อหนึ่งรายในหนึ่งรอบ สำหรับผู้ชม (viewerTeamId) ตาม revealLevel */
function publicBuyer(round, b, level, viewerTeamId) {
  const out = {
    round,
    buyerId: b.buyerId,
    name: b.name,
    sku: b.sku,
    skuName: b.skuName,
    ref: b.ref,
    demand: b.demand,
    soldQty: b.soldQty,
    unfilled: b.demand - b.soldQty,
    offersCount: b.offersCount,
  };
  if (level === 'range' || level === 'all') {
    out.offeredQty = b.offeredQty;
    out.minSoldPct = b.soldQty ? pct(b.minSoldPrice, b.ref) : null;
    out.maxSoldPct = b.soldQty ? pct(b.maxSoldPrice, b.ref) : null;
    out.avgSoldPct = b.soldQty ? pct(b.avgSoldPrice, b.ref) : null;
  }
  if (level === 'all') {
    out.bids = b.offers
      .map((o) => ({ teamId: o.teamId, teamName: o.teamName, price: o.price, pct: pct(o.price, b.ref), qty: o.qty, sold: o.sold }))
      .sort((x, y) => x.price - y.price);
  }
  const mine = viewerTeamId ? b.offers.find((o) => o.teamId === viewerTeamId) : null;
  if (mine) out.mine = { qty: mine.qty, price: mine.price, pct: pct(mine.price, b.ref), sold: mine.sold, reason: mine.reason };
  return out;
}

function publicHistory(game, viewerTeamId, level) {
  const lv = level || game.config.revealLevel;
  const rows = [];
  for (const res of game.results) {
    for (const b of res.buyers) rows.push(publicBuyer(res.round, b, lv, viewerTeamId));
  }
  return rows;
}

/**
 * สถิติราคาตัดสิน (clearing) ต่อ SKU จากข้อมูลที่มองเห็น
 * observation = อัตราส่วนราคา/ราคากลาง ที่ผู้ซื้อยังยอมซื้อ
 *  - ถ้าผู้ซื้อซื้อครบ: ใช้ราคาขายสูงสุด (ราคาขอบ)
 *  - ถ้าผู้ซื้อยังขาด (มีของไม่พอ): ตลาดตึง -> ใช้เพดานราคา (censored)
 *  - ถ้าเห็นแค่ผลของตัวเอง: ขายได้ = clearing >= ราคาเรา, ขายไม่ได้ = clearing < ราคาเรา
 */
function clearingObservations(rows, capPct) {
  const bySku = {};
  for (const r of rows) {
    let obs = null;
    let weightNote = '';
    if (r.maxSoldPct != null || r.offeredQty != null) {
      if (r.unfilled > 0) { obs = capPct / 100; weightNote = 'unfilled'; }
      else if (r.maxSoldPct != null) obs = r.maxSoldPct / 100;
    } else if (r.mine) {
      if (r.mine.reason === 'over_cap') obs = null;
      else if (r.mine.sold >= r.mine.qty) obs = Math.min(capPct, r.mine.pct + 3) / 100;
      else if (r.mine.sold > 0) obs = r.mine.pct / 100;
      else obs = Math.max(50, r.mine.pct - 5) / 100;
    } else if (r.unfilled > 0) {
      obs = capPct / 100; weightNote = 'unfilled';
    }
    if (obs == null) continue;
    (bySku[r.sku] ||= []).push({ round: r.round, ratio: obs, demand: r.demand, unfilled: r.unfilled, note: weightNote });
  }
  return bySku;
}

/** EWMA ของ log(ratio) ต่อ SKU (ใช้กับบอทสาย adaptive/opportunist) */
function ewmaClearing(obsBySku, lambda = 0.6) {
  const out = {};
  for (const [sku, list] of Object.entries(obsBySku)) {
    let m = null;
    for (const o of list.slice().sort((a, b) => a.round - b.round)) {
      const x = Math.log(o.ratio);
      m = m == null ? x : lambda * x + (1 - lambda) * m;
    }
    const last = list[list.length - 1];
    out[sku] = { ratio: Math.exp(m), lastUnfilled: last.unfilled > 0, n: list.length };
  }
  return out;
}

module.exports = { publicBuyer, publicHistory, clearingObservations, ewmaClearing, pct };
