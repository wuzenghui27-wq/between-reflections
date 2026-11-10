// 画面合成：整屏只画当前这一面（白天或夜晚）。
// 切换时从旅人身上扩散一圈光波，光波经过的地方换成另一面；前方用淡色轮廓预告另一面的路与障碍。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX, LV = RF.LEVEL, RG = RF.Regions;
  const W = C.W, H = C.H, SX = C.PLAYER_SX, rgb = U.rgb;
  const other = w => (w === 'day' ? 'night' : 'day');
  const on = (o, w) => o.w === 'both' || o.w === w;

  const e = {
    world: 'day', t: 0, cam: 0, a: 1, reduce: false, G: null,
    palOf(rid) { return RG.R[rid][e.world]; },
    flash(k) { return e.G.flashes[k]; },
    // 预告轮廓的透明度：前方 PREVIEW_AHEAD 以内清楚，再远渐隐；身后很快淡掉
    ghostA(x0, x1) {
      if (e.noGhost) return 0;
      const px = e.G.px, A = C.PREVIEW_AHEAD;
      if (x1 < px - 140) return 0;
      const d = x0 - px;
      const far = d < A * 0.75 ? 1 : U.clamp(1 - (d - A * 0.75) / (A * 0.4), 0, 1);
      const near = x1 < px ? U.clamp((x1 - (px - 140)) / 140, 0, 1) : 1;
      return 0.9 * far * near;
    }
  };

  // 当前镜头附近的区域及过渡权重
  function regionMix(centre) {
    for (let k = 1; k < LV.regions.length; k++) {
      const bx = LV.regions[k].x0;
      if (Math.abs(centre - bx) < 420) return [[k - 1, 1], [k, U.smooth((centre - bx + 420) / 840)]];
    }
    return [[LV.regionAt(centre), 1]];
  }

  function backdrop(c, mix) {
    for (const [ri, w] of mix) {
      if (w <= 0.01) continue;
      const R = RG.R[LV.regions[ri].id];
      e.a = w; c.globalAlpha = w; e.pal = R[e.world];
      R.back(c, e);
      const p = R[e.world];
      if (R.water) {
        const wy = R.water[e.world];
        const g = c.createLinearGradient(0, wy, 0, H);
        g.addColorStop(0, rgb(p.water, 0.9)); g.addColorStop(1, rgb(U.mix(p.water, p.deep, 0.7)));
        c.fillStyle = g; c.fillRect(0, wy, W, H - wy);
        c.globalAlpha = 1;
        if (w > 0.99) X.reflect(wy - 200, 200, wy, R.water.frozen === e.world ? 0.5 : 0.34);
        c.globalAlpha = w;
        // 波纹 / 冰面
        if (R.water.frozen === e.world) {
          c.fillStyle = 'rgba(220,235,255,0.22)'; c.fillRect(0, wy, W, 3);
        } else {
          c.strokeStyle = rgb(e.world === 'day' ? [255, 255, 255] : p.light, 0.25); c.lineWidth = 1;
          for (let k = 0; k < 14; k++) {
            const yy = wy + 6 + k * 9, xx = U.mod(U.hash(k, 3) * W - e.cam * (0.6 + k * 0.03) + (e.reduce ? 0 : e.t * 8), W + 200) - 100;
            c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + 30 + k * 4, yy); c.stroke();
          }
        }
      } else {
        const g = c.createLinearGradient(0, 590, 0, H);
        g.addColorStop(0, rgb(p.deep, 0.5)); g.addColorStop(1, rgb(U.mix(p.deep, [0, 0, 0], 0.35)));
        c.fillStyle = g; c.fillRect(0, 590, W, H - 590);
      }
    }
    c.globalAlpha = 1; e.a = 1;
  }

  function scene(c, G, world, cam, opt) {
    e.world = world; e.cam = cam;
    X.mute = !!opt.mute;
    X.screenTransform();
    const mix = regionMix(cam + W / 2);
    backdrop(c, mix);
    const x0 = cam - 100, x1 = cam + W + 100;
    for (const m of LV.mirages) if (m.x1 > x0 && m.x0 < x1) RF.Props.mirage(c, m, cam, e);
    // 另一面的预告轮廓（只画对方独有的东西）
    if (opt.preview) {
      const ow = other(world);
      for (const s of LV.solids) if (s.w === ow && s.x1 > x0 && s.x0 < x1) RF.Props.solid(c, s, cam, e, true);
      for (const h of LV.hazards) if (h.w === ow && h.x1 > x0 && h.x0 < x1) RF.Props.hazard(c, h, cam, e, G.gates, true);
      for (const b of LV.bells) if (b.w === ow && b.x > x0 && b.x < x1) RF.Props.bell(c, b, cam, e, G.gates, true);
      for (const l of LV.lanterns) if (l.w === ow && l.x > x0 && l.x < x1) RF.Props.lantern(c, l, cam, e, G.got, true);
    }
    for (const s of LV.solids) if (on(s, world) && s.x1 > x0 && s.x0 < x1) RF.Props.solid(c, s, cam, e, false);
    for (const h of LV.hazards) if (on(h, world) && h.x1 > x0 && h.x0 < x1) RF.Props.hazard(c, h, cam, e, G.gates, false);
    for (const b of LV.bells) if (on(b, world) && b.x > x0 && b.x < x1) RF.Props.bell(c, b, cam, e, G.gates, false);
    for (const l of LV.lanterns) if (on(l, world) && l.x > x0 && l.x < x1) RF.Props.lantern(c, l, cam, e, G.got, false);
    X.mute = false;
    return mix;
  }

  function player(c, G, cam) {
    const sx = G.px - cam, foot = G.foot;
    const R = RG.R[LV.regions[LV.regionAt(G.px)].id], p = R[G.world];
    e.world = G.world;
    RF.Traveler.draw(sx, foot, {
      phase: G.phase, still: G.state !== 'running' && G.state !== 'failing', air: !G.onGround && G.state === 'running',
      alpha: G.playerAlpha, ink: p.ink, rim: p.rim, scarf: p.scarf, face: p.face,
      glow: G.world === 'night' ? 1 : 0.5, t: G.animT
    });
    // 脚下记号：另一面此刻能不能站
    if ((G.state === 'running' || G.state === 'ready') && G.onGround) {
      const safe = G.otherSafe();
      const col = G.world === 'day' ? [36, 74, 190] : [255, 214, 140];
      c.strokeStyle = rgb(col, 0.85); c.lineWidth = 2;
      const my = foot + 14;
      c.beginPath();
      if (safe) c.arc(sx, my, 5, 0, 7);
      else { c.moveTo(sx - 4, my - 4); c.lineTo(sx + 4, my + 4); c.moveTo(sx + 4, my - 4); c.lineTo(sx - 4, my + 4); }
      c.stroke();
    }
  }

  function draw(G, opt) {
    const c = X.ctx;
    e.G = G; e.t = G.animT; e.reduce = G.reduceMotion; e.noGhost = !!opt.noGhost;
    X.lowFx = G.lowFx;
    const cam = opt.camPx - SX;
    X.beginGlow();
    const preview = !opt.noGhost;
    let mix;
    if (G.wipe) {
      const k = U.clamp(G.wipe.t / C.SWITCH_WIPE, 0, 1), r = U.ease(k) * 1500;
      const cx = (opt.title ? W / 2 : G.px - cam), cy = opt.title ? 420 : G.foot - 30;
      scene(c, G, G.wipe.from, cam, { mute: true, preview });
      c.save(); c.beginPath(); c.arc(cx, cy, Math.max(1, r), 0, 7); c.clip();
      mix = scene(c, G, G.world, cam, { preview });
      c.restore();
      X.screenTransform();
      const col = G.world === 'night' ? [190, 210, 255] : [255, 226, 170];
      c.strokeStyle = rgb(col, (1 - k) * (G.wipe.onBeat ? 0.95 : 0.6)); c.lineWidth = G.wipe.onBeat ? 6 : 3;
      c.beginPath(); c.arc(cx, cy, Math.max(1, r), 0, 7); c.stroke();
      X.glow(cx, cy, 120, col, (1 - k) * (G.wipe.onBeat ? 0.8 : 0.4));
    } else {
      mix = scene(c, G, G.world, cam, { preview });
    }
    X.screenTransform();
    if (!opt.title) player(c, G, cam);
    if (G.onBeatFx > 0 && !opt.title) X.glow(G.px - cam, G.foot - 30, 70, [255, 240, 200], G.onBeatFx * 0.5);

    // 泛光强度跟随区域与昼夜
    let gs = 0, ws = 0;
    for (const [ri, w] of mix) { gs += RG.R[LV.regions[ri].id][G.world].glow * w; ws += w; }
    X.composeGlow(ws ? gs / ws : 0.6);

    // 暗角
    X.screenTransform();
    const vg = c.createRadialGradient(W / 2, H * 0.5, H * 0.45, W / 2, H * 0.5, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, G.world === 'night' ? 'rgba(2,4,20,0.45)' : 'rgba(40,30,20,0.18)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    if (G.fade > 0) { c.fillStyle = `rgba(8,8,20,${(G.fade * 0.6).toFixed(3)})`; c.fillRect(0, 0, W, H); }
  }

  RF.Renderer = { draw };
})();
