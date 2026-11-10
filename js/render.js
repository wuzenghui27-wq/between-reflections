// 画面：全部为程序绘制的 2D 绘本风格图形。
// 现实世界画在下半屏；梦境用同一套坐标绘制，再以 y=360 为轴镜像到上半屏。
(function () {
  const C = RF.CFG, LV = RF.LEVEL;
  const W = C.W, FOOT = C.REAL_FOOT;
  let ctx = null;

  // ---------------------------------------------------------------- 工具
  const U = RF.U = {
    clamp: (v, a, b) => v < a ? a : v > b ? b : v,
    lerp: (a, b, t) => a + (b - a) * t,
    smooth: t => t * t * (3 - 2 * t),
    hash: (i, s) => { const x = Math.sin(i * 127.1 + (s || 0) * 311.7) * 43758.5453; return x - Math.floor(x); },
    mod: (a, n) => ((a % n) + n) % n
  };
  const hx = h => { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; };
  const mixA = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgb = (a, al) => (al === undefined || al >= 1) ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al < 0 ? 0 : al})`;
  const pal = o => { const p = {}; for (const k in o) p[k] = hx(o[k]); return p; };
  const mixPal = (p, q, t) => { const r = {}; for (const k in p) r[k] = mixA(p[k], q[k], t); return r; };
  U.rgb = rgb;

  // ---------------------------------------------------------------- 色板（GDD 第 7 节）
  const DAY = pal({ skyTop: '#E6D9BD', skyHor: '#F2E7CF', hills: '#93ADA0', hills2: '#82A194', trees: '#729D91', treeDark: '#5C8478', road: '#856A53', roadEdge: '#5E4A3A', bank: '#6F5A47', lake: '#7FA89C', lakeDeep: '#5F8A80', sun: '#FFF7E2', accent: '#E5BE68', ink: '#3D3446', haze: '#F2E7CF' });
  const DUSK = pal({ skyTop: '#E2AE8E', skyHor: '#F6D8AE', hills: '#A08FA3', hills2: '#8C7F96', trees: '#7B8786', treeDark: '#5E6A6E', road: '#80604C', roadEdge: '#563F33', bank: '#5E4A40', lake: '#8E97A8', lakeDeep: '#66718A', sun: '#FFE2B0', accent: '#EDC271', ink: '#3A2F40', haze: '#F3D6B4' });
  const NIGHT = pal({ skyTop: '#232A52', skyHor: '#4A4777', hills: '#3D4466', hills2: '#343B5B', trees: '#2F3B57', treeDark: '#252E47', road: '#5B4D52', roadEdge: '#2E2830', bank: '#3A3142', lake: '#33476A', lakeDeep: '#253658', sun: '#F6EDCB', accent: '#F0D58E', ink: '#1E1A2A', haze: '#3B3D66' });
  const MOOD = {
    A: pal({ skyTop: '#3E4E86', skyHor: '#25345D', far: '#9E92CB', tree: '#6F7FBA', treeDark: '#4F5C93', treeGlow: '#A9DACB', road: '#647BA3', roadEdge: '#A9DACB', bank: '#4B5E8A', lake: '#2E3F70', lakeDeep: '#1D2A52', accent: '#B7E6D5', gold: '#F0D58E', haze: '#33447A' }),
    B: pal({ skyTop: '#55488A', skyHor: '#222D58', far: '#B3A3DA', tree: '#7C70B6', treeDark: '#594F92', treeGlow: '#D5C6F5', road: '#6C74AA', roadEdge: '#B7E6D5', bank: '#4F5288', lake: '#2B3168', lakeDeep: '#1A1F48', accent: '#B7E6D5', gold: '#F0D58E', haze: '#3B3A72' }),
    C: pal({ skyTop: '#2E2860', skyHor: '#101638', far: '#7E79B8', tree: '#555A97', treeDark: '#3C4176', treeGlow: '#F0D58E', road: '#5C6A9E', roadEdge: '#F0D58E', bank: '#3D4478', lake: '#1C2350', lakeDeep: '#0D1230', accent: '#B7E6D5', gold: '#F5DC96', haze: '#22265A' })
  };

  function realPal(f) {
    if (f < 0.25) return DAY;
    if (f < 0.55) return mixPal(DAY, DUSK, U.smooth((f - 0.25) / 0.3));
    if (f < 0.8) return mixPal(DUSK, NIGHT, U.smooth((f - 0.55) / 0.25));
    return NIGHT;
  }

  // 景色权重：跟随旅行进度，边界处 2 秒柔和过渡（位置驱动，同一地点永远一致）
  function sceneWeights(px) {
    const s = LV.scenes, w = new Array(s.length).fill(0);
    let i = 0;
    for (let k = 0; k < s.length; k++) if (px >= s[k].x) i = k;
    const t = i === 0 ? 1 : U.smooth(U.clamp((px - s[i].x) / 200, 0, 1));
    w[i] = t; if (i > 0) w[i - 1] += 1 - t;
    return w;
  }

  // 每帧环境
  function makeEnv(G) {
    const px = G.px, f = U.clamp(px / LV.endX, 0, 1);
    const ws = sceneWeights(px);
    const moodW = { A: 0, B: 0, C: 0 };
    LV.scenes.forEach((s, k) => moodW[s.mood] += ws[k]);
    // 梦境色板按氛围权重混合
    const dp = {};
    for (const k in MOOD.A) {
      dp[k] = [0, 0, 0];
      for (const m in moodW) { const c = MOOD[m][k]; dp[k][0] += c[0] * moodW[m]; dp[k][1] += c[1] * moodW[m]; dp[k][2] += c[2] * moodW[m]; }
    }
    const v06 = LV.scenes[5].x;
    const a = U.smooth(U.clamp((px - v06) / (LV.endX - v06), 0, 1));
    const align = U.clamp(a * 0.85 + G.alignExtra * 0.15, 0, 1);
    const night = U.clamp((f - 0.55) / 0.25, 0, 1);
    return {
      G, px, camX: px - C.PLAYER_SX, t: G.animT, reduce: G.reduceMotion,
      real: realPal(f), dream: dp, night,
      w: {
        fire: ws[0] + ws[1] * 0.6,
        glow: ws[1] + ws[2] * 0.35 + ws[3] * 0.35 + ws[4] * 0.5 + ws[5] * 0.6,
        float: ws[2] + ws[3] + ws[4] * 0.35,
        cloud: ws[2] + ws[3] * 0.35,
        fish: ws[3],
        river: ws[4] + ws[5],
        wheel: ws[4] * 0.7 + ws[5]
      },
      fishSec: (px - LV.scenes[3].x) / C.SPEED,
      moonX: U.lerp(1130, 1000, align),
      wheelX: U.lerp(520, 1000, align),
      align
    };
  }

  // ---------------------------------------------------------------- 背景元素
  function ridge(off, base, amp, seed, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, base + 6);
    for (let sx = 0; sx <= W + 16; sx += 16) {
      const x = sx + off;
      const h = amp * (0.72 + 0.32 * Math.sin(x * 0.0041 + seed) + 0.2 * Math.sin(x * 0.0107 + seed * 2.3) + 0.09 * Math.sin(x * 0.029 + seed * 1.7));
      ctx.lineTo(sx, base - h);
    }
    ctx.lineTo(W, base + 6); ctx.closePath(); ctx.fill();
  }

  function trees(off, col, dark, seed, sp, dens, glowW, glowCol, t) {
    const i0 = Math.floor(off / sp) - 2, i1 = Math.ceil((off + W) / sp) + 1;
    for (let i = i0; i <= i1; i++) {
      if (U.hash(i, seed) > dens) continue;
      const x = i * sp + U.hash(i, seed + 1) * sp * 0.6 - off;
      const h = 46 + U.hash(i, seed + 2) * 58;
      const r = h * 0.3;
      const cy = FOOT - h * 0.62;
      if (glowW > 0.01) {
        const gl = ctx.createRadialGradient(x, cy, 2, x, cy, r * 2.6);
        const pulse = 0.55 + 0.25 * Math.sin(t * 1.1 + i * 1.7);
        gl.addColorStop(0, rgb(glowCol, 0.45 * glowW * pulse)); gl.addColorStop(1, rgb(glowCol, 0));
        ctx.fillStyle = gl; ctx.fillRect(x - r * 2.6, cy - r * 2.6, r * 5.2, r * 5.2);
      }
      ctx.fillStyle = rgb(dark);
      ctx.fillRect(x - 3, FOOT - h * 0.55, 6, h * 0.55);
      ctx.beginPath();
      ctx.arc(x - r * 0.6, cy + r * 0.35, r * 0.72, 0, Math.PI * 2);
      ctx.arc(x + r * 0.62, cy + r * 0.3, r * 0.68, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(col);
      ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill();
      if (glowW > 0.01) {
        ctx.fillStyle = rgb(glowCol, 0.5 * glowW);
        ctx.beginPath(); ctx.arc(x - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawRealBG(e) {
    const p = e.real;
    const g = ctx.createLinearGradient(0, 360, 0, 560);
    g.addColorStop(0, rgb(p.skyTop)); g.addColorStop(1, rgb(p.skyHor));
    ctx.fillStyle = g; ctx.fillRect(0, 360, W, 360);
    // 星星（夜晚）
    if (e.night > 0.05) {
      for (let i = 0; i < 26; i++) {
        const x = U.mod(U.hash(i, 41) * 1500 - e.camX * 0.04, 1500) - 110;
        const y = 372 + U.hash(i, 42) * 110;
        const tw = e.reduce ? 0.7 : 0.5 + 0.5 * Math.sin(e.t * (0.6 + U.hash(i, 43)) + i);
        ctx.fillStyle = rgb(p.sun, e.night * 0.55 * tw);
        ctx.fillRect(x, y, 2, 2);
      }
    }
    // 太阳 / 月亮
    const sunA = 1 - e.night;
    if (sunA > 0.02) glowDisc(1040, 438, 22, p.sun, sunA * 0.9, 70);
    if (e.night > 0.02) {
      glowDisc(e.moonX, 418, 17, p.sun, e.night, 60 + 30 * e.align);
      ctx.fillStyle = rgb(p.skyTop, 0.35 * e.night);
      ctx.beginPath(); ctx.arc(e.moonX - 5, 414, 4, 0, Math.PI * 2); ctx.arc(e.moonX + 6, 423, 3, 0, Math.PI * 2); ctx.fill();
    }
    ridge(e.camX * 0.12, FOOT, 48, 0.4, rgb(p.hills));
    ridge(e.camX * 0.26, FOOT, 26, 2.2, rgb(p.hills2));
    trees(e.camX * 0.5, p.trees, p.treeDark, 11, 130, 0.62, 0, null, e.t);
  }

  function glowDisc(x, y, r, col, a, gr) {
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, gr);
    g.addColorStop(0, rgb(col, 0.45 * a)); g.addColorStop(1, rgb(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - gr, y - gr, gr * 2, gr * 2);
    ctx.fillStyle = rgb(col, a);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function drawDreamBG(e) {
    const p = e.dream, t = e.t;
    const g = ctx.createLinearGradient(0, 360, 0, 560);
    g.addColorStop(0, rgb(p.skyTop)); g.addColorStop(1, rgb(p.skyHor));
    ctx.fillStyle = g; ctx.fillRect(0, 360, W, 360);

    // 星光：疏落明暗
    const nStars = 40 + Math.round(70 * e.w.river);
    for (let i = 0; i < nStars; i++) {
      const x = U.mod(U.hash(i, 7) * 1500 - e.camX * 0.05, 1500) - 110;
      const y = 366 + U.hash(i, 8) * 160;
      const tw = e.reduce ? 0.7 : 0.45 + 0.55 * Math.sin(t * (0.5 + U.hash(i, 9) * 0.8) + i * 2.1);
      ctx.fillStyle = rgb(p.gold, 0.5 * tw);
      const s = U.hash(i, 10) < 0.15 ? 2.5 : 1.5;
      ctx.fillRect(x, y, s, s);
    }

    // 星河（V05–V06）
    if (e.w.river > 0.01) {
      const a = e.w.river;
      const band = ctx.createLinearGradient(0, 380, 0, 460);
      band.addColorStop(0, rgb(p.gold, 0)); band.addColorStop(0.5, rgb(p.accent, 0.12 * a)); band.addColorStop(1, rgb(p.gold, 0));
      ctx.fillStyle = band; ctx.fillRect(0, 380, W, 80);
      for (let i = 0; i < 160; i++) {
        const x = U.mod(U.hash(i, 31) * 1600 - e.camX * 0.07, 1600) - 160;
        const y = 420 + 18 * Math.sin(x * 0.004 + 1.2) + (U.hash(i, 32) - 0.5) * 34;
        const tw = e.reduce ? 0.8 : 0.5 + 0.5 * Math.sin(t * 1.3 + i);
        ctx.fillStyle = rgb(i % 3 ? p.gold : p.accent, a * 0.7 * tw);
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }

    // 光轮（V05–V06）
    if (e.w.wheel > 0.01) {
      const x = e.wheelX, y = 418, a = e.w.wheel;
      const gr = ctx.createRadialGradient(x, y, 4, x, y, 80 + 30 * e.align);
      gr.addColorStop(0, rgb(p.gold, 0.4 * a)); gr.addColorStop(1, rgb(p.gold, 0));
      ctx.fillStyle = gr; ctx.fillRect(x - 120, y - 120, 240, 240);
      ctx.strokeStyle = rgb(p.gold, 0.9 * a); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      const rot = e.reduce ? 0 : t * 0.15;
      for (let k = 0; k < 12; k++) {
        const an = rot + k * Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(an) * 25, y + Math.sin(an) * 25);
        ctx.lineTo(x + Math.cos(an) * (k % 2 ? 32 : 38), y + Math.sin(an) * (k % 2 ? 32 : 38));
        ctx.stroke();
      }
    }

    // 远山（倒置）
    ctx.globalAlpha = 1 - 0.45 * e.w.float;
    ridge(e.camX * 0.12, FOOT, 50, 3.1, rgb(p.far));
    ctx.globalAlpha = 1;

    // 漂浮的远山（V03–V04）
    if (e.w.float > 0.01) {
      const sp = 380, off = e.camX * 0.2;
      for (let i = Math.floor(off / sp) - 1; i <= Math.ceil((off + W) / sp) + 1; i++) {
        const x = i * sp + U.hash(i, 51) * 160 - off;
        const bob = e.reduce ? 0 : Math.sin(t * 0.45 + i * 1.3) * 6;
        const lift = (1 - e.w.float) * 40;
        const y0 = 432 + U.hash(i, 52) * 50 + bob + lift;
        const s = 0.7 + U.hash(i, 53) * 0.7;
        ctx.fillStyle = rgb(p.far, 0.95 * e.w.float);
        ctx.beginPath();
        ctx.moveTo(x - 46 * s, y0);
        ctx.quadraticCurveTo(x - 20 * s, y0 - 36 * s, x + 4 * s, y0 - 30 * s);
        ctx.quadraticCurveTo(x + 26 * s, y0 - 42 * s, x + 48 * s, y0);
        ctx.lineTo(x + 18 * s, y0 + 34 * s);
        ctx.lineTo(x - 8 * s, y0 + 46 * s);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(p.treeGlow, 0.35 * e.w.float);
        ctx.fillRect(x - 46 * s, y0 - 2, 94 * s, 3);
      }
    }

    // 云层穿过树间（V03）
    if (e.w.cloud > 0.01) {
      for (let i = 0; i < 7; i++) {
        const drift = e.reduce ? 0 : t * 9;
        const x = U.mod(U.hash(i, 61) * 1900 - e.camX * 0.32 - drift, 1900) - 300;
        const y = 470 + U.hash(i, 62) * 50;
        ctx.fillStyle = rgb(p.treeGlow, 0.22 * e.w.cloud);
        ctx.beginPath();
        ctx.ellipse(x, y, 90, 14, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 40, y - 8, 50, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 倒悬树
    trees(e.camX * 0.5, p.tree, p.treeDark, 23, 150, 0.6, e.w.glow, p.treeGlow, t);

    // 萤火（V01–V02）
    if (e.w.fire > 0.01) {
      for (let i = 0; i < 28; i++) {
        const wob = e.reduce ? 0 : Math.sin(t * 0.4 + i) * 24;
        const x = U.mod(U.hash(i, 71) * 1500 - e.camX * 0.6 + wob, 1500) - 110;
        const y = 385 + U.hash(i, 72) * 140 + (e.reduce ? 0 : Math.sin(t * 0.8 + i * 1.7) * 9);
        const a = e.w.fire * (e.reduce ? 0.7 : 0.4 + 0.6 * Math.max(0, Math.sin(t * 1.6 + i * 2.3)));
        glowDot(x, y, 2, p.gold, a);
      }
    }

    // 发光鱼群（V04）
    if (e.w.fish > 0.01) drawFish(e, p);
  }

  function glowDot(x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, rgb(col, a)); g.addColorStop(1, rgb(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  }

  function drawFish(e, p) {
    const sec = e.fishSec, t = e.t;
    const baseX = 1380 - sec * 118;
    for (let i = 0; i < 9; i++) {
      const ox = U.hash(i, 81) * 260 + i * 18;
      const oy = (U.hash(i, 82) - 0.5) * 70;
      const x = baseX + ox;
      const y = 440 + oy + (e.reduce ? 0 : Math.sin(t * 1.4 + i) * 6);
      if (x < -60 || x > W + 60) continue;
      const s = 0.8 + U.hash(i, 83) * 0.5;
      const a = e.w.fish;
      glowDot(x, y, 6 * s, p.accent, 0.35 * a);
      ctx.fillStyle = rgb(p.accent, 0.9 * a);
      ctx.beginPath(); ctx.ellipse(x, y, 13 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
      const wag = e.reduce ? 0 : Math.sin(t * 6 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(x + 11 * s, y);
      ctx.lineTo(x + 21 * s, y - 6 * s + wag);
      ctx.lineTo(x + 21 * s, y + 6 * s + wag);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgb(p.skyHor, 0.8 * a);
      ctx.beginPath(); ctx.arc(x - 7 * s, y - 1, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- 道路与机关
  function solidSegments(world, a, b) {
    const segs = []; let s = a;
    for (const h of LV.holes[world]) {
      if (h.x1 <= a || h.x0 >= b) continue;
      if (h.x0 > s) segs.push([s, h.x0]);
      s = Math.max(s, h.x1);
    }
    if (s < b) segs.push([s, b]);
    return segs;
  }

  function drawGround(world, e) {
    const dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    const camX = e.camX;
    // 湖水
    const g = ctx.createLinearGradient(0, FOOT, 0, 720);
    g.addColorStop(0, rgb(p.lake)); g.addColorStop(1, rgb(p.lakeDeep));
    ctx.fillStyle = g; ctx.fillRect(0, FOOT, W, 180);
    // 水波
    ctx.strokeStyle = rgb(dream ? p.accent : p.haze, 0.22); ctx.lineWidth = 1.5;
    for (let k = 0; k < 16; k++) {
      const y = 596 + U.hash(k, 91) * 110;
      const x = U.mod(U.hash(k, 92) * 1500 - camX * (0.8 + U.hash(k, 93) * 0.3) + (e.reduce ? 0 : Math.sin(e.t * 0.5 + k) * 10), 1500) - 110;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20 + U.hash(k, 94) * 30, y); ctx.stroke();
    }
    // 路面
    const segs = solidSegments(world, camX - 40, camX + W + 40);
    for (const [a, b] of segs) {
      const x = a - camX, w = b - a;
      ctx.fillStyle = rgb(p.bank);
      roundRect(x, FOOT + 6, w, 26, 9); ctx.fill();
      ctx.fillStyle = rgb(p.road);
      roundRect(x, FOOT, w, 13, 4); ctx.fill();
      ctx.strokeStyle = rgb(p.roadEdge); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x + 2, FOOT); ctx.lineTo(x + w - 2, FOOT); ctx.stroke();
      // 草叶 / 光点
      const i0 = Math.ceil(a / 46), i1 = Math.floor(b / 46);
      for (let i = i0; i <= i1; i++) {
        if (U.hash(i, dream ? 101 : 102) > 0.45) continue;
        const gx = i * 46 - camX;
        if (dream) {
          ctx.fillStyle = rgb(p.accent, 0.55);
          ctx.beginPath(); ctx.arc(gx, FOOT - 3, 1.8, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.strokeStyle = rgb(p.trees); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(gx, FOOT); ctx.lineTo(gx - 3, FOOT - 8); ctx.moveTo(gx + 3, FOOT); ctx.lineTo(gx + 5, FOOT - 7); ctx.stroke();
        }
      }
    }
    // 缺口边缘的芦苇 / 水草，提示道路在这里断开
    for (const h of LV.holes[world]) {
      for (const ex of [h.x0, h.x1]) {
        const x = ex - camX;
        if (x < -30 || x > W + 30) continue;
        ctx.strokeStyle = rgb(dream ? p.accent : p.treeDark, 0.8); ctx.lineWidth = 2;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath(); ctx.moveTo(x + k * 5, FOOT + 22); ctx.quadraticCurveTo(x + k * 7, FOOT + 6, x + k * 9, FOOT - 6); ctx.stroke();
        }
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    if (Array.isArray(r)) r = r[0];
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // 形状标记：圆环、叶片、菱形、星形。颜色只作辅助。
  function shapePath(kind, x, y, r) {
    ctx.beginPath();
    switch (kind) {
      case 'ring': ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x + r * 0.45, y); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2, true); break;
      case 'leaf':
        ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y - r * 1.25, x + r, y); ctx.quadraticCurveTo(x, y + r * 1.25, x - r, y); break;
      case 'diamond': ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 0.85, y); ctx.lineTo(x, y + r * 1.15); ctx.lineTo(x - r * 0.85, y); ctx.closePath(); break;
      case 'star':
        for (let k = 0; k < 8; k++) { const an = -Math.PI / 2 + k * Math.PI / 4; const rr = k % 2 ? r * 0.42 : r * 1.15; ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
        ctx.closePath(); break;
    }
  }
  function drawShape(kind, x, y, r, col, lit, a) {
    a = a === undefined ? 1 : a;
    if (lit) glowDot(x, y, r * 0.9, col, 0.7 * a);
    shapePath(kind, x, y, r);
    if (lit) { ctx.fillStyle = rgb(col, a); ctx.fill('evenodd'); }
    else { ctx.fillStyle = rgb(col, 0.25 * a); ctx.fill('evenodd'); }
    ctx.lineWidth = 1.6; ctx.strokeStyle = rgb([30, 28, 45], 0.55 * a); ctx.stroke();
  }

  function bridgeProgress(G, b) {
    const s = G.bridges[b.id];
    if (!s || s.state === 'closed') return 0;
    if (s.state === 'open') return 1;
    return U.clamp(s.t / C.BRIDGE_DEPLOY, 0, 1);
  }

  function drawBridges(world, e) {
    const G = e.G, dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    const markCol = dream ? p.accent : p.accent;
    for (const b of LV.bridges) {
      if (b.world !== world) continue;
      const x0 = b.x0 - e.camX, x1 = b.x1 - e.camX;
      if (x1 < -60 || x0 > W + 60) continue;
      const prog = bridgeProgress(G, b);
      const n = Math.max(1, Math.round((b.x1 - b.x0) / 26));
      const pw = (b.x1 - b.x0) / n;
      const filled = prog >= 1 ? n : Math.floor(prog * n);
      for (let k = 0; k < n; k++) {
        const bx = x0 + k * pw;
        if (bx + pw < -10 || bx > W + 10) continue;
        const on = k < filled;
        if (dream) {
          const cx = bx + pw / 2;
          ctx.beginPath(); ctx.ellipse(cx, FOOT + 4, pw * 0.56, 8, 0, 0, Math.PI * 2);
          if (on) {
            ctx.fillStyle = rgb([128, 196, 178]); ctx.fill();
            ctx.strokeStyle = rgb([40, 70, 80]); ctx.lineWidth = 1.5; ctx.stroke();
            ctx.strokeStyle = rgb(p.accent, 0.8); ctx.beginPath(); ctx.moveTo(cx, FOOT + 4); ctx.lineTo(cx + pw * 0.4, FOOT + 1); ctx.stroke();
          } else {
            ctx.setLineDash([5, 5]); ctx.strokeStyle = rgb(p.accent, 0.75); ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]);
          }
        } else {
          if (on) {
            ctx.fillStyle = rgb([176, 132, 92]); ctx.fillRect(bx + 1.5, FOOT, pw - 3, 11);
            ctx.strokeStyle = rgb([84, 60, 44]); ctx.lineWidth = 1.5; ctx.strokeRect(bx + 1.5, FOOT, pw - 3, 11);
          } else {
            ctx.setLineDash([6, 5]); ctx.strokeStyle = rgb(p.roadEdge, 0.75); ctx.lineWidth = 1.8;
            ctx.strokeRect(bx + 1.5, FOOT, pw - 3, 11); ctx.setLineDash([]);
          }
        }
      }
      // 完成后的扶绳 / 光线
      if (prog >= 1) {
        ctx.strokeStyle = rgb(dream ? p.accent : [110, 80, 58], 0.8); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x0, FOOT - 24); ctx.quadraticCurveTo((x0 + x1) / 2, FOOT - 12, x1, FOOT - 24); ctx.stroke();
      }
      // 桥头标记柱
      const blink = prog > 0 && prog < 1 ? 0.5 + 0.5 * Math.sin(e.t * 20) : 1;
      for (const ex of [x0 - 8, x1 + 8]) {
        ctx.strokeStyle = rgb(dream ? p.roadEdge : p.roadEdge); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ex, FOOT); ctx.lineTo(ex, FOOT - 26); ctx.stroke();
        drawShape(b.shape, ex, FOOT - 34, 7, markCol, prog >= 1, blink);
      }
    }
  }

  function drawPlates(world, e) {
    const G = e.G, dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    const col = dream ? p.accent : p.accent;
    for (const pl of LV.plates) {
      if (pl.world !== world) continue;
      const x = pl.x - e.camX;
      if (x < -60 || x > W + 60) continue;
      const fired = G.firedPlates.has(pl.id);
      const pulse = 0.6 + 0.4 * Math.sin(e.t * 3);
      glowDot(x, FOOT - 2, 8, col, fired ? 0.6 : 0.35 * pulse);
      ctx.fillStyle = rgb(dream ? [150, 170, 200] : [170, 160, 140]);
      ctx.beginPath(); ctx.ellipse(x, FOOT + 1, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgb(col, fired ? 1 : 0.5 + 0.4 * pulse); ctx.lineWidth = 2; ctx.stroke();
      drawShape(pl.shape, x, FOOT - 22 - (e.reduce ? 0 : Math.sin(e.t * 2) * 2), 7, col, true, fired ? 1 : 0.55 + 0.45 * pulse);
    }
  }

  function drawObstacles(world, e) {
    const dream = world === 'dream';
    for (const o of LV.obstacles) {
      if (o.world !== world) continue;
      const x = o.x - e.camX;
      if (x < -80 || x > W + 80) continue;
      const w = o.w, h = 86;
      if (!dream) {
        // 挡路树干
        ctx.fillStyle = '#6E4C38';
        roundRect(x, FOOT - h, w, h + 4, [12, 12, 2, 2]); ctx.fill();
        ctx.strokeStyle = '#2B201B'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = 'rgba(40,28,22,0.55)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + 9 + k * 12, FOOT - h + 14); ctx.lineTo(x + 7 + k * 12, FOOT - 6); ctx.stroke(); }
        ctx.fillStyle = '#C9A27E';
        ctx.beginPath(); ctx.ellipse(x + w / 2, FOOT - h + 4, w / 2 - 3, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2B201B'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#5E8A62';
        ctx.beginPath(); ctx.ellipse(x + w + 6, FOOT - h + 26, 9, 5, -0.5, 0, Math.PI * 2); ctx.fill();
      } else {
        // 梦境晶柱
        const p = e.dream;
        ctx.beginPath();
        ctx.moveTo(x, FOOT); ctx.lineTo(x + 3, FOOT - 58); ctx.lineTo(x + w * 0.45, FOOT - h - 6);
        ctx.lineTo(x + w - 2, FOOT - 64); ctx.lineTo(x + w, FOOT); ctx.closePath();
        ctx.fillStyle = '#D9CCF7'; ctx.fill();
        ctx.strokeStyle = '#141632'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'rgba(120,100,190,0.55)';
        ctx.beginPath(); ctx.moveTo(x + w * 0.45, FOOT - h - 6); ctx.lineTo(x + w - 2, FOOT - 64); ctx.lineTo(x + w, FOOT); ctx.lineTo(x + w * 0.5, FOOT); ctx.closePath(); ctx.fill();
        glowDot(x + w * 0.4, FOOT - 50, 5, p.treeGlow, 0.25);
      }
    }
  }

  function drawCheckpoints(world, e) {
    const G = e.G, dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    LV.checkpoints.forEach((c, i) => {
      if (i === 0) return;
      const x = c.x - e.camX + 40;
      if (x < -30 || x > W + 30) return;
      const lit = G.cpIndex >= i;
      ctx.strokeStyle = rgb(p.roadEdge); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, FOOT); ctx.lineTo(x, FOOT - 46); ctx.lineTo(x + 8, FOOT - 46); ctx.stroke();
      if (lit) glowDot(x + 8, FOOT - 38, 5, dream ? p.gold : p.accent, 0.7);
      ctx.fillStyle = lit ? rgb(dream ? p.gold : p.accent) : rgb(p.roadEdge, 0.6);
      roundRect(x + 4, FOOT - 44, 8, 11, 2); ctx.fill();
    });
  }

  function drawDeck(world, e) {
    const dream = world === 'dream';
    const x0 = LV.endX - 140 - e.camX, x1 = LV.endX + 360 - e.camX;
    if (x1 < 0 || x0 > W) return;
    const col = dream ? e.dream.gold : [150, 112, 82];
    ctx.fillStyle = rgb(col, dream ? 0.5 : 1);
    ctx.fillRect(x0, FOOT, x1 - x0, 8);
    ctx.strokeStyle = rgb(col, dream ? 0.8 : 1); ctx.lineWidth = 2.5;
    for (let x = x0 + 10; x < x1; x += 40) { ctx.beginPath(); ctx.moveTo(x, FOOT); ctx.lineTo(x, FOOT - 30); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0 + 10, FOOT - 30); ctx.lineTo(x1 - 10, FOOT - 30); ctx.stroke();
    // 支撑柱伸入湖水
    for (let x = x0 + 30; x < x1; x += 90) { ctx.fillRect(x, FOOT + 8, 6, 60); }
  }

  // ---------------------------------------------------------------- 角色
  function drawTraveler(sx, phase, o) {
    o = o || {};
    ctx.save();
    ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    const f = FOOT;
    const sw = Math.sin(phase) * (o.still ? 0 : 1);
    const bob = o.still ? 0 : Math.abs(Math.cos(phase)) * 1.6;
    const ink = o.ink || '#3D3446';
    if (o.rim) { ctx.shadowColor = o.rim; ctx.shadowBlur = 12; }
    ctx.lineCap = 'round';
    // 腿
    ctx.strokeStyle = ink; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx, f - 22); ctx.lineTo(sx + sw * 8, f - 1);
    ctx.moveTo(sx, f - 22); ctx.lineTo(sx - sw * 8, f - 1); ctx.stroke();
    // 背包
    ctx.fillStyle = o.pack || '#A8754F';
    roundRect(sx - 15, f - 50 - bob, 11, 22, 4); ctx.fill();
    // 身体
    ctx.fillStyle = ink;
    roundRect(sx - 7, f - 50 - bob, 15, 30, 6); ctx.fill();
    // 手臂
    ctx.strokeStyle = ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx + 2, f - 44 - bob); ctx.lineTo(sx + 2 - sw * 7, f - 28 - bob); ctx.stroke();
    // 围巾
    ctx.shadowBlur = 0;
    const sc = o.scarf || '#E5BE68';
    ctx.fillStyle = sc;
    roundRect(sx - 7, f - 52 - bob, 16, 5, 2); ctx.fill();
    ctx.strokeStyle = sc; ctx.lineWidth = 4;
    const wv = o.still ? 0 : Math.sin(phase * 0.7) * 3;
    ctx.beginPath(); ctx.moveTo(sx - 5, f - 50 - bob); ctx.quadraticCurveTo(sx - 15, f - 52 + wv - bob, sx - 24, f - 47 - wv - bob); ctx.stroke();
    // 头
    if (o.rim) { ctx.shadowColor = o.rim; ctx.shadowBlur = 12; }
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(sx + 2, f - 61 - bob, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- 合成
  function drawWorld(world, e, active) {
    const G = e.G;
    ctx.save();
    if (world === 'real') {
      ctx.beginPath(); ctx.rect(0, 360, W, 360); ctx.clip();
    } else {
      ctx.beginPath(); ctx.rect(0, 0, W, 360); ctx.clip();
      ctx.translate(0, 720); ctx.scale(1, -1);
    }
    if (world === 'real') drawRealBG(e); else drawDreamBG(e);
    // 非当前世界：只保留与判断有关的道路和机关清晰可见
    if (!active) {
      const p = world === 'real' ? e.real : e.dream;
      ctx.fillStyle = rgb(p.haze, 0.5); ctx.fillRect(0, 360, W, 360);
    }
    ctx.globalAlpha = active ? 1 : 0.82;
    drawGround(world, e);
    drawDeck(world, e);
    drawCheckpoints(world, e);
    drawBridges(world, e);
    drawPlates(world, e);
    drawObstacles(world, e);
    ctx.globalAlpha = 1;

    // 角色 / 另一侧目的地预览
    const sx = C.PLAYER_SX;
    const dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    const still = G.state !== 'walking' || G.speedNow < 1;
    if (G.showPlayer) {
      if (active) {
        drawTraveler(sx, G.phase, { rim: dream ? 'rgba(183,230,213,0.9)' : null, ink: dream ? '#1E2240' : rgb(p.ink), still, alpha: G.playerAlpha });
      } else {
        // 目的地预览：半透明身影 + 形状区分的安全/危险标记
        drawTraveler(sx, G.phase, { alpha: 0.26, ink: dream ? '#C9D3F5' : rgb(p.ink), still });
        if (G.state === 'walking' || G.state === 'ready') {
          const hz = G.hazardAt(world, G.px);
          const my = FOOT + 20;
          if (hz) {
            ctx.strokeStyle = '#1B1A2A'; ctx.lineWidth = 6; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(sx - 7, my - 7); ctx.lineTo(sx + 7, my + 7); ctx.moveTo(sx + 7, my - 7); ctx.lineTo(sx - 7, my + 7); ctx.stroke();
            ctx.strokeStyle = '#F08C6E'; ctx.lineWidth = 3;
            ctx.stroke();
          } else {
            ctx.strokeStyle = '#1B1A2A'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(sx, my, 7, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = dream ? rgb(p.accent) : '#FFF6DA'; ctx.lineWidth = 2.5; ctx.stroke();
          }
        }
      }
      // 切换残影
      if (G.afterimage && G.afterimage.world === world && G.afterimage.t > 0) {
        drawTraveler(sx, G.phase, { alpha: 0.45 * (G.afterimage.t / 0.3), ink: dream ? '#B7E6D5' : '#E5BE68', still: true });
      }
    }
    ctx.restore();
  }

  function drawWaterLine(e) {
    const g = ctx.createLinearGradient(0, 352, 0, 368);
    g.addColorStop(0, rgb(e.dream.skyTop, 0)); g.addColorStop(0.5, 'rgba(255,250,235,0.55)'); g.addColorStop(1, rgb(e.real.skyTop, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 352, W, 16);
    ctx.fillStyle = 'rgba(255,250,235,0.6)';
    for (let k = 0; k < 22; k++) {
      const x = U.mod(U.hash(k, 111) * 1500 - e.camX * 0.9 + (e.reduce ? 0 : Math.sin(e.t * 0.7 + k) * 8), 1500) - 110;
      ctx.fillRect(x, 359.5, 14 + U.hash(k, 112) * 30, 1.2);
    }
  }

  // 机关因果提示线：踩下石板时短暂连到对应的桥
  function drawLinks(e) {
    const G = e.G;
    for (const ln of G.links) {
      const a = U.clamp(ln.t / 1.2, 0, 1);
      const pl = ln.plate, b = ln.bridge;
      const x0 = pl.x - e.camX, y0 = pl.world === 'real' ? FOOT - 22 : 720 - (FOOT - 22);
      const x1 = (b.x0 + b.x1) / 2 - e.camX, y1 = b.world === 'real' ? FOOT - 10 : 720 - (FOOT - 10);
      ctx.save();
      ctx.setLineDash([3, 7]); ctx.lineWidth = 2.5;
      ctx.strokeStyle = `rgba(255,236,180,${0.85 * a})`;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + 60, 360, x1, y1); ctx.stroke();
      ctx.restore();
    }
  }

  RF.Render = {
    init(c) { ctx = c; },
    draw(G) {
      const e = makeEnv(G);
      ctx.clearRect(0, 0, W, C.H);
      const dreamActive = G.world === 'dream';
      drawWorld('real', e, !dreamActive);
      drawWorld('dream', e, dreamActive);
      drawWaterLine(e);
      drawLinks(e);
      // 切换的柔和色调过渡（不闪烁全屏）
      if (G.switchFx > 0) {
        const a = G.switchFx / 0.35;
        ctx.fillStyle = dreamActive ? `rgba(183,230,213,${0.16 * a})` : `rgba(240,213,142,${0.16 * a})`;
        if (dreamActive) ctx.fillRect(0, 0, W, 360); else ctx.fillRect(0, 360, W, 360);
      }
      // 失误淡出 / 恢复淡入
      if (G.fade > 0) { ctx.fillStyle = `rgba(22,22,40,${G.fade * 0.82})`; ctx.fillRect(0, 0, W, C.H); }
      if (G.debug) {
        ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
        ctx.fillText(`x=${G.px.toFixed(0)} world=${G.world} state=${G.state} cp=${G.cpIndex}`, 12, 700);
      }
    }
  };
})();
