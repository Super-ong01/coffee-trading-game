/* คู่มือวิธีเล่น ใช้ร่วมกันทั้งหน้าผู้เล่น หน้าผู้จัด และหน้า /guide
   CGGuide.render(config, role) คืน HTML · CGGuide.open() เปิดเป็นหน้าต่างซ้อน */
window.CGGuide = (function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('th-TH');
  const DEF = { rounds: 15, roundSeconds: 300, buyersPerRound: 6, stockPerTeam: 10, unitName: 'กระสอบ', priceCapPct: 150, priceFloorPct: 50, formula: 'B', belowRef: 'negative', unsoldPenalty: 0, revealLevel: 'range', stockMode: 'mixed', skusPerTeam: 2 };

  function render(cfgIn, role) {
    const c = { ...DEF, ...(cfgIn || {}) };
    const u = esc(c.unitName);
    const cap = c.priceCapPct;
    const mins = Math.round((c.roundSeconds / 60) * 10) / 10;
    const below = c.belowRef === 'zero' ? 'ได้ 0 คะแนน (ไม่ติดลบ)' : 'คะแนน<b>ติดลบ</b>';
    const fTxt = {
      A: 'ขายได้ 1 ครั้ง นับ % ส่วนต่าง 1 ครั้ง ไม่ว่าจะขายกี่' + u,
      B: '% ส่วนต่าง × จำนวน' + u + 'ที่ขายได้',
      C: 'ค่าเฉลี่ย % ส่วนต่างของทุกครั้งที่ขายได้',
    }[c.formula];
    const pts = (pct, q) => {
      let d = pct - 100;
      if (c.belowRef === 'zero' && d < 0) d = 0;
      return c.formula === 'B' ? d * q : d;
    };
    const sg = (n) => (n > 0 ? '+' : '') + fmt(n);

    return `
    <div class="guide">
      <a class="g-anim" href="/tutorial" target="_blank" rel="noopener">🎬 <b>ดูวิธีเล่นแบบอนิเมชัน</b> · ร้านการ์ตูนแข่งกันขายกาแฟให้คุณหมี เห็นผลจริงทุกขั้นตอน แล้วลองตั้งราคาเองได้ ▶</a>
      <section class="g-sec">
        <h2>🎯 เป้าหมายของเกม</h2>
        <p>คุณเป็นเจ้าของร้านขายเมล็ดกาแฟ<b>โรบัสต้า</b> ซึ่งแบ่งเป็นเกรด A (ดีที่สุด แพงสุด) ไปจนถึง G มีของ <b>${c.stockPerTeam} ${u}</b> ${c.stockMode === 'mixed' ? `คละ ${c.skusPerTeam} เกรด` : ''} เก็บ <b>⭐ คะแนน</b> ให้ได้มากที่สุดภายใน <b>${c.rounds} รอบ</b> (รอบละ ${mins} นาที) โดยขายให้ได้<b>แพงกว่าราคากลาง</b> และต้องขายให้ได้จริงด้วย</p>
      </section>

      <section class="g-sec">
        <h2>🔄 หนึ่งรอบเกิดอะไรขึ้นบ้าง</h2>
        <div class="steps">
          <div><b>🐻</b>1. มีผู้ซื้อ ${c.buyersPerRound} ราย บอกว่าอยากได้โรบัสต้าเกรดไหน กี่${u}</div>
          <div><b>🏷️</b>2. คุณเลือกผู้ซื้อ ใส่จำนวนกับราคา แล้วกด "ส่งราคา"</div>
          <div><b>🙈</b>3. ทุกร้านส่งพร้อมกัน ไม่มีใครเห็นราคาของใคร</div>
          <div><b>⬇️</b>4. ผู้ซื้อเรียงร้านจากราคาถูกไปแพง แล้วซื้อจนได้ของครบ</div>
          <div><b>⭐</b>5. ร้านที่ขายได้รับคะแนน แล้วทุกคนดูผลก่อนเริ่มรอบใหม่</div>
        </div>
      </section>

      <section class="g-sec">
        <h2>✍️ วิธีใส่ราคา</h2>
        <ol class="g-list">
          <li>หาการ์ดผู้ซื้อที่<b>อยากได้เกรดที่คุณมี</b> (การ์ดสีจาง = คุณไม่มีเกรดนั้น ขายให้ไม่ได้) · แต่ละเกรดมีราคากลางต่างกัน ดูราคากลางบนการ์ดทุกครั้ง</li>
          <li>กดปุ่ม <span class="kbd">+</span> / <span class="kbd">−</span> เลือกจำนวน${u}ที่จะขาย (ใส่ 0 = ไม่ขายให้ร้านนี้)</li>
          <li>ตั้งราคาต่อ${u} ได้ 3 วิธี: <b>เลื่อนแถบ</b>, กด<b>ปุ่มลัด</b> 90%–150%, หรือ<b>พิมพ์ตัวเลข</b> · ตัวเลข % ข้างช่องราคาบอกว่าแพงกว่าราคากลางแค่ไหน</li>
          <li>ขายให้ผู้ซื้อหลายรายในรอบเดียวกันได้ แต่จำนวนรวมต้องไม่เกินของที่มี</li>
          <li>กด <b>"ส่งราคา ✔"</b> · ส่งแล้วแก้และกดส่งใหม่ได้จนหมดเวลา</li>
          <li>ไม่อยากขายรอบนี้ กด <b>"😴 ไม่ขายรอบนี้"</b> ของจะเก็บไว้ขายรอบหน้า</li>
        </ol>
      </section>

      <section class="g-sec">
        <h2>⚖️ ตั้งราคาสูงหรือต่ำ เกิดอะไรขึ้น?</h2>
        <p>หลักง่ายๆ คือ <b>ราคาสูง = คะแนนต่อ${u}เยอะ แต่ขายยาก</b> และ <b>ราคาต่ำ = ขายง่าย แต่คะแนนน้อยหรือติดลบ</b> เพราะผู้ซื้อเลือกร้านที่ถูกที่สุดก่อนเสมอ</p>
        <div class="tablewrap"><table class="g-table">
          <thead><tr><th>ราคาที่ตั้ง</th><th>โอกาสขายได้</th><th>คะแนนถ้าขายได้</th><th>ข้อดี</th><th>ข้อเสีย</th></tr></thead>
          <tbody>
            <tr class="z-below"><td>😬 <b>ต่ำกว่าราคากลาง</b><br><span class="small">ต่ำกว่า 100%</span></td><td>สูงมาก</td><td>${below}</td><td>ขายได้แน่ ใช้ระบายของในรอบท้ายได้</td><td>ยิ่งขายยิ่งเสียคะแนน</td></tr>
            <tr class="z-ref"><td>😐 <b>เท่าราคากลาง</b><br><span class="small">100%</span></td><td>สูง</td><td>0 คะแนน</td><td>ปลอดภัย ไม่เสียคะแนน</td><td>ไม่ได้คะแนนเลย</td></tr>
            <tr class="z-ok"><td>🙂 <b>แพงขึ้นนิดหน่อย</b><br><span class="small">ประมาณ 105–120%</span></td><td>ปานกลางถึงสูง</td><td>ได้พอสมควร</td><td>สมดุลระหว่างคะแนนกับโอกาสขาย</td><td>ถ้าหลายร้านตั้งต่ำกว่า อาจขายไม่หมด</td></tr>
            <tr class="z-high"><td>🤩 <b>แพงมาก</b><br><span class="small">ประมาณ 125–${cap}%</span></td><td>ต่ำ</td><td>ได้เยอะมาก</td><td>ขายได้ครั้งเดียวก็ได้คะแนนก้อนใหญ่</td><td>ร้านที่ถูกกว่ามักแย่งขายจนผู้ซื้อได้ของครบก่อน</td></tr>
            <tr class="z-over"><td>😵 <b>เกินเพดาน</b><br><span class="small">มากกว่า ${cap}%</span></td><td>ขายไม่ได้แน่นอน</td><td>-</td><td>ไม่มี</td><td>ผู้ซื้อไม่รับเลย</td></tr>
          </tbody></table></div>
        <div class="banner good small">✅ <b>ขายไม่ได้ ไม่เสียคะแนน</b> ของยังอยู่ในร้าน เอาไปขายรอบหน้าได้${c.unsoldPenalty ? ` แต่ถ้าเหลือถึงตอนจบเกมจะโดนหัก ${c.unsoldPenalty} ⭐ ต่อ${u}` : ''}</div>
      </section>

      <section class="g-sec">
        <h2>🧮 ตัวอย่าง: ผู้ซื้อ 🐻 ต้องการ 5 ${u} · ราคากลาง ฿1,000</h2>
        <div class="grid g2">
          <div class="g-ex">
            <h3>กรณีที่ 1: คุณตั้ง ฿1,300 (130%) จำนวน 2</h3>
            <ol class="g-queue">
              <li class="ok">ร้าน A ฿950 × 3 → ขายได้ 3 <span class="small">(เหลือที่ว่าง 2)</span></li>
              <li class="ok">ร้าน B ฿1,100 × 2 → ขายได้ 2 <span class="small">(ผู้ซื้อได้ของครบแล้ว)</span></li>
              <li class="no">คุณ ฿1,300 × 2 → <b>ขายไม่ได้</b> ❌</li>
            </ol>
            <p class="small">คุณได้ 0 คะแนน แต่ของยังอยู่ ร้าน B ได้ ${sg(pts(110, 2))} ⭐</p>
          </div>
          <div class="g-ex">
            <h3>กรณีที่ 2: คุณตั้ง ฿1,050 (105%) จำนวน 2</h3>
            <ol class="g-queue">
              <li class="ok">ร้าน A ฿950 × 3 → ขายได้ 3</li>
              <li class="ok">คุณ ฿1,050 × 2 → <b>ขายได้ 2</b> ✅</li>
              <li class="no">ร้าน B ฿1,100 × 2 → ขายไม่ได้</li>
            </ol>
            <p class="small">คุณได้ <b>${sg(pts(105, 2))} ⭐</b> ส่วนร้าน A ขายต่ำกว่าราคากลาง ได้ ${sg(pts(95, 3))} ⭐</p>
          </div>
        </div>
        <p class="small muted">ถ้าไม่มีร้านอื่นขายเกรดนี้เลย คุณตั้ง ฿${fmt(cap * 10)} (${cap}%) ก็ขายได้ และได้ ${sg(pts(cap, 2))} ⭐</p>
      </section>

      <section class="g-sec">
        <h2>💡 เคล็ดลับตั้งราคา</h2>
        <ul class="g-list">
          <li>ดู <b>"แพงสุดที่ขายได้"</b> ของรอบก่อน ถ้าตั้งต่ำกว่านั้นเล็กน้อย มีโอกาสขายได้สูง</li>
          <li>ผู้ซื้อที่ <b>"ขาด"</b> ของในรอบก่อน แปลว่าคนขายน้อย ตั้งราคาสูงได้</li>
          <li><b>แบ่งขายหลายรอบ</b> ดีกว่าเทขายหมดในรอบเดียว เพราะถ้าพลาดจะได้มีโอกาสแก้ตัว</li>
          <li><b>เสนอจำนวนน้อย</b> เสี่ยงน้อย ส่วนเสนอจำนวนมากในราคาถูกจะช่วยระบายของได้เร็ว${c.formula === 'B' ? ' (สูตร B คะแนนคูณตามจำนวนที่ขายได้)' : ` (สูตร ${c.formula} ไม่คูณจำนวน ขายน้อยแต่แพงจึงคุ้มกว่า)`}</li>
          <li>ไม่แน่ใจก็ถาม <b>🤖 หุ่นยนต์ช่วยคิด</b> หรือกด <b>📋 คัดลอกข้อมูลให้ AI</b> แล้วไปถาม Claude หรือ ChatGPT</li>
          <li>ช่วง<b>รอบท้ายๆ</b> ควรเริ่มขายของที่เหลือ เพราะถ้าเหลือถึงตอนจบเกมจะไม่ได้คะแนน</li>
        </ul>
      </section>

      <section class="g-sec">
        <h2>⭐ คิดคะแนนยังไง</h2>
        <p class="g-formula">% ส่วนต่าง = (ราคาที่ขายได้ − ราคากลาง) ÷ ราคากลาง × 100</p>
        <p>สูตรของเกมนี้: <b>${fTxt}</b> · ขายต่ำกว่าราคากลาง ${below} · ราคาที่ส่งคือราคาที่ขายได้จริง</p>
        <p class="small muted">ตัวอย่าง: ราคากลาง ฿1,000 ขายได้ ฿1,200 จำนวน 3 ${u} → % ส่วนต่าง +20% → ได้ ${sg(pts(120, 3))} ⭐</p>
      </section>

      <section class="g-sec">
        <h2>🏁 เกมจบยังไง</h2>
        <ul class="g-list">
          <li>เกมจบ<b>อัตโนมัติ</b>เมื่อรอบที่ ${c.rounds} ปิด ซึ่งเกิดเมื่อหมดเวลา, ทุกคนส่งราคาครบ (ระบบนับถอยหลัง 10 วินาที) หรือผู้จัดกดปิดรอบ</li>
          <li>ของที่เหลือในร้านตอนจบเกม<b>ไม่ได้คะแนน</b>${c.unsoldPenalty ? ` และโดนหัก ${c.unsoldPenalty} ⭐ ต่อ${u}` : ''}</li>
          <li>ร้านที่ได้ ⭐ มากที่สุดชนะ 🥇 ถ้าคะแนนเท่ากัน ร้านที่ขายได้จำนวนมากกว่าได้อันดับดีกว่า</li>
          <li>หน้าจอจะแสดงอันดับสุดท้ายของทุกร้าน และกราฟคะแนนในแท็บ "📒 ประวัติของฉัน"</li>
        </ul>
      </section>

      ${role === 'host' ? `
      <section class="g-sec g-host">
        <h2>🧑‍🏫 สำหรับผู้จัด</h2>
        <ol class="g-list">
          <li><b>ก่อนเริ่ม:</b> ตั้งจำนวนคนจริงกับบอท และค่าอื่นๆ ระบบบันทึกเองอัตโนมัติ ให้ผู้เล่นต่อ Wi-Fi เดียวกัน แล้วเข้าลิงก์ที่แสดงบนจอ</li>
          <li><b>เริ่มเกม:</b> ปุ่มจะกดได้เมื่อคนจริงเข้าครบ (หรือเปลี่ยนเงื่อนไขเป็น "เริ่มได้เลย ที่ว่างเติมบอท")</li>
          <li><b>ระหว่างรอบ:</b> ใช้ 🔔 ปิดรอบตอนนี้ / +1 นาที / หยุดชั่วคราว ได้ และดูได้ว่าใครส่งแล้ว (✅ ส่งแล้ว, 😴 ไม่ขาย, ⏳ กำลังคิด)</li>
          <li><b>หลังรอบ:</b> เปิดสรุปตลาดให้ทุกคนดู แล้วกด "เริ่มรอบถัดไป ▶"</li>
          <li><b>จบเกม:</b> หลังรอบสุดท้ายระบบสรุปอันดับให้เอง กด "ดาวน์โหลด CSV/JSON" เพื่อเก็บผล แล้วกด "เริ่มเกมใหม่" ถ้าจะเล่นอีกรอบ (ผู้เล่นต้องเข้าร่วมใหม่)</li>
          <li><b>ปิดเซิร์ฟเวอร์กลางเกม:</b> เกมบันทึกอัตโนมัติ เปิด start-windows.bat ใหม่แล้วจะเล่นต่อจากเดิม</li>
        </ol>
      </section>` : ''}
      <p class="small muted">กติกาบางข้อเป็นสมมติฐานของเกมจำลอง ผู้จัดปรับได้ในหน้าตั้งค่า</p>
    </div>`;
  }

  let modal = null;
  function open(cfg, role) {
    close();
    modal = document.createElement('div');
    modal.className = 'g-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'คู่มือวิธีเล่น');
    modal.innerHTML = `<div class="g-card"><div class="g-head"><h1>📖 คู่มือวิธีเล่น</h1><div class="btnrow"><a class="btn dark" href="/tutorial" target="_blank" rel="noopener">🎬 ดูแบบอนิเมชัน</a><button class="btn stop" data-close>ปิด ✕</button></div></div><div class="g-body">${render(cfg, role)}</div></div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) close(); });
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    modal.querySelector('[data-close]').focus();
  }
  function close() {
    if (modal) { modal.remove(); modal = null; document.body.style.overflow = ''; }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { render, open, close };
})();
