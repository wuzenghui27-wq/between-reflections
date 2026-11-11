// 游戏逻辑（不碰 DOM、不发声音）：奔跑、跳跃、昼夜切换、碰撞、铃铛与门、灯、检查点。
// 界面与声音通过事件订阅：G.on('fail', fn) 等。逻辑是确定性的，test/solve.js 用它验证关卡可通。
(function () {
  const C = RF.CFG, LV = RF.LEVEL, U = RF.U;
  const other = w => (w === 'day' ? 'night' : 'day');
  const active = (o, w) => o.w === 'both' || o.w === w;

  RF.REASONS = {
    fall: '脚下没有路了',
    wall: '撞上了台阶',
    stuck: '另一面这里是实心的',
    gate: '门还锁着',
    hazard: '被挡住了'
  };
  RF.TIPS = {
    fall: '留意前方淡色的轮廓，那是另一面的路，提前切过去。缺口可以按空格跳过。',
    wall: '按空格（或 ↑）跳上去。',
    stuck: '等走过那一段再切换。',
    gate: '先切到另一面，碰响铃铛，门就会打开。',
    hazard: '另一面这里没有它，切过去；矮的障碍可以跳过。'
  };

  // ------------------------------------------------------------ 几何查询（纯函数，供逻辑与画面共用）
  const Q = {
    // 与角色身体横向重叠、在某一面存在的地面
    supportY(world, x, foot, tol) {
      let best = null;
      for (const s of LV.solids) {
        if (s.x0 > x + C.HALF_W) break;
        if (s.x1 < x - C.HALF_W || !active(s, world)) continue;
        if (s.y >= foot - tol && s.y <= foot + 1) { if (best === null || s.y < best) best = s.y; }
      }
      return best;
    },
    // 实心地面是否插进身体（薄平台不算）
    solidInBody(world, x, foot) {
      for (const s of LV.solids) {
        if (s.x0 > x + C.HALF_W - 1) break;
        if (s.thin || s.x1 < x - C.HALF_W + 1 || !active(s, world)) continue;
        if (s.y < foot - 0.5) return s;
      }
      return null;
    },
    hazardHit(world, x, foot, gates) {
      const l = x - C.HALF_W + 3, r = x + C.HALF_W - 3, top = foot - C.BODY_H + 4, bot = foot - 2;
      for (const h of LV.hazards) {
        if (h.x0 > r) break;
        if (h.x1 < l || !active(h, world)) continue;
        if (h.gate && gates[h.gate]) continue;
        if (top < h.y1 && bot > h.y0) return h;
      }
      return null;
    },
    groundAt(world, x) {  // 某处最高的地面（用于检查点落脚）
      let best = null;
      for (const s of LV.solids) if (active(s, world) && x >= s.x0 && x <= s.x1 && (best === null || s.y < best)) best = s.y;
      return best;
    }
  };
  RF.Q = Q;

  function createGame() {
    const handlers = {};
    const G = {
      // title | intro | running | failing | ready | paused | arrived | ended
      state: 'title', prevState: null,
      px: 0, foot: C.GROUND, vy: 0, onGround: true, coyote: 0, jumpBuf: 0,
      world: 'day', phase: 0, airT: 0,
      gates: {}, got: {}, cpIndex: 0, regionIndex: 0,
      animT: 0, timer: 0, readyDur: 0,
      pendingSwitch: false, failReason: null, failKind: null, failStreak: 0, lastFail: null,
      wipe: null, fade: 0, playerAlpha: 1, flashes: {}, onBeatFx: 0,
      shown: {}, reduceMotion: false, lowFx: false,
      stats: { fails: 0, switches: 0, time: 0 },
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      emit(ev, ...a) { (handlers[ev] || []).forEach(fn => fn(...a)); }
    };
    G.beat = () => G.px / C.BEAT_PX;

    function setWorld(w, silent) { G.world = w; G.emit('world', w, !!silent); }

    G.loadCheckpoint = function (i) {
      const cp = LV.checkpoints[i];
      G.cpIndex = i;
      G.px = cp.x;
      setWorld(cp.world, true);
      G.foot = Q.groundAt(cp.world, cp.x) || C.GROUND;
      G.vy = 0; G.onGround = true; G.coyote = 0; G.jumpBuf = 0; G.airT = 0;
      for (const b of LV.bells) { if (b.x >= cp.x) delete G.gates[b.id]; else G.gates[b.id] = true; }
      for (const l of LV.lanterns) { if (l.x >= cp.x) delete G.got[l.i]; }
      G.wipe = null; G.playerAlpha = 1; G.pendingSwitch = false; G.flashes = {};
      G.regionIndex = LV.regionAt(G.px);
    };

    G.reset = function () {
      G.shown = {}; G.got = {}; G.gates = {};
      G.failStreak = 0; G.lastFail = null;
      G.stats = { fails: 0, switches: 0, time: 0 };
      G.loadCheckpoint(0);
      G.phase = 0;
    };
    G.lanternCount = () => Object.keys(G.got).length;

    // ------------------------------------------------------------ 流程
    // 随机天气：每次开始旅程，为每一站按权重抽一种天气
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
    G.start = function () { G.rollWeather(); G.reset(); G.state = 'intro'; G.timer = 0; G.emit('intro'); };
    function beginRunning() { G.state = 'running'; G.emit('run'); }
    function enterReady(dur, label, tip) { G.state = 'ready'; G.timer = 0; G.readyDur = dur; G.emit('ready', label, tip); }
    function endReady() { G.fade = 0; G.state = 'running'; G.emit('readyEnd'); }

    function fail(reason, kind) {
      G.state = 'failing'; G.timer = 0;
      G.failReason = reason; G.failKind = kind || null;
      G.stats.fails++;
      G.failStreak = G.lastFail === reason ? G.failStreak + 1 : 1;
      G.lastFail = reason;
      G.emit('fail', reason);
    }
    G.retry = function () {
      G.loadCheckpoint(G.cpIndex);
      G.fade = 0.6;
      enterReady(C.READY, '回到最近的检查点', '');
    };
    G.pause = function () {
      if (!['running', 'ready', 'intro', 'failing'].includes(G.state)) return false;
      G.prevState = G.state; G.state = 'paused'; G.emit('paused'); return true;
    };
    G.resume = function () {
      if (G.state !== 'paused') return;
      const prev = G.prevState;
      G.emit('resumed');
      if (prev === 'running' || prev === 'ready') enterReady(C.RESUME_READY, '准备', '');
      else G.state = prev;
    };

    // ------------------------------------------------------------ 输入
    G.inputSwitch = function () {
      if (G.state === 'intro') beginRunning();
      else if (G.state === 'running') G.pendingSwitch = true;
      else if (G.state === 'ready' && G.timer > 0.15) endReady();
    };
    G.inputJump = function () {
      if (G.state === 'intro') beginRunning();
      else if (G.state === 'running') G.jumpBuf = C.JUMP_BUFFER;
      else if (G.state === 'ready' && G.timer > 0.15) endReady();
    };
    G.inputRetry = function () {
      if (G.state === 'running') G.retry();
      else if (G.state === 'ready' && G.timer > 0.15) endReady();
    };

    // 另一面此刻能不能站（脚下记号用）
    G.otherSafe = function () {
      const w = other(G.world);
      if (Q.solidInBody(w, G.px, G.foot - C.STEP_UP)) return false;
      if (Q.hazardHit(w, G.px, G.foot, G.gates)) return false;
      if (!G.onGround) return true;
      return Q.supportY(w, G.px, G.foot, C.STEP_UP) !== null;
    };

    // ------------------------------------------------------------ 物理一步
    function physics(dt) {
      // 1) 切换：瞬间翻面，再按新的一面判定
      if (G.pendingSwitch) {
        G.pendingSwitch = false;
        const from = G.world;
        setWorld(other(G.world));
        G.stats.switches++;
        const ph = G.beat() % 1, off = Math.min(ph, 1 - ph);
        G.wipe = { from, t: 0, onBeat: off < 0.14 };
        if (off < 0.14) G.onBeatFx = 1;
        G.emit('switched', G.world, off < 0.14);
        const s = Q.solidInBody(G.world, G.px, G.foot);
        if (s) {
          if (G.foot - s.y <= C.STEP_UP && !Q.solidInBody(G.world, G.px, s.y)) { G.foot = s.y; G.vy = 0; G.onGround = true; }
          else return fail('stuck');
        }
      }
      // 2) 跳
      if (G.jumpBuf > 0) {
        G.jumpBuf -= dt;
        if (G.onGround || G.coyote > 0) {
          G.vy = -C.JUMP_V; G.onGround = false; G.coyote = 0; G.jumpBuf = 0; G.airT = 0;
          G.emit('jump');
        }
      }
      // 3) 前进 + 撞墙 / 迈上小台阶
      let sp = C.SPEED;
      const toEnd = LV.endX - G.px;
      if (toEnd < 300) sp = C.SPEED * Math.max(0.05, toEnd / 300);
      G.px = Math.min(LV.endX, G.px + sp * dt);
      G.phase += sp * dt * 0.075;
      const s = Q.solidInBody(G.world, G.px, G.foot);
      if (s) {
        if (G.foot - s.y <= C.STEP_UP && G.vy >= 0) { G.foot = s.y; G.onGround = true; G.vy = 0; }
        else return fail('wall');
      }
      // 4) 竖直
      if (G.onGround) {
        const sy = Q.supportY(G.world, G.px, G.foot, C.STEP_UP);
        if (sy === null) {
          // 地面略低一点就贴下去（走下小台阶），否则开始下落
          const low = Q.supportY(G.world, G.px, G.foot + C.STEP_UP, C.STEP_UP);
          if (low !== null) G.foot = low;
          else { G.onGround = false; G.coyote = C.COYOTE; G.vy = 0; G.airT = 0; }
        } else G.foot = sy;
      } else {
        G.coyote = Math.max(0, G.coyote - dt);
        G.airT += dt;
        G.vy += C.GRAVITY * dt;
        const nf = G.foot + G.vy * dt;
        if (G.vy > 0) {
          let land = null;
          for (const t of LV.solids) {
            if (t.x0 > G.px + C.HALF_W) break;
            if (t.x1 < G.px - C.HALF_W || !active(t, G.world)) continue;
            if (t.y >= G.foot - 0.01 && t.y <= nf && (land === null || t.y < land)) land = t.y;
          }
          if (land !== null) { G.foot = land; G.vy = 0; G.onGround = true; G.emit('land'); }
          else G.foot = nf;
        } else G.foot = nf;
      }
      if (G.foot > C.FALL_LIMIT) return fail('fall');
      // 5) 障碍 / 门
      const h = Q.hazardHit(G.world, G.px, G.foot, G.gates);
      if (h) return fail(h.gate ? 'gate' : 'hazard', h.kind);
      // 6) 铃铛
      for (const b of LV.bells) {
        if (G.gates[b.id] || !active(b, G.world)) continue;
        if (Math.abs(b.x - G.px) < C.HALF_W + 16 && G.foot - C.BODY_H - 10 < b.y && G.foot + 4 > b.y - 20) {
          G.gates[b.id] = true; G.flashes[b.id] = 1.2; G.emit('bell', b);
        }
      }
      // 7) 灯
      for (const l of LV.lanterns) {
        if (G.got[l.i] || !active(l, G.world)) continue;
        if (Math.abs(l.x - G.px) < C.HALF_W + 14 && l.y > G.foot - C.BODY_H - 16 && l.y < G.foot + 10) {
          G.got[l.i] = true; G.flashes['l' + l.i] = 1; G.emit('lantern', l);
        }
      }
    }

    // ------------------------------------------------------------ 更新
    G.update = function (dt) {
      if (G.state === 'paused') return;
      G.animT += dt;
      if (G.wipe) { G.wipe.t += dt; if (G.wipe.t >= C.SWITCH_WIPE) G.wipe = null; }
      if (G.onBeatFx > 0) G.onBeatFx = Math.max(0, G.onBeatFx - dt * 2.5);
      for (const k in G.flashes) { G.flashes[k] -= dt; if (G.flashes[k] <= 0) delete G.flashes[k]; }
      if (G.state === 'title' || G.state === 'ended') return;
      G.stats.time += dt;

      switch (G.state) {
        case 'intro':
          G.timer += dt;
          if (G.timer >= C.INTRO_TIME) beginRunning();
          break;
        case 'running': {
          physics(dt);
          if (G.state !== 'running') break;
          for (let i = G.cpIndex + 1; i < LV.checkpoints.length; i++) {
            if (G.px >= LV.checkpoints[i].x && G.onGround) { G.cpIndex = i; G.failStreak = 0; G.emit('checkpoint', i); }
          }
          const ri = LV.regionAt(G.px);
          if (ri !== G.regionIndex) { G.regionIndex = ri; }
          for (let i = 0; i < LV.regions.length; i++) {
            const k = 'r' + i;
            if (!G.shown[k] && G.px >= LV.regions[i].x0) { G.shown[k] = 1; G.emit('region', LV.regions[i], i); }
          }
          for (let i = 0; i < LV.texts.length; i++) {
            const t = LV.texts[i], k = 't' + i;
            if (G.shown[k] || G.px < t.x || G.px > t.x + 500) continue;
            G.shown[k] = 1; G.emit('hint', t.text, t.dur, t.tag);
          }
          if (G.px >= LV.endX - 1) { G.state = 'arrived'; G.timer = 0; G.emit('arrive'); }
          break;
        }
        case 'failing':
          G.timer += dt;
          G.fade = U.clamp(G.timer / C.FAIL_FADE, 0, 1);
          G.playerAlpha = 1 - G.fade * 0.8;
          if (G.failReason === 'fall') { G.vy += C.GRAVITY * dt * 0.5; G.foot += G.vy * dt * 0.5; }
          if (G.timer >= C.FAIL_FADE) {
            G.loadCheckpoint(G.cpIndex);
            G.fade = 1;
            enterReady(C.READY, RF.REASONS[G.failReason], G.failStreak >= 2 ? RF.TIPS[G.failReason] : '');
          }
          break;
        case 'ready':
          G.timer += dt;
          G.fade = Math.max(0, G.fade - dt / 0.35);
          if (G.timer >= G.readyDur) endReady();
          break;
        case 'arrived':
          G.timer += dt;
          if (G.timer > 4.2) { G.state = 'ended'; G.emit('ended'); }
          break;
      }
    };

    // ------------------------------------------------------------ 供自动验证使用的快照
    const KEYS = ['state', 'px', 'foot', 'vy', 'onGround', 'coyote', 'jumpBuf', 'world', 'cpIndex', 'pendingSwitch', 'airT'];
    G.snapshot = function () {
      const s = {}; for (const k of KEYS) s[k] = G[k];
      s.gates = Object.assign({}, G.gates); s.got = Object.assign({}, G.got);
      return s;
    };
    G.restore = function (s) {
      for (const k of KEYS) G[k] = s[k];
      G.gates = Object.assign({}, s.gates); G.got = Object.assign({}, s.got);
    };
    G.physicsOnly = function (dt) {   // 不触发界面事件的快速模拟
      if (G.state !== 'running') return;
      physics(dt);
      if (G.state === 'running' && G.px >= LV.endX - 1) G.state = 'arrived';
    };

    G.reset();
    return G;
  }

  RF.createGame = createGame;
})();
