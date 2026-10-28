/* กราฟแนวโน้มราคาที่ขายได้ของแต่ละเกรด ในแต่ละรอบ (ถูกสุด / เฉลี่ย / แพงสุดที่ขายได้)
   ใช้ข้อมูลที่ผู้ชมเห็นได้จริงเท่านั้น (history จาก publicHistory) */
window.CGTrend = (function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const gradeOf = (s) => { const m = String(s.name || s.skuName || '').match(/เกรด\s*([A-Z])/i) || String(s.id || s.sku || '').match(/-([A-Z])$/i); return m ? m[1].toUpperCase() : (s.id || s.sku); };

  /** รวมผู้ซื้อหลายรายของเกรดเดียวกันในรอบเดียวกัน */
  function aggregate(rows, skus) {
    const out = {};
    for (const s of skus) out[s.id] = { sku: s.id, name: s.name, grade: gradeOf(s), ref: s.ref, rounds: {} };
    for (const r of rows) {
      const g = out[r.sku] || (out[r.sku] = { sku: r.sku, name: r.skuName, grade: gradeOf(r), ref: r.ref, rounds: {} });
      const x = g.rounds[r.round] || (g.rounds[r.round] = { round: r.round, buyers: 0, demand: 0, sold: 0, offers: 0, min: null, max: null, wsum: 0 });
      x.buyers++; x.demand += r.demand; x.sold += r.soldQty; x.offers += r.offersCount || 0;
      if (r.minSoldPct != null) x.min = x.min == null ? r.minSoldPct : Math.min(x.min, r.minSoldPct);
      if (r.maxSoldPct != null) x.max = x.max == null ? r.maxSoldPct : Math.max(x.max, r.maxSoldPct);
      if (r.avgSoldPct != null) x.wsum += r.avgSoldPct * r.soldQty;
    }
    for (const g of Object.values(out)) for (const x of Object.values(g.rounds)) x.avg = x.sold && x.wsum ? x.wsum / x.sold : null;
    return out;
  }

  const COLORS = { min: '#2FB463', max: '#FF5468', avg: '#7B5CFF' };

  function chartSVG(g, totalRounds, cap, unitBaht) {
    const W = 680, H = 260, L = 52, R = 16, T = 16, B = 30;
    const n = Math.max(totalRounds, 1);
    const pts = [];
    for (let i = 1; i <= n; i++) pts.push(g.rounds[i] || null);
    const vals = pts.flatMap((p) => (p ? [p.min, p.max, p.avg] : [])).filter((v) => v != null);
    const toV = (pct) => (unitBaht ? (g.ref * pct) / 100 : pct);
    let lo = Math.min(90, ...vals) - 5, hi = Math.max(cap, ...vals) + 5;
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const X = (i) => L + (n === 1 ? (W - L - R) / 2 : ((i - 1) / (n - 1)) * (W - L - R));
    const Y = (pct) => T + (1 - (pct - lo) / (hi - lo)) * (H - T - B);
    let s = '';
    const step = hi - lo > 80 ? 20 : 10;
    for (let v = lo; v <= hi; v += step) {
      s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E6D9C6" stroke-dasharray="2 4"/>`;
      s += `<text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${unitBaht ? fmt(toV(v)) : v + '%'}</text>`;
    }
    for (let i = 1; i <= n; i++) if (n <= 15 || i % 2 === 1) s += `<text x="${X(i)}" y="${H - 10}" text-anchor="middle">R${i}</text>`;
    // ราคากลาง & เพดาน
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(100)}" y2="${Y(100)}" stroke="#3A2413" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    s += `<text x="${W - R}" y="${Y(100) - 4}" text-anchor="end" style="fill:#3A2413">ราคากลาง ${unitBaht ? '฿' + fmt(g.ref) : '100%'}</text>`;
    if (cap <= hi) {
      s += `<line x1="${L}" x2="${W - R}" y1="${Y(cap)}" y2="${Y(cap)}" stroke="#C42036" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      s += `<text x="${W - R}" y="${Y(cap) - 4}" text-anchor="end" style="fill:#C42036">เพดาน ${unitBaht ? '฿' + fmt(toV(cap)) : cap + '%'}</text>`;
    }
    // แถบช่วงราคา min–max (ต่อเนื่องเป็นช่วงๆ)
    // เกรดหนึ่งไม่ได้มีผู้ซื้อทุกรอบ จึงลากเส้นเชื่อมข้ามรอบที่ไม่มีข้อมูล
    const seg = [];
    for (let i = 1; i <= n; i++) { const p = pts[i - 1]; if (p && p.min != null) seg.push(i); }
    if (seg.length > 1) s += `<path d="M${seg.map((i) => `${X(i)} ${Y(pts[i - 1].max)}`).join(' L')} L${seg.slice().reverse().map((i) => `${X(i)} ${Y(pts[i - 1].min)}`).join(' L')} Z" fill="#FFC736" opacity=".28"/>`;
    // เส้น + จุด
    for (const k of ['min', 'avg', 'max']) {
      let d = '', pen = false;
      for (let i = 1; i <= n; i++) {
        const p = pts[i - 1];
        if (p && p[k] != null) { d += (pen ? ' L' : ' M') + X(i).toFixed(1) + ' ' + Y(p[k]).toFixed(1); pen = true; }
      }
      s += `<path d="${d}" fill="none" stroke="${COLORS[k]}" stroke-width="${k === 'avg' ? 2 : 2.6}" ${k === 'avg' ? 'stroke-dasharray="5 3"' : ''}/>`;
      for (let i = 1; i <= n; i++) {
        const p = pts[i - 1];
        if (p && p[k] != null) s += `<circle cx="${X(i)}" cy="${Y(p[k])}" r="${k === 'avg' ? 3 : 4}" fill="${COLORS[k]}" stroke="#fff" stroke-width="1.5"><title>R${i} ${k === 'min' ? 'ถูกสุด' : k === 'max' ? 'แพงสุด' : 'เฉลี่ย'} ${fmt(p[k], 1)}% (฿${fmt((g.ref * p[k]) / 100)})</title></circle>`;
      }
    }
    // รอบที่มีผู้ซื้อแต่ขายไม่ได้เลย / ของขาด
    for (let i = 1; i <= n; i++) {
      const p = pts[i - 1];
      if (p && p.min == null) s += `<text x="${X(i)}" y="${T + 12}" text-anchor="middle" style="fill:#C42036;font-size:13px">✕</text>`;
      else if (p && p.sold < p.demand) s += `<text x="${X(i)}" y="${T + 12}" text-anchor="middle" style="font-size:12px">⚠</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="แนวโน้มราคาเกรด ${esc(g.grade)}">${s}</svg>`;
  }

  function badge(g) { return `<span class="grade g-${esc(g)}">${esc(g)}</span>`; }

  /** วาดลงใน el; state เก็บเกรดที่เลือกและหน่วย */
  function mount(el, rows, cfg, opts = {}) {
    const st = el._trend || (el._trend = { sel: null, baht: true });
    if (cfg.revealLevel === 'self') {
      el.innerHTML = `<p class="muted">ผู้จัดตั้งให้เห็นเฉพาะผลของตัวเอง จึงไม่มีข้อมูลราคาถูกสุด/แพงสุดของตลาด</p>`;
      return;
    }
    const agg = aggregate(rows, cfg.skus);
    const grades = Object.values(agg).sort((a, b) => String(a.grade).localeCompare(String(b.grade)));
    const played = Math.max(0, ...rows.map((r) => r.round));
    if (!played) { el.innerHTML = '<p class="muted">ยังไม่มีรอบที่ปิดแล้ว ปิดรอบแรกเสร็จจะเห็นกราฟที่นี่</p>'; return; }
    const withData = grades.filter((g) => Object.keys(g.rounds).length);
    if (!st.sel || !agg[st.sel]) st.sel = (opts.prefer && opts.prefer.find((k) => agg[k] && Object.keys(agg[k].rounds).length)) || (withData[0] || grades[0]).sku;
    const g = agg[st.sel];
    const cap = cfg.priceCapPct;
    const rs = Object.values(g.rounds).sort((a, b) => a.round - b.round);
    const last = rs[rs.length - 1];
    const prevSold = rs.filter((x) => x.max != null);
    const trend = prevSold.length >= 2 ? prevSold[prevSold.length - 1].max - prevSold[prevSold.length - 2].max : null;
    const cell = (x) => (x == null ? '<span class="muted">-</span>' : `${fmt(x, 0)}%`);

    el.innerHTML = `
      <div class="tr-chips">${grades.map((x) => `<button type="button" data-g="${esc(x.sku)}" class="${x.sku === st.sel ? 'on' : ''}" ${Object.keys(x.rounds).length ? '' : 'disabled'}>${badge(x.grade)} <span class="small">฿${fmt(x.ref)}</span></button>`).join('')}</div>
      <div class="tr-head">
        <h3>${badge(g.grade)} ${esc(g.name)} · ราคากลาง ฿${fmt(g.ref)}</h3>
        <div class="seg tr-unit"><button type="button" data-u="baht" aria-pressed="${st.baht}">฿ บาท</button><button type="button" data-u="pct" aria-pressed="${!st.baht}">% ราคากลาง</button></div>
      </div>
      ${rs.length ? `<div class="kpis tr-kpis">
        <div class="kpi"><b style="color:${COLORS.min}">${last.min != null ? fmt(last.min, 0) + '%' : '-'}</b><span>ถูกสุดที่ขายได้ (R${last.round})</span></div>
        <div class="kpi"><b style="color:${COLORS.max}">${last.max != null ? fmt(last.max, 0) + '%' : '-'}</b><span>แพงสุดที่ขายได้ (R${last.round})</span></div>
        <div class="kpi"><b>${last.max != null ? '฿' + fmt((g.ref * last.max) / 100) : '-'}</b><span>ราคาแพงสุดเป็นบาท</span></div>
        <div class="kpi"><b>${trend == null ? '-' : trend > 0 ? '📈 +' + fmt(trend, 0) : trend < 0 ? '📉 ' + fmt(trend, 0) : '➡️ 0'}</b><span>แพงสุดเทียบครั้งก่อน (%)</span></div>
      </div>` : ''}
      <div class="legend"><span><i style="background:${COLORS.max}"></i>แพงสุดที่ขายได้</span><span><i style="background:${COLORS.avg}"></i>เฉลี่ย</span><span><i style="background:${COLORS.min}"></i>ถูกสุดที่ขายได้</span><span><i style="background:#FFC736;height:10px;opacity:.6"></i>ช่วงราคาที่ขายได้</span><span>✕ ไม่มีใครขายได้ · ⚠ ผู้ซื้อได้ของไม่ครบ</span></div>
      <div class="tr-chart">${rs.length ? chartSVG(g, opts.rounds || played, cap, st.baht) : '<p class="muted">เกรดนี้ยังไม่มีผู้ซื้อ</p>'}</div>
      ${rs.length ? `<div class="tablewrap"><table><thead><tr><th>รอบ</th><th class="n">ผู้ซื้อ</th><th class="n">ต้องการ</th><th class="n">ขายได้</th><th class="n">ถูกสุด</th><th class="n">เฉลี่ย</th><th class="n">แพงสุด</th><th class="n">แพงสุด (฿)</th></tr></thead><tbody>
        ${rs.map((x) => `<tr><td>R${x.round}</td><td class="n">${x.buyers}</td><td class="n">${x.demand}</td><td class="n">${x.sold}${x.sold < x.demand ? ` <span class="tag warn">ขาด ${x.demand - x.sold}</span>` : ''}</td><td class="n">${cell(x.min)}</td><td class="n">${cell(x.avg)}</td><td class="n">${cell(x.max)}</td><td class="n">${x.max != null ? '฿' + fmt((g.ref * x.max) / 100) : '-'}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <details class="tr-all" ${st.open ?? opts.openAll ? 'open' : ''}><summary><b>ตารางรวมทุกเกรด</b> <span class="small muted">(ถูกสุด–แพงสุดที่ขายได้ เป็น % ของราคากลาง)</span></summary>
        <div class="tablewrap"><table><thead><tr><th>เกรด</th>${Array.from({ length: played }, (_, i) => `<th class="n">R${i + 1}</th>`).join('')}</tr></thead><tbody>
          ${grades.map((x) => `<tr><td>${badge(x.grade)} ฿${fmt(x.ref)}</td>${Array.from({ length: played }, (_, i) => { const r = x.rounds[i + 1]; return `<td class="n">${!r ? '<span class="muted">·</span>' : r.min == null ? '<span class="err">✕</span>' : `${fmt(r.min, 0)}–${fmt(r.max, 0)}`}</td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div></details>
      <p class="small muted">💡 "แพงสุดที่ขายได้" คือเส้นชัยของรอบนั้น ถ้าตั้งราคาต่ำกว่าเส้นนี้เล็กน้อยมักขายได้ · ถ้าเส้นแดงขยับขึ้นต่อเนื่อง แปลว่าคนขายน้อยลง ตั้งแพงขึ้นได้</p>`;
    el.querySelector('.tr-all').addEventListener('toggle', (e) => { st.open = e.target.open; });
    el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { st.sel = b.dataset.g; mount(el, rows, cfg, opts); }));
    el.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => { st.baht = b.dataset.u === 'baht'; mount(el, rows, cfg, opts); }));
  }

  return { aggregate, mount, chartSVG };
})();
