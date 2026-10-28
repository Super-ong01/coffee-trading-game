'use strict';
// สร้างข้อความสรุปสำหรับ "คัดลอกไปให้ AI" (Claude, ChatGPT ฯลฯ)
const { publicHistory, gradeTrend } = require('./market');
const { leaderboard, currentBuyers, REASON_TH } = require('./game');
const { advise } = require('./advisor');

const LEVEL_TH = { self: 'เห็นเฉพาะผลของตัวเอง', range: 'เห็นช่วงราคาที่ขายได้ของผู้ซื้อแต่ละราย', all: 'เห็นราคาทุกทีมหลังปิดรอบ' };
const FORMULA_TH = {
  A: 'A = ผลรวม percentage_diff ต่อรายการที่ขายได้',
  B: 'B = ผลรวม (percentage_diff × จำนวนที่ขายได้)',
  C: 'C = ค่าเฉลี่ย percentage_diff ของรายการที่ขายได้',
};

function f(v, d = 1) { return v == null ? '-' : Number(v).toFixed(d).replace(/\.0+$/, ''); }

function buildSummary(game, teamId) {
  const cfg = game.config;
  const team = game.teams.find((t) => t.id === teamId);
  if (!team) return '';
  const u = cfg.unitName;
  const rows = publicHistory(game, teamId);
  const lb = leaderboard(game);
  const me = lb.find((r) => r.teamId === teamId);
  const L = [];
  L.push('# ข้อมูลเกมจำลองการขายเมล็ดกาแฟ (สำหรับให้ AI วิเคราะห์)');
  L.push('');
  L.push('สินค้าคือเมล็ดกาแฟโรบัสต้าชนิดเดียว แบ่งเป็นเกรด A–G (แต่ละเกรดมีราคากลางต่างกัน) ช่วยวิเคราะห์ข้อมูลด้านล่าง แล้วแนะนำว่ารอบถัดไปทีมของฉันควรเสนอขายเกรดไหน ให้ผู้ซื้อรายใด จำนวนเท่าไร และราคาต่อหน่วยเท่าไร (หรือควรไม่ขายรอบนี้) พร้อมเหตุผล ความเสี่ยง และสิ่งที่ยังไม่แน่นอน');
  L.push('');
  L.push('## กติกา (บางข้อเป็นสมมติฐานของเกมจำลอง)');
  L.push(`- ทีมทั้งหมด ${lb.length} ทีม, ${cfg.rounds} รอบ, ผู้ซื้อ ${cfg.buyersPerRound} รายต่อรอบ, รอบละ ${Math.round(cfg.roundSeconds / 60)} นาที`);
  L.push('- ทุกทีมยื่นราคาพร้อมกันโดยไม่เห็นราคากัน ผู้ซื้อรับข้อเสนอที่ตรง SKU และไม่เกินเพดาน เรียงจากราคาต่ำไปสูง ซื้อจนครบจำนวนที่ต้องการ (ขายบางส่วนได้)');
  L.push(`- เพดานราคา ${cfg.priceCapPct}% ของราคากลาง, ราคาต่ำสุดที่เสนอได้ ${cfg.priceFloorPct}%, ราคาเท่ากันตัดสินด้วยการสุ่ม`);
  L.push(`- ราคาขายจริง = ราคาที่ยื่น (pay-as-bid)`);
  L.push(`- percentage_diff = (ราคาขายจริง − ราคากลาง) / ราคากลาง × 100`);
  L.push(`- สูตรคะแนน: ${FORMULA_TH[cfg.formula]}; ขายต่ำกว่าราคากลาง${cfg.belowRef === 'zero' ? 'นับเป็น 0' : 'คะแนนติดลบ'}; ของที่ขายไม่ได้ไม่ได้คะแนน${cfg.unsoldPenalty ? `; จบเกมหัก ${cfg.unsoldPenalty} คะแนนต่อ${u}ที่เหลือ` : ''}`);
  L.push(`- ระดับข้อมูลที่เปิดเผยหลังรอบ: ${LEVEL_TH[cfg.revealLevel]}`);
  L.push('');
  L.push('## สถานะทีมของฉัน');
  const decisionRound = game.phase === 'bidding' ? game.round : game.round + 1;
  L.push(`- ทีม: ${team.name} | สถานะเกม: ${game.phase} | รอบปัจจุบัน ${game.round}/${cfg.rounds} | รอบที่ต้องตัดสินใจถัดไป: ${decisionRound > cfg.rounds ? 'เกมจบแล้ว' : decisionRound}`);
  L.push(`- คะแนน ${f(team.score, 2)} | อันดับ ${me?.rank}/${lb.length}`);
  L.push(`- สต๊อกคงเหลือ: ${Object.entries(team.stock).map(([k, v]) => `${skuName(cfg, k)} (${k}, ราคากลาง ${skuRef(cfg, k)}) = ${v} ${u}`).join('; ') || 'หมด'}`);
  L.push('');
  L.push('## ราคากลางแต่ละเกรด');
  for (const s of cfg.skus) L.push(`- ${s.id}: ${s.name} = ${s.ref} บาท/${u}`);
  L.push('');
  if (game.phase === 'bidding') {
    L.push(`## ผู้ซื้อรอบปัจจุบัน (รอบ ${game.round}) — ยังไม่ปิดรอบ`);
    L.push('| ผู้ซื้อ | SKU | ราคากลาง | ต้องการ |');
    L.push('|---|---|---|---|');
    for (const b of currentBuyers(game)) L.push(`| ${b.name} | ${b.sku} | ${b.ref} | ${b.demand} |`);
    L.push('');
  }
  L.push('## ผลตลาดย้อนหลัง (ข้อมูลที่มองเห็นได้)');
  if (!rows.length) L.push('- ยังไม่มีรอบที่ปิดแล้ว');
  else {
    const hasRange = cfg.revealLevel !== 'self';
    L.push(hasRange
      ? '| รอบ | ผู้ซื้อ | SKU | ราคากลาง | ต้องการ | ขายได้รวม | จำนวนข้อเสนอ | จำนวนที่ถูกเสนอรวม | ราคาขายต่ำสุด% | ราคาขายสูงสุด% | เฉลี่ย% | ของฉัน |'
      : '| รอบ | ผู้ซื้อ | SKU | ราคากลาง | ต้องการ | ขายได้รวม | จำนวนข้อเสนอ | ของฉัน |');
    L.push(hasRange ? '|---|---|---|---|---|---|---|---|---|---|---|---|' : '|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const mine = r.mine ? `เสนอ ${r.mine.qty}@${r.mine.price} (${f(r.mine.pct)}%) ขายได้ ${r.mine.sold}` : '-';
      L.push(hasRange
        ? `| ${r.round} | ${r.name} | ${r.sku} | ${r.ref} | ${r.demand} | ${r.soldQty} | ${r.offersCount} | ${r.offeredQty} | ${f(r.minSoldPct)} | ${f(r.maxSoldPct)} | ${f(r.avgSoldPct)} | ${mine} |`
        : `| ${r.round} | ${r.name} | ${r.sku} | ${r.ref} | ${r.demand} | ${r.soldQty} | ${r.offersCount} | ${mine} |`);
    }
    if (cfg.revealLevel === 'all') {
      L.push('');
      L.push('### ราคาทุกข้อเสนอ (รอบล่าสุด)');
      for (const r of rows.filter((x) => x.round === game.results.length)) {
        L.push(`- ${r.name} (${r.sku}): ` + (r.bids || []).map((b) => `${f(b.pct)}%×${b.qty}${b.sold ? `✓${b.sold}` : ''}`).join(', '));
      }
    }
  }
  L.push('');
  if (rows.length && cfg.revealLevel !== 'self') {
    L.push('## แนวโน้มราคาที่ขายได้ของแต่ละเกรด (รวมผู้ซื้อทุกรายของเกรดนั้นในรอบเดียวกัน)');
    L.push('| เกรด | รอบ | ราคากลาง | ต้องการ | ขายได้ | ถูกสุด% | ถูกสุด฿ | เฉลี่ย% | แพงสุด% | แพงสุด฿ |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const t of gradeTrend(rows)) {
      const baht = (p) => (p == null ? '-' : Math.round((t.ref * p) / 100));
      L.push(`| ${t.skuName} | ${t.round} | ${t.ref} | ${t.demand} | ${t.sold} | ${f(t.min)} | ${baht(t.min)} | ${f(t.avg)} | ${f(t.max)} | ${baht(t.max)} |`);
    }
    L.push('');
  }
  L.push('## ประวัติข้อเสนอของฉัน');
  const my = rows.filter((r) => r.mine);
  if (!my.length) L.push('- ยังไม่เคยเสนอขาย');
  for (const r of my) L.push(`- รอบ ${r.round} ${r.name} ${r.sku}: เสนอ ${r.mine.qty} ${u} ที่ ${r.mine.price} บาท (${f(r.mine.pct)}%) → ขายได้ ${r.mine.sold} (${REASON_TH[r.mine.reason]})`);
  L.push('');
  L.push('## คะแนนสะสมรายรอบของฉัน');
  L.push(game.results.map((res) => `R${res.round}: ${f(res.leaderboard.find((x) => x.teamId === teamId)?.score, 2)}`).join(' | ') || '-');
  L.push('');
  L.push('## อันดับ 10 ทีมแรก');
  for (const r of lb.slice(0, 10)) L.push(`${r.rank}. ${r.name} — ${f(r.score, 2)} คะแนน (ขายแล้ว ${r.soldUnits} ${u})`);
  L.push('');
  const adv = advise({ config: cfg, round: game.round, rounds: cfg.rounds, phase: game.phase, stock: team.stock, history: rows, buyers: game.phase === 'bidding' ? currentBuyers(game) : [], profile: 'balanced' });
  L.push('## ความเห็นจาก AI สถิติในเกม (ออฟไลน์, โปรไฟล์สมดุล) — ใช้เป็นข้อมูลประกอบ');
  L.push(`วิธี: ${adv.method}`);
  for (const s of adv.skus) {
    L.push(`- ${s.sku}: แนะนำ ${s.action === 'hold' ? 'ไม่ขาย/รอ' : `${s.recommendPct}% (${s.recommendPrice} บาท) จำนวน ${s.qtyNow}`} | P(ขายได้) ≈ ${f(s.pSell * 100, 0)}% | E ≈ ${s.expectedPerUnit}/หน่วย | ความมั่นใจ ${s.confidence}`);
  }
  for (const n of adv.notes) L.push(`- หมายเหตุ: ${n}`);
  L.push('');
  L.push('หมายเหตุ: นี่คือเกมจำลอง กติกาบางข้อเป็นสมมติฐาน คู่แข่งส่วนใหญ่เป็นบอทที่มีนิสัยต่างกัน (ตัดราคา, ราคากลาง, พรีเมียม, เก็บสต๊อก, ฉวยโอกาส, ปรับตัว, สุ่ม)');
  return L.join('\n');
}

function skuName(cfg, id) { return cfg.skus.find((s) => s.id === id)?.name || id; }
function skuRef(cfg, id) { return cfg.skus.find((s) => s.id === id)?.ref || '-'; }

module.exports = { buildSummary };
