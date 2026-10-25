'use strict';
/*
 * AI ที่ปรึกษาราคา (ออฟไลน์ ไม่เรียก API ใดๆ) ใช้แนวคิดทางการเงิน:
 *  1) EWMA (Exponentially Weighted Moving Average, แบบ RiskMetrics) ประมาณ "ราคาตัดสิน" ของแต่ละ SKU
 *     ให้น้ำหนักรอบล่าสุดมากกว่า
 *  2) Bayesian shrinkage: ข้อมูลน้อย -> ดึงค่าเข้าหา prior (ราคากลาง) ป้องกันการเชื่อข้อมูลไม่กี่จุดมากเกินไป
 *  3) Lognormal model: ln(ราคาตัดสิน/ราคากลาง) ~ Normal(μ, σ)  => P(ขายได้ที่ราคา p) = 1 − Φ((ln p − μ)/σ)
 *  4) Expected Value: E[คะแนน/กระสอบ] = P(ขายได้) × percentage_diff
 *  5) Mean–Variance (Markowitz) / risk-adjusted: U = E − γ·SD  (γ ตามระดับความเสี่ยงที่รับได้)
 *  6) Inventory liquidation schedule (แนวคิด TWAP / Almgren–Chriss อย่างง่าย):
 *     กระจายการขายตามจำนวนโอกาสที่คาดว่าจะเหลือ + ค่าเสียโอกาสของการถือของ (option value of waiting)
 * ใช้เฉพาะข้อมูลที่ผู้เล่นมองเห็นได้จริงเท่านั้น
 */
const { clearingObservations } = require('./market');
const { totalStock } = require('./scoring');

const PROFILES = {
  conservative: { gamma: 0.6, label: 'ระวังความเสี่ยง' },
  balanced: { gamma: 0.25, label: 'สมดุล' },
  aggressive: { gamma: 0, label: 'กล้าเสี่ยง' },
};

// Normal CDF (Abramowitz–Stegun 7.1.26)
function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** ประมาณ μ, σ ของ ln(ratio) ด้วย EWMA + Bayesian shrinkage */
function estimate(obs, priorMu, priorSigma, lambda = 0.75, k = 3) {
  if (!obs.length) return { mu: priorMu, sigma: priorSigma, n: 0, ewmaRatio: null };
  const sorted = obs.slice().sort((a, b) => a.round - b.round);
  // EWMA weights: รอบล่าสุดน้ำหนัก 1, ย้อนไปคูณ lambda
  const lastRound = sorted[sorted.length - 1].round;
  let wSum = 0, m = 0;
  const ws = sorted.map((o) => Math.pow(lambda, lastRound - o.round));
  sorted.forEach((o, i) => { wSum += ws[i]; m += ws[i] * Math.log(o.ratio); });
  m /= wSum;
  let v = 0;
  sorted.forEach((o, i) => { v += ws[i] * (Math.log(o.ratio) - m) ** 2; });
  v = wSum > 0 ? v / wSum : 0;
  const n = sorted.length;
  const mu = (n * m + k * priorMu) / (n + k);
  const sigma = Math.sqrt((n * v + k * priorSigma ** 2) / (n + k));
  return { mu, sigma: Math.max(0.04, sigma), n, ewmaRatio: Math.exp(m) };
}

function evaluatePrice(ratio, est, belowRef) {
  const p = 1 - normCdf((Math.log(ratio) - est.mu) / est.sigma);
  let diff = (ratio - 1) * 100;
  if (belowRef === 'zero' && diff < 0) diff = 0;
  const e = p * diff;
  const sd = Math.sqrt(Math.max(0, p * (1 - p))) * Math.abs(diff);
  return { p, diff, e, sd };
}

function bestFor(est, gamma, cfg) {
  let best = null;
  const lo = Math.max(cfg.priceFloorPct, 70);
  for (let pc = lo; pc <= cfg.priceCapPct; pc += 1) {
    const r = evaluatePrice(pc / 100, est, cfg.belowRef);
    const u = r.e - gamma * r.sd;
    if (!best || u > best.u + 1e-9) best = { pct: pc, u, ...r };
  }
  return best;
}

/**
 * game-agnostic: ใช้ข้อมูลที่ผู้เล่นมองเห็น
 * input: { config, round, rounds, phase, stock, history(rows จาก publicHistory), buyers(รอบปัจจุบัน ถ้ากำลังเสนอราคา), profile }
 */
