// 倒影之间 · “水上水下，两个你”网页原型：画面、按键、声音。规则全在 core.js。
// 画面 320×180：上半 0..89 是浮在上面的一面，第 90 行是水面，下半是另一面，上下翻过来画（只镜像，不缩放）。
(function () {
  'use strict';
  const TW = window.TW, LEVELS = window.TW_LEVELS, C = TW.C;
  const PW = 320, PH = 180, WY = 90;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const ASSET = window.TW_ASSET || (p => '../' + p);

  // ------------------------------------------------------------ 素材
  const REG = {
    jiangnan: { day: 'assets/bg/8536.png', night: 'assets/bg/night/n12.png', band: 24, look: ['rain', 'umbrella'], wx: 'rain' },
    garden: { day: 'assets/bg/8535.png', night: 'assets/bg/night/n10.png', band: 30, look: ['clear', 'book'], wx: 'clear' },
    palace: { day: 'assets/bg/8534.png', night: 'assets/bg/night/n11.png', band: 30, look: ['snow', 'cloak'], wx: 'snow' },
    wall: { day: 'assets/bg/8530.png', night: 'assets/bg/night/n6.png', band: 40, look: ['wind', 'back'], wx: 'wind' }
  };
  const IMG = {};
  function img(p) { if (!IMG[p]) { const i = new Image(); i.src = ASSET(p); IMG[p] = i; } return IMG[p]; }
  const SPR = img('assets/sprites.png');
  const A = window.RF.ATLAS;

  // ------------------------------------------------------------ 声音（共用的离线录音）
  const AU = { ctx: null, buf: {}, music: {}, rid: '' };
  function audioInit() {
    if (AU.ctx) return;
    try { AU.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    AU.master = AU.ctx.createGain(); AU.master.gain.value = 0.8; AU.master.connect(AU.ctx.destination);
  }
  function load(name) {
    if (AU.buf[name] !== undefined) return Promise.resolve(AU.buf[name]);
    AU.buf[name] = null;
    return fetch(ASSET('shared/audio/' + name + '.ogg')).then(r => r.arrayBuffer()).then(b => AU.ctx.decodeAudioData(b)).then(d => (AU.buf[name] = d)).catch(() => null);
  }
  function sfx(name, vol) {
    if (!AU.ctx) return;
    const b = AU.buf['sfx_' + name];
    if (!b) { load('sfx_' + name); return; }
    const s = AU.ctx.createBufferSource(), g = AU.ctx.createGain();
    s.buffer = b; g.gain.value = vol === undefined ? 0.7 : vol; s.connect(g); g.connect(AU.master); s.start();
  }
  function music(rid, topWorld) {
    if (!AU.ctx) return;
    if (AU.rid !== rid) {
      AU.rid = rid;
      for (const w in AU.music) { try { AU.music[w].src.stop(); } catch (e) { } }
      AU.music = {};
      Promise.all(['day', 'night'].map(w => load('music_' + rid + '_' + w))).then(([d, n]) => {
        if (AU.rid !== rid || !d || !n) return;
        const t0 = AU.ctx.currentTime + 0.05;
        [['day', d], ['night', n]].forEach(([w, b]) => {
          const s = AU.ctx.createBufferSource(), g = AU.ctx.createGain();
          s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(AU.master); s.start(t0);
          AU.music[w] = { src: s, g };
        });
      });
    }
    for (const w in AU.music) {
      const g = AU.music[w].g.gain;
      g.setTargetAtTime(w === topWorld ? 0.55 : 0.12, AU.ctx.currentTime, 0.08);   // 水下那一面的音乐闷着、轻着
    }
  }

  // ------------------------------------------------------------ 状态
  let idx = 0, G = null, L = null, phase = 'title', phaseT = 0, card = 0, t = 0;
  const q = new URLSearchParams(location.search);
  if (q.has('at')) idx = Math.max(0, Math.min(LEVELS.length - 1, +q.get('at')));
  let prevFrame = null, shiftFx = -1, blink = 0, stillT = 0;
  const undo = [];                                       // 每次换面前存一份，Z 退回上一次换面之前
  const back = document.createElement('canvas'); back.width = PW; back.height = PH;
  const bctx = back.getContext('2d'); bctx.imageSmoothingEnabled = false;

  function startLevel(i) {
    idx = i; L = LEVELS[i]; G = TW.Game(L); undo.length = 0; FX.length = 0; phase = 'play'; phaseT = 0; card = 0;
    for (const w of ['day', 'night']) img(REG[L.region][w]);
    music(L.region, G.top);
  }

  // ------------------------------------------------------------ 画
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  function sprite(c, name, x, y, flipX, flipY) {
    const a = A[name]; if (!a || !SPR.complete) return;
    c.save();
    c.translate(x, y);
    c.scale(flipX ? -1 : 1, flipY ? -1 : 1);           // 只做镜像
    c.drawImage(SPR, a[0], a[1], a[2], a[3], -a[4], -a[5], a[2], a[3]);
    c.restore();
  }

  // 一面的背景：从这一站的图里按原尺寸截一条 320×90
  function bandBg(c, w, mirror) {
    const reg = REG[L.region], im = img(reg[w]);
    if (!im.complete || !im.naturalWidth) { R(c, 0, mirror ? WY : 0, PW, 90, w === 'night' ? '#0c1226' : '#9fb3c4'); return; }
    if (!mirror) { c.drawImage(im, 0, reg.band, PW, 90, 0, 0, PW, 90); return; }
    // 水下：翻过来，一行一行错开一两个像素当涟漪
    for (let r = 0; r < 90; r++) {
      const sy = reg.band + 89 - r, depth = r;
      const sh = depth < 4 ? 0 : Math.round(Math.sin(depth * 0.9 + t * 2.4) * 0.75 * Math.min(1, depth / 30));   // 最多错开一像素，离水面越远越明显
      c.drawImage(im, 0, sy, PW, 1, sh, WY + r, PW, 1);
    }
  }

  // ------------------------------------------------------------ 组件
  // 颜色全部取自这一站背景图本身（白天雨中江南偏青灰，夜里灯火偏暖橙、水偏青），组件和背景是同一套色。
  // 每样东西都有一圈深色描边、三到五档明暗，按“这一面的坐标”画；mirror 时上下翻到水下：世界里 [y, y+h) 落到屏幕 [PH-y-h, PH-y)
  const PAL = {
    day: {
      ol: '#162529', stone: ['#1a2328', '#2e3a40', '#46565e', '#5e737c', '#7890a0', '#a0b6c0'], moss: ['#384a49', '#44575a', '#4f6a44'],
      wall: ['#768e9b', '#8199a9', '#a3adb1', '#b3c8d6'], grime: '#5a717b',
      roof: ['#151f2b', '#233243', '#2f4354', '#384d61', '#435a71'],
      wood: ['#21252d', '#373032', '#614637', '#8d6843', '#ae8e67'], pane: ['#614637', '#8d6843', '#ae8e67'],
      water: ['rgba(25,61,66,0.7)', 'rgba(55,98,110,0.55)', '#487280', '#8fb0b8'], cloth: ['#7a2e2a', '#a8452f', '#d8cdb4'], canopy: ['#151f2b', '#233243', '#2f4354']
    },
    night: {
      ol: '#1c1416', stone: ['#1c1416', '#3a2c2a', '#5a4a43', '#7a5a46', '#9a6e50', '#c08a5c'], moss: ['#1f3a33', '#2c4a3a', '#3d5a3a'],
      wall: ['#8c6159', '#a06f54', '#d7a376', '#f8b16b'], grime: '#a06f54',
      roof: ['#011c22', '#012a32', '#014359', '#014d63', '#23373f'],
      wood: ['#3f211c', '#50281e', '#80371c', '#a2471d', '#e3731f'], pane: ['#e3731f', '#f69226', '#fbc76b'],
      water: ['rgba(4,59,71,0.7)', 'rgba(8,66,78,0.55)', '#0c4651', '#3a7884'], cloth: ['#5f2b1d', '#a2471d', '#d7a376'], canopy: ['#011c22', '#012a32', '#014359']
    }
  };
  function painter(c, mirror) {
    return (x, y, w, h, col) => { if (w <= 0 || h <= 0) return; c.fillStyle = col; c.fillRect(Math.round(x), mirror ? PH - Math.round(y) - h : Math.round(y), w, h); };
  }
  const isGround = s => s.y1 >= 90 && s.y1 - s.y0 <= 20 && !s.kind;
  function hashi(a, b) { return hash(a * 0.37 + 11, b * 0.73 + 5); }
  const dith = (x, y, k) => k >= 1 || (k > 0 && B4[((y & 3) << 2) | (x & 3)] < k);       // 4×4 抖动：k 是这一格取前景色的比例

  // 青石驳岸：压顶条石（亮面、正面、阴影）、下面错缝条石、苔、贴水的湿痕
  function drawGround(p, s, K, w) {
    const x0 = Math.round(s.x0), x1 = Math.round(s.x1), y0 = Math.round(s.y0), y1 = 90, wd = x1 - x0, S = K.stone;
    p(x0, y0, wd, y1 - y0, S[1]);
    // 压顶条石，一块 10～17 宽
    let x = x0, n = 0;
    while (x < x1) {
      const len = Math.min(x1 - x, 10 + Math.floor(hashi(x0 + n * 7, y0) * 8));
      p(x, y0, len, 1, S[5]); p(x, y0 + 1, len, 1, S[4]); p(x, y0 + 2, len, 1, S[3]);
      for (let k = 1; k < len - 1; k++) if (hashi(x + k, y0 + 1) > 0.86) p(x + k, y0, 1, 1, S[4]);       // 石面上的斑
      if (w === 'day') for (let k = 1; k < len - 1; k++) if (hashi(x + k, 77) > 0.9) p(x + k, y0 + 1, 1, 1, S[5]);   // 雨里的反光
      p(x + len - 1, y0, 1, 3, S[2]);
      x += len; n++;
    }
    p(x0, y0 + 3, wd, 1, K.ol);
    // 条石：每层 3 行 + 1 行灰缝，错缝
    for (let r = 0, yy = y0 + 4; yy < y1; r++, yy += 4) {
      const h = Math.min(3, y1 - yy);
      let bx = x0 - (r & 1 ? 5 : 0), m = 0;
      while (bx < x1) {
        const bw = 7 + Math.floor(hashi(bx + 3, yy + m) * 6), tone = hashi(bx, yy) > 0.6 ? 3 : hashi(bx, yy) > 0.25 ? 2 : 1;
        const a = Math.max(bx, x0), b = Math.min(bx + bw - 1, x1);
        if (b > a) { p(a, yy, b - a, h, S[tone]); p(a, yy, b - a, 1, S[Math.min(5, tone + 1)]); }
        if (bx + bw - 1 >= x0 && bx + bw - 1 < x1) p(bx + bw - 1, yy, 1, h, S[0]);
        bx += bw; m++;
      }
      if (yy + 3 < y1) p(x0, yy + 3, wd, 1, S[0]);
    }
    // 苔：从压顶下面垂下来
    for (let k = x0; k < x1; k++) {
      const v = hashi(k, y0 + 5);
      if (v > 0.8) { const L = 1 + Math.floor(hashi(k, 3) * 4); p(k, y0 + 3, 1, L, K.moss[v > 0.93 ? 2 : 1]); if (L > 2) p(k, y0 + 3, 1, 1, K.moss[2]); }
    }
    // 贴水两行：湿、暗，一行亮的水痕
    for (let k = x0; k < x1; k++) { if (dith(k, 87, 0.5)) p(k, 87, 1, 1, S[0]); p(k, 88, 1, 2, S[0]); }
    p(x0, 86, wd, 1, K.water[1]);
    // 两头收边：描边、压顶探出一格
    if (x0 > 0) { p(x0, y0 + 3, 1, y1 - y0 - 3, K.ol); p(x0 - 1, y0, 1, 3, K.ol); p(x0, y0, 1, 1, S[5]); }
    if (x1 < PW) { p(x1 - 1, y0 + 3, 1, y1 - y0 - 3, K.ol); p(x1, y0, 1, 3, K.ol); }
  }

  // 粉墙黛瓦·马头墙：石脚、白墙（下半截发灰发霉）、漏窗、檐下阴影、两级瓦顶、翘角
  function drawWall(p, s, K, w) {
    const x0 = Math.round(s.x0), x1 = Math.round(s.x1), y0 = Math.round(s.y0), y1 = Math.round(s.y1), wd = x1 - x0, h = y1 - y0, W = K.wall, R = K.roof;
    for (let y = y0; y < y1; y++) {
      const k = (y - y0) / h;
      for (let x = x0; x < x1; x++) {
        let col = W[2];
        if (x === x0 + 1 && w === 'day') col = W[3];
        if (x >= x1 - 2) col = W[1];
        if (k > 0.55 && dith(x, y, (k - 0.55) / 0.45 * 0.8)) col = x >= x1 - 2 ? W[0] : K.grime;     // 墙根返潮发灰
        p(x, y, 1, 1, col);
      }
    }
    // 檐下水渍
    for (let x = x0 + 1; x < x1 - 2; x++) {
      if (hashi(x, y0 + 7) < 0.55) continue;
      const L = 3 + Math.floor(hashi(x, 3) * h * 0.35);
      for (let y = y0 + 4; y < y0 + 4 + L; y++) if (dith(x, y, 0.6 - (y - y0 - 4) / L * 0.5)) p(x, y, 1, 1, W[1]);
    }
    p(x0, y0 + 3, wd, 1, W[0]);                                  // 檐下阴影
    // 石脚
    p(x0, y1 - 4, wd, 4, K.stone[2]); p(x0, y1 - 4, wd, 1, K.stone[4]); p(x0, y1 - 1, wd, 1, K.stone[1]);
    for (let x = x0 + 3; x < x1 - 1; x += 5) p(x, y1 - 3, 1, 2, K.stone[1]);
    // 描边
    p(x0, y0, 1, h, K.ol); p(x1 - 1, y0, 1, h, K.ol);
    // 漏窗：方格里套一个“卍”字纹的意思，用 7×7 画
    if (h >= 26 && wd >= 8) {
      const wx = x0 + Math.floor(wd / 2) - 3, wy = y0 + 9, P = K.pane;
      p(wx - 1, wy - 1, 9, 9, W[0]); p(wx, wy, 7, 7, R[0]);
      const pat = ['1111111', '1000001', '1011101', '1010101', '1011101', '1000001', '1111111'];
      for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 7; xx++) {
        if (pat[yy][xx] === '1') p(wx + xx, wy + yy, 1, 1, R[2]);
        else p(wx + xx, wy + yy, 1, 1, w === 'night' ? P[(xx + yy) & 1 ? 1 : 2] : R[0]);
      }
    }
    // 瓦顶：檐口一层探出两格，中间升起一级脊，两头翘角
    p(x0 - 2, y0, wd + 4, 3, R[1]);
    for (let x = x0 - 2; x < x1 + 2; x++) { p(x, y0, 1, 1, (x & 1) ? R[3] : R[2]); if ((x & 1) === 0) p(x, y0 + 2, 1, 1, R[4]); }   // 瓦垄、瓦当
    p(x0 - 2, y0 + 3, wd + 4, 1, K.ol);
    p(x0, y0 - 3, wd, 3, R[1]); p(x0, y0 - 3, wd, 1, R[4]); p(x0 + 1, y0 - 2, wd - 2, 1, R[2]);
    p(x0 - 1, y0 - 4, 2, 1, R[0]); p(x1 - 1, y0 - 4, 2, 1, R[0]);                                    // 脊头翘起
    p(x0 - 3, y0 - 1, 1, 1, R[0]); p(x1 + 2, y0 - 1, 1, 1, R[0]); p(x0 - 2, y0 - 1, 2, 1, R[1]); p(x1, y0 - 1, 2, 1, R[1]);
  }

  // 货摊：竹竿、条纹布篷（下沿一排垂角）、台面、台上的货
  function drawStall(p, s, K, w) {
    const x0 = Math.round(s.x0), x1 = Math.round(s.x1), y0 = Math.round(s.y0), y1 = Math.round(s.y1), wd = x1 - x0, h = y1 - y0, Wd = K.wood, Cl = K.cloth;
    const cy = y0 + Math.round(h * 0.55);
    p(x0 - 2, y0 + 3, 1, h - 3, Wd[0]); p(x1 + 1, y0 + 3, 1, h - 3, Wd[0]);                            // 竹竿
    p(x0, y0 + 5, wd, cy - y0 - 5, w === 'night' ? Wd[1] : K.stone[1]);                              // 摊后头的暗处
    if (w === 'night') for (let x = x0 + 1; x < x1 - 1; x += 3) p(x, y0 + 7, 2, 3, K.pane[2]);       // 夜里摊后挂一串小灯
    // 台面与台身
    p(x0 - 1, cy, wd + 2, 1, Wd[4]); p(x0 - 1, cy + 1, wd + 2, 1, Wd[3]); p(x0 - 1, cy + 2, wd + 2, 1, K.ol);
    p(x0, cy + 3, wd, y1 - cy - 3, Wd[2]);
    for (let x = x0 + 2; x < x1 - 1; x += 4) p(x, cy + 3, 1, y1 - cy - 3, Wd[1]);
    p(x0, y1 - 1, wd, 1, Wd[0]); p(x0 - 1, cy, 1, y1 - cy, K.ol); p(x1, cy, 1, y1 - cy, K.ol);
    // 货：瓷碗、布匹、果子
    const G = w === 'night' ? ['#d7a376', '#a2471d', '#f69226'] : ['#b3c8d6', '#a8452f', '#8d6843'];
    for (let i = 0, x = x0; x < x1 - 1; i++, x += 3) { p(x, cy - 2, 2, 2, G[i % 3]); p(x, cy - 2, 1, 1, i % 3 === 0 ? '#e8e4da' : G[(i + 1) % 3]); }
    // 布篷：条纹 + 垂角 + 上沿描边
    for (let x = x0 - 3; x < x1 + 3; x++) {
      const st = (Math.floor((x - x0 + 30) / 3) & 1) ? Cl[1] : Cl[2];
      p(x, y0, 1, 4, st); p(x, y0 + 3, 1, 1, (Math.floor((x - x0 + 30) / 3) & 1) ? Cl[0] : Cl[1]);
      if (((x - x0 + 30) % 3) === 1) p(x, y0 + 4, 1, 1, st);
    }
    p(x0 - 3, y0 - 1, wd + 6, 1, K.ol); p(x0 - 4, y0, 1, 4, K.ol); p(x1 + 3, y0, 1, 4, K.ol);
  }

  // 船：白天乌篷船（黑篷），夜里画舫（亮着窗的小舱）。船身两头翘，描边
  function drawBoat(p, m, K, w) {
    const x0 = Math.round(m.x0), wd = Math.round(m.x1 - m.x0), y = Math.round(m.top), x1 = x0 + wd, Wd = K.wood, Cn = K.canopy;
    // 船身
    p(x0 - 2, y - 1, 2, 1, K.ol); p(x1, y - 1, 2, 1, K.ol);                                           // 两头翘
    p(x0 - 1, y, wd + 2, 1, Wd[4]); p(x0, y + 1, wd, 1, Wd[3]);
    for (let r = 0; r < 3; r++) p(x0 + r, y + 2 + r, wd - 2 * r, 1, Wd[2 - (r === 2 ? 1 : 0)]);
    p(x0 + 3, y + 5, wd - 6, 1, K.ol);
    p(x0 - 1, y + 1, 1, 1, K.ol); p(x1, y + 1, 1, 1, K.ol);
    for (let r = 0; r < 3; r++) { p(x0 + r - 1, y + 2 + r, 1, 1, K.ol); p(x1 - r, y + 2 + r, 1, 1, K.ol); }
    // 舱 / 篷（在船后半截，人站在前半截）
    const cx = x1 - 13, cw = 11;
    if (w === 'night') {
      p(cx, y - 7, cw, 7, Wd[1]);
      for (let k = 0; k < 3; k++) { p(cx + 1 + k * 3, y - 5, 2, 3, K.pane[2]); p(cx + 1 + k * 3, y - 3, 2, 1, K.pane[0]); }
      p(cx - 1, y - 8, cw + 2, 1, Cn[2]); p(cx - 2, y - 9, cw + 4, 1, K.ol); p(cx - 1, y - 7, 1, 7, K.ol); p(cx + cw, y - 7, 1, 7, K.ol);
    } else {
      const rows = [cw - 4, cw - 2, cw, cw, cw, cw];
      rows.forEach((rw, r) => { const xx = cx + (cw - rw) / 2; p(xx, y - 6 + r, rw, 1, r === 1 ? Cn[2] : Cn[1]); p(xx - 1, y - 6 + r, 1, 1, K.ol); p(xx + rw, y - 6 + r, 1, 1, K.ol); });
      p(cx + 2, y - 7, cw - 4, 1, K.ol);
      for (let k = 1; k < cw; k += 3) p(cx + k, y - 4, 1, 4, Cn[0]);                                   // 篷上的竹篾
    }
    p(x0 + 2, y - 14, 1, 14, Wd[1]); p(x0 + 2, y - 15, 1, 1, K.ol);                                      // 篙
  }

  function solids(c, lay, w, mirror) {
    const p = painter(c, mirror), K = PAL[w];
    // 河：没有地面的地方露出水
    for (let x = 0; x < PW; x++) {
      if (groundAt(lay, x + 0.5) < 90) continue;
      p(x, 83, 1, 7, K.water[1]); p(x, 86, 1, 4, K.water[0]);
      const k = Math.sin(x * 0.31 + t * 2.2) + Math.sin(x * 0.09 - t * 1.3);
      if (k > 0.9) p(x, 83, 1, 1, K.water[3]); else if (k > 0) p(x, 83, 1, 1, K.water[2]);
      if (k < -1.3) p(x, 85 + ((x >> 2) & 1), 1, 1, K.water[2]);
    }
    for (const s of lay.solids) {
      if (isGround(s)) drawGround(p, s, K, w);
      else if (s.kind === 'stall') drawStall(p, s, K, w);
      else drawWall(p, s, K, w);
    }
    for (const m of lay.movers) drawBoat(p, m, K, w);
  }

  function groundAt(lay, x) {
    let best = 90;
    for (const s of lay.solids) if (x >= s.x0 && x < s.x1 && s.y0 < best && s.y1 >= 90) best = s.y0;
    return best;
  }
  // 灯：照背景里那种江南街灯——石座、木杆、挑出的铁钩，下挂一只方灯。返回灯心（这一面的坐标）
  function lampPos(lay) { const gy = groundAt(lay, lay.lamp); return { x: Math.round(lay.lamp), y: gy - 25, gy }; }
  function lamp(c, lay, w, mirror, lit) {
    if (lay.lamp === undefined) return;
    const p = painter(c, mirror), K = PAL[w], q = lampPos(lay), x = q.x, gy = q.gy, top = gy - 33, Wd = K.wood;
    const on = w === 'night' || lit;
    p(x + 3, gy - 3, 7, 3, K.stone[3]); p(x + 3, gy - 3, 7, 1, K.stone[5]); p(x + 2, gy - 3, 1, 3, K.ol); p(x + 10, gy - 3, 1, 3, K.ol);
    p(x + 5, top, 3, gy - 3 - top, Wd[2]); p(x + 5, top, 1, gy - 3 - top, Wd[3]); p(x + 4, top, 1, gy - 3 - top, K.ol); p(x + 8, top, 1, gy - 3 - top, K.ol);
    p(x - 1, top, 9, 1, K.ol); p(x - 1, top + 1, 1, 2, K.ol);                                            // 挑臂、吊钩
    // 方灯：顶帽、灯身三格、底座
    const ly = top + 3;
    p(x - 3, ly, 5, 1, K.ol); p(x - 4, ly + 1, 7, 1, K.roof[1]); p(x - 4, ly + 1, 1, 1, K.ol); p(x + 2, ly + 1, 1, 1, K.ol);
    p(x - 3, ly + 2, 5, 6, K.ol);
    const P = on ? ['#e3731f', '#f69226', '#fbc76b'] : K.pane;
    p(x - 2, ly + 3, 3, 4, P[1]); p(x - 1, ly + 3, 1, 4, P[2]); p(x - 2, ly + 6, 3, 1, P[0]);
    p(x - 3, ly + 8, 5, 1, K.roof[1]); p(x - 1, ly + 9, 1, 1, K.ol);
  }

  // 像素光：亮度分档，2×2 抖动
  const BAYER = [0.125, 0.625, 0.875, 0.375];
  function glow(c, cx, cy, r, col, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y) / r; if (d >= 1) continue;
      const pp = d < 0.4 ? 1 - 0.6 * d / 0.4 : 0.4 * (1 - (d - 0.4) / 0.6);
      const v = a * pp * 8, px = cx + x, py = cy + y;
      const lv = Math.floor(v) + ((v - Math.floor(v)) > BAYER[((py & 1) << 1) | (px & 1)] ? 1 : 0);
      if (lv <= 0) continue;
      const k = lv / 8;
      c.fillStyle = `rgb(${col[0] * k | 0},${col[1] * k | 0},${col[2] * k | 0})`;
      c.fillRect(px, py, 1, 1);
    }
    c.restore();
  }

  // ------------------------------------------------------------ 光影
  // 背景图本身已经画好了光，所以光照只压在前景（墙、驳岸、船、灯、人）上，背景只在灯旁添一点暖。
  // 每一面一张暖光图：灯、漏窗、货摊的小灯照亮四周，光线被墙挡住就留下一道影子。按（布局、亮没亮）缓存。
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const AMB = { day: [0.97, 0.98, 1.0], night: [0.74, 0.72, 0.8] };
  const WARM = [1.0, 0.68, 0.36];
  const lightCache = {};
  function lightsOf(lay, w, lit) {
    const out = [];
    if (lay.lamp !== undefined) {
      const q = lampPos(lay);
      if (w === 'night') out.push({ x: q.x + 0.5, y: q.y, r: lit ? 96 : 72, i: lit ? 0.95 : 0.7 });
      else if (lit) out.push({ x: q.x + 0.5, y: q.y, r: 40, i: 0.35 });
    }
    if (w === 'night') for (const s of lay.solids) {
      if (isGround(s)) continue;
      if (s.kind === 'stall') out.push({ x: (s.x0 + s.x1) / 2, y: s.y0 + 8, r: 26, i: 0.3, own: s });
      else if (s.y1 - s.y0 >= 26 && s.x1 - s.x0 >= 8) out.push({ x: (s.x0 + s.x1) / 2, y: s.y0 + 12, r: 18, i: 0.28, own: s });
    }
    return out;
  }
  function blocked(lx, ly, px, py, s) {
    let t0 = 0, t1 = 1;
    const dx = px - lx, dy = py - ly;
    for (const [d, p0, lo, hi] of [[dx, lx, s.x0, s.x1], [dy, ly, s.y0 - 3, s.y1]]) {
      if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) return false; continue; }
      let a = (lo - p0) / d, b = (hi - p0) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
    }
    return t1 > 0.02 && t0 < 0.98;
  }
  function warmMap(lay, w, lit, key) {
    if (lightCache[key]) return lightCache[key];
    const m = new Float32Array(PW * 90), Ls = lightsOf(lay, w, lit);
    const occ = lay.solids.filter(s => !isGround(s));
    for (const l of Ls) {
      const x0 = Math.max(0, Math.floor(l.x - l.r)), x1 = Math.min(PW - 1, Math.ceil(l.x + l.r));
      const y0 = Math.max(0, Math.floor(l.y - l.r)), y1 = Math.min(89, Math.ceil(l.y + l.r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y) / l.r; if (d >= 1) continue;
        let f = l.i * Math.pow(1 - d, 1.6);
        for (const s of occ) {
          if (s === l.own) continue;
          const inside = x + 0.5 >= s.x0 - 3 && x + 0.5 < s.x1 + 3 && y + 0.5 >= s.y0 - 5 && y + 0.5 < s.y1;
          if (inside) continue;
          if (blocked(l.x, l.y, x + 0.5, y + 0.5, s)) { f *= 0.15; break; }
        }
        m[y * PW + x] += f;
      }
    }
    return (lightCache[key] = m);
  }
  // fg=true：前景层，按环境光压暗再加暖光；fg=false：背景层，只在灯旁添暖（背景原有的光不动）
  function lightPass(c, fg) {
    const top = G.top, bot = TW.other(top), S = G.S, lit = G.state === 'won';
    const mT = warmMap(S.lay[top], top, lit, idx + top + lit), mB = warmMap(S.lay[bot], bot, lit, idx + bot + lit);
    const im = c.getImageData(0, 0, PW, PH), d = im.data;
    const fl = 1 + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 17.1);
    const gain = fg ? 1.9 : 0.7;
    for (let y = 0; y < PH; y++) {
      const half = y < WY ? 0 : 1, w = half ? bot : top, wy = half ? PH - 1 - y : y, m = half ? mB : mT;
      const A = fg ? AMB[w] : [1, 1, 1];
      for (let x = 0; x < PW; x++) {
        const i = (y * PW + x) * 4;
        if (fg && d[i + 3] === 0) continue;
        let v = m[wy * PW + x] * fl;
        if (!fg && v < 0.04) continue;
        if (v > 0) v = Math.floor(v * 8 + B4[((y & 3) << 2) | (x & 3)]) / 8;
        d[i] = Math.min(255, d[i] * (A[0] + v * WARM[0] * gain));
        d[i + 1] = Math.min(255, d[i + 1] * (A[1] + v * WARM[1] * gain));
        d[i + 2] = Math.min(255, d[i + 2] * (A[2] + v * WARM[2] * gain));
      }
    }
    c.putImageData(im, 0, 0);
  }
  // 影子：脚下一小团；夜里顺着地面往背光那边拖长；白天日头在左上，影子短短往右。墙在白天也往右落一道。
  function shadows(c, lay, w, mirror, bodies) {
    const p = painter(c, mirror);
    const sh = a => `rgba(10,8,18,${a.toFixed(2)})`;
    if (w === 'day') for (const s of lay.solids) {
      if (isGround(s)) continue;
      const gy = groundAt(lay, s.x1 + 2); if (gy >= 90) continue;
      for (let k = 0; k < 9; k++) p(s.x1 + 2 + k, gy, 1, 2, sh(0.3 * (1 - k / 9)));
    }
    for (const b of bodies) {
      if (!b.ground) continue;
      const fx = Math.round(b.x), fy = Math.round(b.y);
      p(fx - 3, fy, 7, 1, sh(0.38)); p(fx - 2, fy + 1, 5, 1, sh(0.2));
      if (w === 'day') { for (let k = 0; k < 7; k++) p(fx + 3 + k, fy, 1, 1, sh(0.24 * (1 - k / 7))); continue; }
      if (lay.lamp === undefined) continue;
      const q = lampPos(lay), dx = fx - q.x, r = 72;
      if (Math.abs(dx) > r) continue;
      const dir = dx >= 0 ? 1 : -1, len = Math.min(34, 6 + Math.abs(dx) * 0.45), a0 = 0.55 * (1 - Math.abs(dx) / r);
      for (let k = 0; k < len; k++) p(fx + dir * (3 + k), fy, 1, 1 + (k < len * 0.6 ? 1 : 0), sh(a0 * (1 - k / len)));
    }
  }
  // 水面灯影：上面那一面的灯在水面上拖一道碎光
  function waterGlints(c, lay, w) {
    if (lay.lamp === undefined || (w !== 'night' && G.state !== 'won')) return;
    const q = lampPos(lay), x = q.x;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 24; r++) {
      if (((r + Math.floor(t * 5)) % 3) === 0) continue;
      const a = 0.45 * (1 - r / 24), wob = Math.round(Math.sin(r * 1.7 + t * 3.1) * (1 + r * 0.08));
      const len = 2 + ((r * 7 + Math.floor(t * 6)) % 4);
      c.fillStyle = `rgba(255,170,80,${(Math.floor(a * 6) / 6).toFixed(2)})`;
      c.fillRect(x - (len >> 1) + wob, WY + 1 + r, len, 1);
    }
    c.restore();
  }
  // 另一面的轮廓：用一圈虚线描出“换过去以后”脚下和身边会是什么；换过去会卡住的那个人，虚线变朱红
  function ghosts(c, lay, w, mirror, warn) {
    const p = painter(c, mirror);
    const col = warn ? 'rgba(214,74,52,0.75)' : 'rgba(246,238,220,0.32)';
    for (const s of lay.solids) {
      const x0 = Math.round(s.x0), x1 = Math.round(s.x1), y0 = Math.round(s.y0);
      const ground = isGround(s);
      for (let x = x0; x < x1; x += 2) p(x, y0 - (ground ? 0 : 1), 1, 1, col);
      if (!ground) for (let y = y0; y < s.y1; y += 2) { p(x0, y, 1, 1, col); p(x1 - 1, y, 1, 1, col); }
      else { if (x0 > 0) for (let y = y0; y < 88; y += 2) p(x0, y, 1, 1, col); if (x1 < PW) for (let y = y0; y < 88; y += 2) p(x1 - 1, y, 1, 1, col); }
    }
    if (lay.lamp !== undefined) { const q = lampPos(lay); for (let y = q.y - 4; y < q.gy; y += 3) p(q.x + 6, y, 1, 1, col); p(q.x - 1, q.y - 2, 1, 1, col); p(q.x - 2, q.y, 3, 1, col); }
  }
  // 前景：驳岸边的芦苇（挡在人前面），雨天石板上的水花
  function foreground(c, lay, w, mirror) {
    const p = painter(c, mirror), K = PAL[w];
    for (const s of lay.solids) {
      if (!isGround(s)) continue;
      for (const [ex, dir] of [[s.x0, 1], [s.x1 - 1, -1]]) {
        if (ex <= 0 || ex >= PW - 1) continue;
        for (let k = 0; k < 4; k++) {
          const bx = Math.round(ex + dir * (1 + k * 2)), hgt = 5 + Math.floor(hashi(bx, k) * 6), sway = Math.sin(t * 1.6 + bx * 0.7);
          for (let y = 0; y < hgt; y++) { const off = Math.round(sway * y / hgt * 1.2) - (y > hgt - 3 ? dir : 0); p(bx + off, s.y0 - y, 1, 1, y > hgt - 2 ? K.moss[2] : K.moss[1]); }
        }
      }
    }
    if (REG[L.region].wx === 'rain') for (let i = 0; i < 8; i++) {
      const ph = (t * 3 + hash(i, 11)) % 1, x = Math.floor(hash(i + Math.floor(t * 3 + hash(i, 11)) * 13, 12) * PW), gy = groundAt(lay, x);
      if (gy >= 90 || ph > 0.5) continue;
      const r = Math.floor(ph * 6);
      p(x - r, gy - 1, 1, 1, K.stone[5]); p(x + r, gy - 1, 1, 1, K.stone[5]); if (r === 0) p(x, gy - 2, 1, 1, K.stone[5]);
    }
  }
  // ------------------------------------------------------------ 粒子：落地扬尘、换面时脚下的水圈
  const FX = [];
  function puff(half, x, y, kind) {
    if (kind === 'dust') for (let k = 0; k < 6; k++) FX.push({ half, x: x + (k - 2.5) * 1.2, y: y - 1, vx: (k - 2.5) * 9, vy: -6 - hash(k, t) * 10, life: 0.35 + hash(k, 3) * 0.15, t: 0, kind });
    else FX.push({ half, x, y, life: 0.6, t: 0, kind });
  }
  function stepFX(dt) {
    for (const f of FX) { f.t += dt; if (f.kind === 'dust') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 30 * dt; f.vx *= 0.9; } }
    for (let i = FX.length - 1; i >= 0; i--) if (FX[i].t > FX[i].life) FX.splice(i, 1);
  }
  function drawFX(c) {
    for (const f of FX) {
      const k = f.t / f.life, p = painter(c, f.half === 1);
      if (f.kind === 'dust') p(f.x, f.y, 1, 1, `rgba(220,214,200,${(0.6 * (1 - k)).toFixed(2)})`);
      else { const r = Math.floor(2 + k * 9), a = (0.7 * (1 - k)).toFixed(2); p(f.x - r, f.y, 2, 1, `rgba(240,236,220,${a})`); p(f.x + r - 1, f.y, 2, 1, `rgba(240,236,220,${a})`); p(f.x - r + 2, f.y - 1, 2 * r - 4, 1, `rgba(240,236,220,${(a * 0.4).toFixed(2)})`); }
    }
  }

  function traveler(c, b, mirror, reflect) {
    const reg = REG[L.region];
    let fr;
    if (!b.ground) fr = b.vy < 60 ? 'up' : 'fall';
    else if (Math.abs(b.vx) > 20) fr = b.landT < 0.09 ? 'land' : String(Math.floor(b.walk / 6) % 8);
    else fr = Math.floor(t / 0.7) % 4 === 3 ? 'idle1' : 'idle0';
    const name = `t_${reg.look[0]}_${reg.look[1]}_${fr}`;
    const x = Math.round(b.x), y = Math.round(mirror ? PH - b.y : b.y);
    c.save();
    if (reflect) c.globalAlpha = 0.92;
    sprite(c, name, x, y, b.face < 0, mirror);
    c.restore();
  }

  function waterLine(c) {
    for (let x = 0; x < PW; x++) {
      const k = Math.sin(x * 0.21 + t * 3) + Math.sin(x * 0.07 - t * 1.7);
      R(c, x, WY - 1, 1, 1, k > 1.2 ? 'rgba(255,255,255,0.55)' : 'rgba(220,235,255,0.22)');
      R(c, x, WY, 1, 1, k > 0.6 ? 'rgba(255,255,255,0.4)' : 'rgba(180,210,240,0.25)');
    }
  }

  const fgc = document.createElement('canvas'); fgc.width = PW; fgc.height = PH;
  const fctx = fgc.getContext('2d'); fctx.imageSmoothingEnabled = false;
  function scene(c) {
    const top = G.top, bot = TW.other(top), S = G.S, play = phase !== 'title';
    // 背景：上半这一面，下半另一面翻过来（水越深越暗，分六档）
    bandBg(c, top, false);
    bandBg(c, bot, true);
    for (let k = 0; k < 6; k++) R(c, 0, WY + k * 15, PW, 15, bot === 'night' ? `rgba(2,20,30,${0.18 + k * 0.05})` : `rgba(14,40,50,${0.14 + k * 0.05})`);
    lightPass(c, false);
    // 前景层：驳岸、墙、船、灯、影子、人，单独打光
    fctx.clearRect(0, 0, PW, PH);
    solids(fctx, S.lay[top], top, false);
    solids(fctx, S.lay[bot], bot, true);
    if (play) { shadows(fctx, S.lay[top], top, false, [G.A]); shadows(fctx, S.lay[bot], bot, true, [G.B]); }
    lamp(fctx, S.lay[top], top, false, G.lit);
    lamp(fctx, S.lay[bot], bot, true, G.lit);
    if (play) { traveler(fctx, G.A, false, false); traveler(fctx, G.B, true, true); }
    lightPass(fctx, true);
    // 水下那一半的前景也隔着一层水：淡淡压一层水色
    fctx.save(); fctx.globalCompositeOperation = 'source-atop';
    fctx.fillStyle = bot === 'night' ? 'rgba(4,40,52,0.22)' : 'rgba(20,60,72,0.2)'; fctx.fillRect(0, WY, PW, 90);
    fctx.restore();
    c.drawImage(fgc, 0, 0);
    foreground(c, S.lay[top], top, false);
    foreground(c, S.lay[bot], bot, true);
    drawFX(c);
    // 另一面的轮廓：站稳不动的时候慢慢浮出来
    if (play && G.state === 'running') {
      const still = Math.min(stillT, 1);
      if (still > 0.4) {
        const pv = G.shiftPreview();
        c.save(); c.globalAlpha = Math.min(1, (still - 0.4) / 0.4);
        ghosts(c, S.lay[bot], bot, false, pv && !pv.air && !pv.a);
        ghosts(c, S.lay[top], top, true, pv && !pv.air && !pv.b);
        c.restore();
      }
    }
    R(c, 0, WY, PW, 5, 'rgba(200,220,240,0.08)');
    weather(c, REG[L.region].wx);
    for (const [w, mir, under] of [[top, false, G.underA], [bot, true, G.underB]]) {
      const lay = S.lay[w]; if (lay.lamp === undefined) continue;
      const q = lampPos(lay);
      if (w === 'night' || G.lit) glow(c, q.x - 1, mir ? PH - q.y : q.y, G.lit ? 18 : under ? 14 : 10, [255, 180, 96], G.lit ? 0.6 : under ? 0.45 : 0.3);
    }
    waterGlints(c, S.lay[top], top);
    waterLine(c);
  }

  function hash(i, s) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
  const mod = (a, n) => ((Math.floor(a) % n) + n) % n;
  function weather(c, w) {
    if (w === 'rain') {
      c.fillStyle = 'rgba(210,225,245,0.5)';
      for (let i = 0; i < 70; i++) { const x = mod(hash(i, 1) * 360 - t * 40, 360) - 20, y = mod(hash(i, 2) * 100 + t * 230, 100) - 10; c.fillRect(x, y, 1, 4); }
      c.fillStyle = 'rgba(220,235,255,0.5)';                       // 雨点落在水面上：一圈圈小水花
      for (let i = 0; i < 10; i++) { const ph = (t * 2 + hash(i, 5)) % 1; const x = Math.floor(hash(i + Math.floor(t * 2 + hash(i, 5)), 6) * PW); const r = Math.floor(ph * 4); c.fillRect(x - r, WY + 1, 1, 1); c.fillRect(x + r, WY + 1, 1, 1); }
    } else if (w === 'snow') {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 60; i++) { const big = i % 5 === 0; const x = mod(hash(i, 3) * 340 + Math.sin(t * 0.8 + i) * 5 - t * 6, 340) - 10, y = mod(hash(i, 4) * 95 + t * (big ? 22 : 13), 95) - 5; c.fillRect(x, y, big ? 2 : 1, big ? 2 : 1); }
    } else if (w === 'wind') {
      const cols = ['#d0682a', '#e0a030', '#b8402a', '#c88a2a'];
      for (let i = 0; i < 20; i++) { const x = mod(hash(i, 7) * 360 - t * (90 + hash(i, 8) * 60), 360) - 20, y = Math.floor(10 + hash(i, 9) * 70 + Math.sin(t * 3 + i) * 6); c.fillStyle = cols[i % 4]; c.fillRect(x, y, 2, 1); }
    }
  }

  // ------------------------------------------------------------ 界面（像素字，原生 12px，不画框）
  const PAPER = '246,238,220';
  function text(c, s, x, y, a, center) {
    c.font = '12px FusionPixel'; c.textBaseline = 'alphabetic';
    c.fillStyle = `rgba(${PAPER},${a})`;
    const w = c.measureText(s).width;
    c.fillText(s, Math.round(center ? (PW - w) / 2 : x), y);
  }
  function inkBand(c, y, h, a) { for (let k = 0; k < 20; k++) { const d = Math.abs(k - 9.5) / 10; c.fillStyle = `rgba(23,19,28,${a * (1 - d * d)})`; c.fillRect(k * 16, y, 16, h); } }
  const NUM = '一二三四五六七八九十';
  function ui(c) {
    if (phase === 'title') {
      inkBand(c, 58, 50, 0.7);
      text(c, '倒影之间', 0, 78, 1, true);
      text(c, '水上的你，水里的你，一起走', 0, 94, 0.8, true);
      if (Math.floor(t * 2) % 2 === 0) text(c, '按任意键或点一下出发', 0, 150, 0.85, true);
      return;
    }
    if (phase === 'end') { inkBand(c, 70, 36, 0.7); text(c, '灯都亮了。', 0, 92, 1, true); return; }
    // 左上：朱印景号 + 景名
    R(c, 6, 6, 14, 14, '#c43226'); R(c, 7, 7, 12, 12, 'rgba(246,238,220,0.15)');
    text(c, idx < 10 ? NUM[idx] : '十', 7, 18, 1);
    text(c, L.name, 24, 17, 1);
    // 进度：一排小灯笼，过了的点亮
    for (let k = 0; k < LEVELS.length; k++) {
      const on = k < idx || (k === idx && G.lit), x = 25 + k * 6;
      R(c, x + 1, 20, 1, 1, 'rgba(246,238,220,0.4)');
      R(c, x, 21, 3, 3, on ? '#e8452c' : 'rgba(246,238,220,0.22)');
      if (on) { R(c, x + 1, 22, 1, 1, '#ffd27a'); R(c, x + 1, 24, 1, 1, '#f2c850'); }
    }
    // 进景：题名，停一会儿按四档淡去
    if (card < 3.2) {
      let a = Math.max(0, Math.min(1, Math.min(card / 0.3, (3.2 - card) / 0.6))); a = Math.floor(a * 4) / 4;
      inkBand(c, 140, 30, 0.5 * a);                       // 题名放在水下那一半的下方，不压人
      text(c, L.name, 0, 154, a, true);
      text(c, L.line, 0, 166, 0.8 * a, true);
    }
    if (idx === 0 && card > 3.2 && card < 16) text(c, '← → 走  空格 跳  Shift 对调  Z 退一步  R 重来', 0, PH - 6, 0.7 * Math.min(1, (card - 3.2) / 0.5, (16 - card) / 2), true);
  }

  // ------------------------------------------------------------ 一帧
  function frame() {
    if (!G) return;
    scene(bctx);
    // 对调：旧画面盖着，从水面往上下两头一层层揭开（抖动边）
    if (shiftFx >= 0 && prevFrame) {
      const k = Math.min(1, shiftFx / 0.32), r = Math.floor((1 - Math.pow(1 - k, 3)) * 94);
      const pc = prevFrame.getContext('2d');
      bctx.save();
      bctx.beginPath();
      for (let y = 0; y < PH; y++) {
        const d = Math.abs(y + 0.5 - WY);
        if (d < r - 4) continue;
        if (d < r) { for (let x = (y & 1); x < PW; x += 2) bctx.rect(x, y, 1, 1); continue; }
        bctx.rect(0, y, PW, 1);
      }
      bctx.clip();
      bctx.drawImage(prevFrame, 0, 0);
      bctx.restore();
      void pc;
    }
    if (G.blockedT > 0) { const a = G.blockedT / 0.35 * 0.35; R(bctx, 0, WY - 1, PW, 2, `rgba(200,70,70,${a})`); }
    // 赢：两盏灯一起亮，水面一道光
    if (G.state === 'won') { const a = Math.max(0, 0.5 - G.winT * 0.3); R(bctx, 0, WY - 1, PW, 2, `rgba(255,220,150,${a})`); }
    if (G.state === 'failing') R(bctx, 0, 0, PW, PH, `rgba(8,8,20,${Math.min(0.7, G.winT * 2)})`);
    // 暗角
    const vg = bctx.createRadialGradient(PW / 2, PH / 2, PH * 0.45, PW / 2, PH / 2, PH * 0.98);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,10,24,0.22)');
    bctx.fillStyle = vg; bctx.fillRect(0, 0, PW, PH);
    ui(bctx);
    ctx.drawImage(back, 0, 0);
  }

  // ------------------------------------------------------------ 主循环（固定 60 步/秒）
  let acc = 0, last = performance.now();
  function loop(now) {
    const dt = Math.min(0.25, (now - last) / 1000); last = now; acc += dt;
    while (acc >= C.STEP) {
      acc -= C.STEP; t += C.STEP; card += C.STEP; phaseT += C.STEP;
      if (shiftFx >= 0) { shiftFx += C.STEP; if (shiftFx > 0.32) shiftFx = -1; }
      stepFX(C.STEP);
      if (G && phase === 'play') {
        G.events.length = 0;
        const pre = G.snap();
        G.step();
        if (G.events.some(e => e[0] === 'shift')) { undo.push(pre); if (undo.length > 50) undo.shift(); }
        stillT = G.A.ground && G.B.ground && Math.abs(G.A.vx) < 1 && G.state === 'running' ? stillT + C.STEP : 0;
        for (const [n, a] of G.events) onEvent(n, a);
        if (G.state === 'won' && G.winT > 1.8) {
          if (idx + 1 < LEVELS.length) startLevel(idx + 1); else { phase = 'end'; sfx('arrive'); }
        }
      }
    }
    frame();
    requestAnimationFrame(loop);
  }
  let stepN = 0;
  function onEvent(n, a) {
    if (n === 'shift') {
      if (!prevFrame) { prevFrame = document.createElement('canvas'); prevFrame.width = PW; prevFrame.height = PH; }
      prevFrame.getContext('2d').drawImage(back, 0, 0);
      shiftFx = 0;
      sfx(G.top === 'night' ? 'switch_night' : 'switch_day');
      music(L.region, G.top);
      puff(0, G.A.x, G.A.y, 'ring'); puff(1, G.B.x, G.B.y, 'ring');
    } else if (n === 'blocked') sfx('blocked');
    else if (n === 'jump') sfx('jump', 0.5);
    else if (n === 'land') { sfx('land', 0.5); if (G.A.landed) puff(0, G.A.x, G.A.y, 'dust'); if (G.B.landed) puff(1, G.B.x, G.B.y, 'dust'); }
    else if (n === 'win') { sfx('lantern'); setTimeout(() => sfx('gate'), 350); }
    else if (n === 'fail') sfx('splash');
    if (G.A.ground && Math.abs(G.A.vx) > 20) { const k = Math.floor(G.A.walk / 34); if (k !== stepN) { stepN = k; sfx('step' + (k & 1), 0.35); } }
  }

  // ------------------------------------------------------------ 按键
  const keys = {};
  window.addEventListener('keydown', e => {
    audioInit();
    if (e.repeat) { e.preventDefault(); return; }
    if (phase === 'title' || phase === 'end') { startLevel(phase === 'end' ? 0 : idx); e.preventDefault(); return; }
    const k = e.code;
    keys[k] = true;
    if (k === 'ArrowLeft' || k === 'KeyA') G.input.move(-1, true);
    else if (k === 'ArrowRight' || k === 'KeyD') G.input.move(1, true);
    else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') G.input.jump();
    else if (k === 'ShiftLeft' || k === 'ShiftRight') G.input.shift();
    else if (k === 'KeyR') { G.reset(); undo.length = 0; }
    else if (k === 'KeyZ' || k === 'Backspace') { if (undo.length && G.state !== 'won') { G.load(undo.pop()); G.inL = G.inR = false; sfx('ui', 0.5); } }
    else if (k === 'BracketRight' && e.altKey) startLevel(Math.min(LEVELS.length - 1, idx + 1));
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    const k = e.code; keys[k] = false;
    if (!G) return;
    if (k === 'ArrowLeft' || k === 'KeyA') G.input.move(-1, !!(keys.ArrowLeft || keys.KeyA));
    if (k === 'ArrowRight' || k === 'KeyD') G.input.move(1, !!(keys.ArrowRight || keys.KeyD));
  });
  // 点一下画面也能出发（嵌在别的页面里时，先点一下才拿得到按键）
  cv.addEventListener('pointerdown', () => { audioInit(); try { cv.focus(); } catch (e) { } if (phase === 'title' || phase === 'end') startLevel(phase === 'end' ? 0 : idx); });
  window.addEventListener('blur', () => { if (G) { G.inL = G.inR = false; } });

  // 触屏：左下 ← →，右下 跳 / 对调
  function touchUI() {
    const pad = document.getElementById('pad'); if (!pad) return;
    pad.style.display = 'flex';
    const bind = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); if (phase !== 'play') { startLevel(phase === 'end' ? 0 : idx); return; } down(); });
      el.addEventListener('pointerup', e => { e.preventDefault(); up && up(); });
      el.addEventListener('pointerleave', () => up && up());
    };
    bind('bl', () => G.input.move(-1, true), () => G.input.move(-1, false));
    bind('br', () => G.input.move(1, true), () => G.input.move(1, false));
    bind('bj', () => G.input.jump());
    bind('bs', () => G.input.shift());
    const bz = document.getElementById('bz'); if (bz) bind('bz', () => { if (undo.length && G.state !== 'won') { G.load(undo.pop()); sfx('ui', 0.5); } });
  }
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) touchUI();

  // 整数倍放大，余下黑边
  function resize() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / PW, innerHeight / PH)));
    cv.style.width = PW * s + 'px'; cv.style.height = PH * s + 'px';
  }
  window.addEventListener('resize', resize); resize();

  // 先把题名画面摆好（用第一景的背景）
  L = LEVELS[idx]; G = TW.Game(L);
  for (const w of ['day', 'night']) img(REG[L.region][w]);
  // 测试用：?play 直接进景，?auto 按求解器走法自己走
  if (q.has('play')) startLevel(idx);
  window.__TW = { get G() { return G; }, startLevel, get phase() { return phase; } };
  requestAnimationFrame(loop);
})();
