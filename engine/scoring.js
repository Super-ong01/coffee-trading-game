'use strict';
// ระบบคะแนน (โมเดลสมมติ เลือกได้ A/B/C)
// percentage_diff = (ราคาขายจริง - ราคากลาง) / ราคากลาง * 100

function percentageDiff(price, ref) {
  return ((price - ref) / ref) * 100;
}

function adjustedDiff(diff, belowRef) {
  return belowRef === 'zero' && diff < 0 ? 0 : diff;
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * lines = รายการที่ขายสำเร็จ [{qty, price, ref}]
 * A: sum(diff ต่อรายการ)   B: sum(diff × จำนวน)   C: average(diff ต่อรายการ)
 */
function scoreLines(lines, formula, belowRef) {
  if (!lines.length) return 0;
  const diffs = lines.map((l) => adjustedDiff(percentageDiff(l.price, l.ref), belowRef));
  if (formula === 'A') return round2(diffs.reduce((a, d) => a + d, 0));
  if (formula === 'C') return round2(diffs.reduce((a, d) => a + d, 0) / diffs.length);
  return round2(diffs.reduce((a, d, i) => a + d * lines[i].qty, 0));
}

function teamScore(team, cfg, ended) {
  let s = scoreLines(team.lines, cfg.formula, cfg.belowRef);
  if (ended && cfg.unsoldPenalty > 0) s -= cfg.unsoldPenalty * totalStock(team);
  return round2(s);
}

function totalStock(team) {
  return Object.values(team.stock).reduce((a, b) => a + b, 0);
}

module.exports = { percentageDiff, adjustedDiff, scoreLines, teamScore, totalStock, round2 };
