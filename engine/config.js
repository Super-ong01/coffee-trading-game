'use strict';
// ค่าตั้งต้นของเกม ทุกค่าที่ยังไม่ยืนยันจากผู้จัดเป็น "สมมติฐาน" และแก้ได้จากหน้าผู้จัด

// โรบัสต้าชนิดเดียว แบ่ง 7 เกรด (A ดีที่สุด → G) ราคากลางเป็นค่าสมมติ แก้ได้ในหน้าผู้จัด
const DEFAULT_SKUS = [
  { id: 'ROB-A', name: 'โรบัสต้า เกรด A', ref: 1400 },
  { id: 'ROB-B', name: 'โรบัสต้า เกรด B', ref: 1250 },
  { id: 'ROB-C', name: 'โรบัสต้า เกรด C', ref: 1100 },
  { id: 'ROB-D', name: 'โรบัสต้า เกรด D', ref: 950 },
  { id: 'ROB-E', name: 'โรบัสต้า เกรด E', ref: 800 },
  { id: 'ROB-F', name: 'โรบัสต้า เกรด F', ref: 650 },
  { id: 'ROB-G', name: 'โรบัสต้า เกรด G', ref: 500 },
];
// ชุดเดิม (เวอร์ชันก่อน) ใช้ตรวจว่าเกมที่บันทึกไว้ยังเป็นค่าเริ่มต้นเก่าหรือไม่
const LEGACY_SKU_IDS = ['ARA-A-CHO', 'ARA-A-FRU', 'ARA-B-NUT', 'ROB-A-ERT', 'ROB-B-BLD', 'SPC-FLR'];

const BOT_STYLES = ['undercut', 'fair', 'premium', 'saver', 'opportunist', 'adaptive', 'random'];
const BOT_STYLE_TH = {
  undercut: 'ตัดราคา',
  fair: 'ราคากลางๆ',
  premium: 'พรีเมียม',
  saver: 'เก็บสต๊อก',
  opportunist: 'ฉวยโอกาส',
  adaptive: 'ปรับตัวตามตลาด',
  random: 'สุ่ม',
};

const DEFAULTS = {
  humans: 5,            // ที่นั่งคนจริง
  bots: 45,             // จำนวนบอท
  rounds: 15,
  buyersPerRound: 6,
  roundSeconds: 300,    // 5 นาที
  stockPerTeam: 10,
  unitName: 'กระสอบ',
  stockMode: 'mixed',   // mixed = คละ 2 ชนิด, single = ชนิดเดียว
  skusPerTeam: 2,
  demandRatio: 0.9,     // ความต้องการรวมทั้งเกม / สินค้ารวมทุกทีม  [สมมติฐาน]
  priceCapPct: 150,     // ผู้ซื้อไม่รับราคาเกินนี้ (% ของราคากลาง) [สมมติฐาน]
  priceFloorPct: 50,    // ห้ามเสนอต่ำกว่านี้
  formula: 'B',         // A | B | C
  belowRef: 'negative', // negative | zero
  unsoldPenalty: 0,     // คะแนนที่หักต่อกระสอบที่เหลือเมื่อจบเกม
  revealLevel: 'range', // self | range | all
  autoCloseWhenAllReady: true,
  requireFullSeats: true, // ต้องให้คนจริงเข้าครบทุกที่นั่งก่อนจึงเริ่มเกมได้
  fillEmptyWithBots: true,
  seed: 'coffee-2026',
  skus: DEFAULT_SKUS,
};

function clampInt(v, lo, hi, def) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}
function clampNum(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

function parseSkus(input) {
  if (Array.isArray(input)) return input;
  if (typeof input !== 'string') return null;
  const out = [];
  for (const line of input.split(/\r?\n/)) {
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 3 || !parts[0]) continue;
    out.push({ id: parts[0], name: parts[1], ref: Number(parts[2]) });
  }
  return out;
}

function normalizeConfig(input = {}) {
  const c = { ...DEFAULTS, ...input };
  const cfg = {
    humans: clampInt(c.humans, 0, 200, DEFAULTS.humans),
    bots: clampInt(c.bots, 0, 500, DEFAULTS.bots),
    rounds: clampInt(c.rounds, 1, 60, DEFAULTS.rounds),
    buyersPerRound: clampInt(c.buyersPerRound, 1, 30, DEFAULTS.buyersPerRound),
    roundSeconds: clampInt(c.roundSeconds, 10, 3600, DEFAULTS.roundSeconds),
    stockPerTeam: clampInt(c.stockPerTeam, 1, 1000, DEFAULTS.stockPerTeam),
    unitName: String(c.unitName || DEFAULTS.unitName).slice(0, 20),
    stockMode: c.stockMode === 'single' ? 'single' : 'mixed',
    skusPerTeam: clampInt(c.skusPerTeam, 1, 10, DEFAULTS.skusPerTeam),
    demandRatio: clampNum(c.demandRatio, 0.1, 3, DEFAULTS.demandRatio),
    priceCapPct: clampNum(c.priceCapPct, 100, 500, DEFAULTS.priceCapPct),
    priceFloorPct: clampNum(c.priceFloorPct, 1, 100, DEFAULTS.priceFloorPct),
    formula: ['A', 'B', 'C'].includes(c.formula) ? c.formula : 'B',
    belowRef: c.belowRef === 'zero' ? 'zero' : 'negative',
    unsoldPenalty: clampNum(c.unsoldPenalty, 0, 1000, 0),
    revealLevel: ['self', 'range', 'all'].includes(c.revealLevel) ? c.revealLevel : 'range',
    autoCloseWhenAllReady: c.autoCloseWhenAllReady !== false && c.autoCloseWhenAllReady !== 'false',
    requireFullSeats: c.requireFullSeats !== false && c.requireFullSeats !== 'false',
    fillEmptyWithBots: c.fillEmptyWithBots !== false && c.fillEmptyWithBots !== 'false',
    seed: String(c.seed ?? DEFAULTS.seed).slice(0, 60) || DEFAULTS.seed,
  };
  let skus = parseSkus(c.skus) || DEFAULT_SKUS;
  skus = skus
    .filter((s) => s && s.id && Number(s.ref) > 0)
    .map((s) => ({ id: String(s.id).slice(0, 30), name: String(s.name || s.id).slice(0, 60), ref: Math.round(Number(s.ref)) }));
  const seen = new Set();
  skus = skus.filter((s) => (seen.has(s.id) ? false : seen.add(s.id)));
  cfg.skus = skus.length ? skus : DEFAULT_SKUS;
  cfg.skusPerTeam = Math.min(cfg.skusPerTeam, cfg.skus.length, cfg.stockPerTeam);
  if (cfg.humans + cfg.bots < 1) cfg.bots = 1;
  return cfg;
}

module.exports = { LEGACY_SKU_IDS, DEFAULTS, DEFAULT_SKUS, BOT_STYLES, BOT_STYLE_TH, normalizeConfig, parseSkus };
