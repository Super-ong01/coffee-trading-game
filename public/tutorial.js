/* วิธีเล่นแบบอนิเมชัน: ร้านการ์ตูนแข่งขายโรบัสต้าให้คุณหมี (กติกาเดียวกับเกมจริง) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString('th-TH');
  const sgn = (n) => (n > 0 ? '+' : '') + fmt(n);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = reduce ? 0.35 : 1;
  class Cancel extends Error {}

  // ---------- ตัวการ์ตูน ----------
  const INK = '#3A2413';
  function animalSVG(kind, color, mood = 'neutral') {
    const st = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
    let ears = '';
    if (kind === 'cat') ears = `<path d="M26 34 L24 8 L44 22 Z" fill="${color}" ${st}/><path d="M74 34 L76 8 L56 22 Z" fill="${color}" ${st}/>`;
    if (kind === 'rabbit') ears = `<ellipse cx="38" cy="14" rx="7" ry="20" fill="${color}" ${st}/><ellipse cx="62" cy="14" rx="7" ry="20" fill="${color}" ${st}/><ellipse cx="38" cy="15" rx="3" ry="12" fill="#FFD6E4"/><ellipse cx="62" cy="15" rx="3" ry="12" fill="#FFD6E4"/>`;
    if (kind === 'fox') ears = `<path d="M24 36 L20 4 L46 22 Z" fill="${color}" ${st}/><path d="M76 36 L80 4 L54 22 Z" fill="${color}" ${st}/><path d="M27 28 L25 12 L38 22 Z" fill="#fff"/><path d="M73 28 L75 12 L62 22 Z" fill="#fff"/>`;
    if (kind === 'owl') ears = `<path d="M28 28 L26 12 L40 22 Z" fill="${color}" ${st}/><path d="M72 28 L74 12 L60 22 Z" fill="${color}" ${st}/>`;
    if (kind === 'bear') ears = `<circle cx="28" cy="24" r="10" fill="${color}" ${st}/><circle cx="72" cy="24" r="10" fill="${color}" ${st}/><circle cx="28" cy="24" r="4" fill="#E9C29B"/><circle cx="72" cy="24" r="4" fill="#E9C29B"/>`;
    if (kind === 'pig') ears = `<path d="M28 30 L26 14 L42 22 Z" fill="${color}" ${st}/><path d="M72 30 L74 14 L58 22 Z" fill="${color}" ${st}/>`;
    const eyes = kind === 'owl'
      ? `<circle cx="39" cy="44" r="10" fill="#fff" ${st}/><circle cx="61" cy="44" r="10" fill="#fff" ${st}/><circle cx="39" cy="45" r="4" fill="${INK}"/><circle cx="61" cy="45" r="4" fill="${INK}"/><path d="M46 54 L50 60 L54 54 Z" fill="#FFB627" ${st}/>`
      : mood === 'happy'
        ? `<path d="M35 45 Q40 39 45 45" fill="none" ${st}/><path d="M55 45 Q60 39 65 45" fill="none" ${st}/>`
        : `<circle cx="40" cy="44" r="4" fill="${INK}"/><circle cx="60" cy="44" r="4" fill="${INK}"/>`;
    const snout = kind === 'pig' ? `<ellipse cx="50" cy="56" rx="9" ry="6" fill="#FFB3C7" ${st}/><circle cx="47" cy="56" r="1.6" fill="${INK}"/><circle cx="53" cy="56" r="1.6" fill="${INK}"/>`
      : kind === 'owl' ? '' : `<ellipse cx="50" cy="57" rx="11" ry="8" fill="#fff" opacity=".65"/><ellipse cx="50" cy="53" rx="3.5" ry="2.5" fill="${INK}"/>`;
    const mouth = mood === 'happy' ? `<path d="M42 60 Q50 70 58 60" fill="#FF7A8A" ${st}/>`
      : mood === 'sad' ? `<path d="M43 66 Q50 58 57 66" fill="none" ${st}/>`
        : mood === 'wow' ? `<ellipse cx="50" cy="63" rx="4" ry="5" fill="#FF7A8A" ${st}/>` : `<path d="M44 63 L56 63" fill="none" ${st}/>`;
    const cheeks = mood === 'happy' ? `<circle cx="32" cy="55" r="5" fill="#FF9AB0" opacity=".7"/><circle cx="68" cy="55" r="5" fill="#FF9AB0" opacity=".7"/>` : '';
    const tear = mood === 'sad' ? `<path d="M64 48 Q67 55 64 58 Q61 55 64 48 Z" fill="#6EC6FF" ${st}/>` : '';
    return `<svg viewBox="0 0 100 112" aria-hidden="true">
      <ellipse cx="50" cy="92" rx="30" ry="20" fill="${color}" ${st}/>
      <path d="M36 80 H64 V108 Q50 112 36 108 Z" fill="#FFF5D9" ${st}/>
      <circle cx="50" cy="94" r="3" fill="${INK}"/>
      ${ears}
      <circle cx="50" cy="46" r="27" fill="${color}" ${st}/>
      ${eyes}${snout}${mouth}${cheeks}${tear}
    </svg>`;
  }

  // ---------- กติกาจับคู่ (เหมือนเกมจริง) ----------
  function match(shops, demand, capPct) {
    const active = shops.filter((s) => s.qty > 0);
    const eligible = active.filter((s) => s.pct <= capPct).sort((a, b) => a.pct - b.pct || a.tie - b.tie);
    let left = demand;
    const res = {};
    shops.forEach((s) => (res[s.id] = { sold: 0, reason: s.qty > 0 ? 'outbid' : 'skip' }));
    for (const s of eligible) {
      const q = Math.min(s.qty, left);
      res[s.id].sold = q;
      left -= q;
      res[s.id].reason = q === s.qty ? 'sold' : q > 0 ? 'partial' : 'outbid';
    }
    active.filter((s) => s.pct > capPct).forEach((s) => (res[s.id].reason = 'over'));
    const order = [...eligible, ...active.filter((s) => s.pct > capPct).sort((a, b) => a.pct - b.pct), ...shops.filter((s) => s.qty <= 0)];
    const soldPcts = eligible.filter((s) => res[s.id].sold > 0).map((s) => s.pct);
    return { res, order, left, maxSoldPct: soldPcts.length ? Math.max(...soldPcts) : null };
  }
  const points = (pct, sold) => (pct - 100) * sold; // สูตร B
  const zoneOf = (pct, cap) => (pct > cap ? 'over' : pct < 100 ? 'below' : pct <= 120 ? 'ok' : 'high');

  // ---------- เวที ----------
  class Stage {
    constructor(el) { this.el = el; this.token = 0; this.instant = false; }
    async sleep(ms) {
      const t = this.token;
      if (!this.instant) await new Promise((r) => setTimeout(r, ms * SPEED));
      if (t !== this.token) throw new Cancel();
    }
    setup(sc) {
      this.token++;
      this.sc = sc;
      const el = this.el;
      el.innerHTML = `<div class="cloud" style="top:30px;animation-delay:-4s"></div><div class="cloud" style="top:70px;animation-delay:-18s;transform:scale(.7)"></div>
        <div class="buyer-wrap"><div>${animalSVG('bear', '#B07A4F', 'neutral')}</div>
          <div class="bear-bubble">อยากได้ <b>โรบัสต้าเกรด ${sc.grade}</b> <b>${sc.demand}</b> กระสอบ<br><span class="small">ราคากลาง ฿${fmt(sc.ref)} · รับไม่เกิน ฿${fmt(sc.ref * sc.cap / 100)}</span></div></div>
        <div class="cart"><div class="box"></div><div class="count">0/${sc.demand}</div></div>`;
      this.bear = el.querySelector('.buyer-wrap');
      this.cart = el.querySelector('.cart');
      this.cartBox = el.querySelector('.cart .box');
      this.cartCount = el.querySelector('.cart .count');
      this.got = 0;
      this.shopEls = {};
      const n = sc.shops.length;
      sc.shops.forEach((s, i) => {
        const d = document.createElement('div');
        d.className = 'shop' + (s.you ? ' you' : '');
        d.style.left = ((i + 0.5) / n) * 100 + '%';
        const z = zoneOf(s.pct, sc.cap);
        d.innerHTML = `<div class="pop"></div><div class="rank"></div>
          <div class="pcard"><div class="inner"><div class="face back">${s.qty > 0 ? '?' : '😴'}</div>
            <div class="face front ${s.qty > 0 ? z : ''}">${s.qty > 0 ? `฿${fmt(sc.ref * s.pct / 100)}<small>${s.pct}% × ${s.qty}</small>` : 'ไม่ขาย'}</div></div></div>
          <div class="ch">${animalSVG(s.animal, s.color, 'neutral')}</div>
          <div class="nm">${s.name}</div><div class="pile">${'🛍️'.repeat(s.qty)}</div><div class="stamp"></div>`;
        el.appendChild(d);
        this.shopEls[s.id] = d;
      });
      this.match = match(sc.shops, sc.demand, sc.cap);
    }
    mood(id, m) {
      const s = this.sc.shops.find((x) => x.id === id);
      this.shopEls[id].querySelector('.ch').innerHTML = animalSVG(s.animal, s.color, m);
    }
    async showShops() { for (const s of this.sc.shops) { this.shopEls[s.id].classList.add('in'); await this.sleep(180); } }
    async buyerIn() { this.bear.classList.add('in'); await this.sleep(500); this.cart.classList.add('in'); await this.sleep(700); }
    async writeBids() {
      for (const s of this.sc.shops) { const c = this.shopEls[s.id].querySelector('.pcard'); c.classList.add('in', 'writing'); await this.sleep(260); }
      await this.sleep(700);
      for (const s of this.sc.shops) this.shopEls[s.id].querySelector('.pcard').classList.remove('writing');
    }
    async reveal() {
      for (const s of this.sc.shops) {
        this.shopEls[s.id].querySelector('.pcard').classList.add('flip');
        if (s.qty > 0 && s.pct > this.sc.cap) this.mood(s.id, 'wow');
        await this.sleep(420);
      }
      await this.sleep(300);
    }
    async queue() {
      const n = this.sc.shops.length;
      this.match.order.forEach((s, i) => {
        const d = this.shopEls[s.id];
        d.style.left = ((i + 0.5) / n) * 100 + '%';
        if (s.qty > 0 && s.pct <= this.sc.cap) { const r = d.querySelector('.rank'); r.textContent = i + 1; r.classList.add('in'); }
      });
      await this.sleep(1000);
    }
    async flySack(id) {
      const d = this.shopEls[id];
      const pile = d.querySelector('.pile');
      const base = this.el.getBoundingClientRect();
      const a = pile.getBoundingClientRect();
      const b = this.cartBox.getBoundingClientRect();
      pile.textContent = pile.textContent.replace('🛍️', '');
      if (!this.instant) {
        const f = document.createElement('span');
        f.className = 'flysack';
        f.textContent = '🛍️';
        f.style.left = a.left - base.left + a.width / 2 - 12 + 'px';
        f.style.top = a.top - base.top + 'px';
        this.el.appendChild(f);
        f.getBoundingClientRect();
        f.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px,${b.top - a.top}px) rotate(360deg)`;
        await this.sleep(560);
        f.remove();
      }
      this.got++;
      this.cartBox.insertAdjacentHTML('beforeend', '<span>🛍️</span>');
      this.cartCount.textContent = `${this.got}/${this.sc.demand}`;
      if (this.got >= this.sc.demand) this.cart.classList.add('full');
    }
    async buy() {
      for (const s of this.match.order) {
        const r = this.match.res[s.id];
        if (s.qty <= 0) continue;
        const d = this.shopEls[s.id];
        d.classList.add('focus');
        await this.sleep(250);
        for (let k = 0; k < r.sold; k++) await this.flySack(s.id);
        d.classList.remove('focus');
        await this.sleep(150);
      }
      await this.sleep(300);
    }
    async results() {
      for (const s of this.sc.shops) {
        const r = this.match.res[s.id];
        const d = this.shopEls[s.id];
        const stamp = d.querySelector('.stamp');
        const pop = d.querySelector('.pop');
        if (s.qty <= 0) { stamp.textContent = 'พักรอบนี้'; stamp.className = 'stamp in'; this.mood(s.id, 'neutral'); continue; }
        const pts = points(s.pct, r.sold);
        stamp.textContent = r.reason === 'sold' ? `ขายได้ ${r.sold} ✓` : r.reason === 'partial' ? `ได้ ${r.sold}/${s.qty}` : r.reason === 'over' ? 'แพงเกิน!' : 'ขายไม่ได้';
        stamp.className = 'stamp in ' + (r.reason === 'sold' ? 'sold' : r.reason === 'partial' ? 'part' : 'none');
        pop.textContent = `${sgn(pts)} ⭐`;
        pop.className = 'pop in' + (pts < 0 ? ' neg' : pts === 0 ? ' zero' : '');
        this.mood(s.id, r.sold === 0 ? 'sad' : pts >= 0 ? 'happy' : 'neutral');
        await this.sleep(260);
      }
      this.bear.querySelector('div').innerHTML = animalSVG('bear', '#B07A4F', this.got >= this.sc.demand ? 'happy' : 'neutral');
      await this.sleep(400);
    }
    async fullRound() { await this.writeBids(); await this.reveal(); await this.queue(); await this.buy(); await this.results(); }
    overlay(html) {
      this.el.querySelectorAll('.overlay').forEach((x) => x.remove());
      const o = document.createElement('div');
      o.className = 'overlay';
      o.innerHTML = html;
      this.el.appendChild(o);
      o.getBoundingClientRect();
      o.classList.add('in');
      return o;
    }
  }

  function resultTable(sc, m) {
    return `<div class="tablewrap"><table class="restable"><thead><tr><th>ร้าน</th><th class="n">ราคา</th><th class="n">เสนอ</th><th class="n">ขายได้</th><th class="n">คะแนน</th></tr></thead><tbody>
      ${m.order.map((s) => { const r = m.res[s.id]; const p = points(s.pct, r.sold); return `<tr class="${s.you ? 'me' : ''}"><td>${s.name}</td><td class="n">${s.qty > 0 ? `฿${fmt(sc.ref * s.pct / 100)} (${s.pct}%)` : '-'}</td><td class="n">${s.qty}</td><td class="n">${s.qty > 0 ? (r.sold ? '✅ ' + r.sold : '❌ 0') : '😴'}</td><td class="n">${s.qty > 0 ? sgn(p) : '0'}</td></tr>`; }).join('')}
    </tbody></table></div><p class="small muted">คะแนน = (% ราคา − 100) × จำนวนที่ขายได้</p>`;
  }

  // ---------- โหมดเล่าเรื่อง ----------
  const STORY_SHOPS = (youPct) => [
    { id: 'you', name: 'ร้านคุณ', animal: 'cat', color: '#FFB86B', pct: youPct, qty: 2, you: true, tie: 0.5 },
    { id: 'rab', name: 'ร้านกระต่าย', animal: 'rabbit', color: '#F9C6DA', pct: 95, qty: 3, tie: 0.2 },
    { id: 'fox', name: 'ร้านจิ้งจอก', animal: 'fox', color: '#FF8A5B', pct: 110, qty: 2, tie: 0.4 },
    { id: 'owl', name: 'ร้านนกฮูก', animal: 'owl', color: '#B9A5FF', pct: 140, qty: 2, tie: 0.7 },
  ];
  const STORY = (youPct) => ({ grade: 'B', ref: 1250, demand: 5, cap: 150, shops: STORY_SHOPS(youPct) });

  const steps = [
    { title: '👋 ยินดีต้อนรับสู่ตลาดกาแฟ', text: 'นี่คือร้านขายเมล็ดโรบัสต้า 4 ร้าน ร้านสีส้มคือ<b>ร้านคุณ</b> ส่วนร้านอื่นเป็นคู่แข่ง ทุกร้านอยากขายของให้ได้ราคาดี',
      run: async (st) => { await st.showShops(); } },
    { title: '🐻 คุณหมีผู้ซื้อมาแล้ว', text: 'ผู้ซื้อบอกว่าอยากได้<b>เกรดไหน กี่กระสอบ</b> ราคากลางเท่าไร และ<b>ไม่ยอมจ่ายเกินเท่าไร</b> (เพดาน 150%) ในเกมจริงจะมีผู้ซื้อรอบละ 6 ราย',
      run: async (st) => { await st.buyerIn(); } },
    { title: '🙈 ทุกร้านเขียนราคาแบบปิดไว้', text: 'ทุกร้านใส่ราคาและจำนวนพร้อมกัน <b>ไม่มีใครเห็นราคาของใคร</b> ร้านคุณตั้งไว้สูงถึง 130% เพราะอยากได้คะแนนเยอะ',
      run: async (st) => { await st.writeBids(); } },
    { title: '🃏 หมดเวลา! เปิดราคา', text: 'พอปิดรอบ ราคาของทุกร้านจะถูกเปิดออกมา สีของป้ายราคาบอกว่าถูกหรือแพง: <span class="tag bad">ต่ำกว่าราคากลาง</span> <span class="tag good">พอดี</span> <span class="tag warn">แพง</span>',
      run: async (st) => { await st.reveal(); } },
    { title: '⬇️ เรียงจากถูกไปแพง', text: 'คุณหมีชอบของถูก จึงจัดคิวให้<b>ร้านที่ถูกที่สุดได้ขายก่อน</b> ตัวเลขสีม่วงคือลำดับคิว',
      run: async (st) => { await st.queue(); } },
    { title: '🛍️ คุณหมีซื้อจนได้ของครบ', text: 'คุณหมีซื้อจากคิวที่ 1 ก่อน แล้วไล่ไปเรื่อยๆ จนได้ครบ 5 กระสอบ <b>พอครบแล้วจะหยุดซื้อทันที</b> ร้านที่อยู่ท้ายคิวจึงอาจขายไม่ได้',
      run: async (st) => { await st.buy(); } },
    { title: '😢 ผลลัพธ์: ร้านคุณขายไม่ได้', text: 'ร้านกระต่ายขายได้ 3 แต่ราคาต่ำกว่าราคากลางเลย<b>เสียคะแนน</b> ร้านจิ้งจอกขายได้ 2 ได้คะแนน ส่วนร้านคุณ (130%) <b>แพงไป ขายไม่ได้</b> แต่ไม่เสียคะแนน และของยังอยู่ไว้ขายรอบหน้า',
      run: async (st) => { await st.results(); }, extra: (st) => resultTable(st.sc, st.match) },
    { title: '🔁 ลองใหม่: ตั้งราคา 105%', text: 'รอบนี้ร้านคุณลดราคาลงเหลือ 105% ซึ่งถูกกว่าร้านจิ้งจอก จึงได้คิวที่ 2 คราวนี้<b>ขายได้ 2 กระสอบ ได้ +10 ⭐</b> ร้านจิ้งจอกกลายเป็นฝ่ายขายไม่ได้แทน',
      run: async (st) => {
        const ff = st.ff;
        st.setup(STORY(105)); st.instant = true; st.el.classList.add('instant');
        await st.showShops(); await st.buyerIn();
        st.el.getBoundingClientRect();
        if (!ff) st.el.classList.remove('instant');
        st.instant = ff;
        await st.fullRound();
      },
      extra: (st) => resultTable(st.sc, st.match) },
    { title: '⚖️ ตั้งราคาสูงหรือต่ำดี?', text: '<b>ราคาสูง</b> = คะแนนต่อกระสอบเยอะ แต่เสี่ยงขายไม่ได้ · <b>ราคาต่ำ</b> = ขายง่าย แต่คะแนนน้อยหรือติดลบ · ดู "แพงสุดที่ขายได้" ของรอบก่อนช่วยเดาได้',
      run: async (st) => {
        const o = st.overlay(`<h2>ราคาแต่ละแบบเป็นยังไง</h2><div class="zones">
          <div class="zone z-below"><b>😬</b><h4>ต่ำกว่า 100%</h4><p>ขายได้แน่ แต่เสียคะแนน</p></div>
          <div class="zone z-ref"><b>😐</b><h4>100%</h4><p>ขายง่าย ได้ 0 คะแนน</p></div>
          <div class="zone z-ok"><b>🙂</b><h4>105–120%</h4><p>สมดุล น่าลองที่สุด</p></div>
          <div class="zone z-high"><b>🤩</b><h4>125–150%</h4><p>คะแนนเยอะ แต่เสี่ยงโดนแย่ง</p></div>
          <div class="zone z-over"><b>😵</b><h4>เกิน 150%</h4><p>ขายไม่ได้แน่นอน</p></div></div>
          <p class="small">ขายไม่ได้ = ไม่เสียคะแนน ของยังอยู่ไว้ขายรอบหน้า</p>`);
        for (const z of o.querySelectorAll('.zone')) { z.classList.add('in'); await st.sleep(250); }
      } },
    { title: '🏁 เกมจบยังไง', text: 'เล่นไปจน<b>ครบ 15 รอบ</b> เกมก็จบเอง ของที่เหลือในร้าน<b>ไม่ได้คะแนน</b> (รอบท้ายๆ ควรเริ่มขายให้หมด) ร้านที่ได้ ⭐ มากที่สุดชนะ ถ้าคะแนนเท่ากัน ร้านที่ขายได้มากกว่าชนะ',
      run: async (st) => {
        const o = st.overlay(`<div class="rounds15">${Array.from({ length: 15 }, () => '<i></i>').join('')}</div><p class="small" id="rtxt">รอบที่ 0/15</p>
          <div class="podium">
            <div class="p">${animalSVG('fox', '#FF8A5B', 'happy')}<div class="blk b2">🥈</div></div>
            <div class="p">${animalSVG('cat', '#FFB86B', 'happy')}<div class="blk b1">🥇</div></div>
            <div class="p">${animalSVG('owl', '#B9A5FF', 'happy')}<div class="blk b3">🥉</div></div></div>`);
        const dots = o.querySelectorAll('.rounds15 i');
        for (let i = 0; i < dots.length; i++) { dots[i].classList.add('on'); o.querySelector('#rtxt').textContent = `รอบที่ ${i + 1}/15`; await st.sleep(110); }
        o.querySelector('#rtxt').textContent = 'ครบ 15 รอบ จบเกม! ประกาศผล 🎉';
        const ps = o.querySelectorAll('.podium .p');
        for (const i of [2, 0, 1]) { ps[i].classList.add('in'); await st.sleep(350); }
      } },
  ];

  const story = new Stage($('#storyStage'));
  let cur = 0, auto = false, autoT = null, goId = 0;
  const dotsEl = $('#dots');
  dotsEl.innerHTML = steps.map((_, i) => `<button aria-label="ตอนที่ ${i + 1}" data-i="${i}"></button>`).join('');
  dotsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { stopAuto(); go(Number(b.dataset.i)); } });

  async function go(i) {
    cur = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[cur];
    $('#capTitle').innerHTML = s.title;
    $('#capText').innerHTML = s.text;
    $('#capExtra').innerHTML = '';
    $('#stepTag').textContent = `ตอนที่ ${cur + 1}/${steps.length}`;
    [...dotsEl.children].forEach((d, k) => { d.classList.toggle('on', k === cur); d.classList.toggle('done', k < cur); });
    $('#prevBtn').disabled = cur === 0;
    $('#nextBtn').textContent = cur === steps.length - 1 ? 'ลองเล่นเอง ▼' : 'ถัดไป ▶';
    clearTimeout(autoT);
    const myGo = ++goId;
    story.setup(STORY(130));
    try {
      // เล่นตอนก่อนหน้าแบบทันที แล้วค่อยเล่นตอนนี้แบบมีอนิเมชัน
      story.instant = true; story.ff = true;
      story.el.classList.add('instant');
      for (let k = 0; k < cur; k++) await steps[k].run(story);
      story.el.getBoundingClientRect();
      story.el.classList.remove('instant');
      story.instant = false; story.ff = false;
      await steps[cur].run(story);
      if (s.extra) $('#capExtra').innerHTML = s.extra(story);
      if (auto && goId === myGo) autoT = setTimeout(() => (cur < steps.length - 1 ? go(cur + 1) : stopAuto()), 2600);
    } catch (e) { if (!(e instanceof Cancel)) console.error(e); }
  }
  function stopAuto() { auto = false; clearTimeout(autoT); $('#playBtn').textContent = '⏵ เล่นอัตโนมัติ'; }
  $('#prevBtn').addEventListener('click', () => { stopAuto(); go(cur - 1); });
  $('#nextBtn').addEventListener('click', () => {
    stopAuto();
    if (cur === steps.length - 1) $('#sandbox').scrollIntoView({ behavior: 'smooth' });
    else go(cur + 1);
  });
  $('#playBtn').addEventListener('click', () => {
    if (auto) return stopAuto();
    auto = true; $('#playBtn').textContent = '⏸ หยุด';
    go(cur === steps.length - 1 ? 0 : cur);
  });

  // ---------- โหมดลองเอง ----------
  let GRADES = [
    { g: 'A', ref: 1400 }, { g: 'B', ref: 1250 }, { g: 'C', ref: 1100 }, { g: 'D', ref: 950 }, { g: 'E', ref: 800 }, { g: 'F', ref: 650 }, { g: 'G', ref: 500 },
  ];
  let CAP = 150;
  const sb = new Stage($('#sbStage'));
  let seed = 7;
  const history = [];
  function rng(s) { return function () { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const R5 = (x) => Math.round(x / 5) * 5;

  function sbScenario() {
    const r = rng(seed * 97 + $('#sbScen').selectedIndex);
    const scen = $('#sbScen').value;
    const g = GRADES.find((x) => x.g === $('#sbGrade').value) || GRADES[0];
    const base = [
      { id: 'rab', name: 'ร้านกระต่าย', animal: 'rabbit', color: '#F9C6DA' },
      { id: 'fox', name: 'ร้านจิ้งจอก', animal: 'fox', color: '#FF8A5B' },
      { id: 'pig', name: 'ร้านหมูน้อย', animal: 'pig', color: '#FFC2D1' },
    ];
    let demand = 5;
    let rivals;
    if (scen === 'undercut') rivals = base.map((b) => ({ ...b, pct: R5(80 + r() * 20), qty: 1 + Math.floor(r() * 3) }));
    else if (scen === 'none') rivals = base.map((b) => ({ ...b, pct: 100, qty: 0 }));
    else if (scen === 'bigdemand') { demand = 9; rivals = base.map((b, i) => ({ ...b, pct: R5(100 + r() * 45), qty: 1 + Math.floor(r() * 2) })); }
    else rivals = [
      { ...base[0], pct: R5(90 + r() * 15), qty: 1 + Math.floor(r() * 3) },
      { ...base[1], pct: R5(100 + r() * 25), qty: 1 + Math.floor(r() * 2) },
      { ...base[2], pct: R5(115 + r() * 35), qty: 1 + Math.floor(r() * 3) },
    ];
    rivals.forEach((x) => (x.tie = r()));
    const you = { id: 'you', name: 'ร้านคุณ', animal: 'cat', color: '#FFB86B', pct: Number($('#sbPrice').value), qty: Number($('#sbQty').value), you: true, tie: r() };
    const shops = [you, ...rivals];
    return { grade: g.g, ref: g.ref, demand, cap: CAP, shops };
  }

  function sbMood() {
    const pct = Number($('#sbPrice').value);
    const g = GRADES.find((x) => x.g === $('#sbGrade').value) || GRADES[0];
    const q = Number($('#sbQty').value);
    $('#sbPriceTxt').textContent = `฿${fmt(g.ref * pct / 100)} (${pct}%)`;
    const z = zoneOf(pct, CAP);
    const m = $('#sbMood');
    m.className = 'mood ' + (z === 'high' ? 'ok' : z);
    m.innerHTML = z === 'over' ? '😵 แพงเกินเพดาน คุณหมีไม่ซื้อแน่นอน'
      : z === 'below' ? `😬 ถูกกว่าราคากลาง ขายง่าย แต่ถ้าขายได้จะเสีย ${sgn(points(pct, q))} ⭐`
        : z === 'ok' ? `🙂 ราคาพอดี ถ้าขายได้ทั้งหมดได้ ${sgn(points(pct, q))} ⭐`
          : `🤩 ถ้าขายได้ทั้งหมดได้ ${sgn(points(pct, q))} ⭐ แต่เสี่ยงโดนร้านที่ถูกกว่าแย่ง`;
  }

  async function sbIdle() {
    sb.setup(sbScenario());
    sb.instant = true; sb.el.classList.add('instant');
    try { await sb.showShops(); await sb.buyerIn(); } catch { /* ignore */ }
    sb.el.getBoundingClientRect(); sb.el.classList.remove('instant'); sb.instant = false;
    $('#sbResult').innerHTML = '<p class="muted small">ตั้งราคาแล้วกด "ส่งราคา ▶" ได้เลย</p>';
  }

  let running = false;
  async function sbRun() {
    if (running) return;
    running = true;
    $('#sbGo').disabled = true;
    const sc = sbScenario();
    sb.setup(sc);
    sb.instant = true; sb.el.classList.add('instant');
    await sb.showShops(); await sb.buyerIn();
    sb.el.getBoundingClientRect(); sb.el.classList.remove('instant'); sb.instant = false;
    $('#sbResult').innerHTML = '<p class="muted">⏳ คุณหมีกำลังเลือกซื้อ…</p>';
    try {
      await sb.fullRound();
      const m = sb.match;
      const you = sc.shops[0];
      const r = m.res.you;
      const pts = points(you.pct, r.sold);
      let head, why, cls;
      if (r.reason === 'over') { head = '😵 แพงเกินไป ขายไม่ได้'; cls = 'bad'; why = `ราคาคุณ ${you.pct}% เกินเพดาน ${CAP}% คุณหมีไม่ซื้อเลย`; }
      else if (r.sold === 0) { head = '😢 ขายไม่ได้'; cls = 'bad'; why = 'ร้านที่ถูกกว่าคุณขายจนคุณหมีได้ของครบก่อนถึงคิวคุณ'; }
      else if (r.sold < you.qty) { head = `🙂 ขายได้ ${r.sold} จาก ${you.qty}`; cls = 'warn'; why = 'ร้านที่ถูกกว่าขายไปก่อน ของที่คุณหมียังต้องการเลยเหลือให้คุณไม่พอ'; }
      else { head = `🎉 ขายได้ครบ ${r.sold} กระสอบ!`; cls = 'good'; why = m.order[0].id === 'you' ? 'คุณถูกที่สุด เลยได้ขายเป็นร้านแรก' : 'ยังมีที่ว่างพอถึงคิวคุณ'; if (you.pct >= 125) why += ' และได้ราคาสูงด้วย เยี่ยมมาก!'; }
      const tip = r.sold < you.qty && m.maxSoldPct != null && r.reason !== 'skip'
        ? `💡 รอบนี้ราคาแพงที่สุดที่ยังขายได้คือ ${m.maxSoldPct}% ลองตั้งต่ำกว่านั้นดู`
        : pts < 0 ? '💡 ขายได้ก็จริง แต่ราคาต่ำกว่าราคากลางเลยเสียคะแนน ลองขยับราคาขึ้นเหนือ 100%'
          : r.sold === you.qty && m.left === 0 ? '💡 ขายได้ครบแล้ว ลองขยับราคาขึ้นอีกนิดดูว่ายังขายได้ไหม' : m.left > 0 ? '💡 คุณหมียังได้ของไม่ครบ แปลว่าของขาดตลาด ตั้งแพงขึ้นได้อีก' : '';
      $('#sbResult').innerHTML = `<div class="banner ${cls}"><h3>${head} <span class="num">${sgn(pts)} ⭐</span></h3><p class="small">${why}</p>${tip ? `<p class="small">${tip}</p>` : ''}</div>${resultTable(sc, m)}`;
      history.unshift({ pct: you.pct, qty: you.qty, sold: r.sold, pts, scen: $('#sbScen').selectedOptions[0].text });
      history.length = Math.min(history.length, 8);
      $('#sbHistory').innerHTML = `<p class="small muted">ที่ลองไปแล้ว:</p><div class="histrow">${history.map((h) => `<span class="chip">${h.pct}% × ${h.qty} → ${h.sold ? '✅' : '❌'} ${sgn(h.pts)}⭐ <span class="small muted">(${h.scen})</span></span>`).join('')}</div>`;
    } catch (e) { if (!(e instanceof Cancel)) console.error(e); }
    running = false;
    $('#sbGo').disabled = false;
  }

  function setupSandbox() {
    $('#sbGrade').innerHTML = GRADES.map((g) => `<option value="${g.g}">เกรด ${g.g} · ราคากลาง ฿${fmt(g.ref)}</option>`).join('');
    $('#sbGrade').value = GRADES[Math.min(1, GRADES.length - 1)].g;
    $('#sbPrice').max = Math.max(160, CAP + 10);
    const onChange = () => { sbMood(); if (!running) sbIdle(); };
    ['sbScen', 'sbGrade'].forEach((id) => $('#' + id).addEventListener('change', onChange));
    $('#sbPrice').addEventListener('input', sbMood);
    $('#sbPrice').addEventListener('change', () => { if (!running) sbIdle(); });
    const q = $('#sbQty');
    const setQ = (v) => { q.value = Math.max(1, Math.min(5, v)); sbMood(); if (!running) sbIdle(); };
    $('#sbMinus').addEventListener('click', () => setQ(Number(q.value) - 1));
    $('#sbPlus').addEventListener('click', () => setQ(Number(q.value) + 1));
    q.addEventListener('change', () => setQ(Number(q.value) || 1));
    $('#sbGo').addEventListener('click', sbRun);
    $('#sbReroll').addEventListener('click', () => { seed = Math.floor(Math.random() * 1e6); sbIdle(); });
    sbMood();
    sbIdle();
  }

  // ใช้ราคากลางและเพดานจากเกมจริง (ถ้าเซิร์ฟเวอร์ส่งมาได้)
  fetch('/api/config').then((r) => r.json()).then((cfg) => {
    const gs = (cfg.skus || []).map((s) => { const m = String(s.name).match(/เกรด\s*([A-Z])/i); return m ? { g: m[1].toUpperCase(), ref: s.ref } : null; }).filter(Boolean);
    if (gs.length) GRADES = gs;
    if (cfg.priceCapPct) CAP = cfg.priceCapPct;
  }).catch(() => {}).finally(() => { setupSandbox(); go(0); });
})();
