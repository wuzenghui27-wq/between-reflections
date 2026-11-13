// 界面层：输入、面板、文字、声音挂接、缩放与主循环。
(function () {
  const C = RF.CFG, A = RF.Audio, LV = RF.LEVEL;
  const $ = id => document.getElementById(id);
  const G = RF.createGame();
  RF.G = G;
  G.debug = /[?&]debug/.test(location.search);
  try { G.reduceMotion = localStorage.getItem('between-reflections:reduce') === 'on'; } catch (e) { }

  const stage = $('stage'), canvas = $('game');
  // 舞台不该滚动（焦点落到面板里的按钮时浏览器会自己滚一下）
  stage.addEventListener('scroll', () => { if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; } });
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
  // 提示条：宣纸小签，左边一方朱印（画的是要做的动作：日月互换 / 向上一跃 / 一只眼睛表示“看”），
  // 句子里的按键换成键帽，底下一道朱线随时间缩短。
  const esc = t => t.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  function showHint(text, dur, tag) {
    const h = $('hint');
    const seal = /Shift|切/.test(text) ? 'swap' : /空格|跳/.test(text) ? 'leap' : 'look';
    const body = esc(text).replace(/Shift/g, '<kbd>Shift</kbd>').replace(/空格（或 ↑）/g, '<kbd>空格</kbd>');
    h.innerHTML = `<i class="seal seal-${seal}" aria-hidden="true"></i><span class="hint-text">${body}</span><b class="hint-timer" style="animation-duration:${dur}s"></b>`;
    h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); hintT = dur;
  }
  function hideHint() { $('hint').classList.remove('show'); hintT = 0; }
  function showChapter(reg) {
    const c = $('chapterCard');
    c.querySelector('.ch-no').textContent = reg.no;
    c.querySelector('.ch-name').textContent = reg.name;
    c.querySelector('.ch-line').textContent = reg.line;
    c.classList.add('show');
    clearTimeout(chapterTimer);
    chapterTimer = setTimeout(() => c.classList.remove('show'), 3200);
  }
  // ---------------------------------------------------------------- 唐诗：旅途中随机浮现
  const MT = RF.Meta;
  let poemT = 0, poemUsed = {};
  const nextPoemIn = () => 16 + Math.random() * 18;          // 每隔十几到三十几秒，在空闲时浮现一联
  function showPoem() {
    const rid = LV.regions[LV.regionAt(G.px)].id;
    const [line, title, author] = MT.pick(rid, poemUsed);
    const el = $('poemLine');
    el.querySelector('.pl-text').innerHTML = line.split('，').join('<br>');
    el.querySelector('.pl-src').innerHTML = '《' + title + '》 ' + author;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function tickPoem(dt) {
    if (G.state !== 'running') return;
    poemT -= dt;
    if (poemT > 0) return;
    // 有提示、站名卡、印章正在显示时先等一等
    if ($('hint').classList.contains('show') || $('chapterCard').classList.contains('show') || $('stamp').classList.contains('show')) { poemT = 2; return; }
    showPoem(); poemT = nextPoemIn();
  }
  function setLanterns() { $('lanternCount').textContent = G.lanternCount() + ' / ' + LV.lanterns.length; }

  // ---------------------------------------------------------------- 事件 → 界面 / 声音
  G.on('world', w => {
    A.setNight(w === 'night');
    $('worldPill').dataset.world = w;
    $('worldName').textContent = w === 'night' ? '夜晚' : '白天';
  });
  G.on('switched', w => A.sfx('switch', { night: w === 'night', onBeat: false }));
  G.on('blocked', () => A.sfx('layerDown'));                 // 另一面这里是实心的，切不过去
  G.on('intro', () => $('introLine').classList.add('show'));
  G.on('run', () => $('introLine').classList.remove('show'));
  // 粒子与手感
  const PT = RF.Particles;
  const DUST = { jiangnan: ['#b5b7b0', '#8a8c8c'], garden: ['#f4f1ea', '#c9c4b8'], autumn: ['#c8a070', '#d0682a', '#8a9a3a'],
    wall: ['#c0a888', '#8a6a4c'], glacier: ['#ffffff', '#c8e4f4'], tibet: ['#ffffff', '#dfe6ee'] };
  const dustCols = () => DUST[LV.regions[LV.regionAt(G.px)].id] || ['#cccccc'];
  G.on('jump', () => { A.sfx('jump'); PT.dust(G.px, G.foot, 6, dustCols(), 0.6); });
  G.on('land', () => { A.sfx('land'); PT.dust(G.px, G.foot, 8, dustCols(), 0.8); });
  G.on('bell', b => { A.sfx('bell'); if (b) PT.sparks(b.x, b.y, '#ffe08a', 10); });
  G.on('lantern', l => {
    A.sfx('lantern'); setLanterns();
    PT.sparks(l.x, l.y, '#ffd27a', 14);
    const p = $('lanternPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump');
  });
  // 这一关的灯亮了：院门打开，音乐加一层
  G.on('roomClear', r => {
    setTimeout(() => A.sfx('checkpoint'), 260);
    A.setLayer(3);
    PT.sparks(r.x0 + 1225, r.exitY - 70, '#ffe8a8', 16);
    G.keyTip = null;
  });
  G.on('room', r => {
    A.setLayer(G.room === 0 ? 1 : 2);
    $('roomName').textContent = '第 ' + (r.i + 1) + ' 景 · ' + r.name;
    const p = $('roomPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump');
    setLanterns(); hideHint(); G.keyTip = null;
  });
  const WNAME = { clear: '晴', rain: '雨', snow: '雪', fog: '雾', wind: '风' };
  function setWeather() {
    const w = G.weatherAt(G.px);
    $('weatherName').textContent = WNAME[w] || '晴';
    $('weatherPill').dataset.weather = w;
    $('weatherIcon').src = 'assets/ui/' + (w || 'clear') + '.png';
    A.setWeather(w);
  }
  G.on('region', reg => { showChapter(reg); A.sfx('region'); setWeather(); });
  G.on('hint', (t, d, tag) => {
    showHint(t, d, tag);
    // 只有第一关在河边立一块 Shift 键帽，其余的关让人自己琢磨
    G.keyTip = tag === 'switch' && !touchUI ? { key: 'k_shift', tag, t: 30 } : null;
  });
  G.on('switched', () => { if (G.keyTip) G.keyTip.t = 0; });
  // 掉进水里：溅一下水，回到这一关开头
  G.on('fail', () => { A.sfx('board'); PT.splash(G.px, C.GROUND + 30, 'rgba(230,240,255,0.9)'); });
  G.on('retry', () => { setLanterns(); });
  G.on('arrive', () => { A.sfx('arrive'); hideHint(); });
  G.on('ended', () => {
    $('hud').classList.add('hidden'); panelStack = []; $('chapterCard').classList.remove('show'); $('poemLine').classList.remove('show');
    hideHint(); G.keyTip = null;
    const s = G.stats, m = Math.floor(s.time / 60), sec = Math.round(s.time % 60);
    $('endLanterns').textContent = G.lanternCount() + ' / ' + LV.lanterns.length;
    $('endSwitches').textContent = s.switches;
    $('endTime').textContent = m + ' 分 ' + String(sec).padStart(2, '0') + ' 秒';
    showPanel('endScreen');
  });
  G.on('paused', () => { A.pause(); panelStack = []; showPanel('pauseScreen'); });
  G.on('resumed', () => { A.resume(); A.sfx('ui'); hidePanels(); focusGame(); });

  // ---------------------------------------------------------------- 旅程进度条：六站
  const jr = $('journey');
  jr.querySelector('.stops').innerHTML = LV.rooms.map(r => `<i style="left:${(r.x0 / LV.totalX * 100).toFixed(2)}%" title="${r.name}"></i>`).join('') + '<i class="end" style="left:100%"></i>';
  let lastP = -1;
  function setJourney() {
    const p = Math.max(0, Math.min(1, G.px / LV.totalX));
    if (Math.abs(p - lastP) < 0.0008) return;
    lastP = p;
    jr.style.setProperty('--p', (p * 100).toFixed(2) + '%');
    jr.querySelectorAll('.stops i').forEach((el, i) => el.classList.toggle('done', i <= G.room));
  }

  // ---------------------------------------------------------------- 流程
  function startJourney() {
    A.unlock(); A.sfx('ui');
    hidePanels(); panelStack = [];
    hideHint();
    $('hud').classList.remove('hidden');
    focusGame();
    G.wipe = null;
    RF.Particles.clear();
    G.start();
    poemUsed = {}; poemT = 9 + Math.random() * 8; $('poemLine').classList.remove('show');
    A.setLayer(1);
    setLanterns();
    if (startAt) { jumpTo(startAt); }
    setWeather();
  }
  function toTitle() {
    A.resume();
    G.state = 'title';
    G.reset();
    hidePanels(); hideHint(); panelStack = []; $('poemLine').classList.remove('show');
    $('introLine').classList.remove('show');
    $('chapterCard').classList.remove('show');
    $('hud').classList.add('hidden');
    showPanel('titleScreen');
  }
  function focusGame() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    canvas.focus({ preventScroll: true });
  }
  // 调试：?at=第几景，直接从那一关开始
  const atM = location.search.match(/[?&]at=(\d+)/);
  const startAt = atM ? +atM[1] : 0;
  function jumpTo(n) { if (LV.rooms[n - 1]) { G.loadRoom(n - 1); G.shown['r' + LV.rooms[n - 1].region] = 0; } }

  // ---------------------------------------------------------------- 输入
  const inGame = () => !['title', 'paused', 'ended'].includes(G.state);
  const LEFT = { ArrowLeft: 1, KeyA: 1 }, RIGHT = { ArrowRight: 1, KeyD: 1 }, JUMP = { Space: 1, ArrowUp: 1, KeyW: 1 };
  window.addEventListener('keydown', e => {
    const k = e.code;
    if (k === 'ShiftLeft' || k === 'ShiftRight' || e.key === 'Shift') {
      if (inGame()) { e.preventDefault(); if (!e.repeat) G.inputSwitch(); }
    } else if (LEFT[k] || RIGHT[k]) {
      if (inGame()) { e.preventDefault(); if (!e.repeat) G.inputMove(LEFT[k] ? -1 : 1, true); }
    } else if (JUMP[k]) {
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
  window.addEventListener('keyup', e => {
    const k = e.code;
    if (LEFT[k] || RIGHT[k]) G.inputMove(LEFT[k] ? -1 : 1, false);
    else if (JUMP[k] && inGame()) G.inputJumpRelease();
  });
  // 触屏：左下角两个方向键，右下角“昼夜”和“跳”
  let touchUI = false;
  const pad = $('pad');
  function useTouch() { if (!touchUI) { touchUI = true; stage.classList.add('touch'); G.keyTip = null; } }
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) useTouch();
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') useTouch(); }, true);
  pad.querySelectorAll('[data-pad]').forEach(b => {
    const act = b.dataset.pad;
    const down = e => {
      e.preventDefault(); A.unlock(); b.classList.add('on');
      if (!inGame()) return;
      if (act === 'l') G.inputMove(-1, true); else if (act === 'r') G.inputMove(1, true);
      else if (act === 's') G.inputSwitch(); else G.inputJump();
    };
    const up = e => {
      e.preventDefault(); b.classList.remove('on');
      if (act === 'l') G.inputMove(-1, false); else if (act === 'r') G.inputMove(1, false);
      else if (act === 'j' && inGame()) G.inputJumpRelease();
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  // 开场那句话：点一下画面也能开始
  canvas.addEventListener('pointerdown', e => { if (G.state === 'intro') { e.preventDefault(); G.inputJump(); } });
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
      if (G.state !== 'paused') {
        RF.Particles.update(C.STEP);
        tickPoem(C.STEP);
        if (G.keyTip) G.keyTip.t -= G.state === 'running' ? C.STEP : 0;
      }
      if (hintT > 0 && G.state === 'running') { hintT -= C.STEP; if (hintT <= 0) hideHint(); }
      // 标题页：每隔几秒自己翻一次昼夜
      if (G.state === 'title' && !G.reduceMotion) {
        titleFlip += C.STEP;
        if (titleFlip > 5.5) { titleFlip = 0; const from = G.world; G.world = from === 'day' ? 'night' : 'day'; G.wipe = { from, t: 0 }; }
      }
      acc -= C.STEP;
    }
    const rid = LV.regions[LV.regionAt(G.px)].id;
    A.tick(G.beat(), G.state === 'running', rid, LV.paceAt(G.px));
    const title = G.state === 'title';
    const camPx = title ? 1900 + Math.sin(G.animT * 0.04) * 900 : G.camX + C.PLAYER_SX;
    RF.Renderer.draw(G, { camPx, title, noGhost: title });
    if (!title) setJourney();
    if (G.debug && dbg) dbg.textContent = `x ${Math.round(G.px)} · 拍 ${G.beat().toFixed(2)} · ${G.world} · 脚 ${Math.round(G.foot)} · 第 ${G.room + 1} 景 · 钟 ${G.dclock.toFixed(1)} · ${G.state}`;
  }
  if (G.debug && dbg) dbg.hidden = false;
  refreshToggles();
  G.rollWeather();
  // 先载入背景与像素素材，再开放“开始”
  const btn = $('btnStart');
  btn.disabled = true; btn.textContent = '载入中…';
  RF.Regions.load(() => { btn.disabled = false; btn.textContent = '开始旅行'; });
  requestAnimationFrame(frame);

  RF.debug = { G, start: startJourney, toTitle, jumpTo, showPoem };
})();
