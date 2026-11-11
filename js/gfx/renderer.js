// 画面合成（像素坐标，320×180）：背景图 → 天气远层 → 水面 / 深谷 → 预告轮廓 → 地面与物件 → 旅人 → 天气近层。
// 切换时从旅人身上扩散一圈光波，光波经过的地方换成另一面。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX, LV = RF.LEVEL, RG = RF.Regions;
  const P = C.PIX, PW = X.PW, PH = X.PH, SX = C.PLAYER_SX;
  const other = w => (w === 'day' ? 'night' : 'day');
  const on = (o, w) => o.w === 'both' || o.w === w;

  const e = {
    world: 'day', t: 0, camPix: 0, reduce: false, G: null, noGhost: false,
    camY: 0, camYpix: 0, dip: 0, lastT: null, pulse: 0,
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
    // 以下是“世界”层：跟着镜头上下移
    c.save(); c.translate(0, e.camYpix); X.oy = e.camYpix;
    RG.lowland(c, LV.regions[m.a].id, world, e.t, e.camPix, 1);
    if (m.b !== null && m.t > 0) RG.lowland(c, LV.regions[m.b].id, world, e.t, e.camPix, m.t);
    if (!opt.noPlayer) reflection(G, cam, LV.regions[m.a].id, world);
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
    RF.Props.decorations(e, x0, x1);
    for (const h of LV.hazards) if (on(h, world) && h.x1 > x0 && h.x0 < x1) RF.Props.hazard(h, e, G.gates, false);
    for (const b of LV.bells) if (on(b, world) && b.x > x0 && b.x < x1) RF.Props.bell(b, e, G.gates, false);
    for (const l of LV.lanterns) if (on(l, world) && l.x > x0 && l.x < x1) RF.Props.lantern(l, e, G.got, false);
    if (!e.noGhost) RF.Props.coins(e, x0, x1);
    c.restore(); X.oy = 0;
    X.mute = false;
    return m;
  }

  // 水面倒影：画在水里、地面之前，所以只在缺口处露出来
  function reflection(G, cam, rid, world) {
    const wl = RG.R[rid].water; if (!wl) return;
    const wy = Math.round(wl[world] / P), fy = Math.round(G.foot / P);
    if (fy > wy + 1) return;
    const c = X.ctx, ri = LV.regionAt(G.px);
    const st = G.state === 'running' ? (G.riding ? 'idle' : G.onGround ? 'run' : 'air') : 'idle';
    c.save();
    c.beginPath(); c.rect(0, wy + 1, PW, PH + 16 - wy); c.clip();
    c.translate(0, wy * 2 + 1); c.scale(1, -1);
    RF.Traveler.draw(G.px - cam, G.foot, {
      weather: G.weather[ri], region: ri, state: st, dist: G.px, night: world === 'night', vy: G.vy, landT: G.landT, t: e.t,
      alpha: 0.32 * (G.playerAlpha === undefined ? 1 : G.playerAlpha), noGlow: true
    });
    c.restore();
    // 倒影上几道水波亮线
    c.fillStyle = world === 'day' ? 'rgba(255,255,255,0.35)' : 'rgba(200,215,255,0.3)';
    const px = Math.round((G.px - cam) / P), d = wy - fy;
    for (let k = 0; k < 3; k++) c.fillRect(px - 4 + ((Math.floor(e.t * 3) + k * 3) % 7) - 3, wy + 3 + d + k * 4, 4 + k, 1);
  }

  function player(G, cam) {
    const ri = LV.regionAt(G.px);
    const st = G.state === 'running' ? (G.riding ? 'idle' : G.onGround ? 'run' : 'air') : (G.state === 'failing' && !G.onGround ? 'air' : 'idle');
    RF.Traveler.draw(G.px - cam, G.foot, {
      weather: G.weather[ri], region: ri, state: st, dist: G.px, alpha: G.playerAlpha, night: G.world === 'night',
      vy: G.vy, landT: G.landT, t: e.t
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

  // 教学提示：人物头顶浮着一个按键
  function keyTip(G, cam) {
    const k = G.keyTip; if (!k || k.t <= 0 || G.state !== 'running') return;
    const x = Math.round((G.px - cam) / P) + 8, y = Math.round(G.foot / P) - 32 + (G.reduceMotion ? 0 : Math.round(Math.sin(e.t * 6)));
    const press = Math.floor(e.t * 2.5) % 2;     // 一按一放
    RF.Props.spr(k.key, x, y + press, false);
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
    // 物件跟着鼓点轻轻一跳（每拍开头的一小段）
    const bph = G.beat() % 1;
    e.pulse = !e.reduce && (G.state === 'running' || G.state === 'intro') && bph < 0.14 ? 1 : 0;
    X.lowFx = G.lowFx;
    const cam = opt.camPx - SX;
    e.camPix = Math.round(cam / P);
    // 镜头上下平滑跟随：人物爬高时画面跟着往下送一点；落地时轻轻一沉
    const dt = e.lastT === null ? 0 : U.clamp(e.t - e.lastT, 0, 0.05); e.lastT = e.t;
    const target = opt.title ? 0 : U.clamp((C.GROUND - G.foot) * 0.42, -20, 64);
    e.camY += (target - e.camY) * (1 - Math.exp(-dt * 3.2));
    e.dip *= Math.exp(-dt * 9);
    e.camYpix = Math.round(e.camY / P + (G.reduceMotion ? 0 : e.dip));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    X.beginGlow();
    const preview = !opt.noGhost;
    let m;
    const cx = opt.title ? PW / 2 : Math.round((G.px - cam) / P), cy = opt.title ? 100 : Math.round((G.foot - 30) / P) + e.camYpix;
    const np = !!opt.title;
    if (G.wipe) {
      const k = U.clamp(G.wipe.t / C.SWITCH_WIPE, 0, 1), rr = U.ease(k) * 380 + 12;
      scene(G, G.wipe.from, cam, { mute: true, preview, noPlayer: np });
      // 另一面画进第二块画布，用抖动边的圆形遮罩叠上来
      X.ctx = X.ctx2; X.ctx2.setTransform(1, 0, 0, 1, 0, 0); X.ctx2.imageSmoothingEnabled = false;
      m = scene(G, G.world, cam, { preview, noPlayer: np });
      X.ctx = c;
      X.dissolve(cx, cy, rr);
      c.drawImage(X.buf2, 0, 0);
      const col = G.world === 'night' ? [200, 215, 255] : [255, 230, 170];
      ring(cx, cy, rr, U.rgb(col, (1 - k) * (G.wipe.onBeat ? 1 : 0.7)));
      X.glow(cx, cy, 30, col, (1 - k) * (G.wipe.onBeat ? 0.8 : 0.4));
    } else m = scene(G, G.world, cam, { preview, noPlayer: np });

    c.save(); c.translate(0, e.camYpix); X.oy = e.camYpix;
    if (!opt.title) player(G, cam);
    if (G.onBeatFx > 0 && !opt.title) X.glow(cx, cy - e.camYpix, 18, [255, 240, 200], G.onBeatFx * 0.5);
    RF.Particles.draw(c, e.camPix);
    if (!opt.title) keyTip(G, cam);
    c.restore(); X.oy = 0;
    // 近处的天气（落在人物前面）与近景剪影
    RG.weatherFront(c, G.weather[LV.regionAt(cam + C.W / 2)], G.world, e.t, e.camPix, e.reduce);
    RG.foreground(c, LV.regions[m.a].id, G.world, e.t, e.camPix, e.reduce);

    // 暗角与失误淡出
    const vg = c.createRadialGradient(PW / 2, PH / 2, PH * 0.45, PW / 2, PH / 2, PH * 0.98);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, G.world === 'night' ? 'rgba(4,6,24,0.5)' : 'rgba(30,20,10,0.2)');
    c.fillStyle = vg; c.fillRect(0, 0, PW, PH);
    if (G.fade > 0) { c.fillStyle = `rgba(8,8,20,${(G.fade * 0.6).toFixed(3)})`; c.fillRect(0, 0, PW, PH); }

    let sx = 0, sy = 0;
    if (RF.Particles.shake > 0 && !G.reduceMotion) { const a = RF.Particles.shake; sx = Math.round((Math.random() * 2 - 1) * a); sy = Math.round((Math.random() * 2 - 1) * a * 0.6); }
    X.present(G.world === 'night' ? 1.0 : 0.55, sx, sy);
  }

  RF.Renderer = { draw, kick(v) { e.dip = Math.max(e.dip, v); } };
})();