function advise(input) {
  const { config: cfg, history, stock } = input;
  const profileKey = PROFILES[input.profile] ? input.profile : 'balanced';
  const gamma = PROFILES[profileKey].gamma;
  // รอบที่กำลังจะตัดสินใจ: ถ้ากำลังเสนอราคาคือรอบนี้, ถ้าดูผลอยู่คือรอบถัดไป
  const decisionRound = input.phase === 'bidding' ? input.round : input.round + 1;
  const roundsLeft = Math.max(0, input.rounds - decisionRound + 1);
  const obsBySku = clearingObservations(history, cfg.priceCapPct);
  const allObs = Object.values(obsBySku).flat();
  // prior ของตลาดทั้งหมด (pooled) แล้วค่อย shrink ราย SKU เข้าหา pooled
  const pooled = estimate(allObs, Math.log(1.05), 0.18, 0.75, 4);
  const roundsSeen = new Set(history.map((h) => h.round)).size;
  const notes = [];
  if (allObs.length < 6) notes.push('ข้อมูลย้อนหลังยังน้อย คำแนะนำส่วนใหญ่อิงสมมติฐานเริ่มต้น (ราคาตัดสินราว 105% ของราคากลาง)');
  if (cfg.revealLevel === 'self') notes.push('ผู้จัดเปิดเผยเฉพาะผลของคุณเอง ระบบจึงเดาราคาตัดสินจากผลขายได้/ไม่ได้ของคุณ ความแม่นยำต่ำกว่าปกติ');
  if (cfg.formula === 'A' || cfg.formula === 'C') notes.push(`สูตร ${cfg.formula} ไม่คูณจำนวนกระสอบ: แต่ละรายการที่ขายได้มีค่าเท่ากัน การเสนอจำนวนน้อยในราคาสูงจึงคุ้มกว่าสูตร B`);
  if (cfg.unsoldPenalty > 0) notes.push(`มีการหักคะแนน ${cfg.unsoldPenalty} ต่อ${cfg.unitName}ที่เหลือเมื่อจบเกม ระบบเพิ่มน้ำหนักให้การระบายของ`);

  const skus = [];
  for (const [sku, have] of Object.entries(stock)) {
    if (have <= 0) continue;
    const skuInfo = cfg.skus.find((s) => s.id === sku) || { name: sku, ref: 0 };
    const obs = obsBySku[sku] || [];
    const est = estimate(obs, pooled.mu, Math.max(pooled.sigma, 0.1), 0.75, 3);
    const best = bestFor(est, gamma, cfg);
    const profiles = {};
    for (const [k, p] of Object.entries(PROFILES)) profiles[k] = bestFor(est, p.gamma, cfg);
    // ค่าคาดหวังที่ราคากลาง (100%) ไว้เปรียบเทียบ
    const atRef = evaluatePrice(1, est, cfg.belowRef);

    // ความถี่ที่ SKU นี้มีผู้ซื้อ ต่อรอบ (Bayesian: prior = 1-(1-1/จำนวนชนิด)^ผู้ซื้อต่อรอบ)
    const priorAppear = 1 - Math.pow(1 - 1 / cfg.skus.length, cfg.buyersPerRound);
    const roundsWithSku = new Set(history.filter((h) => h.sku === sku).map((h) => h.round)).size;
    const appear = (roundsWithSku + 2 * priorAppear) / (roundsSeen + 2);
    const avgDemand = obs.length ? obs.reduce((a, o) => a + o.demand, 0) / obs.length : null;

    const currentBuyers = (input.buyers || []).filter((b) => b.sku === sku);
    const futureOpp = Math.max(0, roundsLeft - 1) * appear; // โอกาสในรอบหลังจากนี้
    // TWAP: ขายส่วนเท่าๆ กันต่อโอกาส
    let qtyNow = Math.ceil(have / (1 + futureOpp));
    // ค่าเสียโอกาสของการรอ: ถ้าตลาดรอบนี้ตึงกว่าปกติ ขายเพิ่ม, ถ้าคาดหวังติดลบ ให้รอ
    const totalDemandNow = currentBuyers.reduce((a, b) => a + b.demand, 0);
    let momentum = 0;
    if (avgDemand && currentBuyers.length) momentum = totalDemandNow / (avgDemand * currentBuyers.length) - 1;
    if (momentum > 0.2) qtyNow = Math.ceil(qtyNow * 1.3);
    if (cfg.unsoldPenalty > 0 && roundsLeft <= 3) qtyNow = have;
    if (roundsLeft <= 1) qtyNow = have;
    let action = 'sell';
    const reasons = [];
    if (best.e <= 0.05 && roundsLeft > 1) {
      action = 'hold';
      qtyNow = 0;
      reasons.push('ทุกระดับราคาให้คะแนนคาดหวังไม่เป็นบวก รอรอบหลังคุ้มกว่า');
    }
    if (input.phase === 'bidding' && !currentBuyers.length) {
      action = 'no_buyer';
      qtyNow = 0;
    }
    if (totalDemandNow && qtyNow > totalDemandNow) qtyNow = totalDemandNow;
    qtyNow = Math.min(have, Math.max(0, qtyNow));

    reasons.unshift(
      `ข้อมูลราคาตัดสินของ ${skuInfo.name}: ${est.n} จุด${est.n ? ` (EWMA ≈ ${(est.ewmaRatio * 100).toFixed(0)}%)` : ''} → ประมาณการกลาง ≈ ${(Math.exp(est.mu) * 100).toFixed(0)}% ความผันผวน σ ≈ ${(est.sigma * 100).toFixed(0)}%`,
      `ที่ราคา ${best.pct}%: โอกาสขายได้ ≈ ${(best.p * 100).toFixed(0)}% คะแนนคาดหวัง ≈ ${best.e.toFixed(1)} ต่อ${cfg.unitName} (ถ้าขายที่ 100%: โอกาส ${(atRef.p * 100).toFixed(0)}%, คะแนน ${atRef.e.toFixed(1)})`,
      `เหลือ ${roundsLeft} รอบ คาดว่าจะมีผู้ซื้อ SKU นี้อีก ≈ ${futureOpp.toFixed(1)} ครั้งหลังรอบนี้ → แบ่งขาย ${qtyNow}/${have} ${cfg.unitName}`
    );
    if (momentum > 0.2) reasons.push(`รอบนี้ผู้ซื้อต้องการมากกว่าค่าเฉลี่ย ${(momentum * 100).toFixed(0)}% จึงเพิ่มจำนวนขาย`);
    if (obs.some((o) => o.note === 'unfilled')) reasons.push('เคยมีรอบที่ผู้ซื้อ SKU นี้ซื้อไม่ครบ แปลว่าบางครั้งของขาดตลาด ตั้งราคาสูงได้');

    const per = currentBuyers.map((b) => ({
      buyerId: b.id, buyerName: b.name, demand: b.demand,
      price: Math.round(b.ref * best.pct / 100), pct: best.pct,
    }));
    // แบ่งจำนวนให้ผู้ซื้อแต่ละราย ตามสัดส่วน demand
    if (per.length && qtyNow > 0) {
      let left = qtyNow;
      const totalD = per.reduce((a, x) => a + x.demand, 0);
      per.forEach((x, i) => {
        const q = i === per.length - 1 ? left : Math.min(left, Math.round(qtyNow * x.demand / totalD));
        x.qty = Math.min(q, x.demand);
        left -= x.qty;
      });
    } else per.forEach((x) => (x.qty = 0));

    const curve = [];
    for (let pc = 80; pc <= cfg.priceCapPct; pc += 5) {
      const r = evaluatePrice(pc / 100, est, cfg.belowRef);
      curve.push({ pct: pc, p: +r.p.toFixed(3), e: +r.e.toFixed(2) });
    }
    skus.push({
      sku, name: skuInfo.name, ref: skuInfo.ref, stock: have, action,
      recommendPct: best.pct, recommendPrice: Math.round(skuInfo.ref * best.pct / 100),
      pSell: +best.p.toFixed(3), expectedPerUnit: +best.e.toFixed(2), riskSD: +best.sd.toFixed(2),
      qtyNow, perBuyer: per,
      profiles: Object.fromEntries(Object.entries(profiles).map(([k, v]) => [k, { pct: v.pct, price: Math.round(skuInfo.ref * v.pct / 100), p: +v.p.toFixed(3), e: +v.e.toFixed(2), sd: +v.sd.toFixed(2) }])),
      confidence: est.n >= 8 ? 'สูง' : est.n >= 3 ? 'กลาง' : 'ต่ำ',
      dataPoints: est.n,
      reasons, curve,
    });
  }
  return {
    profile: profileKey, profileLabel: PROFILES[profileKey].label, decisionRound, roundsLeft,
    totalStock: Object.values(stock).reduce((a, b) => a + b, 0),
    notes, skus,
    method: 'EWMA + Bayesian shrinkage → Lognormal P(ขายได้) → Expected Value & Mean–Variance → Inventory liquidation (TWAP)',
    disclaimer: 'เป็นการประเมินทางสถิติจากข้อมูลที่เห็นได้เท่านั้น ไม่ใช่การรับประกันผล ทีมอื่นอาจเปลี่ยนพฤติกรรมได้ตลอด',
  };
}

module.exports = { advise, normCdf, estimate, evaluatePrice, PROFILES, totalStock };
