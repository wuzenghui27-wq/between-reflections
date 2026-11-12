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
  // ---------------------------------------------------------------- 唐诗：旅途中随机浮现
  const MT = RF.Meta;
  G.diff = MT.data.diff;
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
  G.on('switched', (w, onBeat) => A.sfx('switch', { night: w === 'night', onBeat }));
  G.on('chime', (cl, i, n) => A.sfx('chime', n));
  G.on('echo', (cl, i, n) => A.sfx('chime', n + 5));
  G.on('intro', () => $('introLine').classList.add('show'));
  G.on('run', () => $('introLine').classList.remove('show'));
  // 粒子与手感
  const PT = RF.Particles;
  const DUST = { jiangnan: ['#b5b7b0', '#8a8c8c'], garden: ['#f4f1ea', '#c9c4b8'], autumn: ['#c8a070', '#d0682a', '#8a9a3a'],
    wall: ['#c0a888', '#8a6a4c'], glacier: ['#ffffff', '#c8e4f4'], tibet: ['#ffffff', '#dfe6ee'] };
  const dustCols = () => DUST[LV.regions[LV.regionAt(G.px)].id] || ['#cccccc'];
  let slideN = 0;
  G.on('jump', () => { A.sfx('jump'); PT.dust(G.px, G.foot, 6, dustCols(), 0.6); });
  G.on('land', () => { A.sfx('land'); PT.dust(G.px, G.foot, 10, dustCols(), 1); RF.Renderer.kick(1.2); });
  G.on('bell', b => { A.sfx('bell'); if (b) PT.sparks(b.x, b.y + 0, '#ffe08a', 10); });
  G.on('lantern', l => {
    A.sfx('lantern'); setLanterns();
    PT.sparks(l.x, l.y, '#ffd27a', 14);
    PT.float(l.x, l.y - 30, '+1', '#ffe8a8');
    setLayer(A.layer + 1);
    const p = $('lanternPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump');
  });
  G.on('checkpoint', () => { A.sfx('checkpoint'); PT.sparks(G.px - 24, G.foot - 50, '#ffd890', 8); });
  // 铜钱：一路吃过去就是一段旋律
  function setCoins() { $('coinCount').textContent = G.coinCount(); }
  G.on('coin', (c, run) => {
    A.sfx('coin', run);
    PT.sparks(c.x, c.y, run >= 4 ? '#fff2b0' : '#ffd27a', run >= 4 ? 6 : 4);
    setCoins();
  });
  G.on('moongate', () => { A.sfx('switch', { night: G.world === 'night', onBeat: false }); PT.sparks(G.px, G.foot - 40, '#fff6e0', 10); });
  // 上船：木头一响，溅点水
  G.on('board', f => { A.sfx('board'); PT.splash(G.px - 20, f.y + 8, 'rgba(230,240,255,0.9)'); RF.Renderer.kick(1.5); });
  // 空中翻面借力
  G.on('hop', () => {
    A.sfx('hop');
    PT.sparks(G.px, G.foot - 10, G.world === 'night' ? '#c8d8ff' : '#ffe0a0', 12);
    PT.dust(G.px, G.foot, 4, ['#ffffff', '#e8e0d0'], 0.5);
  });
  // 乐器层：收灯、连拍升一档，失误降一档
  function setLayer(n, quiet) {
    const old = A.layer; A.setLayer(n);
    const el = $('comboPill');
    el.querySelectorAll('.pip').forEach((p, i) => p.classList.toggle('on', i < A.layer));
    if (quiet || A.layer === old) return;
    A.sfx(A.layer > old ? 'layerUp' : 'layerDown');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    if (A.layer > old) PT.float(G.px, G.foot - 120, '+', '#fff2c0');
  }
  // 踩拍连击
  G.on('combo', n => {
    const el = $('comboPill');
    $('comboNum').textContent = n >= 2 ? '×' + n : '';
    if (n >= 2) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    if (n > 0 && n % 4 === 0) { PT.float(G.px, G.foot - 110, 'x' + n, '#fff2c0'); setLayer(A.layer + 1); }
  });
  // 每站结束盖一个印章：甲乙丙丁
  let stampTimer = null;
  G.on('regionDone', (ri, g) => {
    if (!g) return;
    const st = $('stamp');
    st.querySelector('.st-mark').textContent = g.mark;
    st.querySelector('.st-name').textContent = LV.regions[ri].name;
    st.querySelector('.st-sub').textContent = '踩拍 ' + Math.round(g.beat * 100) + '% · 铜钱 ' + g.coins + '/' + g.coinsTotal + ' · 灯 ' + g.lanterns + '/' + g.lanternsTotal + ' · 失误 ' + g.fails;
    st.classList.remove('show'); void st.offsetWidth; st.classList.add('show');
    A.sfx('checkpoint');
    clearTimeout(stampTimer); stampTimer = setTimeout(() => st.classList.remove('show'), 2600);
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
    showHint(t, d);
    const key = tag === 'switch' || tag === 'switch2' || tag === 'hop' || tag === 'bridge' || tag === 'gate2' || tag === 'eave' || tag === 'eave2' || tag === 'chime' ? 'k_shift' : tag === 'jump' || tag === 'lotus' || tag === 'roll' ? 'k_space' : null;
    G.keyTip = key && !touchUI ? { key, t: Math.min(d, 3.5) } : null;
  });
  G.on('switched', () => { if (G.keyTip && G.keyTip.key === 'k_shift') G.keyTip.t = 0; });
  G.on('jump', () => { if (G.keyTip && G.keyTip.key === 'k_space') G.keyTip.t = 0; });
  G.on('fail', () => { A.sfx('fail'); PT.shake = 3; setTimeout(() => setLayer(A.layer - 1), 350); hideHint(); $('chapterCard').classList.remove('show'); });
  G.on('ready', (label, tip) => { showReason(label, tip); setLanterns(); setWeather(); });
  G.on('readyEnd', () => hideReason());
  G.on('arrive', () => { A.sfx('arrive'); hideHint(); });
  G.on('ended', () => {
    $('hud').classList.add('hidden'); panelStack = []; $('chapterCard').classList.remove('show'); $('poemLine').classList.remove('show');
    hideHint(); $('stamp').classList.remove('show'); G.keyTip = null;
    const s = G.stats, m = Math.floor(s.time / 60), sec = Math.round(s.time % 60);
    $('endLanterns').textContent = G.lanternCount() + ' / ' + LV.lanterns.length;
    $('endFails').textContent = s.fails;
    $('endTime').textContent = m + ' 分 ' + String(sec).padStart(2, '0') + ' 秒';
    $('endCombo').textContent = s.bestCombo || 0;
    $('endCoins').textContent = G.coinCount() + ' / ' + LV.coins.length;
    const rows = LV.regions.map((r, i) => {
      const g = G.grade(i);
      if (!g || !G.graded[i]) return `<li><span class="g-name">${r.name}</span><span class="g-sub">—</span><b class="g-mark off">·</b></li>`;
      return `<li><span class="g-name">${r.name}</span><span class="g-sub">踩拍 ${Math.round(g.beat * 100)}% · 铜钱 ${g.coins}/${g.coinsTotal}</span><b class="g-mark">${g.mark}</b></li>`;
    });
    $('endGrades').innerHTML = rows.join('');
    showPanel('endScreen');
  });
  G.on('paused', () => { A.pause(); panelStack = []; showPanel('pauseScreen'); });
  G.on('resumed', () => { A.resume(); A.sfx('ui'); hidePanels(); focusGame(); });

  // ---------------------------------------------------------------- 旅程进度条：六站
  const jr = $('journey');
  jr.querySelector('.stops').innerHTML = LV.regions.map(r => `<i style="left:${(r.x0 / LV.totalX * 100).toFixed(2)}%" title="${r.name}"></i>`).join('') + '<i class="end" style="left:100%"></i>';
  let lastP = -1;
  function setJourney() {
    const p = Math.max(0, Math.min(1, G.px / LV.totalX));
    if (Math.abs(p - lastP) < 0.0008) return;
    lastP = p;
    jr.style.setProperty('--p', (p * 100).toFixed(2) + '%');
    const ri = LV.regionAt(G.px);
    jr.querySelectorAll('.stops i').forEach((el, i) => el.classList.toggle('done', i <= ri));
  }

  // ---------------------------------------------------------------- 流程
  function startJourney() {
    A.unlock(); A.sfx('ui');
    hidePanels(); panelStack = [];
    hideReason(); hideHint();
    $('hud').classList.remove('hidden');
    focusGame();
    G.wipe = null;
    RF.Particles.clear();
    $('comboNum').textContent = '';
    G.applyDiff();
    G.start();
    poemUsed = {}; poemT = 9 + Math.random() * 8; $('poemLine').classList.remove('show');
    setLayer(1, true); setCoins();
    setLanterns();
    if (startAt) { jumpTo(startAt); }
    setWeather();
  }
  function toTitle() {
    A.resume();
    G.state = 'title';
    G.reset();
    hidePanels(); hideHint(); hideReason(); panelStack = []; $('poemLine').classList.remove('show');
    $('stamp').classList.remove('show');
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
  window.addEventListener('keyup', e => {
    const k = e.code;
    if ((k === 'Space' || k === 'ArrowUp' || k === 'KeyW') && inGame()) G.inputJumpRelease();
  });
  // 触屏 / 鼠标：左半屏切换，右半屏跳
  let touchUI = false;
  canvas.addEventListener('pointerdown', e => {
    if (!inGame()) return;
    if (e.pointerType === 'touch') touchUI = true;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 2) G.inputSwitch(); else { G.inputJump(); jumpPtr = e.pointerId; }
  });
  let jumpPtr = null;
  window.addEventListener('pointerup', e => { if (e.pointerId === jumpPtr) { jumpPtr = null; if (inGame()) G.inputJumpRelease(); } });
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
      case 'diff': {
        const ds = ['easy', 'normal', 'hard'];
        G.diff = ds[(ds.indexOf(G.diff) + 1) % 3]; MT.setDiff(G.diff); refreshDiff(); A.sfx('ui'); break;
      }
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
        // 冰滑道：脚下扬起雪沫
        if (G.state === 'running' && G.onGround && !G.riding && LV.paceAt(G.px) > 1.2 && (slideN = (slideN + 1) % 3) === 0)
          PT.dust(G.px - 6, G.foot, 2, ['#ffffff', '#dfeefa', '#bcd6ec'], 1.6);
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
    const camPx = title ? 1400 + Math.sin(G.animT * 0.04) * 900 : G.px;
    RF.Renderer.draw(G, { camPx, title, noGhost: title });
    if (!title) setJourney();
    if (G.debug && dbg) dbg.textContent = `x ${Math.round(G.px)} · 拍 ${G.beat().toFixed(2)} · ${G.world} · 脚 ${Math.round(G.foot)} · 检查点 ${G.cpIndex} · ${G.state}`;
  }
  if (G.debug && dbg) dbg.hidden = false;
  const DNAME = { easy: '轻松', normal: '标准', hard: '困难' };
  function refreshDiff() { $('btnDiff').textContent = '难度 ' + DNAME[G.diff]; }
  refreshDiff();
  refreshToggles();
  G.rollWeather();
  // 先载入背景与像素素材，再开放“开始”
  const btn = $('btnStart');
  btn.disabled = true; btn.textContent = '载入中…';
  RF.Regions.load(() => { btn.disabled = false; btn.textContent = '开始旅行'; });
  requestAnimationFrame(frame);

  RF.debug = { G, start: startJourney, toTitle, jumpTo, showPoem };
})();
