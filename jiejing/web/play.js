// 借景 · 网页试玩版画面（规则全在 core/core.js；这里只画、只读键盘鼠标、只放声音）。
// 画面内部 320×180，整数倍放大，余下黑边；最近邻；人物和层都对齐到整像素。
(function () {
  'use strict';
  const W = 320, H = 180;
  const base = document.currentScript.dataset.base || '..';
  const cv = document.getElementById('c'), out = cv.getContext('2d');
  const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
  const g = buf.getContext('2d'); g.imageSmoothingEnabled = false;

  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(src); i.src = src; });
  const getJSON = u => fetch(u).then(r => r.json());

  let LV, ART, IMG = {}, G, li = 0, levelT = 0, nextT = -1, shake = [0, 0, 0], flash = null, bloomAt = null, walkDist = 0;
  const Q = new URLSearchParams(location.search);

  async function boot() {
    LV = (await getJSON(base + '/data/levels.json')).levels;
    ART = await getJSON(base + '/data/art.json');
    const names = ['char_traveler', 'props_lamp', 'paper_noise'];
    for (const n of names) IMG[n] = await load(base + '/art/' + n + '.png');
    for (const L of LV) {
      IMG[L.id + '_bg'] = await load(base + '/art/levels/' + L.id + '_bg.png');
      for (let k = 0; k < 3; k++) IMG[L.id + '_L' + k] = await load(base + '/art/levels/' + L.id + '_L' + k + '.png');
    }
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
    levelT = 0; nextT = -1; flash = null; bloomAt = null;
  }
  window.JJView = { start: i => start(i), get G() { return G; }, levels: () => LV };

  // ------------------------------------------------------------ 输入
  const keys = {}, pressed = {};
  addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  // 鼠标：滚轮换层，按住拖动推层
  let drag = null, wheelSel = 0;
  cv.addEventListener('wheel', e => { e.preventDefault(); wheelSel += e.deltaY > 0 ? 1 : -1; }, { passive: false });
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, acc: 0 }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (drag) { drag.acc += (e.clientX - drag.x) * (window.devicePixelRatio || 1) / scale; drag.x = e.clientX; } });
  const endDrag = () => { drag = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  function cycleSel(d) {
    const P = G.pushable; if (!P.length) return -1;
    const i = P.indexOf(G.sel);
    return P[(i + d + P.length) % P.length];
  }
  function readInput() {
    const k = keys, once = c => { const v = pressed[c]; pressed[c] = false; return !!v; };
    let sel = -1;
    if (once('Tab') || once('KeyE') || (k.ShiftLeft || k.ShiftRight) && once('ArrowUp')) sel = cycleSel(1);
    if (once('KeyQ') || (k.ShiftLeft || k.ShiftRight) && once('ArrowDown')) sel = cycleSel(-1);
    if (wheelSel) { sel = cycleSel(wheelSel > 0 ? 1 : -1); wheelSel = 0; }
    let dir = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    let push = !!(k.ShiftLeft || k.ShiftRight);
    if (drag) {
      push = true;
      if (Math.abs(drag.acc) >= 0.5) { dir = drag.acc > 0 ? 1 : -1; const sp = JJ.C.PUSH[G.sel] || 0.5; drag.acc -= dir * sp; if (Math.sign(drag.acc) !== dir) drag.acc = Math.abs(drag.acc) < sp ? 0 : drag.acc; }
      else dir = 0;
    }
    const jump = !push && (once('Space') || once('ArrowUp') || once('KeyW'));
    const undo = once('KeyZ') || once('Backspace');
    if (once('KeyR')) { start(li); }
    if (once('KeyN')) { start(li + 1); }
    if (once('KeyP')) { start(li - 1); }
    for (const c in pressed) pressed[c] = false;
    return { dir, jump, push, sel, undo };
  }

  // ------------------------------------------------------------ 每帧
  function tick() {
    levelT++;
    const inp = readInput();
    const before = G.p.x;
    G.step(inp);
    for (const [n, a] of G.events) {
      if (n === 'locked') shake[a] = 8;
      if (n === 'settle' && a[1]) flash = { t: 18, k: a[0] };
      if (n === 'fall') bloomAt = { x: JJ.rnd(G.p.x + G.o[G.p.L]), y: Math.min(H - 8, JJ.rnd(G.p.y)), t: 0 };
      if (n === 'win') nextT = 120;
      if (n === 'borrow') flash = { t: 14, k: a, borrow: true };
      Sound.ev(n, a);
    }
    walkDist += Math.abs(G.p.x - before);
    for (let k = 0; k < 3; k++) if (shake[k] > 0) shake[k]--;
    if (flash && --flash.t <= 0) flash = null;
    if (bloomAt) bloomAt.t++;
    if (nextT > 0 && --nextT === 0) start(li + 1);
  }

  // ------------------------------------------------------------ 画
  const GOLD = '#E0A64A', RED = '#B8352A', INK = '#1B1A1F';
  function layerX(k) {
    const s = shake[k] ? (shake[k] % 4 < 2 ? 1 : -1) : 0;
    return JJ.rnd(G.o[k]) + s;
  }
  function travelerFrame() {
    const p = G.p;
    if (G.pushing) return 10 + ((G.frame >> 3) & 1);
    if (!p.ground) return p.vy < 0 ? 8 : 9;
    if (p.vx !== 0) return 2 + (Math.floor(walkDist / 3) % 6);
    return (G.frame >> 5) & 1;
  }
  function drawTraveler() {
    if (G.bloom > 0) return;
    const p = G.p, f = travelerFrame();
    const x = JJ.rnd(p.x + G.o[p.L]) - 8, y = JJ.rnd(p.y) - 16;
    const sx = (f % 8) * 16, sy = (f >> 3) * 16;
    g.save();
    if (p.face < 0) { g.translate(x + 16, y); g.scale(-1, 1); g.drawImage(IMG.char_traveler, sx, sy, 16, 16, 0, 0, 16, 16); }
    else g.drawImage(IMG.char_traveler, sx, sy, 16, 16, x, y, 16, 16);
    g.restore();
  }
  function drawLamp() {
    const L = LV[li], lm = L.lamp, line = G.S.layers[lm.layer].lines[lm.line];
    const x = JJ.rnd(lm.x + G.o[lm.layer]), y = JJ.rnd(JJ.yAt(line, lm.x));
    if (G.won) {
      g.drawImage(IMG.props_lamp, 36, 0, 24, 24, x - 3, y - 29, 24, 24);
      const f = 1 + ((G.wonT >> 3) & 1);
      g.drawImage(IMG.props_lamp, f * 12, 0, 12, 28, x - 3, y - 28, 12, 28);
    } else g.drawImage(IMG.props_lamp, 0, 0, 12, 28, x - 3, y - 28, 12, 28);
  }
  // 预光：选中的层离某个接缝点 1–5 像素时，在接缝处画一道淡金虚线；吸上的一刻闪一下
  function joints(k) {
    const out = [], S = G.S, A = S.layers[k];
    for (let j = 0; j < 3; j++) {
      if (j === k) continue;
      const oj = JJ.rnd(G.o[j]);
      for (const a of A.lines) for (const b of S.layers[j].lines) {
        const ar = a.pts[a.pts.length - 1], al = a.pts[0], bl = b.pts[0], br = b.pts[b.pts.length - 1];
        if (Math.abs(ar[1] - bl[1]) <= 1.01) out.push({ s: bl[0] + oj - ar[0], x: bl[0] + oj, y: bl[1], end: ar[0] });
        if (Math.abs(al[1] - br[1]) <= 1.01) out.push({ s: br[0] + oj - al[0], x: br[0] + oj, y: br[1], end: al[0] });
      }
    }
    return out.filter(q => q.s >= A.min && q.s <= A.max);
  }
  function drawGlow() {
    const k = G.sel; if (k < 0) return;
    const o = G.o[k];
    for (const q of joints(k)) {
      const d = Math.abs(q.s - o);
      if (d > JJ.C.GLOW || d < 0.5) continue;
      const ex = JJ.rnd(q.end + o), a = Math.min(ex, q.x), b = Math.max(ex, q.x);
      g.fillStyle = GOLD;
      for (let x = a - 1; x <= b + 1; x++) if ((x + (G.frame >> 2)) % 3 !== 0) g.fillRect(x, q.y - 1, 1, 1);
      g.fillRect(q.x, q.y - 3, 1, 1); g.fillRect(q.x, q.y + 3, 1, 1);
    }
    if (flash && !flash.borrow) {
      for (const q of joints(flash.k)) if (q.s === JJ.rnd(G.o[flash.k])) {
        const r = 18 - flash.t;
        g.fillStyle = GOLD;
        for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; g.fillRect(JJ.rnd(q.x + Math.cos(an) * r * 0.4), JJ.rnd(q.y - 1 + Math.sin(an) * r * 0.3), 1, 1); }
      }
    }
  }
  // 选中的层：它的墨线两端各一个金点（无字提示）；左上角三道墨，选中的那道是朱砂
  function drawSel() {
    const k = G.sel;
    if (k >= 0) {
      const o = JJ.rnd(G.o[k]);
      g.fillStyle = GOLD;
      for (const l of G.S.layers[k].lines) {
        for (const pt of [l.pts[0], l.pts[l.pts.length - 1]]) g.fillRect(pt[0] + o, pt[1] - 2, 1, 1);
      }
    }
    if (!G.pushable.length) return;
    for (let i = 0; i < 3; i++) {
      const can = G.pushable.includes(i), on = i === k;
      g.fillStyle = on ? RED : (can ? '#55555C' : '#B4AFA2');
      const w = [6, 9, 12][i];
      g.fillRect(8, 8 + i * 4, w, on ? 2 : 1);
    }
  }
  function drawBloom() {
    if (!bloomAt) return;
    const t = bloomAt.t; if (t > 40) { bloomAt = null; return; }
    g.fillStyle = INK;
    const r = 2 + t * 0.35;
    for (let i = 0; i < 24; i++) {
      const an = i / 24 * Math.PI * 2 + (i % 3);
      const rr = r * (0.6 + ((i * 37) % 10) / 20);
      if ((i + t) % 5 === 0) continue;
      g.fillRect(JJ.rnd(bloomAt.x + Math.cos(an) * rr), JJ.rnd(bloomAt.y - 4 + Math.sin(an) * rr * 0.6), 1, 1);
    }
  }
  function draw() {
    const L = LV[li], A = ART.levels[L.id];
    g.globalCompositeOperation = 'source-over';
    g.drawImage(IMG[L.id + '_bg'], 0, 0);
    for (let k = 0; k < 3; k++) {
      g.drawImage(IMG[L.id + '_L' + k], layerX(k) + A.layers[k].dx, 0);
      if (L.lamp.layer === k) drawLamp();
      if (G.p.L === k) drawTraveler();
    }
    drawGlow();
    drawBloom();
    g.globalCompositeOperation = 'multiply';
    g.drawImage(IMG.paper_noise, 0, 0);
    g.globalCompositeOperation = 'source-over';
    drawSel();
    // 过关：画面慢慢褪成纸色
    if (nextT >= 0 && nextT < 40) { g.fillStyle = 'rgba(239,232,216,' + ((40 - nextT) / 40).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    if (levelT < 30) { g.fillStyle = 'rgba(239,232,216,' + ((30 - levelT) / 30).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    out.imageSmoothingEnabled = false;
    out.fillStyle = '#000'; out.fillRect(0, 0, cv.width, cv.height);
    out.drawImage(buf, ox, oy, W * scale, H * scale);
  }
  let scale = 1, ox = 0, oy = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr);
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    scale = Math.max(1, Math.floor(Math.min(cv.width / W, cv.height / H)));
    ox = Math.floor((cv.width - W * scale) / 2); oy = Math.floor((cv.height - H * scale) / 2);
  }

  // ------------------------------------------------------------ 声音（先用简单合成占位：古琴拨弦、木鱼、风铃）
  const Sound = (function () {
    let ac = null;
    const ensure = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } return ac; };
    addEventListener('keydown', ensure, { once: true }); addEventListener('pointerdown', ensure, { once: true });
    const PENT = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
    function pluck(f, t, v) {
      const a = ensure(); if (!a) return;
      const o = a.createOscillator(), o2 = a.createOscillator(), gn = a.createGain(), lp = a.createBiquadFilter();
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.005;
      lp.type = 'lowpass'; lp.frequency.value = 1800;
      const now = a.currentTime;
      gn.gain.setValueAtTime(0, now); gn.gain.linearRampToValueAtTime(v, now + 0.005); gn.gain.exponentialRampToValueAtTime(0.0005, now + t);
      o.connect(lp); o2.connect(lp); lp.connect(gn); gn.connect(a.destination);
      o.start(); o2.start(); o.stop(now + t); o2.stop(now + t);
    }
    function knock(f, v) {
      const a = ensure(); if (!a) return;
      const o = a.createOscillator(), gn = a.createGain(), now = a.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.6, now + 0.08);
      gn.gain.setValueAtTime(v, now); gn.gain.exponentialRampToValueAtTime(0.0005, now + 0.12);
      o.connect(gn); gn.connect(a.destination); o.start(); o.stop(now + 0.13);
    }
    let note = 0;
    return {
      ev(n, a) {
        if (n === 'settle') { if (a[1]) pluck(PENT[(note++ * 3) % 5 + 2], 1.4, 0.12); else knock(220, 0.05); }
        if (n === 'borrow') pluck(PENT[(note++ * 2) % 8], 1.8, 0.1);
        if (n === 'hop') knock(330, 0.04);
        if (n === 'land') knock(200, 0.05);
        if (n === 'locked') knock(140, 0.08);
        if (n === 'fall') pluck(130.81, 2.0, 0.08);
        if (n === 'undo') knock(260, 0.05);
        if (n === 'win') { pluck(392, 2.5, 0.12); setTimeout(() => pluck(523.25, 2.5, 0.1), 180); setTimeout(() => pluck(659.25, 3, 0.09), 360); }
      }
    };
  })();

  boot();
})();
