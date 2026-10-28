(function () {
  const { skuIcon, buyerAvatar, medal, $, $$, esc, fmt, sgn, api, toast, syncClock, remainingMs, mmss, roundDots, lineChart, REVEAL_TH, PHASE_TH } = window.CG;
  const pin = new URLSearchParams(location.search).get('pin') || '';
  const H = pin ? { 'x-host-pin': pin } : {};
  let view = null, key = '', info = null, confirmReset = false;
  const COLORS = ['var(--accent)', 'var(--good)', 'var(--warn)', '#3B7DD8', '#8E5BD0', '#2A9D8F', '#C2185B', '#6D4C41'];

  document.getElementById('guideBtn').addEventListener('click', () => window.CGGuide.open(view && view.config, 'host'));
  const host = (action, body = {}) => api('/api/host/' + action, body, H).catch((e) => { toast(e.message); throw e; });

  api('/api/host/info', undefined, H).then((i) => { info = i; if (view && view.phase === 'lobby') renderLobbyLive(); }).catch(() => {});

  const es = new EventSource('/events?role=host' + (pin ? '&pin=' + encodeURIComponent(pin) : ''));
  es.onmessage = (ev) => {
    view = JSON.parse(ev.data);
    syncClock(view.serverNow);
    renderTop();
    const k = view.phase + ':' + view.round;
    if (k !== key) { key = k; confirmReset = false; renderMain(); }
    renderLive();
  };

  function renderTop() {
    $('#hRound').textContent = view.round ? `${view.round}/${view.rounds}` : '-';
    $('#hPhase').textContent = PHASE_TH[view.phase];
    $('#hDots').innerHTML = view.phase === 'lobby' ? '' : roundDots(view.round, view.rounds, view.phase);
  }
  function tick() {
    if (!view) return;
    const ms = remainingMs(view);
    const txt = view.phase === 'bidding' ? (view.pausedRemainingMs != null ? '⏸ ' : '⏰ ') + mmss(ms) : PHASE_TH[view.phase];
    $('#hTimer').className = view.phase === 'bidding' ? 'timer' + (ms != null && ms < 60000 ? ' low' : '') : 'timer idle';
    $('#hTimer').textContent = txt;
    const big = $('#bigTimer');
    if (big) { big.textContent = (view.pausedRemainingMs != null ? '⏸ ' : '') + mmss(ms); big.classList.toggle('low', ms != null && ms < 60000); }
  }
  setInterval(tick, 250);

  function renderMain() {
    const m = $('#hostMain');
    if (view.phase === 'lobby') { m.innerHTML = lobbyHTML(); bindLobby(); }
    else if (view.phase === 'bidding') { m.innerHTML = biddingHTML(); bindBidding(); }
    else { m.innerHTML = resultsHTML(); bindResults(); }
    tick();
  }
  function renderLive() {
    if (view.phase === 'lobby') renderLobbyLive();
    if (view.phase === 'bidding') renderBiddingLive();
  }

  // ---------- LOBBY ----------
  function field(id, label, input, tag) {
    return `<div class="field"><label for="${id}">${label} ${tag ? `<span class="tag ${tag === 'สมมติฐาน' ? 'warn' : 'mut'}">${tag}</span>` : ''}</label>${input}</div>`;
  }
  const num = (id, v, attrs = '') => `<input type="number" id="${id}" value="${v}" ${attrs}>`;
  const sel = (id, v, opts) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

  function lobbyHTML() {
    const c = view.config;
    return `
    <div class="grid g2">
      <section class="panel">
        <header><h2>🙋 1. ให้ผู้เล่นเข้าร่วม</h2></header>
        <p>ให้ผู้เล่นต่อ <b>Wi-Fi เดียวกับเครื่องนี้</b> แล้วเปิดเบราว์เซอร์ไปที่</p>
        <div id="joinUrls" class="joinurl">กำลังหาที่อยู่…</div>
        <p class="muted small" id="pinInfo"></p>
        <div><h3 id="joinedTitle">ผู้เล่นที่เข้าแล้ว</h3><div class="chips" id="joinedList" style="margin-top:8px"></div></div>
        <div class="btnrow"><button class="btn huge go" id="startBtn">เริ่มเกม ▶</button></div>
        <p class="muted small" id="startNote"></p>
      </section>
      <section class="panel">
        <header><h2>⚙️ 2. ตั้งค่าเกม</h2><span class="tag warn">ค่าที่ยังไม่ยืนยันจากผู้จัดจริง = สมมติฐาน</span></header>
        <div class="form">
          ${field('cHumans', 'คนจริง (ที่นั่ง)', num('cHumans', c.humans, 'min="0" max="200"'))}
          ${field('cBots', 'บอท', num('cBots', c.bots, 'min="0" max="500"'))}
          <div class="field"><label>รวมทีม</label><div class="pctread ok" id="cTotal" style="font-size:1.4rem">${c.humans + c.bots}</div></div>
          ${field('cRounds', 'จำนวนรอบ', num('cRounds', c.rounds, 'min="1" max="60"'))}
          ${field('cBuyers', 'ผู้ซื้อต่อรอบ', num('cBuyers', c.buyersPerRound, 'min="1" max="30"'))}
          ${field('cMinutes', 'เวลาต่อรอบ (นาที)', num('cMinutes', c.roundSeconds / 60, 'min="0.5" step="0.5"'))}
          ${field('cStock', 'สต๊อกเริ่มต้น/ทีม', num('cStock', c.stockPerTeam, 'min="1"'))}
          ${field('cUnit', 'หน่วย', `<input id="cUnit" value="${esc(c.unitName)}">`)}
          ${field('cStockMode', 'รูปแบบสต๊อก', sel('cStockMode', c.stockMode, [['mixed', 'คละหลายชนิด'], ['single', 'ชนิดเดียว']]), 'สมมติฐาน')}
          ${field('cSkusPer', 'จำนวนชนิดต่อทีม (ถ้าคละ)', num('cSkusPer', c.skusPerTeam, 'min="1"'))}
          ${field('cDemand', 'ความต้องการรวม / สินค้ารวม', num('cDemand', c.demandRatio, 'min="0.1" max="3" step="0.05"'), 'สมมติฐาน')}
          ${field('cCap', 'เพดานราคา (% ราคากลาง)', num('cCap', c.priceCapPct, 'min="100" max="500"'), 'สมมติฐาน')}
          ${field('cFloor', 'ราคาต่ำสุด (%)', num('cFloor', c.priceFloorPct, 'min="1" max="100"'), 'สมมติฐาน')}
          ${field('cFormula', 'สูตรคะแนน', sel('cFormula', c.formula, [['A', 'A: รวม % ต่อรายการ'], ['B', 'B: % × จำนวน'], ['C', 'C: ค่าเฉลี่ย %']]), 'สมมติฐาน')}
          ${field('cBelow', 'ขายต่ำกว่าราคากลาง', sel('cBelow', c.belowRef, [['negative', 'คะแนนติดลบ'], ['zero', 'นับเป็น 0']]), 'สมมติฐาน')}
          ${field('cPenalty', 'หักคะแนน/หน่วยที่เหลือตอนจบ', num('cPenalty', c.unsoldPenalty, 'min="0" step="1"'), 'สมมติฐาน')}
          ${field('cReveal', 'เปิดเผยข้อมูลหลังรอบ', sel('cReveal', c.revealLevel, [['self', 'เฉพาะผลตัวเอง'], ['range', 'ช่วงราคาที่ขายได้'], ['all', 'ราคาทุกทีม']]), 'สมมติฐาน')}
          ${field('cAuto', 'ทุกคนส่งแล้ว', sel('cAuto', c.autoCloseWhenAllReady, [['true', 'ปิดรอบใน 10 วินาที'], ['false', 'รอจนหมดเวลา']]))}
          ${field('cFill', 'เงื่อนไขการเริ่มเกม', sel('cFill', c.requireFullSeats ? 'full' : 'fill', [['full', 'คนจริงต้องเข้าครบก่อน'], ['fill', 'เริ่มได้เลย ที่ว่างเติมบอท']]))}
          ${field('cSeed', 'Seed (ค่าเดิม = เกมเดิม)', `<input id="cSeed" value="${esc(c.seed)}">`)}
        </div>
        ${field('cSkus', 'ชนิดกาแฟ: รหัส,ชื่อ,ราคากลาง (บรรทัดละชนิด)', `<textarea id="cSkus" rows="6">${esc(c.skus.map((s) => `${s.id},${s.name},${s.ref}`).join('\n'))}</textarea>`)}
        <div class="btnrow"><button class="btn dark" id="saveCfg">บันทึกการตั้งค่า</button><span class="muted small" id="cfgMsg"></span></div>
      </section>
    </div>`;
  }

  function readCfg() {
    return {
      humans: $('#cHumans').value, bots: $('#cBots').value, rounds: $('#cRounds').value, buyersPerRound: $('#cBuyers').value,
      roundSeconds: Math.round(Number($('#cMinutes').value) * 60), stockPerTeam: $('#cStock').value, unitName: $('#cUnit').value,
      stockMode: $('#cStockMode').value, skusPerTeam: $('#cSkusPer').value, demandRatio: $('#cDemand').value,
      priceCapPct: $('#cCap').value, priceFloorPct: $('#cFloor').value, formula: $('#cFormula').value, belowRef: $('#cBelow').value,
      unsoldPenalty: $('#cPenalty').value, revealLevel: $('#cReveal').value, autoCloseWhenAllReady: $('#cAuto').value === 'true',
      requireFullSeats: $('#cFill').value === 'full', fillEmptyWithBots: true, seed: $('#cSeed').value, skus: $('#cSkus').value,
    };
  }

  function bindLobby() {
    // บันทึกอัตโนมัติทุกครั้งที่แก้ค่า เพื่อให้ตัวเลข "ผู้เล่นที่เข้าแล้ว x/y" ตรงกับฟอร์มเสมอ
    let saveT = null, dirty = false;
    const save = async () => {
      clearTimeout(saveT);
      if (!dirty) return;
      dirty = false;
      try { await host('config', readCfg()); $('#cfgMsg').textContent = 'บันทึกแล้ว ✓'; }
      catch { $('#cfgMsg').textContent = 'บันทึกไม่สำเร็จ'; }
    };
    const upd = () => {
      $('#cTotal').textContent = (Number($('#cHumans').value) || 0) + (Number($('#cBots').value) || 0);
      $('#cfgMsg').textContent = 'กำลังบันทึก…';
      dirty = true;
      clearTimeout(saveT);
      saveT = setTimeout(save, 600);
    };
    $$('#hostMain .form input, #hostMain .form select, #cSkus').forEach((el) => { el.addEventListener('input', upd); el.addEventListener('change', upd); });
    $('#saveCfg').addEventListener('click', async () => { dirty = true; await save(); toast('บันทึกการตั้งค่าแล้ว'); });
    $('#startBtn').addEventListener('click', async () => {
      await save();
      await host('start');
    });
    renderLobbyLive();
  }

  function renderLobbyLive() {
    if (!$('#joinUrls')) return;
    if (info) {
      $('#joinUrls').innerHTML = info.urls.length ? info.urls.map(esc).join('<br>') : 'ไม่พบเครือข่าย — ตรวจสอบว่าเครื่องนี้ต่อ Wi-Fi แล้ว';
      $('#pinInfo').textContent = `รหัสผู้จัด ${info.pin} (ใช้เมื่อจะคุมเกมจากเครื่องอื่น: เติม /host?pin=${info.pin} ท้ายลิงก์)`;
    }
    const c = view.config;
    // ถ้าฟอร์มยังไม่ได้บันทึก ให้ใช้ค่าจากฟอร์ม เพื่อไม่ให้ตัวเลขขัดกัน
    const fh = $('#cHumans'), fb = $('#cBots');
    if (fh && fb && document.activeElement !== fh && document.activeElement !== fb && $('#cfgMsg').textContent !== 'กำลังบันทึก…') {
      fh.value = c.humans; fb.value = c.bots; $('#cTotal').textContent = c.humans + c.bots;
    }
    $('#joinedTitle').textContent = `ผู้เล่นที่เข้าแล้ว ${view.humans.length}/${c.humans}`;
    $('#joinedList').innerHTML = view.humans.length
      ? view.humans.map((h) => `<span class="chip">🙂 ${esc(h.name)} <button class="btn ghost" style="padding:0 6px" data-kick="${h.id}" title="นำออก">✕</button></span>`).join('')
      : '<span class="muted small">ยังไม่มีใครเข้า</span>';
    $$('[data-kick]').forEach((b) => b.addEventListener('click', () => host('kick', { teamId: b.dataset.kick })));
    const empty = Math.max(0, c.humans - view.humans.length);
    const sb = $('#startBtn');
    const blocked = c.requireFullSeats && empty > 0;
    sb.disabled = blocked;
    sb.textContent = blocked ? `รอผู้เล่นอีก ${empty} คน` : 'เริ่มเกม ▶';
    if (blocked) {
      $('#startNote').textContent = `ต้องให้คนจริงเข้าครบ ${c.humans} คนก่อนจึงเริ่มได้ (เข้าแล้ว ${view.humans.length}) · ถ้าจะเริ่มเลย ให้ลดจำนวน "คนจริง" หรือเปลี่ยน "เงื่อนไขการเริ่มเกม"`;
      return;
    }
    $('#startNote').textContent = `เมื่อเริ่ม: คนจริง ${view.humans.length} + บอท ${c.bots + (c.fillEmptyWithBots ? empty : 0)} = ${view.humans.length + c.bots + (c.fillEmptyWithBots ? empty : 0)} ทีม` + (empty && c.fillEmptyWithBots ? ` (ที่นั่งว่าง ${empty} ที่ เติมด้วยบอท)` : '');
  }

  // ---------- BIDDING ----------
  function biddingHTML() {
    return `
    <div class="grid g2">
      <section class="panel" style="align-items:flex-start">
        <span class="muted">รอบ ${view.round} จาก ${view.rounds} · เวลาที่เหลือ</span>
        <div class="hosttimer" id="bigTimer">--:--</div>
        <div class="btnrow">
          <button class="btn stop big" id="closeBtn">🔔 ปิดรอบตอนนี้</button>
          <button class="btn ghost" id="extBtn">+1 นาที</button>
          <button class="btn ghost" id="pauseBtn">หยุดชั่วคราว</button>
        </div>
      </section>
      <section class="panel">
        <header><h2>สถานะการส่งของคนจริง</h2><b class="num" id="readyCount"></b></header>
        <div class="chips" id="readyList"></div>
        <p class="muted small">บอท ${view.botCount} ตัวส่งราคาแล้วแบบซ่อน (ไม่มีใครเห็นราคากันก่อนปิดรอบ)</p>
      </section>
    </div>
    <section class="panel">
      <header><h2>ผู้ซื้อรอบนี้</h2><span class="muted small">เพดาน ${view.config.priceCapPct}% ของราคากลาง</span></header>
      <div class="tablewrap"><table><thead><tr><th>ผู้ซื้อ</th><th>สินค้า</th><th class="n">ราคากลาง</th><th class="n">เพดาน</th><th class="n">ต้องการ</th></tr></thead><tbody>
        ${view.buyers.map((b) => `<tr><td>${buyerAvatar(b)} ${esc(b.name)}</td><td>${skuIcon(b.skuName + b.sku)} ${esc(b.skuName)}</td><td class="n">${fmt(b.ref)}</td><td class="n">${fmt(b.ref * view.config.priceCapPct / 100)}</td><td class="n">${b.demand}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
    ${boardHTML(10)}`;
  }
  function bindBidding() {
    $('#closeBtn').addEventListener('click', () => host('close'));
    $('#extBtn').addEventListener('click', () => host('extend', { seconds: 60 }));
    $('#pauseBtn').addEventListener('click', () => host(view.pausedRemainingMs != null ? 'resume' : 'pause'));
    renderBiddingLive();
  }
  function renderBiddingLive() {
    if (!$('#readyList')) return;
    $('#readyCount').textContent = `${view.ready.ready}/${view.ready.total}`;
    $('#readyList').innerHTML = view.humans.map((h) => `<span class="status-chip ${h.submitted ? 'ok' : ''}">${h.submitted === 'offer' ? '✅' : h.submitted === 'skip' ? '😴' : '⏳'} ${esc(h.name)} <span class="small muted">${h.submitted === 'offer' ? 'ส่งแล้ว' : h.submitted === 'skip' ? 'ไม่ขาย' : 'กำลังคิด'}</span></span>`).join('') || '<span class="muted">ไม่มีผู้เล่นคนจริง</span>';
    $('#pauseBtn').textContent = view.pausedRemainingMs != null ? 'เล่นต่อ' : 'หยุดชั่วคราว';
  }

  // ---------- RESULTS / ENDED ----------
  function boardHTML(limit) {
    const rows = limit ? view.leaderboard.slice(0, limit) : view.leaderboard;
    const humansOutside = limit ? view.leaderboard.slice(limit).filter((r) => r.type === 'human') : [];
    const tr = (r) => `<tr class="${r.type === 'human' ? 'me' : ''}"><td class="n">${medal(r.rank) ? `<span class="medal">${medal(r.rank)}</span>` : r.rank}</td><td>${r.type === 'human' ? '🙂' : '🤖'} ${esc(r.name)} ${r.type === 'human' ? '<span class="tag good">คนจริง</span>' : `<span class="tag mut">${esc(r.style)}</span>`}</td><td class="n">${fmt(r.score, 1)}</td><td class="n">${r.soldUnits}</td><td class="n">${r.stockLeft}</td></tr>`;
    return `<section class="panel"><header><h2>${limit ? `อันดับ ${limit} ทีมแรก` : `อันดับทั้งหมด ${view.leaderboard.length} ทีม`}</h2><span class="tag warn">บอท = ข้อมูลจำลอง</span></header>
      <div class="tablewrap" ${limit ? '' : 'style="max-height:640px;overflow:auto"'}><table><thead><tr><th class="n">#</th><th>ทีม</th><th class="n">คะแนน</th><th class="n">ขายแล้ว</th><th class="n">เหลือ</th></tr></thead><tbody>
      ${rows.map(tr).join('')}
      ${humansOutside.length ? `<tr><td colspan="5" class="muted small">คนจริงที่อยู่นอก ${limit} อันดับแรก</td></tr>` + humansOutside.map(tr).join('') : ''}
      </tbody></table></div></section>`;
  }

  function resultsHTML() {
    const r = view.lastResult;
    const ended = view.phase === 'ended';
    const series = view.roundScores.map((s, i) => ({ name: s.name, color: COLORS[i % COLORS.length], values: s.series }));
    return `
    <section class="panel">
      <header><h2>${ended ? 'จบเกม · สรุปผล' : `ผลรอบ ${r.round}`}</h2>
        <div class="btnrow">
          ${ended ? '' : '<button class="btn huge go" id="nextBtn">เริ่มรอบถัดไป ▶</button>'}
          <a class="btn ghost" href="/api/host/export.csv${pin ? '?pin=' + encodeURIComponent(pin) : ''}">ดาวน์โหลด CSV</a>
          <a class="btn ghost" href="/api/host/export.json${pin ? '?pin=' + encodeURIComponent(pin) : ''}">ดาวน์โหลด JSON</a>
        </div></header>
      <div class="tablewrap"><table><thead><tr><th>ผู้ซื้อ</th><th>สินค้า</th><th class="n">ราคากลาง</th><th class="n">ต้องการ</th><th class="n">ขายได้</th><th class="n">ข้อเสนอ</th><th class="n">เสนอรวม</th><th class="n">ต่ำสุด%</th><th class="n">สูงสุด%</th><th class="n">เฉลี่ย%</th></tr></thead><tbody>
        ${r.buyers.map((b) => `<tr><td>${buyerAvatar(b)} ${esc(b.name)}</td><td>${skuIcon(b.skuName)} ${esc(b.skuName)}</td><td class="n">${fmt(b.ref)}</td><td class="n">${b.demand}</td><td class="n">${b.soldQty}${b.demand > b.soldQty ? ` <span class="tag warn">ขาด ${b.demand - b.soldQty}</span>` : ''}</td><td class="n">${b.offersCount}</td><td class="n">${b.offeredQty}</td><td class="n">${fmt(b.minSoldPct, 1)}</td><td class="n">${fmt(b.maxSoldPct, 1)}</td><td class="n">${fmt(b.avgSoldPct, 1)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
    ${series.length ? `<section class="panel"><header><h2>คะแนนสะสมของคนจริง</h2></header>
      <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>
      ${lineChart(series, { h: 240 })}</section>` : ''}
    <section class="panel"><header><div><h2>📈 แนวโน้มราคาแต่ละเกรด</h2><p class="muted small">ถูกสุด / เฉลี่ย / แพงสุดที่ขายได้ในแต่ละรอบ (ผู้จัดเห็นข้อมูลระดับช่วงราคาเสมอ)</p></div></header><div id="hostTrend"></div></section>
    ${boardHTML(ended ? 0 : 15)}
    <section class="panel"><header><h2>จัดการเกม</h2></header>
      <div class="confirm" id="resetBox"><button class="btn ghost" id="resetBtn">เริ่มเกมใหม่ (ใช้การตั้งค่าเดิม)</button></div>
      <p class="muted small">เกมถูกบันทึกอัตโนมัติในโฟลเดอร์ data ถ้าปิดเซิร์ฟเวอร์แล้วเปิดใหม่จะเล่นต่อจากเดิม</p></section>`;
  }
  function bindResults() {
    window.CGTrend.mount($('#hostTrend'), view.history, { ...view.config, revealLevel: 'range' }, { rounds: view.rounds, openAll: true });
    const nb = $('#nextBtn');
    if (nb) nb.addEventListener('click', () => host('next'));
    $('#resetBtn').addEventListener('click', () => {
      $('#resetBox').innerHTML = '<span class="err">ยืนยันล้างเกมนี้? ผู้เล่นทุกคนต้องเข้าร่วมใหม่</span><button class="btn" id="resetYes">ยืนยัน ล้างเกม</button><button class="btn ghost" id="resetNo">ยกเลิก</button>';
      $('#resetYes').addEventListener('click', () => host('reset'));
      $('#resetNo').addEventListener('click', () => { key = ''; renderMain(); });
    });
  }
})();
