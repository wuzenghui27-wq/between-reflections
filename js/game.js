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
    rollerHit(world, x, foot) {
      const l = x - C.HALF_W + 3, r = x + C.HALF_W - 3, top = foot - C.BODY_H + 4, bot = foot - 2;
      for (const h of LV.rollers) {
        if (h.x1 < l || h.x0 > r || !active(h, world)) continue;
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

  // 渡船：被踩上之后跟着路程往前漂，漂满 travel 就停
  function placeFerry(f, px) {
    const off = f.on ? Math.max(0, Math.min(f.travel, px - f.p0)) : 0;
    f.x0 = f.bx0 + off; f.x1 = f.bx1 + off; f.off = off;
    f.moving = f.on && off < f.travel;
  }
  RF.placeFerry = placeFerry;
  // 滚木：px 过了触发点后，按“相对人的时间”朝左滚
  function placeRoller(h, px) {
    const off = px > h.trig ? (px - h.trig) * h.v : 0;
    h.x0 = h.bx0 - off; h.x1 = h.bx1 - off; h.rolling = off > 0;
  }
  RF.placeRoller = placeRoller;
  const SINK_DELAY = 0.28, SINK_V = 70;

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
      stats: { fails: 0, switches: 0, time: 0 }, combo: 0,
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      emit(ev, ...a) { (handlers[ev] || []).forEach(fn => fn(...a)); }
    };
    G.beat = () => G.px / C.BEAT_PX;
    // 引路铜钱（js/coins.js 生成；自动求解时没有）
    if (!LV.coins) LV.coins = (RF.COINS || []).map((c, i) => ({ i, x: c[0], y: c[1], w: c[2] ? 'night' : 'day' }));
    G.cgot = {}; G.coinRun = 0; G.lastCoin = -9;

    function setWorld(w, silent) { G.world = w; G.emit('world', w, !!silent); }

    G.loadCheckpoint = function (i) {
      const cp = LV.checkpoints[i];
      G.cpIndex = i;
      G.px = cp.x;
      setWorld(cp.world, true);
      G.foot = Q.groundAt(cp.world, cp.x) || C.GROUND;
      G.vy = 0; G.onGround = true; G.coyote = 0; G.jumpBuf = 0; G.airT = 0; G.hopUsed = false;
      for (const b of LV.bells) { if (b.x >= cp.x) delete G.gates[b.id]; else G.gates[b.id] = true; }
      for (const l of LV.lanterns) { if (l.x >= cp.x) delete G.got[l.i]; }
      for (const c of LV.coins) { if (c.x >= cp.x) delete G.cgot[c.i]; }
      for (const f of LV.ferries) {          // 检查点之后的船回到岸边，之前的停在对岸
        if (f.bx0 >= cp.x - 1) { f.on = false; f.p0 = 0; } else { f.on = true; f.p0 = f.bx0 - f.travel - 1e4; }
        placeFerry(f, cp.x);
      }
      G.riding = false;
      for (const h of LV.rollers) placeRoller(h, cp.x);
      for (const sk of LV.sinkers) { sk.y = sk.by; sk.stood = 0; sk.gone = false; }
      G.coinRun = 0; G.lastCoin = -9;
      G.wipe = null; G.playerAlpha = 1; G.pendingSwitch = false; G.flashes = {};
      G.regionIndex = LV.regionAt(G.px);
    };

    G.reset = function () {
      G.shown = {}; G.got = {}; G.gates = {}; G.cgot = {};
      G.failStreak = 0; G.lastFail = null;
      G.stats = { fails: 0, switches: 0, time: 0, bestCombo: 0, reg: LV.regions.map(() => ({ sw: 0, beat: 0, fails: 0 })) };
      G.combo = 0; G.graded = {};
      G.loadCheckpoint(0);
      G.phase = 0;
    };
    G.lanternCount = () => Object.keys(G.got).length;
    G.coinCount = () => Object.keys(G.cgot).length;
    function coins() {
      const by = G.foot - 30;
      for (const c of LV.coins) {
        if (c.x > G.px + 26) break;
        if (c.x < G.px - 26 || G.cgot[c.i] || c.w !== G.world || Math.abs(c.y - by) > 44) continue;
        G.cgot[c.i] = true;
        G.coinRun = c.i === G.lastCoin + 1 ? G.coinRun + 1 : 0;
        G.lastCoin = c.i;
        G.emit('coin', c, G.coinRun);
      }
    }
    // 每站评分：踩拍、收灯、失误 → 甲乙丙丁
    G.grade = function (ri) {
      const rs = G.stats.reg ? G.stats.reg[ri] : null; if (!rs) return null;
      const ls = LV.lanterns.filter(l => LV.regionAt(l.x) === ri);
      const lg = ls.filter(l => G.got[l.i]).length;
      const beat = rs.sw ? rs.beat / rs.sw : 0.5;
      const cs = LV.coins.filter(c => LV.regionAt(c.x) === ri), cg = cs.filter(c => G.cgot[c.i]).length;
      const coinR = cs.length ? cg / cs.length : 1;
      const score = beat * 35 + coinR * 30 + (ls.length ? lg / ls.length : 1) * 15 + (rs.fails === 0 ? 20 : rs.fails <= 2 ? 10 : 0);
      const mark = score >= 80 ? '甲' : score >= 62 ? '乙' : score >= 42 ? '丙' : '丁';
      return { mark, score: Math.round(score), beat, coins: cg, coinsTotal: cs.length, lanterns: lg, lanternsTotal: ls.length, fails: rs.fails, switches: rs.sw };
    };

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
      if (G.stats.reg) G.stats.reg[LV.regionAt(G.px)].fails++;
      if (G.combo) { G.combo = 0; G.emit('combo', 0); }
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
        if (G.stats.reg) {
          const rs = G.stats.reg[LV.regionAt(G.px)];
          rs.sw++; if (off < 0.14) rs.beat++;
          G.combo = off < 0.14 ? G.combo + 1 : 0;
          G.stats.bestCombo = Math.max(G.stats.bestCombo, G.combo);
          G.emit('combo', G.combo);
        }
        const s = Q.solidInBody(G.world, G.px, G.foot);
        if (s) {
          if (G.foot - s.y <= C.STEP_UP && !Q.solidInBody(G.world, G.px, s.y)) { G.foot = s.y; G.vy = 0; G.onGround = true; }
          else return fail('stuck');
        }
        // 空中翻面借力：每次离地只能借一次，向上再弹一下
        if (!G.onGround && !G.hopUsed) {
          G.hopUsed = true;
          G.vy = Math.min(G.vy, -C.JUMP_V * C.SHIFT_HOP);
          G.coyote = 0; G.jumpBuf = 0;
          G.emit('hop');
        }
      }
      // 2) 跳
      if (G.jumpBuf > 0) {
        G.jumpBuf -= dt;
        if (G.onGround || G.coyote > 0) {
          G.vy = -C.JUMP_V; G.onGround = false; G.coyote = 0; G.jumpBuf = 0; G.airT = 0; G.hopUsed = false;
          G.emit('jump');
        }
      }
      // 3) 前进 + 撞墙 / 迈上小台阶
      let sp = C.SPEED * LV.paceAt(G.px);
      const toEnd = LV.endX - G.px;
      if (toEnd < 300) sp = sp * Math.max(0.05, toEnd / 300);
      const prevPx = G.px;
      G.px = Math.min(LV.endX, G.px + sp * dt);
      for (const h of LV.rollers) placeRoller(h, G.px);
      // 月洞门：穿过去天色自己翻转
      for (const mg of LV.moongates) {
        if (prevPx < mg.x && G.px >= mg.x) {
          const from = G.world;
          setWorld(other(G.world));
          G.wipe = { from, t: 0, onBeat: false, gate: true };
          G.emit('moongate', mg);
          const sb = Q.solidInBody(G.world, G.px, G.foot);
          if (sb) {
            if (G.foot - sb.y <= C.STEP_UP && !Q.solidInBody(G.world, G.px, sb.y)) { G.foot = sb.y; G.vy = 0; G.onGround = true; }
            else return fail('stuck');
          }
        }
      }
      G.phase += sp * dt * 0.075;
      for (const f of LV.ferries) if (f.on) placeFerry(f, G.px);
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
          else { G.onGround = false; G.coyote = C.COYOTE; G.vy = 0; G.airT = 0; G.hopUsed = false; }
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
          if (land !== null) { G.foot = land; G.vy = 0; G.onGround = true; G.landT = 0; G.emit('land'); }
          else G.foot = nf;
        } else G.foot = nf;
      }
      // 残荷 / 浮冰：站上去一会儿就往下沉，沉到水下就没了
      for (const sk of LV.sinkers) {
        if (sk.gone) continue;
        const on = G.onGround && G.px >= sk.x0 - C.HALF_W && G.px <= sk.x1 + C.HALF_W && Math.abs(G.foot - sk.y) < 0.6;
        if (on || sk.stood > 0) sk.stood += dt;
        if (sk.stood > SINK_DELAY) {
          sk.y += SINK_V * dt;
          if (on) G.foot = sk.y;
          if (sk.y > sk.by + 44) { sk.gone = true; sk.y = 1e4; }
        }
      }
      // 踩上船：船开始载人
      G.riding = false;
      if (G.onGround && G.world === 'day') for (const f of LV.ferries) {
        if (G.px < f.x0 - C.HALF_W || G.px > f.x1 + C.HALF_W || Math.abs(G.foot - f.y) > 0.5) continue;
        if (!f.on) { f.on = true; f.p0 = G.px; placeFerry(f, G.px); G.emit('board', f); }
        if (f.moving) G.riding = true;
      }
      if (G.foot > C.FALL_LIMIT) return fail('fall');
      // 5) 障碍 / 门
      const h = Q.hazardHit(G.world, G.px, G.foot, G.gates) || Q.rollerHit(G.world, G.px, G.foot);
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
      G.animT += dt; G.landT = (G.landT === undefined ? 9 : G.landT) + dt;
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
          coins();
          for (let i = G.cpIndex + 1; i < LV.checkpoints.length; i++) {
            if (G.px >= LV.checkpoints[i].x && G.onGround) { G.cpIndex = i; G.failStreak = 0; G.emit('checkpoint', i); }
          }
          const ri = LV.regionAt(G.px);
          if (ri !== G.regionIndex) {
            if (ri > G.regionIndex && G.graded && !G.graded[G.regionIndex]) { G.graded[G.regionIndex] = 1; G.emit('regionDone', G.regionIndex, G.grade(G.regionIndex)); }
            G.regionIndex = ri;
          }
          for (let i = 0; i < LV.regions.length; i++) {
            const k = 'r' + i;
            if (!G.shown[k] && G.px >= LV.regions[i].x0) { G.shown[k] = 1; G.emit('region', LV.regions[i], i); }
          }
          for (let i = 0; i < LV.texts.length; i++) {
            const t = LV.texts[i], k = 't' + i;
            if (G.shown[k] || G.px < t.x || G.px > t.x + 500) continue;
            G.shown[k] = 1; G.emit('hint', t.text, t.dur, t.tag);
          }
          if (G.px >= LV.endX - 1) {
            G.state = 'arrived'; G.timer = 0;
            if (G.graded && !G.graded[ri]) { G.graded[ri] = 1; G.emit('regionDone', ri, G.grade(ri)); }
            G.emit('arrive');
          }
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
    const KEYS = ['state', 'px', 'foot', 'vy', 'onGround', 'coyote', 'jumpBuf', 'world', 'cpIndex', 'pendingSwitch', 'airT', 'hopUsed', 'riding'];
    G.snapshot = function () {
      const s = {}; for (const k of KEYS) s[k] = G[k];
      s.gates = Object.assign({}, G.gates); s.got = Object.assign({}, G.got);
      s.ferries = LV.ferries.map(f => [f.on, f.p0]);
      s.sinkers = LV.sinkers.map(k => [k.y, k.stood, k.gone]);
      return s;
    };
    G.restore = function (s) {
      for (const k of KEYS) G[k] = s[k];
      G.gates = Object.assign({}, s.gates); G.got = Object.assign({}, s.got);
      LV.ferries.forEach((f, i) => { f.on = s.ferries[i][0]; f.p0 = s.ferries[i][1]; placeFerry(f, G.px); });
      LV.sinkers.forEach((k, i) => { [k.y, k.stood, k.gone] = s.sinkers[i]; });
      for (const r of LV.rollers) placeRoller(r, G.px);
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
