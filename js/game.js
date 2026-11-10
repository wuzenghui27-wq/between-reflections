// 游戏逻辑：状态机、通行判定、机关、检查点、输入与界面。
(function () {
  const C = RF.CFG, LV = RF.LEVEL, A = RF.Audio, U = RF.U;
  const other = w => (w === 'real' ? 'dream' : 'real');
  const $ = id => document.getElementById(id);

  const REASONS = {
    deploying: '桥还在展开',
    gap: '这边的路还没接上',
    blocked: '前方被挡住了'
  };
  const TIPS = {
    deploying: '等桥变成实线、听到清脆的提示音，再切换。',
    gap: '先看另一边的路是否完整；发光石板会让对面的桥展开。',
    blocked: '在碰到障碍之前，按 Shift 走到另一边。'
  };

  let reduce = false;
  try { reduce = localStorage.getItem('between-reflections:reduce') === 'on'; } catch (e) { }

  // ---------------------------------------------------------------- 状态
  const G = {
    state: 'title',      // title | intro | walking | failing | ready | paused | arrived | ended
    prevState: null,
    px: 0, world: 'real', phase: 0, speedNow: 0,
    animT: 0, timer: 0,
    cpIndex: 0,
    bridges: {}, firedPlates: new Set(),
    links: [], afterimage: null, switchFx: 0, fade: 0, playerAlpha: 1, showPlayer: true,
    pendingSwitch: false, failReason: null, failStreak: 0, lastFail: null,
    shown: new Set(), tutorialDone: false,
    alignExtra: 0,
    reduceMotion: reduce,
    debug: /[?&]debug/.test(location.search),
    stats: { fails: 0, switches: 0, retries: 0, time: 0 }
  };
  RF.G = G;

  // ---------------------------------------------------------------- 通行判定
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

  function resetBridgesFor(cp) {
    for (const b of LV.bridges) {
      if (cp.preopen.includes(b.id)) G.bridges[b.id] = { state: 'open', t: C.BRIDGE_DEPLOY };
      else if (b.x1 > cp.x) G.bridges[b.id] = { state: 'closed', t: 0 };
      else G.bridges[b.id] = { state: 'open', t: C.BRIDGE_DEPLOY };
    }
    for (const p of LV.plates) {
      if (p.x >= cp.x) G.firedPlates.delete(p.id); else G.firedPlates.add(p.id);
    }
  }

  function loadCheckpoint(i) {
    const cp = LV.checkpoints[i];
    G.cpIndex = i;
    G.px = cp.x;
    setWorld(cp.world, true);
    resetBridgesFor(cp);
    G.links = []; G.afterimage = null; G.switchFx = 0;
    G.playerAlpha = 1; G.pendingSwitch = false;
  }

  function setWorld(w, silent) {
    G.world = w;
    A.setDream(w === 'dream');
    const pill = $('worldPill');
    pill.dataset.world = w;
    $('worldName').textContent = w === 'dream' ? '梦境' : '湖岸';
    if (!silent) A.sfx('switch', w === 'dream');
  }

  // ---------------------------------------------------------------- 流程
  function newGame() {
    G.shown.clear(); G.tutorialDone = false;
    G.failStreak = 0; G.lastFail = null; G.alignExtra = 0;
    G.stats = { fails: 0, switches: 0, retries: 0, time: 0 };
    loadCheckpoint(0);
    G.phase = 0;
  }

  function startJourney() {
    A.unlock(); A.startMusic(); A.sfx('ui');
    newGame();
    hidePanels();
    $('hud').classList.remove('hidden');
    focusGame();
    G.state = 'intro'; G.timer = 0;
    showIntro(true);
  }

  function beginWalking() {
    showIntro(false);
    G.state = 'walking';
  }

  function fail(reason) {
    G.state = 'failing'; G.timer = 0;
    G.failReason = reason;
    G.stats.fails++;
    G.failStreak = G.lastFail === reason ? G.failStreak + 1 : 1;
    G.lastFail = reason;
    A.sfx('fail');
    if (hintTag !== 'tutorial') hideHint();
    $('chapterCard').classList.remove('show');
  }

  function enterReady(dur, label, tip) {
    G.state = 'ready'; G.timer = 0; G.readyDur = dur;
    showReason(label, tip);
  }

  function retry() {
    G.stats.retries++;
    loadCheckpoint(G.cpIndex);
    G.fade = 0.6;
    enterReady(C.READY, '回到最近的检查点', '');
  }

  function pause() {
    if (!['walking', 'ready', 'intro', 'failing'].includes(G.state)) return;
    G.prevState = G.state; G.state = 'paused';
    A.pause();
    showPanel('pauseScreen');
    const b = $('btnResume'); if (b) b.focus();
  }

  function resume() {
    if (G.state !== 'paused') return;
    A.resume(); A.sfx('ui');
    hidePanels(); focusGame();
    const prev = G.prevState;
    if (prev === 'walking' || prev === 'ready') enterReady(C.RESUME_READY, '准备', '');
    else G.state = prev;
  }

  function toTitle() {
    A.resume();
    G.state = 'title';
    hidePanels(); hideHint(); hideReason(); showIntro(false);
    $('chapterCard').classList.remove('show');
    $('hud').classList.add('hidden');
    newGame();
    showPanel('titleScreen');
    $('btnStart').focus();
  }

  // ---------------------------------------------------------------- 更新
  function update(dt) {
    if (G.state === 'title' || G.state === 'paused') {
      if (G.state === 'title') G.animT += dt;
      return;
    }
    G.animT += dt;
    G.stats.time += dt;
    if (G.switchFx > 0) G.switchFx = Math.max(0, G.switchFx - dt);
    if (G.afterimage) { G.afterimage.t -= dt; if (G.afterimage.t <= 0) G.afterimage = null; }
    for (const ln of G.links) ln.t -= dt;
    G.links = G.links.filter(l => l.t > 0);
    // 桥展开计时（只在游戏推进时计时，暂停时冻结）
    for (const b of LV.bridges) {
      const s = G.bridges[b.id];
      if (s.state === 'deploying') {
        s.t += dt;
        if (s.t >= C.BRIDGE_DEPLOY) {
          s.state = 'open'; s.t = C.BRIDGE_DEPLOY;
          A.sfx('bridge');
          if (b.hint && !G.shown.has('bh:' + b.id)) { G.shown.add('bh:' + b.id); showHint(b.hint, 3); }
        }
      }
    }
    tickHint(dt);

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
          G.afterimage = { world: G.world, t: 0.3 };
          setWorld(other(G.world));
          G.switchFx = 0.35;
          G.stats.switches++;
          if (!G.tutorialDone) { G.tutorialDone = true; hideHint('tutorial'); }
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
            const s = G.bridges[p.bridge];
            if (s.state === 'closed') { s.state = 'deploying'; s.t = 0; A.sfx('deploy'); }
            A.sfx('plate');
            G.links.push({ plate: p, bridge: LV.bridges.find(b => b.id === p.bridge), t: 1.2 });
          }
        }
        // 4) 检查点（切换世界本身不创建检查点）
        for (let i = G.cpIndex + 1; i < LV.checkpoints.length; i++) {
          if (G.px >= LV.checkpoints[i].x) { G.cpIndex = i; G.failStreak = 0; A.sfx('checkpoint'); }
        }
        // 5) 章节与提示文字
        for (const ch of LV.chapters) {
          const key = 'ch:' + ch.x;
          if (!G.shown.has(key) && G.px >= ch.x) { G.shown.add(key); showChapter(ch); }
        }
        for (const t of LV.texts) {
          const key = 'tx:' + t.x;
          if (G.shown.has(key) || G.px < t.x || G.px > t.x + 600) continue;
          if (t.tutorial && G.tutorialDone) { G.shown.add(key); continue; }
          G.shown.add(key);
          showHint(t.text, t.dur, t.tutorial ? 'tutorial' : null);
        }
        // 6) 通行检查
        const hz = G.hazardAt(G.world, G.px);
        if (hz) { fail(hz); break; }
        // 7) 抵达
        if (G.px >= LV.endX - 1) { G.state = 'arrived'; G.timer = 0; G.speedNow = 0; A.sfx('arrive'); hideHint(); }
        break;
      }

      case 'failing':
        G.speedNow = 0;
        G.timer += dt;
        G.fade = U.clamp(G.timer / C.FAIL_FADE, 0, 1);
        G.playerAlpha = 1 - G.fade * 0.8;
        G.px -= 30 * dt; // 短暂退回
        if (G.timer >= C.FAIL_FADE) {
          loadCheckpoint(G.cpIndex);
          G.fade = 1;
          enterReady(C.READY, REASONS[G.failReason], G.failStreak >= 2 ? TIPS[G.failReason] : '');
        }
        break;

      case 'ready':
        G.speedNow = 0;
        G.timer += dt;
        G.fade = Math.max(0, G.fade - dt / 0.4);
        if (G.timer >= G.readyDur) { hideReason(); G.fade = 0; G.state = 'walking'; }
        break;

      case 'arrived':
        G.timer += dt;
        G.alignExtra = U.clamp(G.timer / 2.5, 0, 1);
        if (G.timer > 3.6) {
          G.state = 'ended';
          $('hud').classList.add('hidden');
          showPanel('endScreen');
          $('btnAgain').focus();
        }
        break;
    }
  }

  // ---------------------------------------------------------------- 输入
  function onSwitchKey() {
    switch (G.state) {
      case 'intro': beginWalking(); break;
      case 'walking': G.pendingSwitch = true; break;
      case 'ready': if (G.timer > 0.15) { hideReason(); G.fade = 0; G.state = 'walking'; } break;
    }
  }
  function onRetryKey() {
    if (G.state === 'walking') retry();
    else if (G.state === 'ready' && G.timer > 0.15) { hideReason(); G.fade = 0; G.state = 'walking'; }
  }

  window.addEventListener('keydown', e => {
    const k = e.code;
    const inGame = !['title', 'paused', 'ended'].includes(G.state);
    if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'Space' || e.key === 'Shift') {
      if (inGame) { e.preventDefault(); if (!e.repeat) onSwitchKey(); }
    } else if (k === 'KeyR') {
      if (inGame && !e.repeat) onRetryKey();
    } else if (k === 'Escape') {
      if (e.repeat) return;
      if (G.state === 'paused') resume();
      else if (inGame) pause();
      else if ($('creditsScreen').classList.contains('show')) closeCredits();
    } else if (k === 'Enter' && G.state === 'title' && document.activeElement === document.body) {
      startJourney();
    }
  });

  const canvas = $('game');
  canvas.addEventListener('pointerdown', e => {
    if (G.state === 'walking' || G.state === 'intro' || G.state === 'ready') { e.preventDefault(); onSwitchKey(); }
  });

  // 移开浏览器焦点时自动暂停
  window.addEventListener('blur', () => pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  function focusGame() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    canvas.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- 界面
  function showPanel(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', p.id === id));
  }
  function hidePanels() { document.querySelectorAll('.panel').forEach(p => p.classList.remove('show')); }

  let hintT = 0, hintTag = null;
  function showHint(text, dur, tag) {
    const h = $('hint'); h.textContent = text; h.classList.add('show');
    hintT = dur; hintTag = tag || null;
  }
  function hideHint(tag) {
    if (tag && hintTag !== tag) return;
    $('hint').classList.remove('show'); hintT = 0; hintTag = null;
  }
  function tickHint(dt) {
    if (hintT > 0 && hintTag !== 'tutorial') { hintT -= dt; if (hintT <= 0) hideHint(); }
  }

  function showReason(main, tip) {
    const r = $('reason');
    r.querySelector('.r-main').textContent = main;
    r.querySelector('.r-tip').textContent = tip || '';
    r.classList.add('show');
  }
  function hideReason() { $('reason').classList.remove('show'); }

  let chapterTimer = null;
  function showChapter(ch) {
    const c = $('chapterCard');
    c.querySelector('.ch-no').textContent = ch.no;
    c.querySelector('.ch-name').textContent = ch.name;
    c.classList.add('show');
    A.sfx('chapter');
    clearTimeout(chapterTimer);
    chapterTimer = setTimeout(() => c.classList.remove('show'), 3200);
  }
  function showIntro(on) { $('introLine').classList.toggle('show', on); }

  function soundLabel() { return '声音：' + (A.enabled ? '开' : '关'); }
  function refreshToggles() {
    document.querySelectorAll('[data-act="sound"]').forEach(b => { b.textContent = soundLabel(); b.setAttribute('aria-pressed', A.enabled); });
    document.querySelectorAll('[data-act="reduce"]').forEach(b => { b.textContent = '减少装饰动画：' + (G.reduceMotion ? '开' : '关'); b.setAttribute('aria-pressed', G.reduceMotion); });
  }

  let creditsReturn = null;
  function openCredits(from) { creditsReturn = from; showPanel('creditsScreen'); $('btnCreditsBack').focus(); }
  function closeCredits() { showPanel(creditsReturn || 'titleScreen'); }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    A.unlock();
    switch (act) {
      case 'start': startJourney(); break;
      case 'resume': resume(); break;
      case 'retry':
        A.resume(); hidePanels(); focusGame();
        retry();
        break;
      case 'title': toTitle(); break;
      case 'again': A.sfx('ui'); startJourney(); break;
      case 'pause': pause(); break;
      case 'sound': A.setEnabled(!A.enabled); refreshToggles(); A.sfx('ui'); break;
      case 'reduce':
        G.reduceMotion = !G.reduceMotion;
        try { localStorage.setItem('between-reflections:reduce', G.reduceMotion ? 'on' : 'off'); } catch (err) { }
        refreshToggles(); break;
      case 'help': $('help').classList.toggle('hidden'); break;
      case 'credits': openCredits(G.state === 'ended' ? 'endScreen' : 'titleScreen'); break;
      case 'creditsBack': closeCredits(); break;
    }
    if (['resume', 'retry', 'again', 'start'].includes(act)) focusGame();
  });

  // ---------------------------------------------------------------- 画布与缩放
  const stage = $('stage');
  const ctx = canvas.getContext('2d');
  RF.Render.init(ctx);
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / C.W, vh / C.H);
    const w = Math.floor(C.W * s), h = Math.floor(C.H * s);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    stage.style.setProperty('--u', (w / C.W) + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(canvas.width / C.W, 0, 0, canvas.height / C.H, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- 主循环（固定步长）
  let last = performance.now(), acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    while (acc >= C.STEP) { update(C.STEP); acc -= C.STEP; }
    RF.Render.draw(G);
    requestAnimationFrame(frame);
  }

  newGame();
  refreshToggles();
  requestAnimationFrame(frame);

  // 供自动化试玩使用的接口
  RF.debug = {
    update, start: startJourney, switchKey: onSwitchKey, retryKey: onRetryKey,
    pause, resume, loadCheckpoint,
    simulate(sec, policy) {
      const n = Math.round(sec / C.STEP);
      for (let i = 0; i < n; i++) { if (policy) policy(G); update(C.STEP); if (G.state === 'ended') return i * C.STEP; }
      return n * C.STEP;
    }
  };
})();
