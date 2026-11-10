// 界面层：输入、面板、文字、声音挂接、缩放与主循环。
(function () {
  const C = RF.CFG, A = RF.Audio;
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
  let hintT = 0, hintTag = null, chapterTimer = null;
  function showHint(text, dur, tag) {
    const h = $('hint'); h.textContent = text; h.classList.add('show');
    hintT = dur; hintTag = tag || null;
  }
  function hideHint(tag) {
    if (tag && hintTag !== tag) return;
    $('hint').classList.remove('show'); hintT = 0; hintTag = null;
  }
  function showReason(main, tip) {
    const r = $('reason');
    r.querySelector('.r-main').textContent = main;
    r.querySelector('.r-tip').textContent = tip || '';
    r.classList.toggle('has-tip', !!tip);
    r.classList.add('show');
  }
  function hideReason() { $('reason').classList.remove('show'); }
  function showChapter(ch) {
    clearTimeout(chapterTimer);
    chapterTimer = setTimeout(() => showChapterNow(ch), 500);
  }
  function showChapterNow(ch) {
    const c = $('chapterCard');
    c.querySelector('.ch-no').textContent = ch.no;
    c.querySelector('.ch-name').textContent = ch.name;
    c.classList.add('show');
    clearTimeout(chapterTimer);
    chapterTimer = setTimeout(() => c.classList.remove('show'), 3400);
  }

  // ---------------------------------------------------------------- 事件 → 界面 / 声音
  G.on('world', (w, silent) => {
    A.setDream(w === 'dream');
    $('worldPill').dataset.world = w;
    $('worldName').textContent = w === 'dream' ? '梦境' : '湖岸';
    if (!silent) A.sfx('switch', w === 'dream');
  });
  G.on('intro', () => $('introLine').classList.add('show'));
  G.on('walk', () => $('introLine').classList.remove('show'));
  G.on('plate', () => A.sfx('plate'));
  G.on('deploy', () => A.sfx('deploy'));
  G.on('bridgeOpen', () => A.sfx('bridge'));
  G.on('checkpoint', () => A.sfx('checkpoint'));
  G.on('chapter', ch => { showChapter(ch); A.sfx('chapter'); });
  G.on('hint', (t, d, tag) => showHint(t, d, tag));
  G.on('hideHint', tag => hideHint(tag));
  G.on('fail', () => {
    A.sfx('fail');
    if (hintTag !== 'tutorial') hideHint();
    $('chapterCard').classList.remove('show');
  });
  G.on('ready', (label, tip) => showReason(label, tip));
  G.on('readyEnd', () => hideReason());
  G.on('arrive', () => { A.sfx('arrive'); hideHint(); clearTimeout(chapterTimer); $('chapterCard').classList.remove('show'); });
  G.on('ended', () => { $('hud').classList.add('hidden'); panelStack = []; showPanel('endScreen'); });
  G.on('paused', () => { A.pause(); panelStack = []; showPanel('pauseScreen'); });
  G.on('resumed', () => { A.resume(); A.sfx('ui'); hidePanels(); focusGame(); });

  // ---------------------------------------------------------------- 流程
  function startJourney() {
    A.unlock(); A.startMusic(); A.sfx('ui');
    hidePanels(); panelStack = [];
    hideReason(); hideHint();
    $('hud').classList.remove('hidden');
    focusGame();
    G.start();
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

  // ---------------------------------------------------------------- 输入
  const inGame = () => !['title', 'paused', 'ended'].includes(G.state);
  window.addEventListener('keydown', e => {
    const k = e.code;
    if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'Space' || e.key === 'Shift') {
      if (inGame()) { e.preventDefault(); if (!e.repeat) G.inputSwitch(); }
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
  canvas.addEventListener('pointerdown', e => {
    if (G.state === 'walking' || G.state === 'intro' || G.state === 'ready') { e.preventDefault(); G.inputSwitch(); }
  });
  // 移开浏览器焦点时自动暂停
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
    const act = b.dataset.act;
    A.unlock();
    switch (act) {
      case 'start': startJourney(); break;
      case 'again': startJourney(); break;
      case 'resume': G.resume(); break;
      case 'retry':
        A.resume(); hidePanels(); focusGame();
        G.state = 'walking';  // 从暂停直接重试本段
        G.retry();
        break;
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
    RF.FX.setScale(canvas.width / C.W, canvas.height / C.H);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- 主循环（固定步长）
  let last = performance.now(), acc = 0, frameAvg = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    // 自适应画质：持续掉帧时关闭部分装饰光效
    frameAvg = frameAvg * 0.97 + Math.min(dt, 0.1) * 0.03;
    if (!G.lowFx && frameAvg > 1 / 42 && G.state === 'walking') G.lowFx = true;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    while (acc >= C.STEP) {
      G.update(C.STEP);
      if (hintT > 0 && hintTag !== 'tutorial' && G.state !== 'paused') { hintT -= C.STEP; if (hintT <= 0) hideHint(); }
      acc -= C.STEP;
    }
    // 标题页：镜头沿湖岸缓缓移动
    const camPx = G.state === 'title' ? 700 + Math.sin(G.animT * 0.05) * 400 : G.px;
    RF.Renderer.draw(G, { camPx });
  }
  refreshToggles();
  requestAnimationFrame(frame);

  // 供自动化试玩使用
  RF.debug = { G, start: startJourney, toTitle };
})();
