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

  let LV, ART, ATL, IMG = {}, G, li = 0, levelT = 0, nextT = -1, shake = [0, 0, 0], flash = null, bloomAt = null, walkDist = 0, landT = 0;
  const Q = new URLSearchParams(location.search);
  // 1-1 的无字引导：推过一次就永久不再出现（存在本机浏览器里，读不到也没关系）
  let guided = false, guideFade = 0;
  try { guided = localStorage.getItem('jj_guided') === '1'; } catch (e) { }

  async function boot() {
    LV = (await getJSON(base + '/data/levels.json')).levels;
    ART = await getJSON(base + '/data/art.json');
    ATL = await getJSON(base + '/data/atlas.json');
    for (const n of ['char_traveler', 'props_architecture', 'ui_ink_seals', 'ui_titles', 'paper_noise']) IMG[n] = await load(base + '/art/' + n + '.png');
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
    levelT = 0; nextT = -1; flash = null; bloomAt = null; landT = 0;
  }
  window.JJView = { start: i => start(i), get G() { return G; }, levels: () => LV, get levelT() { return levelT; }, set levelT(v) { levelT = v; } };

  // ------------------------------------------------------------ 输入
  const keys = {}, pressed = {};
  addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  // 鼠标：滚轮换层；按住拖动，层直接跟着鼠标走（倍数在规则核心里：远 0.4、中 0.7、近 1.0）
  let drag = null, wheelSel = 0;
  cv.addEventListener('wheel', e => { e.preventDefault(); wheelSel += e.deltaY > 0 ? 1 : -1; }, { passive: false });
  cv.addEventListener('pointerdown', e => { cv.focus(); drag = { x: e.clientX, acc: 0 }; cv.setPointerCapture(e.pointerId); });
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
    const shift = !!(k.ShiftLeft || k.ShiftRight);
    let sel = -1;
    if (once('Tab') || once('KeyE') || shift && once('ArrowUp')) sel = cycleSel(1);
    if (once('KeyQ') || shift && once('ArrowDown')) sel = cycleSel(-1);
    if (wheelSel) { sel = cycleSel(wheelSel > 0 ? 1 : -1); wheelSel = 0; }
    let dir = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    let push = shift, dragv;
    if (drag) { push = true; dir = 0; dragv = drag.acc; drag.acc = 0; }
    const jump = !push && (once('Space') || once('ArrowUp') || once('KeyW'));
    const undo = once('KeyZ') || once('Backspace');
    if (once('KeyR')) { start(li); }
    if (once('KeyN')) { start(li + 1); }
    if (once('KeyP')) { start(li - 1); }
    for (const c in pressed) pressed[c] = false;
    const inp = { dir, jump, push, sel, undo };
    if (dragv !== undefined) inp.drag = dragv;
    return inp;
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
      if (n === 'win') nextT = 150;
      if (n === 'land') landT = 6;
      if (n === 'borrow') flash = { t: 14, k: a, borrow: true };
      if (n === 'push' && !guided) { guided = true; guideFade = 30; try { localStorage.setItem('jj_guided', '1'); } catch (e) { } }
      Sound.ev(n, a);
    }
    walkDist += Math.abs(G.p.x - before);
    for (let k = 0; k < 3; k++) if (shake[k] > 0) shake[k]--;
    if (flash && --flash.t <= 0) flash = null;
    if (bloomAt) bloomAt.t++;
    if (landT > 0) landT--;
    if (guideFade > 0) guideFade--;
    if (nextT > 0 && --nextT === 0) start(li + 1);
  }

  // ------------------------------------------------------------ 画
  const GOLD = '#E0A64A', RED = '#B8352A', INK = '#1B1A1F';
  const guideOn = () => !guided && LV[li].id === '1-1' && levelT > 180;
  function layerX(k) {
    let s = shake[k] ? (shake[k] % 4 < 2 ? 1 : -1) : 0;
    // 引导：可推的那一层每 3 秒轻轻左右晃一下（±3 像素），只是画面，不动规则
    if (guideOn() && k === G.sel && !G.pushing) {
      const t = (levelT - 180) % 180;
      if (t < 60) s += JJ.rnd(3 * Math.sin(t / 60 * Math.PI * 2));
    }
    return JJ.rnd(G.o[k]) + s;
  }
  function travelerFrame() {
    const p = G.p, T = ATL.char_traveler.frames;
    if (G.won) return T.bow;
    if (G.pushing) return T.push;
    if (!p.ground) return p.vy < -1 ? 12 : (p.vy <= 1 ? 13 : 14);
    if (landT > 0) return 15;
    if (p.vx !== 0) return 4 + (Math.floor(walkDist / 2.5) % 8);
    return Math.floor(G.frame / 20) % 4;
  }
  function spr(img, r, x, y, flip) {
    if (flip) { g.save(); g.translate(x + r.w, y); g.scale(-1, 1); g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); g.restore(); }
    else g.drawImage(img, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
  }
  function drawTraveler() {
    if (G.bloom > 0) return;
    const p = G.p, f = travelerFrame();
    const x = JJ.rnd(p.x + G.o[p.L]) - 8, y = JJ.rnd(p.y) - 16;
    spr(IMG.char_traveler, { x: (f % 8) * 16, y: (f >> 3) * 16, w: 16, h: 16 }, x, y, p.face < 0);
  }
  function drawLamp() {
    const lm = G.S.lamp, line = G.S.layers[lm.layer].lines[lm.line], P = ATL.props_architecture;
    const x = JJ.rnd(lm.x + G.o[lm.layer]), y = JJ.rnd(JJ.yAt(line, lm.x));
    if (G.won) {
      spr(IMG.props_architecture, P.halo, x - 12, y - 30);
      spr(IMG.props_architecture, (G.wonT >> 3) & 1 ? P.lantern_on2 : P.lantern_on, x - 8, y - 24);
      if (G.wonT > 30) spr(IMG.ui_ink_seals, ATL.ui_ink_seals.clear_seal, x + 8, y - 30);
    } else spr(IMG.props_architecture, P.lantern_off, x - 8, y - 24);
  }
  // 第 k 层停在 v 时，屏幕上哪些端点正好对上（预光、吸附闪光画在这里）
  function jointsAt(k, v) {
    const save = G.o[k], out = [];
    G.o[k] = v;
    const ends = [];
    for (let j = 0; j < 3; j++) {
      const oj = JJ.rnd(G.o[j]);
      G.S.layers[j].lines.forEach((b, bi) => {
        for (const q of G.pieces(j, bi)) { ends.push([q[0] + oj, JJ.yAt(b, q[0]), j, -1]); ends.push([q[1] + oj, JJ.yAt(b, q[1]), j, 1]); }
      });
    }
    for (const e of ends) if (e[3] === 1) for (const f of ends) if (f[3] === -1 && f[2] !== e[2] && f[0] === e[0] && Math.abs(e[1] - f[1]) <= 1.01 && (e[2] === k || f[2] === k || G.S.hasFrames[k])) out.push({ x: e[0], y: Math.min(e[1], f[1]) });
    G.o[k] = save;
    return out;
  }
  function drawGlow() {
    const k = G.sel; if (k < 0) return;
    const o = G.o[k], n = G.nearestSnap(k, o);
    if (n.s !== null && n.d >= 0.5 && n.d <= JJ.C.GLOW) {
      const dx = JJ.rnd(o - n.s);
      g.fillStyle = GOLD;
      for (const q of jointsAt(k, n.s)) {
        const a = Math.min(q.x, q.x + dx), b = Math.max(q.x, q.x + dx);
        for (let x = a - 1; x <= b + 1; x++) if ((x + (G.frame >> 2)) % 3 !== 0) g.fillRect(x, JJ.rnd(q.y) - 1, 1, 1);
        g.fillRect(q.x, JJ.rnd(q.y) - 3, 1, 1); g.fillRect(q.x, JJ.rnd(q.y) + 3, 1, 1);
      }
    }
    if (flash && !flash.borrow) {
      const r = 18 - flash.t;
      g.fillStyle = GOLD;
      for (const q of jointsAt(flash.k, JJ.rnd(G.o[flash.k]))) {
        for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; g.fillRect(JJ.rnd(q.x + Math.cos(an) * r * 0.4), JJ.rnd(q.y - 1 + Math.sin(an) * r * 0.3), 1, 1); }
      }
    }
  }
  // 选中的层：它露出来的每段墨线两端各一个金点；右上角三道墨（远中近），选中的那道是朱砂
  function drawSel() {
    const k = G.sel;
    if (k >= 0) {
      const o = layerX(k);
      g.fillStyle = GOLD;
      G.S.layers[k].lines.forEach((l, bi) => {
        for (const q of G.pieces(k, bi)) for (const x of q) g.fillRect(JJ.rnd(x + o), JJ.rnd(JJ.yAt(l, x)) - 2, 1, 1);
      });
    }
    if (!G.pushable.length) return;
    for (let i = 0; i < 3; i++) {
      const can = G.pushable.includes(i), on = i === k;
      g.fillStyle = on ? RED : (can ? '#55555C' : '#B4AFA2');
      const w = [6, 9, 12][i];
      g.fillRect(W - 8 - w, 8 + i * 4, w, on ? 2 : 1);
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
  // 景名：左上角朱印 + 中文景名 + 一行英文小字，开场停 3 秒后淡出
  function drawTitle() {
    const t = levelT; if (t > 240) return;
    const a = t < 20 ? t / 20 : (t > 200 ? (240 - t) / 40 : 1);
    g.globalAlpha = a;
    const U = ATL.ui_ink_seals, T = ATL.ui_titles[LV[li].id];
    spr(IMG.ui_ink_seals, U.title_seal, 8, 8);
    g.drawImage(IMG.ui_titles, T.x, T.y, T.w, 16, 36, 8, T.w, 16);
    g.drawImage(IMG.ui_titles, T.x, T.y + 16, T.w, 16, 36, 21, T.w, 16);
    g.globalAlpha = 1;
  }
  // 1-1 引导图标：底部极淡地浮现 Shift 键帽和左右滑动
  function drawGuide() {
    let a = 0;
    if (guideOn()) a = Math.min(1, (levelT - 180) / 60) * 0.45;
    else if (guideFade > 0) a = guideFade / 30 * 0.45;
    if (a <= 0) return;
    const U = ATL.ui_ink_seals;
    g.globalAlpha = a;
    spr(IMG.ui_ink_seals, U.icon_shift, W / 2 - 18, H - 22);
    spr(IMG.ui_ink_seals, U.icon_swipe, W / 2 + 2, H - 22);
    g.globalAlpha = 1;
  }
  function drawLayer(L, A, k) {
    const frames = (L.frames || []).filter(f => f.target === k);
    if (frames.length) {
      // 框景：这一层只在框里画出来
      g.save(); g.beginPath();
      for (const f of frames) g.rect(f.x1 + layerX(f.layer), f.y1, f.x2 - f.x1, f.y2 - f.y1);
      g.clip();
      g.drawImage(IMG[L.id + '_L' + k], layerX(k) + A.layers[k].dx, 0);
      g.restore();
    } else g.drawImage(IMG[L.id + '_L' + k], layerX(k) + A.layers[k].dx, 0);
  }
  function draw() {
    const L = LV[li], A = ART.levels[L.id];
    g.globalCompositeOperation = 'source-over';
    g.drawImage(IMG[L.id + '_bg'], 0, 0);
    for (let k = 0; k < 3; k++) {
      drawLayer(L, A, k);
      if (L.lamp.layer === k) drawLamp();
      if (G.p.L === k) drawTraveler();
    }
    drawGlow();
    drawBloom();
    g.globalCompositeOperation = 'multiply';
    g.drawImage(IMG.paper_noise, 0, 0);
    g.globalCompositeOperation = 'source-over';
    drawSel();
    drawTitle();
    drawGuide();
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
