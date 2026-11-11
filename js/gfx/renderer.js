// 画面合成（像素坐标，320×180）：背景图 → 天气远层 → 水面 / 深谷 → 预告轮廓 → 地面与物件 → 旅人 → 天气近层。
// 切换时从旅人身上扩散一圈光波，光波经过的地方换成另一面。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX, LV = RF.LEVEL, RG = RF.Regions;
  const P = C.PIX, PW = X.PW, PH = X.PH, SX = C.PLAYER_SX;
  const other = w => (w === 'day' ? 'night' : 'day');
  const on = (o, w) => o.w === 'both' || o.w === w;

  const e = {
    world: 'day', t: 0, camPix: 0, reduce: false, G: null, noGhost: false,
    flash(k) { return e.G.flashes[k]; },
    ghostA(x0, x1) {
      if (e.noGhost) return 0;
      const px = e.G.px, A = C.PREVIEW_AHEAD;
      if (x1 < px - 140) return 0;
      const d = x0 - px;
      const far = d < A * 0.75 ? 1 : U.clamp(1 - (d - A * 0.75) / (A * 0.4), 0, 1);
      const near = x1 < px ? U.clamp((x1 - (px - 140)) / 140, 0, 1) : 1;
      return 0.85 * far * near;
    }
  };

  function scene(G, world, cam, opt) {
    const c = X.ctx;
    e.world = world;
    X.mute = !!opt.mute;
    const centre = cam + C.W / 2;
    const m = RG.backdrop(c, G, world, centre);
    const wA = G.weather[m.a];
    RG.weatherBack(c, wA, world, e.t, e.camPix);
    RG.lowland(c, LV.regions[m.a].id, world, e.t, e.camPix, 1);
    if (m.b !== null && m.t > 0) RG.lowland(c, LV.regions[m.b].id, world, e.t, e.camPix, m.t);
    const x0 = cam - 120, x1 = cam + C.W + 120;
    for (const mr of LV.mirages) if (mr.x1 > x0 && mr.x0 < x1) RF.Props.mirage(mr, e);
    if (opt.preview) {
      const ow = other(world);
      for (const s of LV.solids) if (s.w === ow && s.x1 > x0 && s.x0 < x1) RF.Props.ghostSolid(s, e);
      for (const h of LV.hazards) if (h.w === ow && h.x1 > x0 && h.x0 < x1) RF.Props.hazard(h, e, G.gates, true);
      for (const b of LV.bells) if (b.w === ow && b.x > x0 && b.x < x1) RF.Props.bell(b, e, G.gates, true);
      for (const l of LV.lanterns) if (l.w === ow && l.x > x0 && l.x < x1) RF.Props.lantern(l, e, G.got, true);
    }
    for (const s of LV.solids) if (on(s, world) && s.x1 > x0 && s.x0 < x1) RF.Props.solid(s, e);
    for (const h of LV.hazards) if (on(h, world) && h.x1 > x0 && h.x0 < x1) RF.Props.hazard(h, e, G.gates, false);
    for (const b of LV.bells) if (on(b, world) && b.x > x0 && b.x < x1) RF.Props.bell(b, e, G.gates, false);
    for (const l of LV.lanterns) if (on(l, world) && l.x > x0 && l.x < x1) RF.Props.lantern(l, e, G.got, false);
    X.mute = false;
    return m;
  }

  function player(G, cam) {
    const ri = LV.regionAt(G.px);
    const st = G.state === 'running' ? (G.onGround ? 'run' : 'air') : (G.state === 'failing' && !G.onGround ? 'air' : 'idle');
    RF.Traveler.draw(G.px - cam, G.foot, {
      weather: G.weather[ri], region: ri, state: st, dist: G.px, alpha: G.playerAlpha, night: G.world === 'night'
    });
    // 脚下记号：另一面此刻能不能站
    if ((G.state === 'running' || G.state === 'ready') && G.onGround) {
      const x = Math.round((G.px - cam) / P), y = Math.round(G.foot / P) + 3;
      const col = G.world === 'day' ? '#2a4cc0' : '#ffd88a';
      X.ctx.fillStyle = col;
      if (G.otherSafe()) { X.ctx.fillRect(x - 1, y, 3, 1); X.ctx.fillRect(x - 2, y + 1, 1, 1); X.ctx.fillRect(x + 2, y + 1, 1, 1); X.ctx.fillRect(x - 1, y + 2, 3, 1); }
      else { for (let k = -1; k <= 1; k++) { X.ctx.fillRect(x + k, y + 1 + k, 1, 1); X.ctx.fillRect(x - k, y + 1 + k, 1, 1); } }
    }
  }

  function ring(cx, cy, rr, col) {
    const n = Math.max(24, Math.round(rr * 3));
    X.ctx.fillStyle = col;
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; X.ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 2, 2); }
  }

  function draw(G, opt) {
    const c = X.ctx;
    if (!RG.ready) { c.fillStyle = '#1d1a2b'; c.fillRect(0, 0, PW, PH); X.beginGlow(); X.present(0); return; }
    e.G = G; e.t = G.animT; e.reduce = G.reduceMotion; e.noGhost = !!opt.noGhost;
    X.lowFx = G.lowFx;
    const cam = opt.camPx - SX;
    e.camPix = Math.round(cam / P);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    X.beginGlow();
    const preview = !opt.noGhost;
    let m;
    const cx = opt.title ? PW / 2 : Math.round((G.px - cam) / P), cy = opt.title ? 100 : Math.round((G.foot - 30) / P);
    if (G.wipe) {
      const k = U.clamp(G.wipe.t / C.SWITCH_WIPE, 0, 1), rr = U.ease(k) * 380;
      scene(G, G.wipe.from, cam, { mute: true, preview });
      c.save(); c.beginPath(); c.arc(cx, cy, Math.max(1, rr), 0, 7); c.clip();
      m = scene(G, G.world, cam, { preview });
      c.restore();
      const col = G.world === 'night' ? [200, 215, 255] : [255, 230, 170];
      ring(cx, cy, rr, U.rgb(col, (1 - k) * (G.wipe.onBeat ? 1 : 0.7)));
      X.glow(cx, cy, 30, col, (1 - k) * (G.wipe.onBeat ? 0.8 : 0.4));
    } else m = scene(G, G.world, cam, { preview });

    if (!opt.title) player(G, cam);
    if (G.onBeatFx > 0 && !opt.title) X.glow(cx, cy, 18, [255, 240, 200], G.onBeatFx * 0.5);
    // 近处的天气（落在人物前面）
    RG.weatherFront(c, G.weather[LV.regionAt(cam + C.W / 2)], G.world, e.t, e.camPix, e.reduce);

    // 暗角与失误淡出
    const vg = c.createRadialGradient(PW / 2, PH / 2, PH * 0.45, PW / 2, PH / 2, PH * 0.98);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, G.world === 'night' ? 'rgba(4,6,24,0.5)' : 'rgba(30,20,10,0.2)');
    c.fillStyle = vg; c.fillRect(0, 0, PW, PH);
    if (G.fade > 0) { c.fillStyle = `rgba(8,8,20,${(G.fade * 0.6).toFixed(3)})`; c.fillRect(0, 0, PW, PH); }

    X.present(G.world === 'night' ? 1.0 : 0.55);
  }

  RF.Renderer = { draw };
})();
