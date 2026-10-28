(function () {
  const { $, $$, esc, fmt, sgn, api, copyText, toast, syncClock, remainingMs, mmss, roundDots, lineChart, REVEAL_TH, PHASE_TH, skuIcon, buyerAvatar, medal } = window.CG;
  const TOKEN_KEY = 'cg_token';
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
  let view = null;
  let mainKey = '';
  let drafts = {};        // buyerId -> {qty, price}
  let draftRound = -1;
  let profile = 'balanced';
  let lastAdvice = null;
  let es = null;
  let celebrated = '';

  const U = () => (view ? view.config.unitName : 'กระสอบ');
  const skuOf = (id) => view.config.skus.find((s) => s.id === id) || { id, name: id, ref: 0 };
  const stockTotal = () => Object.values(view.team.stock).reduce((a, b) => a + b, 0);

  // ---------- เข้าร่วม ----------
  async function showJoin(msg) {
    $('#joinView').classList.remove('hidden');
    $('#gameView').classList.add('hidden');
    $('#topbar').classList.add('hidden');
    $('#submitBar').classList.add('hidden');
    $('#joinErr').textContent = msg || '';
    try {
      const info = await api('/api/info');
      $('#joinSeats').textContent = info.phase === 'lobby' ? `ที่นั่งผู้เล่น: เข้าแล้ว ${info.joined}/${info.seats}` : 'เกมเริ่มไปแล้ว ถ้าเคยเข้าร่วม ให้เปิดจากเครื่องเดิม';
    } catch { /* ignore */ }
  }
  $('#guideBtn').addEventListener('click', () => window.CGGuide.open(view && view.config, 'player'));
  $('#joinGuide').addEventListener('click', async () => {
    let cfg = null;
    try { cfg = await api('/api/config'); } catch { /* ใช้ค่าเริ่มต้น */ }
    window.CGGuide.open(cfg, 'player');
  });
  $('#joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/join', { name: $('#joinName').value });
      token = r.token;
      try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
      connect();
    } catch (err) { $('#joinErr').textContent = err.message; }
  });

  // ---------- realtime ----------
  function connect() {
    if (!token) return showJoin();
    if (es) es.close();
    es = new EventSource('/events?token=' + encodeURIComponent(token));
    es.onmessage = (ev) => onView(JSON.parse(ev.data));
    es.addEventListener('kicked', () => { es.close(); forget('เกมถูกรีเซ็ต หรือทีมของคุณถูกนำออก กรุณาเข้าร่วมใหม่'); });
    es.onerror = async () => {
      try { await api('/api/me?token=' + encodeURIComponent(token)); }
      catch (e) { if (/ไม่พบทีม/.test(e.message)) { es.close(); forget(); } }
    };
  }
  function forget(msg) {
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    showJoin(msg);
  }

  function onView(v) {
    view = v;
    syncClock(v.serverNow);
    $('#joinView').classList.add('hidden');
    $('#gameView').classList.remove('hidden');
    $('#topbar').classList.remove('hidden');
    renderTop();
    const key = v.phase + ':' + v.round;
    if (key !== mainKey) { mainKey = key; renderMain(); }
    else if (v.phase === 'lobby') renderMain();
    else updateMainLive();
    renderSubmitBar();
    renderTab(currentTab);
  }

  // ---------- แถบบน ----------
  function renderTop() {
    const v = view;
    $('#tbTeam').textContent = v.team.name;
    $('#tbRound').textContent = v.round ? `${v.round}/${v.rounds}` : '-';
    $('#tbScore').textContent = fmt(v.team.score, 1);
    $('#tbRank').textContent = v.team.rank ? `${medal(v.team.rank)}${v.team.rank}` : '-';
    $('#tbStock').textContent = v.phase === 'lobby' ? '-' : stockTotal();
    $('#tbRound').parentElement.classList.toggle('hidden', !v.round);
    $('#tbStock').parentElement.classList.toggle('hidden', v.phase === 'lobby');
    $('#tbRank').parentElement.classList.toggle('hidden', !v.team.rank || v.phase === 'lobby');
    $('#tbScore').parentElement.classList.toggle('hidden', v.phase === 'lobby');
    $('#tbDots').innerHTML = v.phase === 'lobby' ? '' : roundDots(v.round, v.rounds, v.phase);
    tickTimer();
  }
  function tickTimer() {
    if (!view) return;
    const ms = remainingMs(view);
    const t = $('#tbTimer');
    const bar = $('#timebar');
    if (view.phase !== 'bidding') {
      t.textContent = PHASE_TH[view.phase];
      t.className = 'timer idle';
      bar.classList.add('hidden');
      return;
    }
    t.textContent = (view.pausedRemainingMs != null ? '⏸ ' : '⏰ ') + mmss(ms);
    const low = ms != null && ms < 60000;
    t.className = 'timer' + (low ? ' low' : '');
    bar.classList.remove('hidden');
    const f = $('#timebarFill');
    f.style.width = Math.max(0, Math.min(100, (ms / (view.config.roundSeconds * 1000)) * 100)) + '%';
    f.classList.toggle('low', low);
  }
  setInterval(tickTimer, 250);

  // ---------- หน้าหลัก ----------
  function renderMain() {
    const v = view;
    if (v.phase === 'lobby') return renderLobby();
    if (v.phase === 'bidding') return renderBidding();
    renderResults();
  }

  function howToSteps() {
    return `<div class="steps">
      <div><b>🐻</b>ผู้ซื้อบอกว่าอยากได้โรบัสต้าเกรดไหน กี่${esc(U())}</div>
      <div><b>🏷️</b>เลือกจำนวน แล้วตั้งราคาที่จะขาย</div>
      <div><b>🙈</b>ทุกร้านส่งราคาพร้อมกัน ไม่มีใครเห็นของใคร</div>
      <div><b>⬇️</b>ผู้ซื้อซื้อจากร้านที่ถูกที่สุดก่อน จนได้ของครบ</div>
      <div><b>⭐</b>ขายแพงกว่าราคากลาง = ได้คะแนน ขายถูกกว่า = เสียคะแนน</div>
    </div>`;
  }

  function renderLobby() {
    const v = view;
    const left = v.lobby.seats - v.lobby.joined.length;
    $('#main').innerHTML = `
      <div class="panel" style="align-items:center;text-align:center">
        <div class="waiting">⏳</div>
        <h1>สวัสดี ${esc(v.team.name)}!</h1>
        <p class="muted">${left > 0 && v.config.requireFullSeats ? `รอเพื่อนอีก <b>${left}</b> คน แล้วผู้จัดจะกดเริ่มเกม` : 'เพื่อนมาครบแล้ว รอผู้จัดกดเริ่มเกม'}</p>
        <div class="chips" style="justify-content:center">${v.lobby.joined.map((n) => `<span class="chip">🙂 ${esc(n)}</span>`).join('')}${Array.from({ length: Math.max(0, left) }, () => '<span class="chip muted">❔ ว่าง</span>').join('')}</div>
        <p class="small muted">คู่แข่งอีก ${v.lobby.bots} ร้านเป็นบอท 🤖</p>
      </div>
      <div class="panel"><h2>🎮 เล่นยังไง</h2>${howToSteps()}<div class="btnrow"><a class="btn go big" href="/tutorial" target="_blank" rel="noopener">🎬 ดูวิธีเล่นแบบอนิเมชัน</a><button class="btn dark big" type="button" id="lobbyGuide">📖 อ่านคู่มือฉบับเต็ม</button></div></div>`;
    $('#lobbyGuide').addEventListener('click', () => window.CGGuide.open(view.config, 'player'));
  }

  function sacksHTML(total, selected) {
    let h = '<span class="sacks" aria-hidden="true">';
    for (let i = 0; i < total; i++) h += `<span class="${i < selected ? '' : 'off'}">🛍️</span>`;
    return h + '</span>';
  }

  function stockChips() {
    return Object.entries(view.team.stock).filter(([, q]) => q > 0).map(([k, q]) => {
      const s = skuOf(k);
      return `<span class="chip">${skuIcon(s.name + k)} ${esc(s.name)} <b class="num">×${q}</b></span>`;
    }).join('');
  }

  function renderBidding() {
    const v = view;
    if (draftRound !== v.round) {
      drafts = {};
      for (const b of v.buyers) drafts[b.id] = { qty: 0, price: Math.round(b.ref * 1.1) };
      for (const o of v.myOffers) drafts[o.buyerId] = { qty: o.qty, price: o.price };
      draftRound = v.round;
    }
    const total = stockTotal();
    $('#main').innerHTML = `
      <div class="panel cream">
        <header><div><h1>รอบที่ ${v.round}: ใครอยากซื้ออะไรบ้าง?</h1>
          <p class="muted small">เลือกผู้ซื้อที่ต้องการเกรดที่คุณมี ใส่จำนวนกับราคา แล้วกด "ส่งราคา" ไม่อยากขายก็กด "ไม่ขายรอบนี้" ได้</p></div></header>
        <div class="chips"><b>ของในร้านคุณ:</b> ${total ? stockChips() : '<span class="err">ขายหมดแล้ว 🎉</span>'}</div>
        <div id="statusBanner"></div>
      </div>
      <div class="buyers" id="buyerGrid">${sortedBuyers().map(buyerCard).join('')}</div>`;
    bindBuyerInputs();
    updateMainLive();
  }
  // ผู้ซื้อที่เราขายให้ได้ขึ้นก่อน
  function sortedBuyers() {
    return view.buyers.slice().sort((a, b) => ((view.team.stock[b.sku] || 0) > 0) - ((view.team.stock[a.sku] || 0) > 0));
  }

  function buyerCard(b) {
    const v = view;
    const have = v.team.stock[b.sku] || 0;
    const cap = Math.round(b.ref * v.config.priceCapPct / 100);
    const d = drafts[b.id];
    const can = have > 0;
    const lo = Math.ceil(b.ref * v.config.priceFloorPct / 100);
    const hi = Math.round(b.ref * (v.config.priceCapPct + 15) / 100);
    return `<article class="buyer ${can ? '' : 'cannot'} ${d.qty > 0 ? 'active' : ''}" data-b="${b.id}">
      <div class="who"><div class="avatar">${buyerAvatar(b)}</div>
        <div class="bubble">อยากได้ ${skuIcon(b.skuName + b.sku)} <b>${esc(b.skuName)}</b><br><b class="num">${b.demand}</b> ${esc(U())}</div></div>
      <div class="priceline"><span>ราคากลาง <b class="num">฿${fmt(b.ref)}</b></span><span>รับไม่เกิน <b class="num">฿${fmt(cap)}</b></span></div>
      ${can ? `
      <div class="field"><label>จะขายให้กี่${esc(U())}? (คุณมี ${have})</label>
        <div class="stepper"><button type="button" data-act="minus" aria-label="ลด">−</button><input type="number" inputmode="numeric" min="0" max="${have}" value="${d.qty}" data-in="qty" id="q-${b.id}" aria-label="จำนวน"><button type="button" data-act="plus" aria-label="เพิ่ม">+</button></div>
        <div data-sacks>${sacksHTML(have, d.qty)}</div></div>
      <div class="field"><label for="p-${b.id}">ตั้งราคาต่อ${esc(U())}</label>
        <div class="pricebox"><span>฿</span><input type="number" inputmode="numeric" min="1" value="${d.price}" data-in="price" id="p-${b.id}"><span class="pctread" data-pct></span></div>
        <input type="range" min="${lo}" max="${hi}" step="${Math.max(1, Math.round(b.ref / 100))}" value="${d.price}" data-in="range" aria-label="เลื่อนตั้งราคา">
        <div class="meter" data-meter></div>
        <div class="meterlabels"><span>ถูก</span><span>ราคากลาง</span><span>แพง</span><span>เกิน</span></div>
        <div class="pctchips">${[90, 100, 110, 120, 130, 140, 150].filter((x) => x <= v.config.priceCapPct + 10).map((x) => `<button type="button" data-pctset="${x}">${x}%</button>`).join('')}</div></div>
      <div class="mood" data-mood></div>` : `<p class="muted">🚫 คุณไม่มี${esc(b.skuName)} ขายให้ผู้ซื้อรายนี้ไม่ได้</p>`}
    </article>`;
  }

  function bindBuyerInputs() {
    $$('#buyerGrid .buyer').forEach((card) => {
      const id = card.dataset.b;
      const qi = card.querySelector('[data-in="qty"]');
      if (!qi) return;
      const pi = card.querySelector('[data-in="price"]');
      const ri = card.querySelector('[data-in="range"]');
      const b = view.buyers.find((x) => x.id === id);
      const have = view.team.stock[b.sku] || 0;
      const set = (src) => {
        if (src === 'range') pi.value = ri.value;
        drafts[id].qty = Math.max(0, Math.min(have, Math.floor(Number(qi.value) || 0)));
        drafts[id].price = Math.round(Number(pi.value) || 0);
        if (src !== 'range') ri.value = drafts[id].price;
        refreshCard(card, b);
        renderSubmitBar();
      };
      qi.addEventListener('input', () => set('qty'));
      pi.addEventListener('input', () => set('price'));
      ri.addEventListener('input', () => { if (drafts[id].qty === 0) qi.value = 1; set('range'); });
      qi.addEventListener('change', () => { qi.value = drafts[id].qty; });
      card.querySelector('[data-act="minus"]').addEventListener('click', () => { qi.value = Math.max(0, drafts[id].qty - 1); set('qty'); });
      card.querySelector('[data-act="plus"]').addEventListener('click', () => { qi.value = Math.min(have, drafts[id].qty + 1); set('qty'); });
      card.querySelectorAll('[data-pctset]').forEach((btn) => btn.addEventListener('click', () => {
        pi.value = Math.round(b.ref * Number(btn.dataset.pctset) / 100);
        if (drafts[id].qty === 0) qi.value = Math.min(have, 1);
        set('price');
      }));
      refreshCard(card, b);
    });
  }

  function zone(pc) {
    const cap = view.config.priceCapPct;
    if (pc > cap) return 'over';
    if (pc < 100) return 'below';
    return 'ok';
  }

  function refreshCard(card, b) {
    const v = view;
    const d = drafts[b.id];
    const pc = d.price / b.ref * 100;
    const cap = v.config.priceCapPct;
    const z = zone(pc);
    const el = card.querySelector('[data-pct]');
    if (!el) return;
    el.textContent = fmt(pc, 0) + '%';
    el.className = 'pctread ' + z;
    card.querySelectorAll('[data-pctset]').forEach((x) => x.classList.toggle('on', Math.round(pc) === Number(x.dataset.pctset)));
    card.classList.toggle('active', d.qty > 0);
    card.querySelector('[data-sacks]').innerHTML = sacksHTML(v.team.stock[b.sku] || 0, d.qty);
    // แถบสีราคา
    const lo = v.config.priceFloorPct, hi = cap + 15, span = hi - lo;
    const w = (a, c) => Math.max(0, (c - a) / span * 100);
    const mid = Math.min(cap, 120);
    const pinLeft = Math.max(0, Math.min(100, (pc - lo) / span * 100));
    card.querySelector('[data-meter]').innerHTML =
      `<i class="z1" style="width:${w(lo, 100)}%"></i><i class="z3" style="width:${w(100, mid)}%"></i><i class="z2" style="width:${w(mid, cap)}%"></i><i class="z4" style="width:${w(cap, hi)}%"></i><span class="pin" style="left:${pinLeft}%"></span>`;
    const diff = (d.price - b.ref) / b.ref * 100;
    const adj = v.config.belowRef === 'zero' && diff < 0 ? 0 : diff;
    const pts = v.config.formula === 'B' ? adj * d.qty : adj;
    const mood = card.querySelector('[data-mood]');
    mood.className = 'mood ' + z;
    if (d.qty <= 0) { mood.className = 'mood'; mood.innerHTML = '👉 กด + เพื่อเลือกจำนวนที่จะขายให้ร้านนี้'; return; }
    if (z === 'over') mood.innerHTML = '😵 แพงเกินที่ผู้ซื้อรับได้ ขายไม่ได้แน่นอน';
    else if (z === 'below') mood.innerHTML = `😬 ถูกกว่าราคากลาง ขายง่าย แต่${v.config.belowRef === 'zero' ? 'ไม่ได้คะแนน' : `เสียคะแนน <b>${sgn(pts)}</b> ⭐`}`;
    else if (pc <= 120) mood.innerHTML = `🙂 ราคาพอดี ถ้าขายได้ทั้งหมดได้ <b>${sgn(pts)}</b> ⭐`;
    else mood.innerHTML = `🤩 ได้คะแนนเยอะ <b>${sgn(pts)}</b> ⭐ แต่ระวัง! ร้านที่ถูกกว่าอาจแย่งขายไปก่อน`;
  }

  function validate() {
    const v = view;
    const errs = [];
    const per = {};
    let units = 0, n = 0;
    for (const b of v.buyers) {
      const d = drafts[b.id];
      if (!d || d.qty <= 0) continue;
      n++; units += d.qty;
      per[b.sku] = (per[b.sku] || 0) + d.qty;
      const floor = Math.ceil(b.ref * v.config.priceFloorPct / 100);
      if (!(d.price >= floor)) errs.push(`${b.name}: ราคาต่ำสุดคือ ฿${fmt(floor)}`);
    }
    for (const [sku, q] of Object.entries(per)) {
      const have = v.team.stock[sku] || 0;
      if (q > have) errs.push(`${skuOf(sku).name}: จะขายรวม ${q} แต่มีแค่ ${have}`);
    }
    return { errs, units, n };
  }

  function renderSubmitBar() {
    const bar = $('#submitBar');
    if (!view || view.phase !== 'bidding') { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const { errs, units, n } = validate();
    const paused = view.pausedRemainingMs != null;
    let msg;
    if (errs.length) msg = `<span class="err">⚠️ ${esc(errs[0])}</span>`;
    else if (n) msg = `จะขาย <b>${units}</b> ${esc(U())} ให้ผู้ซื้อ ${n} ร้าน`;
    else msg = 'ยังไม่ได้เลือกจำนวน';
    if (view.submitted === 'offer') msg = `<span class="okmsg">✅ ส่งราคาแล้ว</span> แก้แล้วกดส่งใหม่ได้จนหมดเวลา · ` + msg;
    if (view.submitted === 'skip') msg = `<span class="okmsg">😴 เลือกไม่ขายรอบนี้แล้ว</span> เปลี่ยนใจได้จนหมดเวลา`;
    if (paused) msg = '<span class="err">⏸ ผู้จัดหยุดเกมชั่วคราว</span> · ' + msg;
    $('#submitMsg').innerHTML = msg + `<br><span class="muted small">เพื่อนส่งแล้ว ${view.ready.ready}/${view.ready.total} คน</span>`;
    $('#sendBtn').disabled = !!errs.length || !n || paused;
    $('#skipBtn').disabled = paused;
    $('#sendBtn').textContent = view.submitted === 'offer' ? 'ส่งราคาใหม่ ✔' : 'ส่งราคา ✔';
  }

  $('#sendBtn').addEventListener('click', async () => {
    const offers = view.buyers.filter((b) => drafts[b.id]?.qty > 0).map((b) => ({ buyerId: b.id, qty: drafts[b.id].qty, price: drafts[b.id].price }));
    try { await api('/api/offers', { token, offers }); toast('✅ ส่งราคาแล้ว! ไม่มีใครเห็นราคาของคุณจนกว่าจะปิดรอบ'); }
    catch (e) { toast('⚠️ ' + e.message); }
  });
  $('#skipBtn').addEventListener('click', async () => {
    try { await api('/api/offers', { token, skip: true }); toast('😴 รอบนี้ไม่ขาย เก็บของไว้ขายรอบหน้า'); }
    catch (e) { toast('⚠️ ' + e.message); }
  });

  function updateMainLive() {
    const v = view;
    const sb = $('#statusBanner');
    if (sb && v.phase === 'bidding') {
      const ms = remainingMs(v);
      let h = v.lastRound && v.lastRound.round === v.round - 1
        ? `<div class="banner small">รอบที่แล้วคุณได้ <b class="num">${sgn(v.lastRound.delta)}</b> ⭐ · ดูรายละเอียดที่ "📒 ประวัติของฉัน"</div>` : '';
      if (ms != null && ms <= 10000 && v.ready.total && v.ready.ready === v.ready.total) h += '<div class="banner warn small">⏰ ทุกคนส่งครบแล้ว กำลังจะปิดรอบ!</div>';
      sb.innerHTML = h;
    }
  }

  // ---------- ผลรอบ ----------
  const REASON_KID = {
    sold: 'เย้! ขายได้ครบ',
    partial: 'ขายได้บางส่วน เพราะร้านที่ถูกกว่าขายไปก่อน ของเลยเหลือให้คุณไม่พอ',
    outbid: 'ขายไม่ได้ เพราะร้านอื่นตั้งราคาถูกกว่า แล้วผู้ซื้อได้ของครบก่อนถึงคิวคุณ',
    tie_lost: 'ราคาเท่ากับร้านอื่นพอดี แล้วจับฉลากแพ้',
    over_cap: 'แพงเกินที่ผู้ซื้อรับได้',
  };

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#FFC736', '#2FB463', '#FF5468', '#7B5CFF', '#FF9A3D', '#3FB6FF'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4000);
  }

  function renderResults() {
    const v = view;
    const lr = v.lastRound;
    const rows = v.history.filter((h) => lr && h.round === lr.round);
    const ended = v.phase === 'ended';
    const offers = lr ? lr.offers : [];
    const sold = offers.reduce((a, o) => a + o.sold, 0);
    const offered = offers.reduce((a, o) => a + o.qty, 0);
    const showRange = v.config.revealLevel !== 'self';
    let cls, face, title;
    if (!offers.length) { cls = 'meh'; face = '😴'; title = 'รอบนี้คุณพักไม่ได้ขาย'; }
    else if (sold === offered) { cls = 'win'; face = '🎉'; title = `ขายได้ครบ ${sold} ${U()}!`; }
    else if (sold > 0) { cls = 'meh'; face = '🙂'; title = `ขายได้ ${sold} จาก ${offered} ${U()}`; }
    else { cls = 'lose'; face = '😢'; title = 'รอบนี้ขายไม่ได้เลย'; }
    if (ended) { face = v.team.rank <= 3 ? medal(v.team.rank) || '🏆' : '🏁'; }
    $('#main').innerHTML = `
      <div class="panel hero-result ${ended ? 'win' : cls}">
        <div class="face">${face}</div>
        ${ended ? `<h1>จบเกมแล้ว! ${esc(v.team.name)} ได้อันดับ ${v.team.rank} จาก ${v.totalTeams}</h1>
          <div class="big">${fmt(v.team.score, 1)} ⭐</div>
          <p class="muted small">ผลนี้มาจากเกมจำลอง ใช้ฝึกคิด ไม่ใช่การทายผลการแข่งขันจริง</p>`
        : `<h1>${esc(title)}</h1>
          <div class="big" style="color:${lr && lr.delta < 0 ? '#C42036' : '#1E8A4A'}">${lr ? sgn(lr.delta) : '0'} ⭐</div>
          <p class="muted">รอผู้จัดเริ่มรอบที่ ${v.round + 1}…</p>`}
        <div class="kpis" style="width:100%">
          <div class="kpi"><span class="ic">⭐</span><b>${fmt(v.team.score, 1)}</b><span>คะแนนรวม</span></div>
          <div class="kpi"><span class="ic">🏆</span><b>${v.team.rank}/${v.totalTeams}</b><span>อันดับ</span></div>
          <div class="kpi"><span class="ic">🛍️</span><b>${stockTotal()}</b><span>${esc(U())}ที่เหลือ</span></div>
        </div>
      </div>
      ${offers.length ? `<div class="panel"><h2>ขายให้ใครไปบ้าง</h2>
        ${offers.map((o) => {
          const st = o.reason === 'sold' ? 'sold' : o.reason === 'partial' ? 'partial' : 'none';
          const tip = (o.reason === 'outbid' || o.reason === 'tie_lost' || o.reason === 'partial') && o.maxSoldPct != null
            ? `<br><span class="small">💡 รอบนี้ราคาที่แพงที่สุดที่ยังขายได้คือ ${fmt(o.maxSoldPct, 0)}% ของราคากลาง</span>` : '';
          return `<div class="deal ${st}"><div class="avatar">${buyerAvatar(o)}</div>
            <div class="body"><b>${esc(o.buyerName)}</b> · ${skuIcon(o.skuName + o.sku)} ${esc(o.skuName)}<br>
              <span class="small">เสนอ ${o.qty} ${esc(U())} ราคา ฿${fmt(o.price)} (${fmt(o.pct, 0)}%) → ขายได้ <b>${o.sold}</b></span><br>
              <span class="small">${esc(REASON_KID[o.reason] || o.reasonText)}</span>${tip}</div>
            <div class="res">${st === 'sold' ? '✅' : st === 'partial' ? '🟡' : '❌'}</div></div>`;
        }).join('')}</div>` : ''}
      <div class="btnrow"><button class="btn go big" id="quickCopy">📋 คัดลอกข้อมูลให้ AI</button><button class="btn dark big" id="quickAdvise">🤖 ถามหุ่นยนต์ช่วยคิด</button><button class="btn big" id="quickTrend">📈 ดูแนวโน้มราคา</button></div>
      <div class="panel">
        <header><h2>🛒 ตลาดรอบนี้เป็นยังไง</h2><span class="tag mut">${esc(REVEAL_TH[v.config.revealLevel])}</span></header>
        <div class="tablewrap"><table><thead><tr><th>ผู้ซื้อ</th><th>อยากได้</th><th class="n">ต้องการ</th><th class="n">ซื้อได้</th><th class="n">ร้านที่เสนอ</th>${showRange ? '<th class="n">ถูกสุด</th><th class="n">แพงสุดที่ขายได้</th>' : ''}</tr></thead><tbody>
          ${rows.map((r) => `<tr><td>${buyerAvatar(r)} ${esc(r.name)}</td><td>${skuIcon(r.skuName + r.sku)} ${esc(r.skuName)}</td><td class="n">${r.demand}</td><td class="n">${r.soldQty}${r.unfilled ? ` <span class="tag warn">ขาด ${r.unfilled}</span>` : ''}</td><td class="n">${r.offersCount}</td>${showRange ? `<td class="n">${r.minSoldPct != null ? fmt(r.minSoldPct, 0) + '%' : '-'}</td><td class="n">${r.maxSoldPct != null ? fmt(r.maxSoldPct, 0) + '%' : '-'}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>
        ${showRange ? '<p class="small muted">💡 "แพงสุดที่ขายได้" คือเส้นชัย ถ้ารอบหน้าตั้งต่ำกว่านี้นิดหน่อย มีโอกาสขายได้มากขึ้น</p>' : ''}
        ${v.config.revealLevel === 'all' ? rows.map((r) => `<p class="small"><b>${esc(r.name)}</b>: ${(r.bids || []).map((b) => `<span class="chip">${fmt(b.pct, 0)}%×${b.qty}${b.sold ? ' ✓' + b.sold : ''}</span>`).join(' ')}</p>`).join('') : ''}
      </div>`;
    $('#quickCopy').addEventListener('click', async () => { selectTab('copy'); await makeSummary(true); });
    $('#quickAdvise').addEventListener('click', () => { selectTab('ai'); runAdvice(); });
    $('#quickTrend').addEventListener('click', () => selectTab('trend'));
    const ck = v.phase + v.round;
    if (celebrated !== ck && ((lr && lr.delta > 0) || (ended && v.team.rank <= 3))) { celebrated = ck; confetti(); }
  }

  // ---------- แท็บ ----------
  let currentTab = 'ai';
  function selectTab(t) {
    currentTab = t;
    $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    ['ai', 'copy', 'history', 'trend', 'board', 'rules'].forEach((k) => $('#tab-' + k).classList.toggle('hidden', k !== t));
    renderTab(t);
    $('#tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));

  function renderTab(t) {
    if (!view) return;
    if (t === 'history') renderHistory();
    if (t === 'board') renderBoard();
    if (t === 'trend') window.CGTrend.mount($('#tab-trend .tr-body'), view.history, view.config, { rounds: view.rounds, prefer: Object.keys(view.team.stock).filter((k) => view.team.stock[k] > 0) });
    if (t === 'rules') renderRules();
  }

  function renderHistory() {
    const v = view;
    const mine = v.history.filter((h) => h.mine);
    $('#tab-history').innerHTML = `<header><h2>📒 ประวัติของฉัน</h2></header>
      <div class="legend"><span><i style="background:var(--berry)"></i>คะแนนรวมแต่ละรอบ</span></div>
      ${lineChart([{ name: 'score', color: 'var(--berry)', values: v.scoreSeries, width: 3 }])}
      ${mine.length ? `<div class="tablewrap"><table><thead><tr><th>รอบ</th><th>ผู้ซื้อ</th><th>กาแฟ</th><th class="n">เสนอ</th><th class="n">ราคา%</th><th class="n">ขายได้</th><th class="n">แพงสุดที่ขายได้</th></tr></thead><tbody>
        ${mine.map((h) => `<tr><td>${h.round}</td><td>${buyerAvatar(h)} ${esc(h.name)}</td><td>${skuIcon(h.skuName + h.sku)} ${esc(h.skuName)}</td><td class="n">${h.mine.qty} @ ฿${fmt(h.mine.price)}</td><td class="n">${fmt(h.mine.pct, 0)}%</td><td class="n">${h.mine.sold ? '✅ ' + h.mine.sold : '❌ 0'}</td><td class="n">${h.maxSoldPct != null ? fmt(h.maxSoldPct, 0) + '%' : '-'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">ยังไม่เคยเสนอขาย</p>'}`;
  }

  function renderBoard() {
    const v = view;
    $('#tab-board').innerHTML = `<header><h2>🏆 อันดับทั้งหมด (${v.leaderboard.length} ร้าน)</h2><span class="tag mut">🤖 = บอท</span></header>
      <div class="tablewrap" style="max-height:520px;overflow:auto"><table><thead><tr><th class="n">#</th><th>ร้าน</th><th class="n">⭐ คะแนน</th><th class="n">ขายแล้ว</th></tr></thead><tbody>
      ${v.leaderboard.map((r) => `<tr class="${r.me ? 'me' : ''}"><td class="n">${medal(r.rank) ? `<span class="medal">${medal(r.rank)}</span>` : r.rank}</td><td>${r.type === 'human' ? '🙂' : '🤖'} ${esc(r.name)}${r.me ? ' (คุณ)' : ''}</td><td class="n">${fmt(r.score, 1)}</td><td class="n">${r.soldUnits}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function renderRules() {
    $('#tab-rules').innerHTML = `<header><h2>📖 คู่มือวิธีเล่น</h2><button class="btn ghost" type="button" id="guideFull">เปิดเต็มจอ</button></header>` + window.CGGuide.render(view.config, 'player');
    $('#guideFull').addEventListener('click', () => window.CGGuide.open(view.config, 'player'));
  }

  // ---------- หุ่นยนต์ที่ปรึกษา ----------
  $$('#profileSeg button').forEach((b) => b.addEventListener('click', () => {
    profile = b.dataset.p;
    $$('#profileSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    runAdvice();
  }));
  $('#adviseBtn').addEventListener('click', runAdvice);

  async function runAdvice() {
    const out = $('#adviceOut');
    out.innerHTML = '<p class="muted">🤖 กำลังคิด…</p>';
    try {
      const a = await api(`/api/advice?token=${encodeURIComponent(token)}&profile=${profile}`);
      lastAdvice = a;
      if (!a.skus.length) { out.innerHTML = '<p class="muted">ของในร้านหมดแล้ว ไม่มีอะไรให้แนะนำ 🎉</p>'; return; }
      const bidding = view.phase === 'bidding';
      out.innerHTML = `
        <p>คำแนะนำสำหรับ <b>รอบที่ ${a.decisionRound}</b> (เหลือ ${a.roundsLeft} รอบ)</p>
        ${a.notes.map((n) => `<div class="banner warn small">💬 ${esc(n)}</div>`).join('')}
        <div class="grid g2">${a.skus.map((s) => adviceCard(s, bidding)).join('')}</div>
        ${bidding ? '<div class="btnrow"><button class="btn go big" id="applyAdvice">✨ ใส่ราคาที่แนะนำให้เลย</button></div>' : ''}
        <details><summary class="small muted">หุ่นยนต์คิดยังไง?</summary><p class="small muted">${esc(a.method)}<br>${esc(a.disclaimer)}</p></details>`;
      if (bidding) $('#applyAdvice').addEventListener('click', applyAdvice);
    } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  function adviceCard(s, bidding) {
    const icon = skuIcon(s.name + s.sku);
    const rec = s.action === 'hold' ? '😴 รอบนี้อย่าเพิ่งขาย' : s.action === 'no_buyer' ? '🙅 รอบนี้ไม่มีคนอยากได้' : `ขาย ${s.qtyNow} ${U()} ที่ ${s.recommendPct}% (฿${fmt(s.recommendPrice)})`;
    const conf = s.confidence === 'สูง' ? '😎 มั่นใจมาก' : s.confidence === 'กลาง' ? '🙂 มั่นใจพอสมควร' : '🤔 ยังเดาอยู่';
    return `<div class="advice">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${icon} ${esc(s.name)}</b><span class="tag grape">${conf}</span></div>
      <div class="rec">${esc(rec)}</div>
      <div class="kpis">
        <div class="kpi"><b>${fmt(s.pSell * 100)}%</b><span>โอกาสขายได้</span></div>
        <div class="kpi"><b>${sgn(s.expectedPerUnit)}</b><span>⭐ ที่คาดว่าจะได้/${esc(U())}</span></div>
      </div>
      ${bidding && s.perBuyer.length ? `<p class="small">แบ่งให้: ${s.perBuyer.filter((p) => p.qty > 0).map((p) => `${buyerAvatar(p)} ${esc(p.buyerName)} ${p.qty} ${esc(U())}`).join(' · ') || '-'}</p>` : ''}
      <table><thead><tr><th>นิสัย</th><th class="n">ราคา</th><th class="n">โอกาสขาย</th><th class="n">⭐/หน่วย</th></tr></thead><tbody>
        ${Object.entries(s.profiles).map(([k, p]) => `<tr><td>${{ conservative: '🐢 ปลอดภัย', balanced: '⚖️ พอดีๆ', aggressive: '🚀 กล้าเสี่ยง' }[k]}</td><td class="n">${p.pct}%</td><td class="n">${fmt(p.p * 100)}%</td><td class="n">${sgn(p.e)}</td></tr>`).join('')}
      </tbody></table>
      ${miniCurve(s)}
      <details><summary class="small">ทำไมแนะนำแบบนี้</summary><ul>${s.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
    </div>`;
  }

  function miniCurve(s) {
    const W = 320, H = 120, L = 30, R = 34, T = 8, B = 20;
    const c = s.curve;
    if (!c.length) return '';
    const lo = c[0].pct, hi = c[c.length - 1].pct;
    const emin = Math.min(0, ...c.map((d) => d.e)), emax = Math.max(1, ...c.map((d) => d.e));
    const X = (p) => L + (p - lo) / (hi - lo || 1) * (W - L - R);
    const Ye = (e) => T + (1 - (e - emin) / (emax - emin || 1)) * (H - T - B);
    const Yp = (p) => T + (1 - p) * (H - T - B);
    const path = (f, k) => c.map((d, i) => (i ? 'L' : 'M') + X(d.pct).toFixed(1) + ' ' + f(d[k]).toFixed(1)).join(' ');
    let g = `<line x1="${L}" x2="${W - R}" y1="${Ye(0)}" y2="${Ye(0)}" stroke="#C9B9A3"/>`;
    g += `<path d="${path(Yp, 'p')}" fill="none" stroke="var(--grass)" stroke-width="2.5"/>`;
    g += `<path d="${path(Ye, 'e')}" fill="none" stroke="var(--berry)" stroke-width="3"/>`;
    g += `<line x1="${X(s.recommendPct)}" x2="${X(s.recommendPct)}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="4 3" stroke-width="1.5"/>`;
    g += `<text x="${L}" y="${H - 6}">${lo}%</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${hi}%</text>`;
    return `<div><div class="legend"><span><i style="background:var(--berry)"></i>⭐ ที่คาดว่าจะได้</span><span><i style="background:var(--grass)"></i>โอกาสขายได้</span><span>┆ ราคาที่แนะนำ</span></div><svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg></div>`;
  }

  function applyAdvice() {
    if (!lastAdvice || view.phase !== 'bidding') return;
    for (const b of view.buyers) drafts[b.id] = { qty: 0, price: drafts[b.id]?.price || Math.round(b.ref * 1.1) };
    for (const s of lastAdvice.skus) for (const p of s.perBuyer) if (drafts[p.buyerId]) drafts[p.buyerId] = { qty: p.qty, price: p.price };
    renderBidding();
    renderSubmitBar();
    $('#main').scrollIntoView({ behavior: 'smooth' });
    toast('✨ ใส่ราคาให้แล้ว ลองดูอีกที แล้วกด "ส่งราคา"');
  }

  // ---------- คัดลอกสรุป ----------
  async function makeSummary(andCopy) {
    const box = $('#summaryBox');
    try {
      const text = await api('/api/summary?token=' + encodeURIComponent(token));
      box.value = text;
      if (andCopy) {
        const ok = await copyText(text, box);
        toast(ok ? '📋 คัดลอกแล้ว! เอาไปวางในแชต AI ได้เลย' : 'คัดลอกอัตโนมัติไม่ได้ กดค้างที่กล่องข้อความเพื่อคัดลอกเอง');
      }
    } catch (e) { toast(e.message); }
  }
  $('#copyBtn').addEventListener('click', () => makeSummary(true));
  $('#refreshSummary').addEventListener('click', () => makeSummary(false));

  connect();
})();
