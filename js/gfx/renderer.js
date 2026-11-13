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
    ghostA(x0, x1) {            // 另一面的东西：本关里的都看得见
      if (e.noGhost) return 0;
      const r = LV.rooms[e.G.room];
      return x1 < r.x0 || x0 > r.x1 ? 0 : 0.85;
    }
  };

  function scene(G, world, cam, opt) {
    const c = X.ctx;
    e.world = world;
    X.mute = !!opt.mute;
    const centre = cam + C.W / 2;
    // 先铺一层底色：万一背景图没画上，也不会留下上一帧的拖影
    c.fillStyle = world === 'night' ? '#0c1226' : '#9fb3c4'; c.fillRect(0, 0, X.PW, X.PH);
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
      for (const h of LV.rollers) if (h.w === ow) RF.Props.roller(h, e, true);
    }
    for (const s of LV.solids) if (on(s, world) && s.x1 > x0 && s.x0 < x1) RF.Props.solid(s, e);
    RF.Props.decorations(e, x0, x1);
    RF.Props.chimes(e, x0, x1);
    RF.Props.movers(e, x0, x1);
    for (const mg of LV.moongates) if (mg.x > x0 && mg.x < x1) RF.Props.moongate(mg, e);
    for (const h of LV.hazards) if (on(h, world) && h.x1 > x0 && h.x0 < x1) RF.Props.hazard(h, e, G.gates, false);
    for (const b of LV.bells) if (on(b, world) && b.x > x0 && b.x < x1) RF.Props.bell(b, e, G.gates, false);
    for (const h of LV.rollers) if (on(h, world)) RF.Props.roller(h, e, false);
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
    const st = pose(G);
    c.save();
    c.beginPath(); c.rect(0, wy + 1, PW, PH + 16 - wy); c.clip();
    c.translate(0, wy * 2 + 1); c.scale(1, -1);
    RF.Traveler.draw(G.px - cam, G.foot, {
      weather: G.weather[ri], region: ri, state: st, dist: G.walkDist, flip: G.face < 0, night: world === 'night', vy: G.vy, landT: G.landT, t: e.t,
      alpha: 0.32 * (G.playerAlpha === undefined ? 1 : G.playerAlpha), noGlow: true
    });
    c.restore();
    // 倒影上几道水波亮线
    c.fillStyle = world === 'day' ? 'rgba(255,255,255,0.35)' : 'rgba(200,215,255,0.3)';
    const px = Math.round((G.px - cam) / P), d = wy - fy;
    for (let k = 0; k < 3; k++) c.fillRect(px - 4 + ((Math.floor(e.t * 3) + k * 3) % 7) - 3, wy + 3 + d + k * 4, 4 + k, 1);
  }

  const pose = G => (G.state === 'running' || G.state === 'failing') ? (!G.onGround ? 'air' : Math.abs(G.vx) > 20 ? 'run' : 'idle') : 'idle';
  function player(G, cam) {
    const ri = LV.regionAt(G.px);
    const bx = G.blockedT > 0 && !G.reduceMotion ? Math.round(Math.sin(G.blockedT * 60) * 3) : 0;     // 切不过去：人晃一下
    RF.Traveler.draw(G.px - cam + bx, G.foot, {
      weather: G.weather[ri], region: ri, state: pose(G), dist: G.walkDist, flip: G.face < 0, alpha: G.playerAlpha, night: G.world === 'night',
      vy: G.vy, landT: G.landT, t: e.t
    });
    // 脚下记号：另一面此刻能不能站
    if (G.state === 'running') {
      const x = Math.round((G.px - cam) / P), y = Math.round(G.foot / P) + 3;
      const c = X.ctx, safe = G.otherSafe();
      if (safe) {        // 另一面能站：脚下一道细细的倒影光，像水面上映出的另一块地
        const col = G.world === 'day' ? [110, 140, 255] : [255, 216, 138];
        c.fillStyle = `rgb(${col})`; c.fillRect(x - 2, y + 1, 5, 1);
        c.fillStyle = `rgba(${col},0.45)`; c.fillRect(x - 4, y + 1, 2, 1); c.fillRect(x + 3, y + 1, 2, 1);
        c.fillStyle = '#ffffff'; c.fillRect(x, y + 1, 1, 1);
        X.glow(x, y + 1, 5, col, 0.35);
      } else {           // 另一面是空的 / 有东西挡着：两截断开的暗线
        c.fillStyle = 'rgba(200,70,70,0.75)'; c.fillRect(x - 3, y + 1, 2, 1); c.fillRect(x + 2, y + 1, 2, 1);
      }
    }
  }

  // 教学提示：不在头顶飘字，而是在“该按的地方”立一道光、地上一枚记号、上面一块按键牌。
  // 人走近时按键牌跟着拍子按下去，过了这个点就收起来；找不到落点（看时机的机关）才退回人物头顶。
  const AIM = { switch: 1 };
  function findCue(G, k) {
    if (!AIM[k.tag]) return null;
    const cur = G.world, oth = cur === 'day' ? 'night' : 'day', Q = RF.Q, foot = G.foot;
    for (let x = G.px + 24; x < LV.rooms[G.room].x1; x += 6) {
      const gc = Q.groundAt(cur, x), haz = Q.hazardHit(cur, x, foot, G.gates);
      if (k.key === 'k_shift') {
        const bad = gc === null;
        const go = Q.groundAt(oth, x);
        if (bad && go !== null && !Q.hazardHit(oth, x, go, G.gates)) return { x: x - 28, y: Q.groundAt(cur, x - 28) ?? go };
      } else if (gc === null || gc < foot - C.STEP_UP || haz) {
        const fx = x - 34; return { x: fx, y: Q.groundAt(cur, fx) ?? foot };
      }
    }
    return null;
  }
  function keyTip(G, cam) {
    const k = G.keyTip; if (!k || k.t <= 0 || G.state !== 'running') { if (k) k.cue = null; return; }
    if (k.cue === undefined || (k.cue && k.cue.x < G.px - 40)) k.cue = k.cue === undefined ? findCue(G, k) : null;
    const c = X.ctx, bob = G.reduceMotion ? 0 : Math.round(Math.sin(e.t * 5) * 1);
    const age = Math.min(1, (k.age = (k.age || 0) + 1 / 60) * 5);         // 出场：从下往上弹一下
    const pop = Math.round((1 - age) * 6 - (age > 0.6 && age < 0.9 ? 1 : 0));
    const col = k.key === 'k_shift' ? (G.world === 'day' ? [120, 150, 255] : [255, 216, 138]) : [255, 244, 214];
    const rgba = a => `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
    if (k.cue) {
      const x = Math.round((k.cue.x - cam) / P), gy = Math.round(k.cue.y / P);
      const near = (k.cue.x - G.px) < C.BEAT_PX * 0.9, ph = (G.beat() % 1);
      c.globalAlpha = Math.min(1, k.t * 2) * age;
      for (let y = 0; y < 30; y++) {                                       // 光柱：底下实、往上散
        const a = 0.85 * (1 - y / 30) * (0.75 + 0.25 * Math.sin(e.t * 6));
        c.fillStyle = rgba(a); c.fillRect(x - 1, gy - y, 3, 1);
        c.fillStyle = rgba(a * 0.45); c.fillRect(x - 3, gy - y, 1, 1); c.fillRect(x + 3, gy - y, 1, 1);
      }
      X.glow(x, gy - 2, 9, col, 0.5);
      const rr = near ? 4 : 5 + Math.round((1 - ph) * 3);                  // 地上的记号：一圈跟着拍子收拢的光点
      for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; c.fillStyle = rgba(0.85); c.fillRect(Math.round(x + Math.cos(t) * rr), Math.round(gy + 1 + Math.sin(t) * rr * 0.35), 1, 1); }
      c.fillStyle = rgba(1); c.fillRect(x, gy - 1, 1, 3); c.fillRect(x - 1, gy, 3, 1);
      const press = near && ph < 0.35 ? 2 : 0;
      RF.Props.spr(k.key, x, gy - 33 + bob + pop + press, false);
      c.globalAlpha = 1;
      return;
    }
    const x = Math.round((G.px - cam) / P) + 2, y = Math.round(G.foot / P) - 40 + bob + pop;
    const press = Math.floor(e.t * 2.5) % 2;
    c.globalAlpha = age; RF.Props.spr(k.key, x, y + press * 2, false); c.globalAlpha = 1;
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
    const target = 0;          // 每关固定一屏，镜头不上下跟
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
    if (!opt.title && G.judge && false) {        // 踩准拍子：脚下溅起一圈光点（不出字）
      const k = G.judge.t / 0.7, jx = Math.round((G.px - cam) / P), jy = Math.round(G.foot / P) - 1;
      const n = G.judge.k === 'miao' ? 14 : 8, rr = 3 + U.ease(Math.min(1, k * 1.6)) * (G.judge.k === 'miao' ? 13 : 9);
      const col = G.world === 'night' ? [200, 220, 255] : [255, 226, 150], a = (1 - k) * (G.judge.k === 'miao' ? 1 : 0.7);
      c.fillStyle = U.rgb(col, a);
      for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; c.fillRect(Math.round(jx + Math.cos(t) * rr), Math.round(jy + Math.sin(t) * rr * 0.35), 1, 1); }
      if (k < 0.35) X.glow(jx, jy - 8, 14, col, (0.35 - k) * (G.judge.k === 'miao' ? 2 : 1.2));
    }
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
