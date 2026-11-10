// 远景：天空、日月、山的空气透视、云海、树、粒子、鱼群、星河、光轮。
// 所有函数都在“现实坐标”下作画：地面在 y=540，天空向上到 y=360。
// 梦境调用同一批函数，只是坐标系被镜像。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX;
  const W = C.W, FOOT = C.REAL_FOOT;
  const rgb = U.rgb;

  function sky(p) {
    const ctx = X.ctx;
    const g = ctx.createLinearGradient(0, 360, 0, 560);
    g.addColorStop(0, rgb(p.sky0)); g.addColorStop(1, rgb(p.sky1));
    ctx.fillStyle = g; ctx.fillRect(0, 358, W, 364);
  }

  // 山脊：越远越淡，底部融进雾色
  function ridge(off, base, amp, seed, col, fog, sharp) {
    const ctx = X.ctx;
    const top = base - amp * 1.6;
    const g = ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, rgb(col)); g.addColorStop(1, rgb(fog));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, base + 4);
    for (let sx = -8; sx <= W + 16; sx += 12) {
      const x = sx + off;
      let h = 0.62 + 0.3 * Math.sin(x * 0.0037 + seed) + 0.16 * Math.sin(x * 0.0091 + seed * 2.1);
      if (sharp) h += 0.32 * (1 - Math.abs(Math.sin(x * 0.006 + seed * 1.3)));
      else h += 0.08 * Math.sin(x * 0.027 + seed);
      ctx.lineTo(sx, base - amp * h);
    }
    ctx.lineTo(W, base + 4); ctx.closePath(); ctx.fill();
  }

  // 一朵柔软的云：上亮下暗
  function cloud(x, y, s, p, a) {
    const ctx = X.ctx;
    const g = ctx.createLinearGradient(0, y - 30 * s, 0, y + 14 * s);
    g.addColorStop(0, rgb(p.cloudHi, a)); g.addColorStop(0.55, rgb(p.cloud, a)); g.addColorStop(1, rgb(p.cloudShade, a * 0.9));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 62 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.moveTo(x - 10 * s, y);
    ctx.arc(x - 24 * s, y - 8 * s, 20 * s, 0, Math.PI * 2);
    ctx.moveTo(x + 30 * s, y);
    ctx.arc(x + 8 * s, y - 16 * s, 26 * s, 0, Math.PI * 2);
    ctx.moveTo(x + 50 * s, y);
    ctx.arc(x + 34 * s, y - 6 * s, 18 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // 圆润的树：受光一侧更亮
  function trees(off, p, seed, sp, dens, sunX, opts) {
    const ctx = X.ctx;
    opts = opts || {};
    const i0 = Math.floor(off / sp) - 2, i1 = Math.ceil((off + W) / sp) + 1;
    for (let i = i0; i <= i1; i++) {
      if (U.hash(i, seed) > dens) continue;
      const x = i * sp + U.hash(i, seed + 1) * sp * 0.6 - off;
      const h = 44 + U.hash(i, seed + 2) * 52;
      const r = h * 0.27;
      const cy = FOOT - 8 - h * 0.62;
      const lean = (sunX - x) > 0 ? 1 : -1;
      // 树干
      ctx.strokeStyle = rgb(p.treeShade); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, FOOT - 6); ctx.quadraticCurveTo(x - 2, FOOT - h * 0.35, x, cy + r * 0.5); ctx.stroke();
      // 树冠
      const g = ctx.createRadialGradient(x + lean * r * 0.5, cy - r * 0.6, r * 0.2, x, cy, r * 1.5);
      g.addColorStop(0, rgb(p.treeHi)); g.addColorStop(0.45, rgb(p.tree)); g.addColorStop(1, rgb(p.treeShade));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, cy, r * 1.05, r * 1.25, 0, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.4, cy + r * 0.6);
      ctx.ellipse(x - r * 0.75, cy + r * 0.45, r * 0.7, r * 0.75, 0, 0, Math.PI * 2);
      ctx.moveTo(x + r * 1.4, cy + r * 0.5);
      ctx.ellipse(x + r * 0.75, cy + r * 0.5, r * 0.68, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (opts.glow > 0.01) {
        const pulse = 0.6 + 0.4 * Math.sin(opts.t * 1.2 + i * 1.9);
        X.glow(x, cy, r * 2.6, p.treeHi, 0.32 * opts.glow * pulse);
        for (let k = 0; k < 3; k++) {
          const lx = x + (U.hash(i * 7 + k, 5) - 0.5) * r * 1.6, ly = cy + (U.hash(i * 7 + k, 6) - 0.4) * r * 1.6;
          ctx.fillStyle = rgb(p.treeHi, 0.85 * opts.glow);
          ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, Math.PI * 2); ctx.fill();
          X.glow(lx, ly, 10, p.treeHi, 0.5 * opts.glow * pulse);
        }
      }
    }
  }

  // 远处的石拱遗迹（极少量，增加旅途感）
  function arches(off, col, seed) {
    const ctx = X.ctx;
    const sp = 900;
    for (let i = Math.floor(off / sp) - 1; i <= Math.ceil((off + W) / sp); i++) {
      if (U.hash(i, seed) > 0.55) continue;
      const x = i * sp + U.hash(i, seed + 1) * 400 - off;
      const s = 0.8 + U.hash(i, seed + 2) * 0.5;
      const top = FOOT - 30 - 64 * s;
      ctx.fillStyle = rgb(col);
      ctx.beginPath();
      ctx.moveTo(x - 30 * s, FOOT - 20);
      ctx.lineTo(x - 30 * s, top + 22 * s);
      ctx.quadraticCurveTo(x, top - 8 * s, x + 30 * s, top + 22 * s);
      ctx.lineTo(x + 30 * s, FOOT - 20);
      ctx.lineTo(x + 18 * s, FOOT - 20);
      ctx.lineTo(x + 18 * s, top + 30 * s);
      ctx.quadraticCurveTo(x, top + 12 * s, x - 18 * s, top + 30 * s);
      ctx.lineTo(x - 18 * s, FOOT - 20);
      ctx.closePath(); ctx.fill();
    }
  }

  // 近处的草坡
  function meadow(off, p, t, reduce) {
    const ctx = X.ctx;
    ctx.fillStyle = rgb(p.meadow);
    ctx.beginPath(); ctx.moveTo(0, FOOT + 4);
    for (let sx = -8; sx <= W + 16; sx += 16) {
      const x = sx + off;
      ctx.lineTo(sx, FOOT - 12 - 9 * Math.sin(x * 0.006) - 5 * Math.sin(x * 0.017 + 1));
    }
    ctx.lineTo(W, FOOT + 4); ctx.closePath(); ctx.fill();
    // 逆光的草尖
    ctx.strokeStyle = rgb(p.meadowHi, 0.75); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    const sp = 9;
    for (let i = Math.floor(off / sp); i <= Math.ceil((off + W) / sp); i++) {
      if (U.hash(i, 3) > 0.55) continue;
      const sx = i * sp - off;
      const base = FOOT - 12 - 9 * Math.sin((sx + off) * 0.006) - 5 * Math.sin((sx + off) * 0.017 + 1);
      const h = 5 + U.hash(i, 4) * 9;
      const sway = reduce ? 0 : Math.sin(t * 1.5 + i * 0.4) * 2;
      ctx.beginPath(); ctx.moveTo(sx, base + 2); ctx.quadraticCurveTo(sx + sway * 0.5, base - h * 0.5, sx + sway, base - h); ctx.stroke();
    }
  }

  // 漂浮的光尘
  function motes(off, p, t, count, y0, y1, seed, a, reduce) {
    const ctx = X.ctx;
    for (let i = 0; i < count; i++) {
      const drift = reduce ? 0 : t * (6 + U.hash(i, seed + 3) * 10);
      const x = U.mod(U.hash(i, seed) * 1600 - off - drift, 1600) - 160;
      const y = y0 + U.hash(i, seed + 1) * (y1 - y0) + (reduce ? 0 : Math.sin(t * 0.7 + i) * 8);
      const tw = reduce ? 0.7 : 0.35 + 0.65 * Math.max(0, Math.sin(t * (0.8 + U.hash(i, seed + 2)) + i * 2.3));
      const s = 0.8 + U.hash(i, seed + 4) * 1.4;
      ctx.fillStyle = rgb(p.mote, a * tw);
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      X.glow(x, y, 6 + s * 3, p.mote, a * tw * 0.35);
    }
  }

  function stars(off, col, t, n, a, reduce, seed) {
    const ctx = X.ctx;
    for (let i = 0; i < n; i++) {
      const x = U.mod(U.hash(i, seed) * 1500 - off, 1500) - 110;
      const y = 364 + U.hash(i, seed + 1) * 150;
      const tw = reduce ? 0.75 : 0.4 + 0.6 * Math.max(0, Math.sin(t * (0.5 + U.hash(i, seed + 2) * 0.9) + i * 2.1));
      const big = U.hash(i, seed + 3) < 0.12;
      ctx.fillStyle = rgb(col, a * tw);
      ctx.beginPath(); ctx.arc(x, y, big ? 1.4 : 0.8, 0, Math.PI * 2); ctx.fill();
      if (big) X.glow(x, y, 10, col, a * tw * 0.6);
    }
  }

  // ---------------------------------------------------------------- 现实世界
  function realBackdrop(e) {
    const p = e.real, ctx = X.ctx, t = e.t;
    sky(p);
    if (e.night > 0.05) stars(e.camX * 0.03, p.sun, t, 40, e.night * 0.8, e.reduce, 41);

    // 太阳：低垂的金色，带丁达尔光束
    const sunA = 1 - e.night;
    const sx = 990, sy = 452 + 110 * U.smooth(U.clamp((e.px / RF.LEVEL.endX - 0.3) / 0.32, 0, 1));
    if (sunA > 0.02) {
      X.glow(sx, sy, 240, p.sunGlow, 0.3 * sunA);
      X.glow(sx, sy, 60, p.sun, 0.55 * sunA);
      ctx.fillStyle = rgb(p.sun, sunA);
      ctx.beginPath(); ctx.arc(sx, sy, 20, 0, Math.PI * 2); ctx.fill();
    }
    // 月亮
    if (e.night > 0.02) {
      const mx = e.moonX, my = 420;
      X.glow(mx, my, 120 + 60 * e.align, p.sunGlow, 0.45 * e.night);
      X.glow(mx, my, 34, p.sun, 0.8 * e.night);
      ctx.fillStyle = rgb(p.sun, e.night);
      ctx.beginPath(); ctx.arc(mx, my, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(p.sky0, 0.18 * e.night);
      ctx.beginPath(); ctx.arc(mx - 4, my - 3, 3.5, 0, Math.PI * 2); ctx.arc(mx + 5, my + 5, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // 远山的空气透视
    ridge(e.camX * 0.06, FOOT - 10, 74, 0.5, p.far, p.fog, true);
    // 地平线的云海
    for (let i = 0; i < 9; i++) {
      const x = U.mod(U.hash(i, 13) * 1700 - e.camX * 0.1 - (e.reduce ? 0 : t * 3), 1700) - 200;
      cloud(x, FOOT - 34 + U.hash(i, 14) * 10, 0.9 + U.hash(i, 15) * 0.7,
        { cloudHi: U.mix(p.fog, [255, 255, 255], 0.5), cloud: p.fog, cloudShade: U.mix(p.fog, p.mid, 0.5) }, 0.85);
    }
    ridge(e.camX * 0.16, FOOT - 6, 44, 2.4, p.mid, p.fog, false);
    arches(e.camX * 0.2, U.mix(p.mid, p.near, 0.6), 7);
    ridge(e.camX * 0.3, FOOT - 4, 26, 4.1, p.near, U.mix(p.near, p.fog, 0.4), false);
    trees(e.camX * 0.55, p, 11, 150, 0.55, sx, {});
    meadow(e.camX * 0.8, p, t, e.reduce);

    // 丁达尔光束（白天到黄昏）
    if (sunA > 0.05 && !e.lowFx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 6; k++) {
        const ang = Math.PI * (0.62 + k * 0.07) + (e.reduce ? 0 : Math.sin(t * 0.15 + k) * 0.015);
        const len = 700, w0 = 6, w1 = 46 + k * 10;
        const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len * 0.35;
        const g = ctx.createLinearGradient(sx, sy, ex, ey);
        g.addColorStop(0, rgb(p.sunGlow, 0.16 * sunA)); g.addColorStop(1, rgb(p.sunGlow, 0));
        ctx.fillStyle = g;
        const nx = -Math.sin(ang), ny = Math.cos(ang) * 0.35;
        ctx.beginPath();
        ctx.moveTo(sx + nx * w0, sy + ny * w0); ctx.lineTo(ex + nx * w1, ey + ny * w1);
        ctx.lineTo(ex - nx * w1, ey - ny * w1); ctx.lineTo(sx - nx * w0, sy - ny * w0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    motes(e.camX * 0.7, p, t, 16, 380, 528, 21, 0.45, e.reduce);
  }

  // ---------------------------------------------------------------- 梦境
  function dreamBackdrop(e) {
    const p = e.dream, ctx = X.ctx, t = e.t, w = e.w;
    sky(p);
    stars(e.camX * 0.04, p.gold, t, 50 + Math.round(70 * w.river), 0.75, e.reduce, 7);

    // 星河（V05–V06）
    if (w.river > 0.01) {
      const band = ctx.createLinearGradient(0, 392, 0, 452);
      band.addColorStop(0, rgb(p.glow, 0)); band.addColorStop(0.5, rgb(p.glow, 0.16 * w.river)); band.addColorStop(1, rgb(p.glow, 0));
      ctx.fillStyle = band; ctx.fillRect(0, 392, W, 60);
      for (let i = 0; i < 180; i++) {
        const x = U.mod(U.hash(i, 31) * 1600 - e.camX * 0.06, 1600) - 160;
        const y = 422 + 16 * Math.sin(x * 0.004 + 1.2) + (U.hash(i, 32) - 0.5) * 36;
        const tw = e.reduce ? 0.8 : 0.4 + 0.6 * Math.max(0, Math.sin(t * 1.2 + i * 1.7));
        ctx.fillStyle = rgb(i % 3 ? p.gold : p.glow, w.river * 0.85 * tw);
        ctx.fillRect(x, y, 1.6, 1.6);
        if (i % 9 === 0) X.glow(x, y, 12, p.gold, w.river * 0.5 * tw);
      }
      X.glow(640, 422, 520, p.glow, 0.12 * w.river);
    }

    // 光轮（V05–V06）
    if (w.wheel > 0.01) {
      const x = e.wheelX, y = 420, a = w.wheel;
      X.glow(x, y, 150 + 80 * e.align, p.gold, 0.4 * a);
      X.glow(x, y, 40, p.gold, 0.7 * a);
      ctx.save();
      ctx.strokeStyle = rgb(p.gold, 0.95 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = rgb(p.gold, 0.6 * a);
      ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2); ctx.stroke();
      const rot = e.reduce ? 0 : t * 0.12;
      for (let k = 0; k < 16; k++) {
        const an = rot + k * Math.PI / 8;
        const r1 = 31, r2 = k % 2 ? 38 : 48;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1);
        ctx.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 倒置的远山
    ridge(e.camX * 0.06, FOOT - 6, 70, 3.1, p.far, p.sky1, true);

    // 云海
    for (let i = 0; i < 10; i++) {
      const x = U.mod(U.hash(i, 61) * 1800 - e.camX * 0.12 - (e.reduce ? 0 : t * 5), 1800) - 200;
      cloud(x, FOOT - 26 + U.hash(i, 62) * 12, 1 + U.hash(i, 63) * 0.8, p, 0.9);
    }
    // 云层穿过树间（V03）
    if (w.cloud > 0.01) {
      for (let i = 0; i < 7; i++) {
        const x = U.mod(U.hash(i, 64) * 1900 - e.camX * 0.35 - (e.reduce ? 0 : t * 10), 1900) - 260;
        cloud(x, 452 + U.hash(i, 65) * 40, 0.7 + U.hash(i, 66) * 0.5, p, 0.55 * w.cloud);
      }
    }

    // 漂浮的远山（V03–V04）
    if (w.float > 0.01) {
      const sp = 420, off = e.camX * 0.22;
      for (let i = Math.floor(off / sp) - 1; i <= Math.ceil((off + W) / sp) + 1; i++) {
        const x = i * sp + U.hash(i, 51) * 180 - off;
        const bob = e.reduce ? 0 : Math.sin(t * 0.45 + i * 1.3) * 6;
        const y0 = 428 + U.hash(i, 52) * 46 + bob + (1 - w.float) * 50;
        const s = 0.7 + U.hash(i, 53) * 0.7;
        const a = w.float;
        const g = ctx.createLinearGradient(0, y0 - 30 * s, 0, y0 + 50 * s);
        g.addColorStop(0, rgb(p.cloudHi, a)); g.addColorStop(0.3, rgb(p.far, a)); g.addColorStop(1, rgb(p.cloudShade, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 50 * s, y0);
        ctx.quadraticCurveTo(x - 22 * s, y0 - 34 * s, x + 2 * s, y0 - 28 * s);
        ctx.quadraticCurveTo(x + 28 * s, y0 - 42 * s, x + 52 * s, y0);
        ctx.quadraticCurveTo(x + 20 * s, y0 + 20 * s, x + 4 * s, y0 + 56 * s);
        ctx.quadraticCurveTo(x - 18 * s, y0 + 20 * s, x - 50 * s, y0);
        ctx.fill();
        // 岛上的小光点
        X.glow(x, y0 - 18 * s, 50 * s, p.glow, 0.25 * a);
        ctx.fillStyle = rgb(p.glow, a);
        ctx.beginPath(); ctx.arc(x + 8 * s, y0 - 30 * s, 2, 0, Math.PI * 2); ctx.fill();
        X.glow(x + 8 * s, y0 - 30 * s, 14, p.glow, 0.7 * a);
      }
    }

    // 倒悬的发光树
    trees(e.camX * 0.55, p, 23, 170, 0.55, 640, { glow: w.glow, t });

    // 萤火（V01–V02）
    if (w.fire > 0.01) motes(e.camX * 0.6, { mote: p.gold }, t, 30, 378, 528, 71, w.fire, e.reduce);
    motes(e.camX * 0.5, p, t, 14, 370, 528, 77, 0.4, e.reduce);

    // 发光鱼群（V04）
    if (w.fish > 0.01) fish(e, p);
  }

  function fish(e, p) {
    const ctx = X.ctx, t = e.t;
    const baseX = 1400 - e.fishSec * 118;
    for (let i = 0; i < 11; i++) {
      const ox = U.hash(i, 81) * 300 + i * 16;
      const oy = (U.hash(i, 82) - 0.5) * 80;
      const x = baseX + ox;
      const y = 448 + oy + (e.reduce ? 0 : Math.sin(t * 1.3 + i) * 6);
      if (x < -80 || x > W + 80) continue;
      const s = 0.8 + U.hash(i, 83) * 0.6;
      const a = e.w.fish;
      // 光尾
      const tail = ctx.createLinearGradient(x, y, x + 70 * s, y);
      tail.addColorStop(0, rgb(p.glow, 0.45 * a)); tail.addColorStop(1, rgb(p.glow, 0));
      ctx.fillStyle = tail;
      ctx.beginPath(); ctx.moveTo(x + 6, y - 2.5 * s); ctx.lineTo(x + 70 * s, y); ctx.lineTo(x + 6, y + 2.5 * s); ctx.fill();
      X.glow(x, y, 26 * s, p.glow, 0.5 * a);
      ctx.fillStyle = rgb(p.cloudHi, 0.95 * a);
      ctx.beginPath(); ctx.ellipse(x, y, 11 * s, 4.2 * s, 0, 0, Math.PI * 2); ctx.fill();
      const wag = e.reduce ? 0 : Math.sin(t * 6 + i) * 2.5;
      ctx.beginPath();
      ctx.moveTo(x + 9 * s, y);
      ctx.lineTo(x + 18 * s, y - 5 * s + wag);
      ctx.lineTo(x + 16 * s, y + wag * 0.3);
      ctx.lineTo(x + 18 * s, y + 5 * s + wag);
      ctx.closePath(); ctx.fill();
    }
  }

  RF.Scenery = { realBackdrop, dreamBackdrop };
})();
