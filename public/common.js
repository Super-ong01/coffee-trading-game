/* ตัวช่วยที่ใช้ร่วมกันทั้งหน้าผู้เล่นและหน้าผู้จัด */
window.CG = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sgn = (n, d = 1) => (n > 0 ? '+' : '') + fmt(n, d);

  async function api(path, body, extraHeaders = {}) {
    const opt = body === undefined ? { headers: extraHeaders } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) };
    const res = await fetch(path, opt);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || 'เกิดข้อผิดพลาด');
    return data;
  }

  // คัดลอกข้อความ: http บน LAN ไม่ใช่ secure context จึงต้องมีวิธีสำรอง
  async function copyText(text, textarea) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fallback */ }
    const ta = textarea || Object.assign(document.createElement('textarea'), { value: text });
    if (!textarea) { ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); }
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    if (!textarea) ta.remove();
    return ok;
  }

  let toastT;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // นาฬิกา: ชดเชยเวลาเครื่องผู้เล่นกับเซิร์ฟเวอร์
  let offset = 0;
  function syncClock(serverNow) { if (serverNow) offset = serverNow - Date.now(); }
  function remainingMs(view) {
    if (!view || view.phase !== 'bidding') return null;
    if (view.pausedRemainingMs != null) return view.pausedRemainingMs;
    return Math.max(0, view.endsAt - (Date.now() + offset));
  }
  function mmss(ms) {
    if (ms == null) return '--:--';
    const s = Math.ceil(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function roundDots(round, rounds, phase) {
    let h = '<div class="rounds" aria-label="รอบ ' + round + '/' + rounds + '">';
    for (let i = 1; i <= rounds; i++) {
      const cls = i < round || (i === round && phase !== 'bidding' && phase !== 'lobby') ? 'done' : i === round && phase === 'bidding' ? 'now' : '';
      h += '<i class="' + cls + '"></i>';
    }
    return h + '</div>';
  }

  /** กราฟเส้นแบบ SVG ง่ายๆ  series=[{name,color,values[]}] */
  function lineChart(series, opts = {}) {
    const W = opts.w || 640, H = opts.h || 220, L = 44, R = 12, T = 12, B = 26;
    const n = Math.max(1, ...series.map((s) => s.values.length));
    const all = series.flatMap((s) => s.values).filter((v) => v != null);
    if (!all.length) return '<p class="muted small">ยังไม่มีข้อมูล</p>';
    let lo = Math.min(0, ...all), hi = Math.max(1, ...all);
    const span = hi - lo || 1;
    const step = niceStep(span / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (i) => L + (n === 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" ${Math.abs(v) < 1e-9 ? '' : 'stroke-dasharray="2 4"'}/>`;
      g += `<text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(v, step < 1 ? 1 : 0)}</text>`;
    }
    const labels = opts.labels || Array.from({ length: n }, (_, i) => 'R' + (i + 1));
    const every = Math.ceil(n / 10);
    labels.forEach((lb, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`; });
    for (const s of series) {
      const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
      if (!pts.length) continue;
      g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
      const lp = pts[pts.length - 1];
      g += `<circle cx="${lp[0]}" cy="${lp[1]}" r="3.5" fill="${s.color}"/>`;
    }
    if (opts.marker != null) g += `<line x1="${X(opts.marker)}" x2="${X(opts.marker)}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="3 3"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}</svg>`;
  }
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-9))));
    const m = x / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  // ไอคอนแบบเกม: ชนิดกาแฟ / ผู้ซื้อ / เหรียญ
  function skuIcon(nameOrId) {
    const str = String(nameOrId || '');
    const m = str.match(/เกรด\s*([A-Z])/i) || str.match(/ROB-([A-Z])\b/i);
    if (m) { const g = m[1].toUpperCase(); return `<span class="grade g-${g}" aria-hidden="true">${g}</span>`; }
    return '☕';
  }
  const ANIMALS = ['🐻', '🐰', '🦊', '🐼', '🐨', '🐯', '🐸', '🐵', '🐷', '🦁', '🐮', '🐔'];
  function buyerAvatar(buyer) {
    const m = String(buyer && (buyer.name || buyer.buyerName) || '').match(/#(\d+)/);
    const n = m ? Number(m[1]) - 1 : 0;
    return ANIMALS[n % ANIMALS.length];
  }
  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '');

  const REVEAL_TH = { self: 'เห็นเฉพาะผลตัวเอง', range: 'เห็นช่วงราคาที่ขายได้', all: 'เห็นราคาทุกทีม' };
  const PHASE_TH = { lobby: 'รอเริ่มเกม', bidding: 'กำลังเสนอราคา', results: 'ประกาศผลรอบ', ended: 'จบเกม' };

  return { skuIcon, buyerAvatar, medal, $, $$, esc, fmt, sgn, api, copyText, toast, syncClock, remainingMs, mmss, roundDots, lineChart, REVEAL_TH, PHASE_TH };
})();
