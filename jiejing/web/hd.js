// 借景 · 高清画面（1920×1080）。规则全在 core/core.js，这里只画、只读键盘鼠标、只放声音。
// 规则坐标仍是 320×180，画面上 1 格 = 6 像素。素材在 hd/（tools/hd_assets.py 处理），说明在 data/hd.json。
(function () {
  'use strict';
  const S = 6, W = 1920, H = 1080;
  const base = document.currentScript.dataset.base || '..';
  const cv = document.getElementById('c'), mainG = cv.getContext('2d');
  let g = mainG;
  cv.width = W; cv.height = H;

  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(src); i.src = src; });
  const getJSON = u => fetch(u).then(r => r.json());
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  let LV, M, IMG = {}, G, li = 0, levelT = 0, nextT = -1, flash = null, bloomAt = null, landT = 0, walkT = 0, selT = 0;
  let scene = null;            // 当前景预先画好的各层
  const Q = new URLSearchParams(location.search);
  const shake = [0, 0, 0];
  let guided = false;
  try { guided = localStorage.getItem('jj_guided') === '1'; } catch (e) { }

  const img = k => IMG[k];
  async function boot() {
    LV = (await getJSON(base + '/data/levels.json')).levels;
    M = await getJSON(base + '/data/hd.json');
    const keys = [];
    for (const p in M.char) keys.push('char_' + p);
    for (const c in M.bg) for (const k of ['sky', 'mountains', 'midground', 'mist', 'water']) if (M.bg[c][k]) keys.push(M.bg[c][k]);
    for (const k in M.comp) { if (M.comp[k].left) for (const p of ['left', 'middle', 'right']) keys.push('w_' + k + '_' + p); else keys.push('w_' + k); }
    for (const k in M.props) keys.push('p_' + k);
    await Promise.all(keys.map(k => load(base + '/hd/' + k + '.webp').then(i => { IMG[k] = i; })));
    try { await document.fonts.load('80px JJBrush', '借景'); } catch (e) { }
    li = Math.max(0, LV.findIndex(l => l.id === Q.get('l')));
    start(li);
    resize(); addEventListener('resize', resize);
    let acc = 0, last = performance.now();
    (function frame(now) {
      acc += Math.min(0.1, (now - last) / 1000); last = now;
      while (acc >= 1 / 60) { tick(); acc -= 1 / 60; }
      draw();
      requestAnimationFrame(frame);
    })(last);
  }
  function start(i) {
    li = (i + LV.length) % LV.length;
    G = JJ.Game(LV[li]);
    levelT = 0; nextT = -1; flash = null; bloomAt = null; landT = 0;
    scene = buildScene(LV[li]);
    particles.length = 0;
  }
  window.JJView = { start: i => start(i), get G() { return G; }, levels: () => LV, get levelT() { return levelT; }, set levelT(v) { levelT = v; } };
  function resize() {
    const r = Math.min(innerWidth / W, innerHeight / H);
    cv.style.width = Math.floor(W * r) + 'px'; cv.style.height = Math.floor(H * r) + 'px';
  }

  // ------------------------------------------------------------ 景：章、配色
  const chap = L => +L.id[0];
  const ROLE = { 1: { far: 'rgba(236,228,212,0.50)', mid: 'rgba(236,228,212,0.18)' }, 2: { far: 'rgba(240,222,196,0.50)', mid: 'rgba(240,222,196,0.18)' },
    3: { far: 'rgba(30,36,48,0.45)', mid: 'rgba(30,36,48,0.20)' }, 4: { far: 'rgba(236,236,236,0.50)', mid: 'rgba(236,236,236,0.18)' } };

  // ------------------------------------------------------------ 组件：把一条墨线“穿上衣服”
  // 平的一段：左端头 + 中段平铺 + 右端头，桥面上沿对齐线的 y
  function run(c, kind, x1, x2, y) {
    const C = M.comp[kind]; if (!C) return;
    const L = C.left, Mi = C.middle, R = C.right;
    const w = x2 - x1;
    c.save(); c.beginPath(); c.rect(x1 - 2, 0, w + 4, H + 400); c.clip();
    if (w >= L.w + R.w) {
      // 中段先铺满（伸到两端头底下一截），端头压在上面，接口就不会露缝
      for (let x = x1 + L.w * 0.45; x < x2 - R.w * 0.45; x += Mi.w - 2) c.drawImage(img('w_' + kind + '_middle'), Math.round(x), y - Mi.top);
      c.drawImage(img('w_' + kind + '_left'), x1, y - L.top);
      c.drawImage(img('w_' + kind + '_right'), x2 - R.w, y - R.top);
    } else {
      for (let x = x1; x < x2; x += Mi.w) c.drawImage(img('w_' + kind + '_middle'), x, y - Mi.top);
    }
    c.restore();
  }
  // 斜的一段：石阶拉到这段的外框里（往下走就翻过来）
  function slope(c, x1, y1, x2, y2) {
    const C = M.comp.stair, up = y2 < y1;
    const w = x2 - x1, h = Math.abs(y2 - y1);
    // 石阶图里台阶面大约从左下到右上占满；按外框拉伸，底下多留一截
    c.save();
    c.translate(up ? x1 : x2, Math.min(y1, y2) - 10);
    if (!up) c.scale(-1, 1);
    c.drawImage(img('w_stair'), 0, 0, w, h + 70);
    c.restore();
  }
  function archHalf(c, pts, right) {
    const xs = pts.map(p => p[0] * S), ys = pts.map(p => p[1] * S);
    const x1 = Math.min(...xs), x2 = Math.max(...xs), top = Math.min(...ys), bot = Math.max(...ys);
    const C = M.comp.arch, sc = (x2 - x1) / C.w;
    c.save(); c.translate(right ? x2 : x1, top - C.top * sc); if (right) c.scale(-1, 1);
    c.drawImage(img('w_arch'), 0, 0, C.w * sc, C.h * sc);
    c.restore();
  }
  const KIND = { bank: 'bank', plank: 'plank', terrace: 'terrace', floor: 'floor', path: 'path', stair: 'path', arch: 'bank' };
  function snowKind(k, ch) { if (ch !== 4) return k; return k === 'bank' ? 'snowbank' : k === 'plank' ? 'snowplank' : k; }
  function drawLine(c, l, ch, forceKind) {
    const pts = l.pts;
    if (l.kind === 'boat') {
      const B = M.comp.boat, x1 = pts[0][0] * S, x2 = pts[pts.length - 1][0] * S, y = pts[0][1] * S;
      const sc = (x2 - x1) * 1.5 / B.w;
      c.drawImage(img('w_boat'), (x1 + x2) / 2 - B.w * sc / 2, y - B.top * sc, B.w * sc, B.h * sc);
      return;
    }
    if (l.kind === 'arch' && !forceKind) { archHalf(c, pts, pts[0][1] < pts[pts.length - 1][1]); return; }
    const kind = forceKind || snowKind(KIND[l.kind] || 'bank', ch);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a[1] === b[1]) run(c, kind, a[0] * S, b[0] * S, a[1] * S);
      else slope(c, a[0] * S, a[1] * S, b[0] * S, b[1] * S);
    }
  }

  // ------------------------------------------------------------ 程序画的建筑（素材没到时顶上）：粉墙黛瓦，开月洞门 / 漏窗
  function wall(c, d, x0) {
    const x1 = (d.x1 + x0) * S, x2 = (d.x2 + x0) * S, y1 = d.y1 * S, y2 = d.y2 * S;
    const t = mk(x2 - x1 + 80, y2 - y1 + 80), q = t.getContext('2d'), ox = 40, oy = 60;
    // 墙身
    const gr = q.createLinearGradient(0, oy, 0, oy + y2 - y1);
    gr.addColorStop(0, '#F3EEE2'); gr.addColorStop(0.8, '#E9E2D2'); gr.addColorStop(1, '#C9C1AF');
    q.fillStyle = gr; q.fillRect(ox, oy, x2 - x1, y2 - y1);
    // 水渍
    for (let i = 0; i < 40; i++) {
      const xx = ox + ((i * 97) % (x2 - x1)), yy = oy + 20 + ((i * 53) % Math.max(1, y2 - y1 - 20));
      const r = q.createRadialGradient(xx, yy, 0, xx, yy, 30 + (i % 5) * 10);
      r.addColorStop(0, 'rgba(120,112,96,0.10)'); r.addColorStop(1, 'rgba(120,112,96,0)');
      q.fillStyle = r; q.fillRect(xx - 80, yy - 80, 160, 160);
    }
    // 瓦顶
    q.fillStyle = '#2B2A30'; q.fillRect(ox - 14, oy - 22, x2 - x1 + 28, 22);
    q.fillStyle = '#3A3940';
    for (let x = ox - 12; x < ox + x2 - x1 + 12; x += 9) q.fillRect(x, oy - 30, 6, 10);
    q.fillStyle = '#1B1A1F'; q.fillRect(ox - 18, oy - 34, x2 - x1 + 36, 6);
    q.beginPath(); q.moveTo(ox - 18, oy - 34); q.lineTo(ox - 30, oy - 46); q.lineTo(ox - 10, oy - 34); q.fill();
    q.beginPath(); q.moveTo(ox + x2 - x1 + 18, oy - 34); q.lineTo(ox + x2 - x1 + 30, oy - 46); q.lineTo(ox + x2 - x1 + 10, oy - 34); q.fill();
    q.fillStyle = 'rgba(0,0,0,0.18)'; q.fillRect(ox, oy, x2 - x1, 10);
    // 开洞
    q.globalCompositeOperation = 'destination-out';
    for (const h of d.holes || []) {
      const hx1 = (h.x1 + x0) * S - x1 + ox, hx2 = (h.x2 + x0) * S - x1 + ox, hy1 = h.y1 * S - y1 + oy, hy2 = h.y2 * S - y1 + oy;
      if (h.kind === 'gate') {
        const r = (hx2 - hx1) / 2, cx = (hx1 + hx2) / 2, cy = hy2 - r * 1.0;
        q.beginPath(); q.arc(cx, cy, r, 0, Math.PI * 2); q.fill();
        q.fillRect(cx - r * 0.55, cy, r * 1.1, hy2 - cy);
      } else q.fillRect(hx1, hy1, hx2 - hx1, hy2 - hy1);
    }
    q.globalCompositeOperation = 'source-over';
    for (const h of d.holes || []) {
      const hx1 = (h.x1 + x0) * S - x1 + ox, hx2 = (h.x2 + x0) * S - x1 + ox, hy1 = h.y1 * S - y1 + oy, hy2 = h.y2 * S - y1 + oy;
      q.strokeStyle = '#2B2A30'; q.lineWidth = 7;
      if (h.kind === 'gate') {
        const r = (hx2 - hx1) / 2, cx = (hx1 + hx2) / 2, cy = hy2 - r;
        q.beginPath(); q.arc(cx, cy, r + 3, 0, Math.PI * 2); q.stroke();
        q.strokeStyle = 'rgba(160,150,130,0.9)'; q.lineWidth = 3; q.beginPath(); q.arc(cx, cy, r + 9, 0, Math.PI * 2); q.stroke();
      } else {
        q.strokeRect(hx1 - 3, hy1 - 3, hx2 - hx1 + 6, hy2 - hy1 + 6);
        // 窗格：上半做冰裂纹花格
        q.strokeStyle = '#3A3940'; q.lineWidth = 3;
        const gh = Math.min(hy2 - hy1, (hx2 - hx1) * 0.9);
        q.save(); q.beginPath(); q.rect(hx1, hy1, hx2 - hx1, gh); q.clip();
        for (let i = -6; i < 12; i++) { q.beginPath(); q.moveTo(hx1 + i * 26, hy1); q.lineTo(hx1 + i * 26 + gh, hy1 + gh); q.stroke(); q.beginPath(); q.moveTo(hx1 + i * 26 + gh, hy1); q.lineTo(hx1 + i * 26, hy1 + gh); q.stroke(); }
        q.restore();
      }
    }
    c.drawImage(t, x1 - ox, y1 - oy);
  }
  function pagoda(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = 'rgba(60,62,72,0.85)';
    for (let i = 0; i < 7; i++) {
      const w = 34 - i * 3.2, yy = -i * 26;
      c.fillRect(-w * 0.42, yy - 22, w * 0.84, 22);
      c.beginPath(); c.moveTo(-w - 6, yy - 20); c.quadraticCurveTo(0, yy - 30, w + 6, yy - 20); c.lineTo(w + 9, yy - 26); c.lineTo(w * 0.5, yy - 30); c.lineTo(-w * 0.5, yy - 30); c.lineTo(-w - 9, yy - 26); c.fill();
    }
    c.fillRect(-2, -7 * 26 - 40, 4, 34);
    c.restore();
  }
  function deco(c, d, ch, layer) {
    const x = d.x * S, y = d.y * S, near = layer === 2;
    const P = M.props;
    const put = (k, sc, ax = 0.5) => { const p = P[k]; c.drawImage(img('p_' + k), x - p.w * sc * ax, y - p.h * sc, p.w * sc, p.h * sc); };
    if (d.k === 'willow') put('willow', near ? 0.75 : 0.55);
    else if (d.k === 'reeds') put('reeds', near ? 0.55 : 0.4);
    else if (d.k === 'house' || d.k === 'hall') { const w = (d.w || 46) * S; put('house', w / P.house.w * 1.25, 0.1); }
    
  }

  // ------------------------------------------------------------ 一景：每层预先画到一张大画布上（层内坐标），每帧只按偏移贴上去
  function buildScene(L) {
    const ch = chap(L), sc = { ch, layers: [], faint: [], masks: [] };
    for (let k = 0; k < 3; k++) {
      const d = L.layers[k] || { lines: [] };
      const xs = [0, 320];
      for (const l of d.lines || []) for (const p of l.pts) xs.push(p[0]);
      for (const dd of d.deco || []) { if (dd.x !== undefined) xs.push(dd.x); if (dd.x1 !== undefined) xs.push(dd.x1, dd.x2); }
      const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60;
      const c = mk((maxX - minX) * S, H), q = c.getContext('2d');
      q.translate(-minX * S, 0);
      for (const dd of d.deco || []) if (dd.k !== 'wall') deco(q, dd, ch, k);
      (d.lines || []).forEach((l, bi) => {
        if (l.faint) {
          // 虚线：先画虚桥；实的那一版另画一张，点亮的段再贴上去
          drawLine(q, l, ch, 'ghost');
          const s = mk((maxX - minX) * S, H), sq = s.getContext('2d');
          sq.translate(-minX * S, 0); drawLine(sq, Object.assign({}, l, { faint: false }), ch);
          sc.faint.push({ k, bi, c: s, minX });
        } else drawLine(q, l, ch);
      });
      for (const dd of d.deco || []) if (dd.k === 'wall') wall(q, dd, 0);
      // 远处的层罩一层纸色（夜里罩夜色），越远越淡
      if (k < 2) {
        q.setTransform(1, 0, 0, 1, 0, 0);
        q.globalCompositeOperation = 'source-atop';
        q.fillStyle = k === 0 ? ROLE[ch].far : ROLE[ch].mid;
        q.fillRect(0, 0, c.width, c.height);
        q.globalCompositeOperation = 'source-over';
        for (const f of sc.faint) if (f.k === k) { const fq = f.c.getContext('2d'); fq.globalCompositeOperation = 'source-atop'; fq.fillStyle = k === 0 ? ROLE[ch].far : ROLE[ch].mid; fq.fillRect(0, 0, f.c.width, f.c.height); }
      }
      // 点选用的粗遮罩（规则格子分辨率）
      const mw = maxX - minX, mask = new Uint8Array(mw * 180);
      const small = mk(mw, 180), sq2 = small.getContext('2d'); sq2.drawImage(c, 0, 0, mw, 180);
      const px = sq2.getImageData(0, 0, mw, 180).data;
      for (let i = 0; i < mw * 180; i++) mask[i] = px[i * 4 + 3] > 40 ? 1 : 0;
      sc.layers.push({ c, minX });
      sc.masks.push({ mask, minX, w: mw });
    }
    return sc;
  }

  // ------------------------------------------------------------ 输入
  const keys = {}, pressed = {};
  addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  // 鼠标：按住画面里哪一层就抓哪一层，层跟着鼠标走
  let drag = null, wheelSel = 0, grabSel = -1;
  const toGame = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 320, (e.clientY - r.top) / r.height * 180]; };
  function pick(gx, gy) {
    for (let k = 2; k >= 0; k--) {
      if (!G.pushable.includes(k)) continue;
      const m = scene.masks[k], lx = Math.floor(gx - G.o[k] - m.minX), ly = Math.floor(gy);
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const x = lx + dx, y = ly + dy;
        if (x >= 0 && x < m.w && y >= 0 && y < 180 && m.mask[y * m.w + x]) return k;
      }
    }
    return -1;
  }
  cv.addEventListener('wheel', e => { e.preventDefault(); wheelSel += e.deltaY > 0 ? 1 : -1; }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    cv.focus(); Sound.wake();
    const [gx, gy] = toGame(e);
    grabSel = pick(gx, gy);
    drag = { x: gx, acc: 0 }; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => { if (drag) { const [gx] = toGame(e); drag.acc += gx - drag.x; drag.x = gx; } });
  const endDrag = () => { drag = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  function cycleSel(d) {
    const P = G.pushable; if (!P.length) return -1;
    const i = P.indexOf(G.sel);
    return P[(i + d + P.length) % P.length];
  }
  function readInput() {
    const k = keys, once = c => { const v = pressed[c]; pressed[c] = false; return !!v; };
    const shift = !!(k.ShiftLeft || k.ShiftRight);
    let sel = -1;
    if (once('Tab') || once('KeyE') || shift && once('ArrowUp')) sel = cycleSel(1);
    if (once('KeyQ') || shift && once('ArrowDown')) sel = cycleSel(-1);
    if (wheelSel) { sel = cycleSel(wheelSel > 0 ? 1 : -1); wheelSel = 0; }
    if (grabSel >= 0) { sel = grabSel; grabSel = -1; }
    let dir = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    let push = shift, dragv;
    if (drag) { push = true; dir = 0; dragv = drag.acc / JJ.C.PAR[sel >= 0 ? sel : Math.max(0, G.sel)]; drag.acc = 0; }
    const jump = !push && (once('Space') || once('ArrowUp') || once('KeyW'));
    const undo = once('KeyZ') || once('Backspace');
    if (once('KeyR')) start(li);
    if (once('KeyN')) start(li + 1);
    if (once('KeyP')) start(li - 1);
    for (const c in pressed) pressed[c] = false;
    const inp = { dir, jump, push, sel, undo };
    if (dragv !== undefined) inp.drag = dragv;
    return inp;
  }

  // ------------------------------------------------------------ 每帧
  function tick() {
    levelT++;
    const inp = readInput();
    const x0 = G.p.x;
    G.step(inp);
    for (const [n, a] of G.events) {
      if (n === 'locked') shake[a] = 10;
      if (n === 'settle' && a[1]) flash = { t: 24, k: a[0] };
      if (n === 'fall') bloomAt = { x: (G.p.x + G.o[G.p.L]) * S, y: Math.min(H - 60, G.p.y * S), t: 0 };
      if (n === 'win') nextT = 200;
      if (n === 'land') landT = 8;
      if (n === 'sel') selT = 30;
      if (n === 'light') lightT[a] = 0;
      if (n === 'push' && !guided) { guided = true; try { localStorage.setItem('jj_guided', '1'); } catch (e) { } }
      Sound.ev(n, a);
    }
    if (G.p.x !== x0 && G.p.ground) walkT += Math.abs(G.p.x - x0); else if (G.p.ground) walkT = 0;
    for (let k = 0; k < 3; k++) if (shake[k] > 0) shake[k]--;
    if (flash && --flash.t <= 0) flash = null;
    if (bloomAt) bloomAt.t++;
    if (landT > 0) landT--;
    if (selT > 0) selT--;
    for (const i in lightT) lightT[i]++;
    stepParticles();
    if (nextT > 0 && --nextT === 0) start(li + 1);
  }
  const lightT = {};

  // ------------------------------------------------------------ 粒子：春落梅、暮浮尘、夜萤火、冬雪
  const particles = [];
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function stepParticles() {
    const ch = scene.ch, want = ch === 4 ? 90 : ch === 3 ? 28 : ch === 1 ? 26 : 22;
    while (particles.length < want) {
      const p = { x: rand() * W, y: particles.length < want / 2 && levelT < 2 ? rand() * H : -20, vx: 0, vy: 0, a: rand() * 6.28, s: 0.6 + rand() * 0.8, life: 0 };
      if (ch === 3) { p.y = 300 + rand() * 700; p.vx = (rand() - 0.5) * 0.4; p.vy = (rand() - 0.5) * 0.3; }
      if (ch === 2) { p.y = rand() * H; }
      particles.push(p);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life++;
      const t = levelT / 60;
      if (ch === 1) { p.vx = 0.6 + Math.sin(t + p.a) * 0.5; p.vy = 0.7 * p.s; p.a += 0.03; }
      else if (ch === 2) { p.vx = 0.25 + Math.sin(t * 0.5 + p.a) * 0.2; p.vy = Math.sin(t * 0.7 + p.a) * 0.15 - 0.05; }
      else if (ch === 3) { p.vx += (rand() - 0.5) * 0.04; p.vy += (rand() - 0.5) * 0.04; p.vx *= 0.98; p.vy *= 0.98; }
      else { p.vx = 0.4 + Math.sin(t * 0.8 + p.a) * 0.4; p.vy = 0.9 * p.s + 0.3; }
      p.x += p.vx; p.y += p.vy;
      if (p.y > H + 30 || p.x > W + 30 || p.x < -40 || p.y < -60 || p.life > 3000) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    const ch = scene.ch;
    for (const p of particles) {
      if (ch === 1) { g.fillStyle = 'rgba(184,53,42,0.75)'; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.beginPath(); g.ellipse(0, 0, 5 * p.s, 3 * p.s, 0, 0, 7); g.fill(); g.restore(); }
      else if (ch === 2) { g.fillStyle = 'rgba(255,214,150,' + (0.25 + 0.2 * Math.sin(levelT / 20 + p.a)) + ')'; g.fillRect(p.x, p.y, 2.5 * p.s, 2.5 * p.s); }
      else if (ch === 3) {
        const a = 0.5 + 0.5 * Math.sin(levelT / 15 + p.a * 3);
        g.globalCompositeOperation = 'lighter';
        const r = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14); r.addColorStop(0, 'rgba(255,230,140,' + (0.7 * a) + ')'); r.addColorStop(1, 'rgba(255,200,80,0)');
        g.fillStyle = r; g.fillRect(p.x - 14, p.y - 14, 28, 28);
        g.globalCompositeOperation = 'source-over';
      } else { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(p.x, p.y, 2.2 * p.s, 0, 7); g.fill(); }
    }
  }

  // ------------------------------------------------------------ 画
  const GOLD = '#E0A64A', RED = '#B8352A', INK = '#1B1A1F';
  function layerX(k) {
    let s = shake[k] ? (shake[k] % 4 < 2 ? 4 : -4) : 0;
    if (!guided && LV[li].id === '1-1' && levelT > 180 && k === G.sel && !G.pushing) {
      const t = (levelT - 180) % 180;
      if (t < 60) s += 3 * S * Math.sin(t / 60 * Math.PI * 2);
    }
    return G.o[k] * S + s;
  }
  function tile(im, x, y, w, hmin) {        // 横向循环平铺
    const iw = w || im.width, ih = Math.max(im.height * iw / im.width, hmin || 0);
    let sx = ((x % iw) + iw) % iw - iw;
    for (; sx < W; sx += iw) g.drawImage(im, sx, y, iw, ih);
  }
  function drawBackdrop() {
    const B = M.bg[scene.ch], t = levelT;
    g.drawImage(img(B.sky), 0, 0, W, H);
    // 远山跟着远层走，中景山丘跟着中层走（推哪层，哪层的山也动）
    tile(img(B.mountains), layerX(0) * 0.5 - 600, 150);
    g.globalAlpha = 0.9; tile(img(B.mist), t * 0.15, 560, B.mist_w); g.globalAlpha = 1;
    tile(img(B.midground), layerX(1) * 0.5 - 900, 300);
    g.globalAlpha = 0.45; tile(img(B.mist), -t * 0.25 + 700, 640, B.mist_w); g.globalAlpha = 1;
  }
  const waterY = () => (LV[li].water || 150) * S - 20;
  // 水：岸上的东西（远山、中景、各层）倒映下来，逐行左右晃，越远晃得越大；再罩一层水色和水纹
  let fgC = null, fgG = null, refC = null, refG = null;
  function drawWater(wy) {
    const B = M.bg[scene.ch], t = levelT, R = H - wy, night = scene.ch === 3;
    refG.clearRect(0, 0, W, R);
    for (let i = 0; i < R; i++) {
      const sy = wy - 1 - Math.floor(i * 0.92);
      if (sy < 0) break;
      const amp = 1.2 + i * 0.03;
      const dx = Math.sin(i * 0.21 + t * 0.07) * amp + Math.sin(i * 0.053 - t * 0.031) * amp * 0.8;
      refG.drawImage(cv, 0, sy, W, 1, dx, i, W, 1);
      refG.drawImage(fgC, 0, sy, W, 1, dx, i, W, 1);
    }
    // 倒影偏淡、偏冷，往下渐渐看不清
    refG.globalCompositeOperation = 'source-atop';
    const tint = refG.createLinearGradient(0, 0, 0, R);
    if (night) { tint.addColorStop(0, 'rgba(20,26,38,0.35)'); tint.addColorStop(1, 'rgba(10,14,22,0.75)'); }
    else { tint.addColorStop(0, 'rgba(200,210,208,0.30)'); tint.addColorStop(1, 'rgba(150,170,175,0.65)'); }
    refG.fillStyle = tint; refG.fillRect(0, 0, W, R);
    refG.globalCompositeOperation = 'source-over';
    g.drawImage(refC, 0, 0, W, R, 0, wy, W, R);
    // 水纹：生成的水面贴图淡淡叠上去，慢慢漂
    if (B.water) { g.globalAlpha = 0.28; tile(img(B.water), t * 0.25, wy, 0, R); g.globalAlpha = 1; }
    // 横向的亮纹：一道道短的波光，缓慢移动
    g.save(); g.globalCompositeOperation = night ? 'lighter' : 'source-over';
    for (let i = 0; i < 90; i++) {
      const yy = wy + 6 + Math.pow(((i * 0.6180339) % 1), 1.6) * (R - 6);
      const len = 20 + (i % 7) * 12 + (yy - wy) * 0.3;
      const xx = ((i * 271.3 + t * (0.2 + (i % 4) * 0.08)) % (W + 300)) - 150;
      const a = (0.10 + 0.12 * Math.sin(t / 40 + i)) * (1 - (yy - wy) / R * 0.5);
      g.strokeStyle = night ? 'rgba(255,220,160,' + a * 0.6 + ')' : 'rgba(255,252,240,' + a * 1.6 + ')';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + len, yy); g.stroke();
      g.strokeStyle = night ? 'rgba(0,0,0,' + a + ')' : 'rgba(70,84,92,' + a + ')';
      g.beginPath(); g.moveTo(xx + len * 0.3, yy + 3); g.lineTo(xx + len * 1.1, yy + 3); g.stroke();
    }
    g.restore();
    // 岸线：一条很淡的亮雾，把岸和水接起来
    const sh = g.createLinearGradient(0, wy - 30, 0, wy + 70);
    const mc = night ? '120,130,150' : '238,234,222';
    sh.addColorStop(0, 'rgba(' + mc + ',0)'); sh.addColorStop(0.3, 'rgba(' + mc + ',' + (night ? 0.2 : 0.5) + ')'); sh.addColorStop(1, 'rgba(' + mc + ',0)');
    g.fillStyle = sh; g.fillRect(0, wy - 30, W, 100);
  }
  function drawLayer(k) {
    const L = LV[li], sl = scene.layers[k];
    const X = layerX(k) + sl.minX * S;
    const frames = (L.frames || []).filter(f => f.target === k);
    const body = () => {
      g.drawImage(sl.c, Math.round(X), 0);
      // 虚线被灯照到的段：贴上实的那一版
      for (const f of scene.faint) {
        if (f.k !== k) continue;
        const pcs = G.pieces(k, f.bi);
        for (const q of pcs) {
          g.save(); g.beginPath(); g.rect(Math.round(X) + (q[0] - f.minX) * S, 0, (q[1] - q[0]) * S, H); g.clip();
          g.drawImage(f.c, Math.round(X), 0);
          g.restore();
        }
      }
    };
    if (frames.length) {
      g.save(); g.beginPath();
      for (const f of frames) {
        const fx = (f.x1) * S + layerX(f.layer);
        if (f.kind === 'gate') { const r = (f.x2 - f.x1) * S / 2; g.arc(fx + r, f.y2 * S - 4 * S - r + 4 * S, r, 0, Math.PI * 2); g.rect(fx + r - r * 0.55, f.y2 * S - 4 * S - r + 4 * S, r * 1.1, r); }
        else g.rect(fx, f.y1 * S, (f.x2 - f.x1) * S, (f.y2 - f.y1) * S);
      }
      g.clip(); body(); g.restore();
    } else body();
  }
  function travelerPose() {
    const p = G.p;
    if (G.won) return 'bow_lantern';
    if (G.pushing) return 'push';
    if (!p.ground) return p.vy < 0 ? 'jump' : 'fall';
    if (landT > 0) return 'land';
    if (p.vx !== 0) return (Math.floor(walkT / 7) % 2) ? 'walk_b' : 'walk_a';
    return 'idle';
  }
  function drawTraveler() {
    if (G.bloom > 0) return;
    const p = G.p, pose = travelerPose(), F = M.char[pose];
    const x = (p.x + G.o[p.L]) * S, y = p.y * S;
    let bob = 0, sy = 1;
    if (pose.startsWith('walk')) bob = -Math.abs(Math.sin(walkT / 7 * Math.PI)) * 4;
    if (pose === 'idle') sy = 1 + Math.sin(levelT / 40) * 0.008;
    // 影子
    if (p.ground) { g.fillStyle = 'rgba(27,26,31,0.18)'; g.beginPath(); g.ellipse(x, y + 2, 40, 6, 0, 0, 7); g.fill(); }
    g.save(); g.translate(Math.round(x), Math.round(y + bob)); if (p.face < 0) g.scale(-1, 1); g.scale(1, sy);
    g.drawImage(img('char_' + pose), -F.ax, -F.ay, F.w, F.h);
    g.restore();
  }
  function lampScreen(m) { const line = G.S.layers[m.layer].lines[m.line]; return [m.x * S + layerX(m.layer), JJ.yAt(line, m.x) * S]; }
  function glow(x, y, r, a, col) {
    g.save(); g.globalCompositeOperation = 'lighter';
    const q = g.createRadialGradient(x, y, 0, x, y, r);
    q.addColorStop(0, 'rgba(' + col + ',' + a + ')'); q.addColorStop(0.3, 'rgba(' + col + ',' + (a * 0.4) + ')'); q.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
  }
  function drawLantern(x, y, on, k) {
    const P = M.props[on ? 'lamp_on' : 'lamp_off'], sc = 0.7;
    g.drawImage(img(on ? 'p_lamp_on' : 'p_lamp_off'), x - P.w * sc / 2, y - P.h * sc, P.w * sc, P.h * sc);
    if (on) { const f = 1 + Math.sin(levelT / 9 + k) * 0.06; glow(x, y - P.h * sc * 0.62, 120 * f, 0.55, '255,190,100'); }
  }
  function drawLamps(k) {
    G.S.lamps.forEach((m, i) => {
      if (m.layer !== k) return;
      const [x, y] = lampScreen(m), on = G.lit[i];
      if (on) {
        // 灯光照到的范围：一圈暖光，边上一道极淡的金线
        const t = lightT[i] !== undefined ? Math.min(1, lightT[i] / 40) : 1, r = m.r * S * t, cy = y;
        g.save(); g.globalCompositeOperation = 'lighter';
        const q = g.createRadialGradient(x, cy, r * 0.2, x, cy, r);
        q.addColorStop(0, 'rgba(255,200,110,0.22)'); q.addColorStop(0.85, 'rgba(255,180,90,0.10)'); q.addColorStop(1, 'rgba(255,170,80,0)');
        g.fillStyle = q; g.beginPath(); g.arc(x, cy, r, 0, 7); g.fill(); g.restore();
        g.strokeStyle = 'rgba(224,166,74,0.35)'; g.lineWidth = 2; g.setLineDash([10, 14]); g.lineDashOffset = -levelT * 0.5;
        g.beginPath(); g.arc(x, cy, r, 0, 7); g.stroke(); g.setLineDash([]);
      }
      drawLantern(x, y, on, i);
    });
    const lm = G.S.lamp;
    if (lm.layer === k) {
      const [x, y] = lampScreen(lm);
      drawLantern(x, y, G.won, 9);
      if (!G.won) glow(x, y - 90, 70, 0.10 + 0.06 * Math.sin(levelT / 30), '255,200,120');   // 终点的灯微微有点暖意，指个方向
    }
  }
  function jointsAt(k, v) {
    const save = G.o[k], out = [];
    G.o[k] = v;
    const ends = [];
    for (let j = 0; j < 3; j++) {
      const oj = JJ.rnd(G.o[j]);
      G.S.layers[j].lines.forEach((b, bi) => { for (const q of G.pieces(j, bi)) { ends.push([q[0] + oj, JJ.yAt(b, q[0]), j, -1]); ends.push([q[1] + oj, JJ.yAt(b, q[1]), j, 1]); } });
    }
    for (const e of ends) if (e[3] === 1) for (const f of ends) if (f[3] === -1 && f[2] !== e[2] && f[0] === e[0] && Math.abs(e[1] - f[1]) <= 1.01) out.push({ x: e[0], y: Math.min(e[1], f[1]) });
    G.o[k] = save;
    return out;
  }
  function drawGlow() {
    const k = G.sel; if (k < 0) return;
    const o = G.o[k], n = G.nearestSnap(k, o);
    if (n.s !== null && n.d >= 0.5 && n.d <= JJ.C.GLOW) {
      const dx = (o - n.s) * S;
      for (const q of jointsAt(k, n.s)) {
        const x = q.x * S, y = q.y * S;
        glow(x + dx / 2, y, 60, 0.35 * (1 - n.d / JJ.C.GLOW) + 0.1, '255,200,110');
        g.strokeStyle = GOLD; g.lineWidth = 3; g.setLineDash([8, 8]); g.lineDashOffset = -levelT;
        g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + dx, y - 2); g.stroke(); g.setLineDash([]);
      }
    }
    if (flash) {
      const t = 24 - flash.t;
      for (const q of jointsAt(flash.k, JJ.rnd(G.o[flash.k]))) {
        glow(q.x * S, q.y * S, 40 + t * 6, 0.6 * (flash.t / 24), '255,210,120');
        g.strokeStyle = 'rgba(224,166,74,' + (flash.t / 24) + ')'; g.lineWidth = 3;
        g.beginPath(); g.arc(q.x * S, q.y * S, 10 + t * 4, 0, 7); g.stroke();
      }
    }
  }
  function drawSel() {
    if (!G.pushable.length) return;
    const k = G.sel;
    // 右上角三道墨（远、中、近），选中的那道是朱砂
    for (let i = 0; i < 3; i++) {
      const can = G.pushable.includes(i), on = i === k;
      g.fillStyle = on ? RED : (can ? 'rgba(85,85,92,0.8)' : 'rgba(180,175,162,0.6)');
      const w = [40, 60, 80][i];
      g.beginPath(); g.ellipse(W - 60 - w / 2, 56 + i * 22, w / 2, on ? 6 : 3.5, 0, 0, 7); g.fill();
    }
    // 选中的层：露出来的墨线两端各一点金
    if (k >= 0 && (selT > 0 || G.pushing || drag)) {
      const o = layerX(k), a = G.pushing || drag ? 1 : selT / 30;
      G.S.layers[k].lines.forEach((l, bi) => {
        for (const q of G.pieces(k, bi)) for (const x of q) { glow(x * S + o, JJ.yAt(l, x) * S - 4, 30, 0.5 * a, '255,200,110'); }
      });
    }
  }
  function drawBloom() {
    if (!bloomAt) return;
    const t = bloomAt.t; if (t > 50) { bloomAt = null; return; }
    for (let i = 0; i < 14; i++) {
      const an = i / 14 * Math.PI * 2 + i, rr = (8 + t * 2.4) * (0.6 + ((i * 37) % 10) / 20);
      g.fillStyle = 'rgba(27,26,31,' + (0.5 * (1 - t / 50)) + ')';
      g.beginPath(); g.arc(bloomAt.x + Math.cos(an) * rr, bloomAt.y - 20 + Math.sin(an) * rr * 0.6, 10 + t * 0.5, 0, 7); g.fill();
    }
  }
  function drawFore() {
    if (scene.ch === 1 || scene.ch === 4) {
      const P = M.props.plum, sway = Math.sin(levelT / 90) * 0.01;
      g.save(); g.translate(-30, -20); g.rotate(sway); g.drawImage(img('p_plum'), 0, 0, P.w * 0.9, P.h * 0.9); g.restore();
    }
    // 四角压暗，像纸边
    const v = g.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1200);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, scene.ch === 3 ? 'rgba(0,0,0,0.45)' : 'rgba(70,52,30,0.30)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
  function drawTitle() {
    const t = levelT; if (t > 260) return;
    const a = t < 30 ? t / 30 : (t > 210 ? (260 - t) / 50 : 1), L = LV[li];
    g.globalAlpha = a;
    g.fillStyle = RED; g.fillRect(96, 90, 64, 64);
    g.fillStyle = '#F3ECDD'; g.font = '44px JJBrush, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('借景'[0], 128, 108); g.font = '28px JJBrush, serif'; g.fillText(L.id.replace('-', '·'), 128, 140);
    g.textAlign = 'left'; g.fillStyle = scene.ch === 3 ? '#E8E2D2' : INK;
    g.font = '84px JJBrush, serif'; g.fillText(L.name, 184, 112);
    g.font = 'italic 30px JJSerif, serif'; g.fillStyle = scene.ch === 3 ? 'rgba(232,226,210,0.7)' : 'rgba(27,26,31,0.6)'; g.fillText(L.en, 188, 168);
    g.globalAlpha = 1;
  }
  function draw() {
    if (!fgC) { fgC = mk(W, H); fgG = fgC.getContext('2d'); refC = mk(W, H); refG = refC.getContext('2d'); }
    g = mainG;
    g.globalCompositeOperation = 'source-over';
    drawBackdrop();
    // 各层先画到前景画布上：伸进水里的部分渐渐化进水里
    g = fgG; g.clearRect(0, 0, W, H);
    for (let k = 0; k < 3; k++) {
      drawLayer(k);
      drawLamps(k);
      if (G.p.L === k) drawTraveler();
    }
    const wy = waterY();
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, wy + 4, 0, wy + 110);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(0, wy + 4, W, H - wy);
    g.globalCompositeOperation = 'source-over';
    g = mainG;
    drawWater(wy);
    g.drawImage(fgC, 0, 0);
    drawGlow();
    drawBloom();
    drawParticles();
    drawFore();
    drawSel();
    drawTitle();
    if (nextT >= 0 && nextT < 60) { g.fillStyle = 'rgba(239,232,216,' + ((60 - nextT) / 60).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    if (levelT < 40) { g.fillStyle = 'rgba(239,232,216,' + ((40 - levelT) / 40).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------ 声音：五声音阶拨弦；接缝、借过去、点灯依次往上走，一景解完是一小段旋律
  const Sound = (function () {
    let ac = null, master = null;
    const ensure = () => {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination); } catch (e) { } }
      if (ac && ac.state === 'suspended') ac.resume();
      return ac;
    };
    addEventListener('keydown', ensure);
    const PENT = [196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
    // 简单的拨弦：Karplus-Strong 预先算好一段
    const cache = {};
    function pluckBuf(f) {
      const a = ensure(); if (!a) return null;
      if (cache[f]) return cache[f];
      const n = Math.floor(a.sampleRate * 2.4), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      const p = Math.floor(a.sampleRate / f), ring = new Float32Array(p);
      let s = 7;
      for (let i = 0; i < p; i++) { s = (s * 16807) % 2147483647; ring[i] = (s / 2147483647) * 2 - 1; }
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const nx = (idx + 1) % p, v = 0.5 * (ring[idx] + ring[nx]) * 0.996;
        d[i] = ring[idx]; ring[idx] = v; idx = nx;
      }
      return (cache[f] = buf);
    }
    function pluck(f, v, delay) {
      const a = ensure(); if (!a) return;
      const b = pluckBuf(f); if (!b) return;
      const s = a.createBufferSource(), gn = a.createGain(), lp = a.createBiquadFilter();
      s.buffer = b; lp.type = 'lowpass'; lp.frequency.value = 2400; gn.gain.value = v;
      s.connect(lp); lp.connect(gn); gn.connect(master); s.start(a.currentTime + (delay || 0));
    }
    function knock(f, v) {
      const a = ensure(); if (!a) return;
      const o = a.createOscillator(), gn = a.createGain(), now = a.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.6, now + 0.08);
      gn.gain.setValueAtTime(v, now); gn.gain.exponentialRampToValueAtTime(0.0005, now + 0.12);
      o.connect(gn); gn.connect(master); o.start(); o.stop(now + 0.13);
    }
    let step = 2;
    const up = () => { const f = PENT[Math.min(PENT.length - 1, step)]; step = Math.min(PENT.length - 1, step + 1); return f; };
    return {
      wake: ensure,
      reset() { step = 2; },
      ev(n, a) {
        if (n === 'settle') { if (a[1]) pluck(up(), 0.28); else knock(220, 0.05); }
        if (n === 'borrow') pluck(up(), 0.22);
        if (n === 'light') { pluck(up(), 0.3); pluck(PENT[Math.min(PENT.length - 1, step + 1)], 0.18, 0.12); }
        if (n === 'hop') knock(330, 0.04);
        if (n === 'land') knock(180, 0.06);
        if (n === 'locked') knock(140, 0.08);
        if (n === 'fall') { pluck(130.81, 0.25); step = Math.max(2, step - 2); }
        if (n === 'undo') { knock(260, 0.05); step = Math.max(2, step - 1); }
        if (n === 'win') { pluck(392, 0.3); pluck(523.25, 0.26, 0.22); pluck(659.25, 0.24, 0.44); pluck(783.99, 0.22, 0.7); step = 2; }
      }
    };
  })();

  boot();
})();
