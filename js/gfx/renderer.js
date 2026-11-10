// 画面合成：两个世界的远景 → 湖面倒影 → 非当前世界淡化 → 近景与角色 → 泛光 → 暗角。
(function () {
  const C = RF.CFG, LV = RF.LEVEL, U = RF.U, X = RF.FX;
  const W = C.W, H = C.H, FOOT = C.REAL_FOOT, SX = C.PLAYER_SX;
  const rgb = U.rgb;

  // 景色权重：跟随旅行进度，边界处约 2 秒柔和过渡；同一地点永远一致
  function sceneWeights(px) {
    const s = LV.scenes, w = new Array(s.length).fill(0);
    let i = 0;
    for (let k = 0; k < s.length; k++) if (px >= s[k].x) i = k;
    const t = i === 0 ? 1 : U.smooth(U.clamp((px - s[i].x) / 200, 0, 1));
    w[i] = t; if (i > 0) w[i - 1] += 1 - t;
    return w;
  }

  function makeEnv(G, camPx) {
    const px = camPx, f = U.clamp(px / LV.endX, 0, 1);
    const ws = sceneWeights(px);
    const moodW = { A: 0, B: 0, C: 0 };
    LV.scenes.forEach((s, k) => moodW[s.mood] += ws[k]);
    const v06 = LV.scenes[5].x;
    const a = U.smooth(U.clamp((px - v06) / (LV.endX - v06), 0, 1));
    const align = U.clamp(a * 0.85 + G.alignExtra * 0.15, 0, 1);
    return {
      G, px, camX: px - SX, t: G.animT, reduce: G.reduceMotion, lowFx: !!G.lowFx,
      real: RF.Palette.real(f), dream: RF.Palette.dream(moodW),
      night: U.clamp((f - 0.55) / 0.25, 0, 1),
      w: {
        fire: ws[0] + ws[1] * 0.6,
        glow: ws[1] + ws[2] * 0.4 + ws[3] * 0.4 + ws[4] * 0.6 + ws[5] * 0.7,
        float: ws[2] + ws[3] + ws[4] * 0.3,
        cloud: ws[2] + ws[3] * 0.4,
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

  // 湖面：底色 + 倒影 + 波光
  function water(e, world) {
    const ctx = X.ctx, dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    X.screenTransform();
    const y0 = dream ? 0 : 540, y1 = dream ? 180 : 720;
    const g = ctx.createLinearGradient(0, dream ? 180 : 540, 0, dream ? 0 : 720);
    g.addColorStop(0, rgb(p.water)); g.addColorStop(1, rgb(p.waterDeep));
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, 180);
    if (dream) X.reflect(180, 180, 180, 0.5); else X.reflect(360, 180, 540, 0.55);
    // 越远越暗的水色
    const g2 = ctx.createLinearGradient(0, dream ? 180 : 540, 0, dream ? 0 : 720);
    g2.addColorStop(0, rgb(p.water, 0.15)); g2.addColorStop(1, rgb(p.waterDeep, 0.85));
    ctx.fillStyle = g2; ctx.fillRect(0, y0, W, 180);
    // 波光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hi = dream ? p.glow : p.rim;
    for (let k = 0; k < 34; k++) {
      const d = U.hash(k, 91);                         // 0 近 → 1 远
      const yy = dream ? 172 - d * 160 : 548 + d * 160;
      const x = U.mod(U.hash(k, 92) * 1500 - e.camX * (0.9 - d * 0.4) + (e.reduce ? 0 : Math.sin(e.t * 0.6 + k) * 10), 1500) - 110;
      const len = 14 + U.hash(k, 94) * 36;
      ctx.fillStyle = rgb(hi, 0.18 * (1 - d * 0.6));
      ctx.fillRect(x, yy, len, 1.2);
    }
    // 日 / 月 / 光轮在水中的光路
    const src = dream ? (e.w.wheel > 0.05 ? [e.wheelX, e.w.wheel, p.gold] : null)
      : (e.night < 0.5 ? [990, 1 - e.night * 2, p.sunGlow] : [e.moonX, e.night, p.sun]);
    if (src) {
      for (let k = 0; k < 16; k++) {
        const d = k / 16;
        const yy = dream ? 176 - d * 150 : 546 + d * 150;
        const wob = e.reduce ? 0 : Math.sin(e.t * 1.7 + k * 1.3) * 6;
        const ww = 8 + d * 34 + U.hash(k, 99) * 10;
        ctx.fillStyle = rgb(src[2], 0.32 * src[1] * (1 - d * 0.5));
        ctx.fillRect(src[0] - ww / 2 + wob, yy, ww, 1.6);
      }
    }
    ctx.restore();
  }

  // 非当前世界：降低饱和度并蒙一层薄雾，只让道路和机关清楚
  function dim(world, e) {
    const ctx = X.ctx, dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    X.screenTransform();
    const y = dream ? 0 : 360;
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(128,128,128,0.6)';
    ctx.fillRect(0, y, W, 360);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgb(dream ? p.sky1 : p.fog, dream ? 0.35 : 0.32);
    ctx.fillRect(0, y, W, 360);
    ctx.restore();
  }

  function clipHalf() {
    const ctx = X.ctx;
    ctx.beginPath(); ctx.rect(-10, 360, W + 20, 362); ctx.clip();
  }

  function travelerStyle(world, e) {
    if (world === 'dream') {
      const p = e.dream;
      return { ink: p.ink, rim: p.rim, scarf: p.glow, face: [235, 255, 250], glow: 1 };
    }
    const p = e.real;
    return { ink: p.ink, rim: p.rim, scarf: [244, 198, 118], face: [255, 236, 210], glow: 0.55 + 0.45 * e.night };
  }

  function drawActors(world, e, active) {
    const G = e.G, ctx = X.ctx, dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    const still = G.state !== 'walking' || G.speedNow < 1;
    const st = travelerStyle(world, e);
    if (active) {
      RF.Traveler.draw(SX, Object.assign({}, st, { phase: G.phase, still, alpha: G.playerAlpha, t: e.t }));
    } else if (G.state !== 'title') {
      // 目的地预览：半透明身影 + 形状区分的安全 / 危险记号
      RF.Traveler.draw(SX, Object.assign({}, st, { phase: G.phase, still, alpha: 0.28, t: e.t, ghost: true, rim: null }));
      if (G.state === 'walking' || G.state === 'ready') {
        const hz = G.hazardAt(world, G.px);
        const my = FOOT + 16;
        ctx.lineCap = 'round';
        if (hz) {
          ctx.strokeStyle = 'rgba(20,16,36,0.85)'; ctx.lineWidth = 5.5;
          ctx.beginPath(); ctx.moveTo(SX - 6, my - 6); ctx.lineTo(SX + 6, my + 6); ctx.moveTo(SX + 6, my - 6); ctx.lineTo(SX - 6, my + 6); ctx.stroke();
          ctx.strokeStyle = '#FF9C86'; ctx.lineWidth = 2.6; ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(20,16,36,0.6)'; ctx.lineWidth = 4.5;
          ctx.beginPath(); ctx.arc(SX, my, 6.5, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = rgb(dream ? p.glow : [255, 248, 230]); ctx.lineWidth = 2; ctx.stroke();
          X.glow(SX, my, 20, dream ? p.glow : p.rim, 0.5);
        }
      }
    }
    // 切换残影：留在原来世界，慢慢化作光
    if (G.afterimage && G.afterimage.world === world && G.afterimage.t > 0) {
      const k = G.afterimage.t / 0.45;
      RF.Traveler.draw(SX, Object.assign({}, st, { phase: G.phase, still: true, alpha: 0.5 * k, t: e.t, ink: dream ? p.glow : p.rim, rim: null }));
      X.glow(SX, FOOT - 30, 70, dream ? p.glow : p.rim, 0.5 * k);
    }
  }

  function drawWorld(world, e) {
    const ctx = X.ctx, dream = world === 'dream';
    const p = dream ? e.dream : e.real;
    const active = e.G.world === world;
    X.worldTransform(world);
    ctx.save(); clipHalf();
    ctx.globalAlpha = active ? 1 : 0.88;
    RF.Props.drawAll(world, e, p);
    ctx.globalAlpha = 1;
    if (e.G.showPlayer !== false) drawActors(world, e, active);
    ctx.restore();
  }

  function seam(e) {
    const ctx = X.ctx;
    X.screenTransform();
    const g = ctx.createLinearGradient(0, 350, 0, 370);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,240,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 350, W, 20);
    // 光层上的一道长长的柔光
    const gg = X.g;
    gg.setTransform(0.25, 0, 0, 0.25, 0, 0);
    const lg = gg.createLinearGradient(0, 340, 0, 380);
    lg.addColorStop(0, 'rgba(255,240,220,0)'); lg.addColorStop(0.5, 'rgba(255,240,220,0.16)'); lg.addColorStop(1, 'rgba(255,240,220,0)');
    gg.fillStyle = lg; gg.fillRect(0, 340, W, 40);
  }

  function links(e) {
    const ctx = X.ctx, G = e.G;
    X.screenTransform();
    for (const ln of G.links) {
      const a = U.clamp(ln.t / 1.4, 0, 1);
      const pl = ln.plate, b = ln.bridge;
      const x0 = pl.x - e.camX, y0 = pl.world === 'real' ? FOOT - 26 : 720 - (FOOT - 26);
      const x1 = (b.x0 + b.x1) / 2 - e.camX, y1 = b.world === 'real' ? FOOT - 8 : 720 - (FOOT - 8);
      const cx = (x0 + x1) / 2 + 80, cy = 360;
      ctx.save();
      ctx.setLineDash([2, 8]); ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
      ctx.lineDashOffset = -e.t * 40;
      ctx.strokeStyle = `rgba(255,240,200,${0.9 * a})`;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
      ctx.restore();
      // 沿线移动的光点
      const k = 1 - a;
      const qx = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * cx + k * k * x1;
      const qy = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * cy + k * k * y1;
      X.g.setTransform(0.25, 0, 0, 0.25, 0, 0);
      X.glow(qx, qy, 40, [255, 236, 190], 0.9 * Math.min(1, a * 2));
    }
  }

  function switchWave(e) {
    const G = e.G, ctx = X.ctx;
    if (G.switchFx <= 0) return;
    const k = 1 - G.switchFx / 0.6;              // 0 → 1
    const dream = G.world === 'dream';
    const p = dream ? e.dream : e.real;
    const col = dream ? p.glow : p.rim;
    X.screenTransform();
    const cy = dream ? 720 - (FOOT - 30) : FOOT - 30;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, dream ? 0 : 360, W, 360); ctx.clip();
    ctx.strokeStyle = rgb(col, 0.55 * (1 - k)); ctx.lineWidth = 2 + 6 * (1 - k);
    ctx.beginPath(); ctx.arc(SX, cy, 20 + 260 * U.ease(k), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgb(col, 0.1 * (1 - k));
    ctx.fillRect(0, dream ? 0 : 360, W, 360);
    ctx.restore();
    X.g.setTransform(0.25, 0, 0, 0.25, 0, 0);
    X.glow(SX, cy, 120, col, 0.6 * (1 - k));
  }

  function vignette() {
    const ctx = X.ctx;
    X.screenTransform();
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(10,8,24,0)'); g.addColorStop(1, 'rgba(10,8,24,0.32)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  RF.Renderer = {
    draw(G, opts) {
      opts = opts || {};
      const camPx = opts.camPx !== undefined ? opts.camPx : G.px;
      const e = makeEnv(G, camPx);
      const ctx = X.ctx;
      X.screenTransform();
      ctx.clearRect(0, 0, W, H);
      X.beginGlow();

      // 1) 远景
      X.worldTransform('real');
      ctx.save(); ctx.beginPath(); ctx.rect(0, 360, W, 180); ctx.clip();
      RF.Scenery.realBackdrop(e);
      ctx.restore();
      X.worldTransform('dream');
      ctx.save(); ctx.beginPath(); ctx.rect(0, 360, W, 180); ctx.clip();
      RF.Scenery.dreamBackdrop(e);
      ctx.restore();

      // 2) 湖面倒影
      water(e, 'real');
      water(e, 'dream');

      // 3) 非当前世界淡化
      if (G.state !== 'title') dim(G.world === 'real' ? 'dream' : 'real', e);

      // 4) 近景与角色
      drawWorld('real', e);
      drawWorld('dream', e);

      // 5) 分界、因果连线、切换波纹
      seam(e);
      links(e);
      switchWave(e);

      // 6) 泛光、暗角、淡出
      X.lowFx = e.lowFx;
      X.composeGlow(e.reduce ? 0.7 : 0.8);
      vignette();
      if (G.fade > 0) { ctx.fillStyle = `rgba(14,12,30,${G.fade * 0.82})`; ctx.fillRect(0, 0, W, H); }
      if (G.debug) {
        ctx.fillStyle = '#fff'; ctx.font = '14px ui-monospace, monospace';
        ctx.fillText(`x=${G.px.toFixed(0)} world=${G.world} state=${G.state} cp=${G.cpIndex}`, 12, 700);
      }
    }
  };
})();
