// 游戏逻辑（不碰 DOM、不发声音）：状态机、通行判定、机关、检查点。
// 界面、声音通过事件订阅：G.on('fail', fn) 等。
(function () {
  const C = RF.CFG, LV = RF.LEVEL, U = RF.U;
  const other = w => (w === 'real' ? 'dream' : 'real');

  RF.REASONS = {
    deploying: '桥还在展开',
    gap: '这边的路还没接上',
    blocked: '前方被挡住了'
  };
  RF.TIPS = {
    deploying: '等桥完整亮起、听到清脆的提示音，再切换。',
    gap: '先看另一边的路是否完整；发光石板会让对面的桥展开。',
    blocked: '在碰到障碍之前，按 Shift 走到另一边。'
  };

  function createGame() {
    const handlers = {};
    const G = {
      // 状态：title | intro | walking | failing | ready | paused | arrived | ended
      state: 'title', prevState: null,
      px: 0, world: 'real', phase: 0, speedNow: 0,
      animT: 0, timer: 0, readyDur: 0,
      cpIndex: 0,
      bridges: {}, firedPlates: new Set(),
      // 表现用状态
      links: [], afterimage: null, switchFx: 0, fade: 0, playerAlpha: 1, alignExtra: 0, flashes: {},
      pendingSwitch: false, failReason: null, failStreak: 0, lastFail: null,
      shown: new Set(), tutorialDone: false,
      reduceMotion: false,
      stats: { fails: 0, switches: 0, retries: 0, time: 0 },

      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      emit(ev, ...a) { (handlers[ev] || []).forEach(fn => fn(...a)); }
    };

    // ------------------------------------------------------------ 通行判定
    G.hazardAt = function (world, x) {
      for (const h of LV.holes[world]) {
        if (x > h.x0 && x < h.x1) {
          if (h.bridge) {
            const s = G.bridges[h.bridge];
            if (s.state === 'open') return null;
            if (s.state === 'deploying') return 'deploying';
          }
          return 'gap';
        }
      }
      for (const o of LV.obstacles) {
        if (o.world === world && x + C.HALF_W > o.x && x - C.HALF_W < o.x + o.w) return 'blocked';
      }
      return null;
    };

    function setWorld(w, silent) {
      G.world = w;
      G.emit('world', w, !!silent);
    }

    G.loadCheckpoint = function (i) {
      const cp = LV.checkpoints[i];
      G.cpIndex = i;
      G.px = cp.x;
      setWorld(cp.world, true);
      for (const b of LV.bridges) {
        if (cp.preopen.includes(b.id)) G.bridges[b.id] = { state: 'open', t: C.BRIDGE_DEPLOY };
        else if (b.x1 > cp.x) G.bridges[b.id] = { state: 'closed', t: 0 };
        else G.bridges[b.id] = { state: 'open', t: C.BRIDGE_DEPLOY };
      }
      for (const p of LV.plates) {
        if (p.x >= cp.x) G.firedPlates.delete(p.id); else G.firedPlates.add(p.id);
      }
      G.links = []; G.afterimage = null; G.switchFx = 0; G.flashes = {};
      G.playerAlpha = 1; G.pendingSwitch = false;
    };

    G.reset = function () {
      G.shown.clear(); G.tutorialDone = false;
      G.failStreak = 0; G.lastFail = null; G.alignExtra = 0;
      G.stats = { fails: 0, switches: 0, retries: 0, time: 0 };
      G.loadCheckpoint(0);
      G.phase = 0;
    };

    // ------------------------------------------------------------ 流程
    G.start = function () {
      G.reset();
      G.state = 'intro'; G.timer = 0;
      G.emit('intro');
    };
    function beginWalking() { G.state = 'walking'; G.emit('walk'); }

    function enterReady(dur, label, tip) {
      G.state = 'ready'; G.timer = 0; G.readyDur = dur;
      G.emit('ready', label, tip);
    }
    function endReady() { G.fade = 0; G.state = 'walking'; G.emit('readyEnd'); }

    function fail(reason) {
      G.state = 'failing'; G.timer = 0;
      G.failReason = reason;
      G.stats.fails++;
      G.failStreak = G.lastFail === reason ? G.failStreak + 1 : 1;
      G.lastFail = reason;
      G.emit('fail', reason);
    }

    G.retry = function () {
      G.stats.retries++;
      G.loadCheckpoint(G.cpIndex);
      G.fade = 0.6;
      enterReady(C.READY, '回到最近的检查点', '');
    };

    G.pause = function () {
      if (!['walking', 'ready', 'intro', 'failing'].includes(G.state)) return false;
      G.prevState = G.state; G.state = 'paused';
      G.emit('paused');
      return true;
    };
    G.resume = function () {
      if (G.state !== 'paused') return;
      const prev = G.prevState;
      G.emit('resumed');
      if (prev === 'walking' || prev === 'ready') enterReady(C.RESUME_READY, '准备', '');
      else G.state = prev;
    };

    // 输入（由界面层调用）
    G.inputSwitch = function () {
      switch (G.state) {
        case 'intro': beginWalking(); break;
        case 'walking': G.pendingSwitch = true; break;
        case 'ready': if (G.timer > 0.15) endReady(); break;   // 跳过失误说明，不切换
      }
    };
    G.inputRetry = function () {
      if (G.state === 'walking') G.retry();
      else if (G.state === 'ready' && G.timer > 0.15) endReady();
    };

    // ------------------------------------------------------------ 更新
    G.update = function (dt) {
      if (G.state === 'paused') return;
      G.animT += dt;
      if (G.state === 'title' || G.state === 'ended') return;
      G.stats.time += dt;
      if (G.switchFx > 0) G.switchFx = Math.max(0, G.switchFx - dt);
      if (G.afterimage) { G.afterimage.t -= dt; if (G.afterimage.t <= 0) G.afterimage = null; }
      for (const ln of G.links) ln.t -= dt;
      G.links = G.links.filter(l => l.t > 0);
      for (const k in G.flashes) { G.flashes[k] -= dt; if (G.flashes[k] <= 0) delete G.flashes[k]; }

      // 桥展开计时（暂停时冻结）
      for (const b of LV.bridges) {
        const s = G.bridges[b.id];
        if (s.state === 'deploying') {
          s.t += dt;
          if (s.t >= C.BRIDGE_DEPLOY) {
            s.state = 'open'; s.t = C.BRIDGE_DEPLOY;
            G.flashes[b.id] = 1.0;
            G.emit('bridgeOpen', b);
            if (b.hint && !G.shown.has('bh:' + b.id)) { G.shown.add('bh:' + b.id); G.emit('hint', b.hint, 3); }
          }
        }
      }

      switch (G.state) {
        case 'intro':
          G.speedNow = 0;
          G.timer += dt;
          if (G.timer >= C.INTRO_TIME) beginWalking();
          break;

        case 'walking': {
          // 1) 先应用有效切换，再按切换后的世界检查危险
          if (G.pendingSwitch) {
            G.pendingSwitch = false;
            G.afterimage = { world: G.world, t: 0.45 };
            setWorld(other(G.world));
            G.switchFx = 0.6;
            G.stats.switches++;
            if (!G.tutorialDone) { G.tutorialDone = true; G.emit('hideHint', 'tutorial'); }
          }
          // 2) 前进（终点前缓缓停下）
          const prev = G.px;
          let sp = C.SPEED;
          const toEnd = LV.endX - G.px;
          if (toEnd < 320) sp = C.SPEED * Math.max(0.06, toEnd / 320);
          G.speedNow = sp;
          G.px = Math.min(LV.endX, G.px + sp * dt);
          G.phase += sp * dt * 0.085;

          // 3) 石板
          for (const p of LV.plates) {
            if (p.world === G.world && !G.firedPlates.has(p.id) && prev < p.x && G.px >= p.x) {
              G.firedPlates.add(p.id);
              G.flashes[p.id] = 1.0;
              const s = G.bridges[p.bridge];
              if (s.state === 'closed') { s.state = 'deploying'; s.t = 0; G.emit('deploy'); }
              G.links.push({ plate: p, bridge: LV.bridges.find(b => b.id === p.bridge), t: 1.4 });
              G.emit('plate', p);
            }
          }
          // 4) 检查点（切换世界本身不创建检查点）
          for (let i = G.cpIndex + 1; i < LV.checkpoints.length; i++) {
            if (G.px >= LV.checkpoints[i].x) { G.cpIndex = i; G.failStreak = 0; G.flashes['cp' + i] = 1.2; G.emit('checkpoint', i); }
          }
          // 5) 章节与提示
          for (const ch of LV.chapters) {
            const key = 'ch:' + ch.x;
            if (!G.shown.has(key) && G.px >= ch.x) { G.shown.add(key); G.emit('chapter', ch); }
          }
          for (const t of LV.texts) {
            const key = 'tx:' + t.x;
            if (G.shown.has(key) || G.px < t.x || G.px > t.x + 600) continue;
            G.shown.add(key);
            if (t.tutorial && G.tutorialDone) continue;
            G.emit('hint', t.text, t.dur, t.tutorial ? 'tutorial' : null);
          }
          // 6) 通行检查
          const hz = G.hazardAt(G.world, G.px);
          if (hz) { fail(hz); break; }
          // 7) 抵达
          if (G.px >= LV.endX - 1) { G.state = 'arrived'; G.timer = 0; G.speedNow = 0; G.emit('arrive'); }
          break;
        }

        case 'failing':
          G.speedNow = 0;
          G.timer += dt;
          G.fade = U.clamp(G.timer / C.FAIL_FADE, 0, 1);
          G.playerAlpha = 1 - G.fade * 0.8;
          G.px -= 30 * dt; // 短暂退回
          if (G.timer >= C.FAIL_FADE) {
            G.loadCheckpoint(G.cpIndex);
            G.fade = 1;
            enterReady(C.READY, RF.REASONS[G.failReason], G.failStreak >= 2 ? RF.TIPS[G.failReason] : '');
          }
          break;

        case 'ready':
          G.speedNow = 0;
          G.timer += dt;
          G.fade = Math.max(0, G.fade - dt / 0.4);
          if (G.timer >= G.readyDur) endReady();
          break;

        case 'arrived':
          G.timer += dt;
          G.alignExtra = U.clamp(G.timer / 2.5, 0, 1);
          if (G.timer > 3.8) { G.state = 'ended'; G.emit('ended'); }
          break;
      }
    };

    // 自动化试玩：按固定步长快速模拟
    G.simulate = function (sec, policy) {
      const n = Math.round(sec / C.STEP);
      for (let i = 0; i < n; i++) { if (policy) policy(G); G.update(C.STEP); if (G.state === 'ended') return i * C.STEP; }
      return n * C.STEP;
    };

    G.reset();
    return G;
  }

  RF.createGame = createGame;
})();
