// 界面层：输入、面板、文字、声音挂接、缩放与主循环。
(function () {
  const C = RF.CFG, A = RF.Audio, LV = RF.LEVEL;
  const $ = id => document.getElementById(id);
  const G = RF.createGame();
  RF.G = G;
  G.debug = /[?&]debug/.test(location.search);
  try { G.reduceMotion = localStorage.getItem('between-reflections:reduce') === 'on'; } catch (e) { }

  const stage = $('stage'), canvas = $('game');
  RF.FX.init(canvas);

  // ---------------------------------------------------------------- 面板
  let panelStack = [];
  function showPanel(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', p.id === id));
    const f = document.querySelector('#' + id + ' .primary, #' + id + ' .strong');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  }
  function hidePanels() { document.querySelectorAll('.panel').forEach(p => p.classList.remove('show')); }
  function currentPanel() { const p = document.querySelector('.panel.show'); return p ? p.id : null; }
  function openSub(id) { panelStack.push(currentPanel()); showPanel(id); }
  function back() { const prev = panelStack.pop(); if (prev) showPanel(prev); else hidePanels(); }

  // ---------------------------------------------------------------- 文字
  let hintT = 0, chapterTimer = null;
  function showHint(text, dur) { const h = $('hint'); h.textContent = text; h.classList.add('show'); hintT = dur; }
  function hideHint() { $('hint').classList.remove('show'); hintT = 0; }
  function showReason(main, tip) {
    const r = $('reason');
    r.querySelector('.r-main').textContent = main;
    r.querySelector('.r-tip').textContent = tip || '';
    r.classList.toggle('has-tip', !!tip);
    r.classList.add('show');
  }
  function hideReason() { $('reason').classList.remove('show'); }
  function showChapter(reg) {
    const c = $('chapterCard');
    c.querySelector('.ch-no').textContent = reg.no;
    c.querySelector('.ch-name').textContent = reg.name;
    c.querySelector('.ch-line').textContent = reg.line;
    c.classList.add('show');
    clearTimeout(chapterTimer);
    chapterTimer = setTimeout(() => c.classList.remove('show'), 3200);
  }
  function setLanterns() { $('lanternCount').textContent = G.lanternCount() + ' / ' + LV.lanterns.length; }

  // ---------------------------------------------------------------- 事件 → 界面 / 声音
  G.on('world', w => {
    A.setNight(w === 'night');
    $('worldPill').dataset.world = w;
    $('worldName').textContent = w === 'night' ? '夜晚' : '白天';
  });
  G.on('switched', (w, onBeat) => A.sfx('switch', { night: w === 'night', onBeat }));
  G.on('intro', () => $('introLine').classList.add('show'));
  G.on('run', () => $('introLine').classList.remove('show'));
  G.on('jump', () => A.sfx('jump'));
  G.on('land', () => A.sfx('land'));
  G.on('bell', () => A.sfx('bell'));
  G.on('lantern', () => { A.sfx('lantern'); setLanterns(); });
  G.on('checkpoint', () => A.sfx('checkpoint'));
  const WNAME = { clear: '晴', rain: '雨', snow: '雪', fog: '雾', wind: '风' };
  function setWeather() {
    const w = G.weatherAt(G.px);
    $('weatherName').textContent = WNAME[w] || '晴';
    $('weatherPill').dataset.weather = w;
    A.setWeather(w);
  }
  G.on('region', reg => { showChapter(reg); A.sfx('region'); setWeather(); });
  G.on('hint', (t, d) => showHint(t, d));
  G.on('fail', () => { A.sfx('fail'); hideHint(); $('chapterCard').classList.remove('show'); });
  G.on('ready', (label, tip) => { showReason(label, tip); setLanterns(); setWeather(); });
  G.on('readyEnd', () => hideReason());
  G.on('arrive', () => { A.sfx('arrive'); hideHint(); });
  G.on('ended', () => {
    $('hud').classList.add('hidden'); panelStack = [];
    const s = G.stats, m = Math.floor(s.time / 60), sec = Math.round(s.time % 60);
    $('endLanterns').textContent = G.lanternCount() + ' / ' + LV.lanterns.length;
    $('endFails').textContent = s.fails;
    $('endTime').textContent = m + ' 分 ' + String(sec).padStart(2, '0') + ' 秒';
    showPanel('endScreen');
  });
  G.on('paused', () => { A.pause(); panelStack = []; showPanel('pauseScreen'); });
  G.on('resumed', () => { A.resume(); A.sfx('ui'); hidePanels(); focusGame(); });

  // ---------------------------------------------------------------- 流程
  function startJourney() {
    A.unlock(); A.sfx('ui');
    hidePanels(); panelStack = [];
    hideReason(); hideHint();
    $('hud').classList.remove('hidden');
    focusGame();
    G.wipe = null;
    G.start();
    setLanterns();
    if (startAt) { jumpTo(startAt); }
    setWeather();
  }
  function toTitle() {
    A.resume();
    G.state = 'title';
    G.reset();
    hidePanels(); hideHint(); hideReason(); panelStack = [];
    $('introLine').classList.remove('show');
    $('chapterCard').classList.remove('show');
    $('hud').classList.add('hidden');
    showPanel('titleScreen');
  }
  function focusGame() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    canvas.focus({ preventScroll: true });
  }
  // 调试：?at=区域序号（1–6）直接从该区域开始
  const atM = location.search.match(/[?&]at=(\d)/);
  const startAt = atM ? +atM[1] : 0;
  function jumpTo(n) {
    const i = LV.checkpoints.findIndex(c => c.region === n - 1);
    if (i >= 0) { G.loadCheckpoint(i); G.shown['r' + (n - 1)] = 0; }
  }

  // ---------------------------------------------------------------- 输入
  const inGame = () => !['title', 'paused', 'ended'].includes(G.state);
  window.addEventListener('keydown', e => {
    const k = e.code;
    if (k === 'ShiftLeft' || k === 'ShiftRight' || e.key === 'Shift') {
      if (inGame()) { e.preventDefault(); if (!e.repeat) G.inputSwitch(); }
    } else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
      if (inGame()) { e.preventDefault(); if (!e.repeat) G.inputJump(); }
    } else if (k === 'KeyR') {
      if (inGame() && !e.repeat) G.inputRetry();
    } else if (k === 'Escape') {
      if (e.repeat) return;
      if (G.state === 'paused' && currentPanel() === 'pauseScreen') G.resume();
      else if (inGame()) G.pause();
      else if (panelStack.length) back();
    } else if (k === 'Enter' && G.state === 'title' && document.activeElement === document.body) {
      startJourney();
    }
  });
  // 触屏 / 鼠标：左半屏切换，右半屏跳
  canvas.addEventListener('pointerdown', e => {
    if (!inGame()) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 2) G.inputSwitch(); else G.inputJump();
  });
  window.addEventListener('blur', () => G.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.pause(); });

  function refreshToggles() {
    document.querySelectorAll('[data-act="sound"]').forEach(b => {
      b.setAttribute('aria-pressed', A.enabled);
      if (b.classList.contains('pill')) b.textContent = '声音 ' + (A.enabled ? '开' : '关');
    });
    document.querySelectorAll('[data-act="reduce"]').forEach(b => b.setAttribute('aria-pressed', G.reduceMotion));
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    A.unlock();
    switch (b.dataset.act) {
      case 'start': case 'again': startJourney(); break;
      case 'resume': G.resume(); break;
      case 'retry': A.resume(); hidePanels(); focusGame(); G.state = 'running'; G.retry(); break;
      case 'title': A.sfx('ui'); toTitle(); break;
      case 'pause': G.pause(); break;
      case 'sound': A.setEnabled(!A.enabled); refreshToggles(); A.sfx('ui'); break;
      case 'reduce':
        G.reduceMotion = !G.reduceMotion;
        try { localStorage.setItem('between-reflections:reduce', G.reduceMotion ? 'on' : 'off'); } catch (err) { }
        refreshToggles(); A.sfx('ui'); break;
      case 'help': A.sfx('ui'); openSub('helpScreen'); break;
      case 'credits': A.sfx('ui'); openSub('creditsScreen'); break;
      case 'back': A.sfx('ui'); back(); break;
    }
  });

  // ---------------------------------------------------------------- 缩放
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / C.W, vh / C.H);
    const w = Math.floor(C.W * s), h = Math.floor(C.H * s);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    stage.style.setProperty('--u', (w / C.W) + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    RF.FX.setOut(canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- 主循环（固定步长）
  let last = performance.now(), acc = 0, frameAvg = 1 / 60, titleFlip = 0;
  const dbg = $('debug');
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    frameAvg = frameAvg * 0.97 + Math.min(dt, 0.1) * 0.03;
    if (!G.lowFx && frameAvg > 1 / 40 && G.state === 'running') G.lowFx = true;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    while (acc >= C.STEP) {
      G.update(C.STEP);
      if (hintT > 0 && G.state === 'running') { hintT -= C.STEP; if (hintT <= 0) hideHint(); }
      // 标题页：每隔几秒自己翻一次昼夜
      if (G.state === 'title' && !G.reduceMotion) {
        titleFlip += C.STEP;
        if (titleFlip > 5.5) { titleFlip = 0; const from = G.world; G.world = from === 'day' ? 'night' : 'day'; G.wipe = { from, t: 0 }; }
      }
      acc -= C.STEP;
    }
    const rid = LV.regions[LV.regionAt(G.px)].id;
    A.tick(G.beat(), G.state === 'running', rid);
    const title = G.state === 'title';
    const camPx = title ? 1400 + Math.sin(G.animT * 0.04) * 900 : G.px;
    RF.Renderer.draw(G, { camPx, title, noGhost: title });
    if (G.debug && dbg) dbg.textContent = `x ${Math.round(G.px)} · 拍 ${G.beat().toFixed(2)} · ${G.world} · 脚 ${Math.round(G.foot)} · 检查点 ${G.cpIndex} · ${G.state}`;
  }
  if (G.debug && dbg) dbg.hidden = false;
  refreshToggles();
  G.rollWeather();
  // 先载入背景与像素素材，再开放“开始”
  const btn = $('btnStart');
  btn.disabled = true; btn.textContent = '载入中…';
  RF.Regions.load(() => { btn.disabled = false; btn.textContent = '开始旅行'; });
  requestAnimationFrame(frame);

  RF.debug = { G, start: startJourney, toTitle, jumpTo };
})();
