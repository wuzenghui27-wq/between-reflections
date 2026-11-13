// 游戏逻辑（不碰 DOM、不发声音）：“一景一题”。
// 自己左右走、跳，Shift 切换昼夜；白天会动的东西在动，夜里全部停住。点亮本关的宫灯，院门打开，走到下一关。
// 没有“失败”：切换时另一面被挡住就切不过去；掉进水里只是回到本关开头。
// 界面与声音通过事件订阅：G.on('lantern', fn) 等。逻辑是确定性的，test/solve.js 用它验证每一关有解。
(function () {
  const C = RF.CFG, LV = RF.LEVEL, U = RF.U;
  const other = w => (w === 'day' ? 'night' : 'day');
  const active = (o, w) => o.w === 'both' || o.w === w;
  const HW = C.HALF_W;

  // ------------------------------------------------------------ 几何查询（逻辑与画面共用）
  const Q = {
    // 挡路的方块（货摊、石墩、没开的门）此刻算不算数
    boxOn(h, world, gates) { return active(h, world) && !(h.gate && gates[h.gate]); },
    // 脚下的落脚面：实地、薄平台、方块顶、会动的踏板。返回 [foot-tol, foot+1] 之间最高的那个
    supportY(world, x, foot, tol, gates) {
      let best = null;
      const take = y => { if (y >= foot - tol && y <= foot + 1 && (best === null || y < best)) best = y; };
      for (const s of LV.solids) { if (s.x1 < x - HW || s.x0 > x + HW || !active(s, world)) continue; take(s.y); }
      for (const h of LV.hazards) { if (h.x1 < x - HW || h.x0 > x + HW || !Q.boxOn(h, world, gates || {})) continue; take(h.y0); }
      for (const m of LV.movers) { if (m.x1 < x - HW || m.x0 > x + HW) continue; take(m.y); }
      return best;
    },
    // 身体（脚在 foot）有没有插进实心的东西里：返回那个东西
    bodyHit(world, x, foot, gates) {
      const l = x - HW + 1, r = x + HW - 1, top = foot - C.BODY_H;
      for (const s of LV.solids) {
        if (s.thin || s.x1 <= l || s.x0 >= r || !active(s, world)) continue;
        if (s.y < foot - 0.5) return s;
      }
      for (const h of LV.hazards) {
        if (h.x1 <= l || h.x0 >= r || !Q.boxOn(h, world, gates || {})) continue;
        if (top < h.y1 && foot - 0.5 > h.y0) return h;
      }
      return null;
    },
    groundAt(world, x) {
      let best = null;
      for (const s of LV.solids) if (active(s, world) && x >= s.x0 && x <= s.x1 && (best === null || s.y < best)) best = s.y;
      return best;
    },
    // 旧画面代码还在用的两个名字
    solidInBody(world, x, foot) { return Q.bodyHit(world, x, foot, {}); },
    hazardHit() { return null; }
  };
  RF.Q = Q;

  // 昼动夜静：踏板的位置只由“白天走过的拍数”决定
  function placeMover(m, clock) {
    const ph = clock / m.period * Math.PI * 2 + (m.phase || 0);
    let x, y;
    if (m.kind === 'wheel') { x = m.cx + m.r * Math.cos(ph); y = m.cy + m.r * Math.sin(ph); }
    else if (m.kind === 'swing') { const th = m.amp * Math.sin(ph); x = m.cx + m.r * Math.sin(th); y = m.cy + m.r * Math.cos(th); m.th = th; }
    else { x = m.cx + m.amp * Math.sin(ph); y = m.cy; }
    m.dir = Math.cos(ph) >= 0 ? 1 : -1;
    m.x0 = x - m.hw; m.x1 = x + m.hw; m.y = y; m.ang = ph;
  }
  RF.placeMover = placeMover;

  function createGame() {
    const handlers = {};
    const G = {
      // title | intro | running | failing | paused | arrived | ended
      state: 'title', prevState: null,
      px: 0, foot: C.GROUND, vx: 0, vy: 0, face: 1, onGround: true, coyote: 0, jumpBuf: 0,
      inL: false, inR: false, walkDist: 0,
      world: 'day', room: 0, camX: 0, dclock: 0, mclock: 0,
      gates: {}, got: {}, cpIndex: 0, regionIndex: 0,
      animT: 0, timer: 0,
      pendingSwitch: false, wipe: null, fade: 0, playerAlpha: 1, flashes: {}, onBeatFx: 0, blockedT: 0,
      shown: {}, reduceMotion: false, lowFx: false, ghostMul: 1,
      stats: { fails: 0, switches: 0, time: 0 }, combo: 0, cgot: {},
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      emit(ev, ...a) { (handlers[ev] || []).forEach(fn => fn(...a)); }
    };
    G.beat = () => G.mclock;                    // 音乐按时间走
    G.diff = 'normal'; G.applyDiff = () => { };

    function setWorld(w, silent) { G.world = w; G.emit('world', w, !!silent); }
    const roomOf = () => LV.rooms[G.room];

    // 进一关（或重来这一关）：人回到开头，这一关的灯、铃、踏板都还原
    G.loadRoom = function (i, keepCam) {
      const r = LV.rooms[i];
      G.room = i; G.cpIndex = i;
      G.px = r.sx; G.foot = r.sy; G.vx = 0; G.vy = 0; G.face = 1; G.onGround = true; G.coyote = 0; G.jumpBuf = 0;
      setWorld(r.world, true);
      for (const l of LV.lanterns) { if (l.room >= i) delete G.got[l.i]; else G.got[l.i] = true; }
      for (const k in G.gates) delete G.gates[k];
      for (const q of LV.rooms) if (q.i < i) G.gates[q.exit] = true;
      for (const b of LV.bells) if (b.x < r.x0) G.gates[b.id] = true;
      for (const ev of LV.eaves) ev.y = r.world === 'day' ? ev.yd : ev.yn;
      G.dclock = 0;
      for (const m of LV.movers) placeMover(m, 0);
      if (!keepCam) G.camX = r.x0;
      G.wipe = null; G.playerAlpha = 1; G.pendingSwitch = false; G.flashes = {}; G.fade = 0;
      G.regionIndex = r.region;
    };
    G.loadCheckpoint = G.loadRoom;
    G.reset = function () {
      G.shown = {}; G.got = {}; G.gates = {};
      G.stats = { fails: 0, switches: 0, time: 0, bestCombo: 0 };
      G.loadRoom(0);
    };
    G.lanternCount = () => Object.keys(G.got).length;
    G.coinCount = () => 0;
    G.grade = () => null;

    // 每次出发，各站的天气随机
    G.rollWeather = function (rnd) {
      rnd = rnd || Math.random;
      G.weather = LV.regions.map(r => {
        const ws = r.weathers || { clear: 1 }; let sum = 0;
        for (const k in ws) sum += ws[k];
        let t = rnd() * sum;
        for (const k in ws) { t -= ws[k]; if (t <= 0) return k; }
        return Object.keys(ws)[0];
      });
    };
    G.weatherAt = px => G.weather[LV.regionAt(px)];
    G.rollWeather(() => 0.01);

    function enterRoom(i) {
      const r = LV.rooms[i];
      if (!G.shown['r' + r.region]) { G.shown['r' + r.region] = 1; G.emit('region', LV.regions[r.region], r.region); }
      G.emit('room', r);
      if (r.hint && !G.shown['h' + i]) { G.shown['h' + i] = 1; G.emit('hint', r.hint.text, r.hint.dur, r.hint.tag); }
    }
    G.start = function () { G.rollWeather(); G.reset(); G.state = 'intro'; G.timer = 0; G.emit('intro'); };
    function beginRunning() { G.state = 'running'; G.emit('run'); enterRoom(G.room); }
    G.retry = function () {                      // 重来本关
      G.loadRoom(G.room); G.state = 'running'; G.fade = 0.5; G.emit('retry');
    };
    G.pause = function () {
      if (!['running', 'intro', 'failing'].includes(G.state)) return false;
      G.prevState = G.state; G.state = 'paused'; G.inL = G.inR = false; G.emit('paused'); return true;
    };
    G.resume = function () { if (G.state !== 'paused') return; G.state = G.prevState; G.emit('resumed'); };

    // ------------------------------------------------------------ 输入
    G.inputSwitch = function () { if (G.state === 'intro') beginRunning(); else if (G.state === 'running') G.pendingSwitch = true; };
    G.inputJump = function () { if (G.state === 'intro') beginRunning(); else if (G.state === 'running') G.jumpBuf = C.JUMP_BUFFER; };
    G.inputJumpRelease = function () {
      if (G.state !== 'running') return;
      G.jumpBuf = 0;
      if (G.jumpRise && G.vy < -C.JUMP_V * C.JUMP_CUT) G.vy = -C.JUMP_V * C.JUMP_CUT;
      G.jumpRise = false;
    };
    G.inputMove = function (dir, down) {
      if (G.state === 'intro' && down) beginRunning();
      if (dir < 0) G.inL = down; else G.inR = down;
    };
    G.inputRetry = function () { if (G.state === 'running') G.retry(); };

    // 另一面此刻能不能切过去（脚下记号用）
    G.otherSafe = function () {
      const hit = Q.bodyHit(other(G.world), G.px, G.foot, G.gates);
      return !hit || (!hit.gate && hit.y !== undefined && G.foot - hit.y <= C.STEP_UP);
    };

    // ------------------------------------------------------------ 物理一步
    function physics(dt) {
      const r = roomOf();
      // 1) 切换：另一面这里是实心的就切不过去
      if (G.pendingSwitch) {
        G.pendingSwitch = false;
        const to = other(G.world);
        let hit = Q.bodyHit(to, G.px, G.foot, G.gates), up = null;
        if (hit && hit.y !== undefined && hit.y0 === undefined && G.foot - hit.y <= C.STEP_UP && !Q.bodyHit(to, G.px, hit.y, G.gates)) { up = hit.y; hit = null; }
        if (hit) { G.blockedT = 0.35; G.emit('blocked'); }
        else {
          const from = G.world;
          setWorld(to);
          if (up !== null) { G.foot = up; G.vy = 0; G.onGround = true; }
          G.stats.switches++;
          G.wipe = { from, t: 0, onBeat: false };
          G.emit('switched', G.world, false);
        }
      }
      // 2) 跳
      if (G.jumpBuf > 0) {
        G.jumpBuf -= dt;
        if (G.onGround || G.coyote > 0) {
          G.vy = -C.JUMP_V; G.onGround = false; G.coyote = 0; G.jumpBuf = 0; G.jumpRise = true;
          G.emit('jump');
        }
      }
      // 3) 飞檐升降，站在上面的人跟着走
      for (const ev of LV.eaves) {
        const tgt = G.world === 'day' ? ev.yd : ev.yn;
        if (ev.y === tgt) continue;
        const on = G.onGround && G.px >= ev.x0 - HW && G.px <= ev.x1 + HW && Math.abs(G.foot - ev.y) < 0.6;
        const st = C.EAVE_V * dt;
        ev.y = Math.abs(tgt - ev.y) <= st ? tgt : ev.y + Math.sign(tgt - ev.y) * st;
        if (on) G.foot = ev.y;
      }
      // 4) 昼动夜静：白天时钟往前走，踏板跟着动，站在上面的人被带着走
      let ride = null;
      if (G.onGround) for (const m of LV.movers) if (G.px >= m.x0 - HW && G.px <= m.x1 + HW && Math.abs(G.foot - m.y) < 0.6) { ride = m; break; }
      const rx = ride ? (ride.x0 + ride.x1) / 2 : 0;
      if (G.world === 'day') { G.dclock += dt / C.BEAT_SEC; for (const m of LV.movers) placeMover(m, G.dclock); }
      G.riding = !!ride;
      if (ride) {
        const nx = G.px + (ride.x0 + ride.x1) / 2 - rx;
        if (!Q.bodyHit(G.world, nx, ride.y, G.gates)) { G.px = nx; G.foot = ride.y; }
        else { G.onGround = false; G.coyote = C.COYOTE; G.vy = 0; }       // 被岸挡住：从踏板上被挤下来
      }
      // 5) 左右走
      const want = (G.inR ? 1 : 0) - (G.inL ? 1 : 0);
      const tv = want * C.WALK, acc = (G.onGround ? C.WALK_ACC : C.AIR_ACC) * dt;
      G.vx = Math.abs(tv - G.vx) <= acc ? tv : G.vx + Math.sign(tv - G.vx) * acc;
      if (want) G.face = want;
      if (G.vx !== 0) {
        let nx = G.px + G.vx * dt;
        nx = Math.max(r.x0 + HW, nx);
        const hit = Q.bodyHit(G.world, nx, G.foot, G.gates);
        if (!hit) G.px = nx;
        else if (hit.y0 === undefined && G.foot - hit.y <= C.STEP_UP && G.vy >= 0 && !Q.bodyHit(G.world, nx, hit.y, G.gates)) { G.px = nx; G.foot = hit.y; G.onGround = true; G.vy = 0; }
        else G.vx = 0;
        G.walkDist += Math.abs(G.vx * dt);
      }
      // 6) 竖直
      if (G.onGround) {
        const sy = Q.supportY(G.world, G.px, G.foot, C.STEP_UP, G.gates);
        if (sy === null) {
          const low = Q.supportY(G.world, G.px, G.foot + C.STEP_UP, C.STEP_UP, G.gates);
          if (low !== null) G.foot = low;
          else { G.onGround = false; G.coyote = C.COYOTE; G.vy = 0; }
        } else G.foot = sy;
      } else {
        G.coyote = Math.max(0, G.coyote - dt);
        G.vy = Math.min(C.FALL_MAX, G.vy + C.GRAVITY * dt);
        const nf = G.foot + G.vy * dt;
        if (G.vy > 0) {
          let land = null;
          const take = (y, tol) => { if (y >= G.foot - 0.01 - (tol || 0) && y <= nf && (land === null || y < land)) land = y; };
          for (const t of LV.solids) { if (t.x1 < G.px - HW || t.x0 > G.px + HW || !active(t, G.world)) continue; take(t.y); }
          for (const h of LV.hazards) { if (h.x1 < G.px - HW || h.x0 > G.px + HW || !Q.boxOn(h, G.world, G.gates)) continue; take(h.y0); }
          for (const m of LV.movers) { if (m.x1 < G.px - HW || m.x0 > G.px + HW) continue; take(m.y, 6); }
          if (land !== null) { G.foot = land; G.vy = 0; G.onGround = true; G.landT = 0; G.jumpRise = false; G.emit('land'); }
          else G.foot = nf;
        } else {
          // 往上：头顶到方块底就停
          let bump = false;
          const top0 = G.foot - C.BODY_H, top1 = nf - C.BODY_H;
          for (const h of LV.hazards) {
            if (h.x1 <= G.px - HW + 1 || h.x0 >= G.px + HW - 1 || !Q.boxOn(h, G.world, G.gates)) continue;
            if (top0 >= h.y1 && top1 < h.y1) { bump = true; G.foot = h.y1 + C.BODY_H; }
          }
          if (bump) G.vy = 0; else G.foot = nf;
        }
      }
      if (G.foot > C.FALL_LIMIT) { G.state = 'failing'; G.timer = 0; G.stats.fails++; G.emit('fail', 'fall'); return; }
      // 7) 铃
      for (const b of LV.bells) {
        if (G.gates[b.id] || !active(b, G.world)) continue;
        if (Math.abs(b.x - G.px) < HW + 18 && G.foot - C.BODY_H - 14 < b.y && G.foot + 4 > b.y - 20) {
          G.gates[b.id] = true; G.flashes[b.id] = 1.2; G.emit('bell', b);
        }
      }
      // 8) 宫灯：碰到就点亮；这一关的灯都亮了，院门打开
      for (const l of LV.lanterns) {
        if (G.got[l.i] || l.room !== G.room || !active(l, G.world)) continue;
        if (Math.abs(l.x - G.px) < HW + 16 && l.y > G.foot - C.BODY_H - 30 && l.y < G.foot + 10) {
          G.got[l.i] = true; G.flashes['l' + l.i] = 1; G.emit('lantern', l);
          if (r.lamps.every(k => G.got[k])) { G.gates[r.exit] = true; G.flashes[r.exit] = 1.2; G.emit('roomClear', r); }
        }
      }
      // 9) 走出这一关
      if (G.px > r.x1 + HW) {
        if (G.room + 1 >= LV.rooms.length) { G.state = 'arrived'; G.timer = 0; G.emit('arrive'); return; }
        G.room++; G.cpIndex = G.room;
        const n = roomOf();
        G.dclock = 0; for (const m of LV.movers) placeMover(m, 0);
        if (G.world !== n.world) { const from = G.world; setWorld(n.world); G.wipe = { from, t: 0, onBeat: false }; }
        G.emit('checkpoint', G.room);
        enterRoom(G.room);
      }
    }

    // ------------------------------------------------------------ 更新
    G.update = function (dt) {
      if (G.state === 'paused') return;
      G.animT += dt; G.landT = (G.landT === undefined ? 9 : G.landT) + dt;
      if (G.wipe) { G.wipe.t += dt; if (G.wipe.t >= C.SWITCH_WIPE) G.wipe = null; }
      if (G.blockedT > 0) G.blockedT -= dt;
      for (const k in G.flashes) { G.flashes[k] -= dt; if (G.flashes[k] <= 0) delete G.flashes[k]; }
      if (G.state === 'title' || G.state === 'ended') return;
      G.stats.time += dt;
      G.mclock += dt / C.BEAT_SEC;
      // 镜头：每关固定一屏，换关时滑过去
      const tx = LV.rooms[G.room].x0;
      G.camX += (tx - G.camX) * (1 - Math.exp(-dt * 7));
      if (Math.abs(tx - G.camX) < 0.5) G.camX = tx;

      switch (G.state) {
        case 'intro':
          G.timer += dt;
          if (G.timer >= C.INTRO_TIME) beginRunning();
          break;
        case 'running':
          G.fade = Math.max(0, G.fade - dt / 0.35);
          physics(dt);
          break;
        case 'failing':                              // 掉下去：暗一下，回到本关开头
          G.timer += dt;
          G.fade = U.clamp(G.timer / 0.3, 0, 1);
          G.vy += C.GRAVITY * dt * 0.5; G.foot += G.vy * dt * 0.5;
          if (G.timer >= 0.3) { G.loadRoom(G.room, true); G.fade = 0.8; G.state = 'running'; G.emit('retry'); }
          break;
        case 'arrived':
          G.timer += dt;
          if (G.timer > 2.6) { G.state = 'ended'; G.emit('ended'); }
          break;
      }
    };

    // ------------------------------------------------------------ 供自动验证使用的快照
    const KEYS = ['state', 'px', 'foot', 'vx', 'vy', 'face', 'onGround', 'coyote', 'jumpBuf', 'world', 'room', 'cpIndex', 'pendingSwitch', 'jumpRise', 'dclock', 'inL', 'inR'];
    G.snapshot = function () {
      const s = {}; for (const k of KEYS) s[k] = G[k];
      s.gates = Object.assign({}, G.gates); s.got = Object.assign({}, G.got);
      s.eaves = LV.eaves.map(k => k.y);
      return s;
    };
    G.restore = function (s) {
      for (const k of KEYS) G[k] = s[k];
      G.gates = Object.assign({}, s.gates); G.got = Object.assign({}, s.got);
      LV.eaves.forEach((k, i) => { k.y = s.eaves[i]; });
      for (const m of LV.movers) placeMover(m, G.dclock);
    };
    G.physicsOnly = function (dt) { if (G.state === 'running') physics(dt); };

    G.reset();
    return G;
  }

  RF.createGame = createGame;
})();
