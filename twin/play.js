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
  let prevFrame = null, shiftFx = -1, blink = 0;
  const back = document.createElement('canvas'); back.width = PW; back.height = PH;
  const bctx = back.getContext('2d'); bctx.imageSmoothingEnabled = false;

  function startLevel(i) {
    idx = i; L = LEVELS[i]; G = TW.Game(L); phase = 'play'; phaseT = 0; card = 0;
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

  // ------------------------------------------------------------ 组件（明代江南：粉墙黛瓦、马头墙、漏窗、青石驳岸、乌篷船、货摊、宫灯）
  // 一律用“这一面的坐标”画，mirror 时整块上下翻到水下：世界里 [y, y+h) 落到屏幕 [PH-y-h, PH-y)
  const PAL = {
    day: { wall: '#ece6d8', shade: '#d2c9b6', stain: '#c2baa8', plinth: '#8c8e88', tile: '#363a46', tileHi: '#5a606e',
      top: '#9ea09a', topHi: '#c8cac2', face: '#73776f', faceDk: '#5b5f59', joint: '#474a46', moss: '#5f7c48',
      water: '#3a5f6c', waterHi: '#9cc0c2', wood: '#8a5a32', woodHi: '#b67c48', woodDk: '#5a3820', awn: '#b8402a', cloth: '#e8dcc0', canopy: '#26282e', win: '#463c34' },
    night: { wall: '#646a88', shade: '#50556f', stain: '#575c78', plinth: '#3a3f52', tile: '#171a26', tileHi: '#2c3044',
      top: '#4c536c', topHi: '#717a9a', face: '#30364a', faceDk: '#262b3c', joint: '#1c202e', moss: '#2d3c3c',
      water: '#132038', waterHi: '#41587e', wood: '#4c3630', woodHi: '#6c4c40', woodDk: '#2c1e1c', awn: '#6c2c2a', cloth: '#8a8496', canopy: '#0e1016', win: '#f4c45c' }
  };
  function painter(c, mirror) {
    return (x, y, w, h, col) => { if (w <= 0 || h <= 0) return; c.fillStyle = col; c.fillRect(Math.round(x), mirror ? PH - Math.round(y) - h : Math.round(y), w, h); };
  }
  const isGround = s => s.y1 >= 90 && s.y1 - s.y0 <= 20 && !s.kind;
  function hashi(a, b) { return hash(a * 0.37 + 11, b * 0.73 + 5); }

  function solids(c, lay, w, mirror) {
    const p = painter(c, mirror), K = PAL[w], night = w === 'night';
    // 河：没有地面的地方露出水，6 行水面
    for (let x = 0; x < PW; x++) {
      if (groundAt(lay, x + 0.5) < 90) continue;
      p(x, 84, 1, 6, K.water);
      const k = Math.sin(x * 0.31 + t * 2.2) + Math.sin(x * 0.09 - t * 1.3);
      if (k > 0.9) p(x, 84, 1, 1, K.waterHi);
      if (k < -1.4) p(x, 86 + ((x >> 2) & 1), 1, 1, K.waterHi);
    }
    for (const s of lay.solids) {
      const x0 = Math.round(s.x0), x1 = Math.round(s.x1), y0 = Math.round(s.y0), y1 = Math.round(s.y1), wd = x1 - x0, h = y1 - y0;
      if (isGround(s)) {
        // 青石驳岸：顶上一层石板（两行），下面错缝条石，岸边有苔
        p(x0, y0, wd, h, K.face);
        p(x0, y0, wd, 1, K.topHi); p(x0, y0 + 1, wd, 1, K.top);
        for (let x = x0 + 3 + Math.floor(hashi(x0, y0) * 9); x < x1 - 1; x += 13 + Math.floor(hashi(x, 1) * 6)) p(x, y0 + 1, 1, 1, K.joint);
        p(x0, y0 + 2, wd, 1, K.joint);
        for (let r = 0, yy = y0 + 3; yy < y1; r++, yy += 4) {
          p(x0, yy + 3, wd, 1, K.joint);
          for (let x = x0 + (r & 1) * 5; x < x1; x += 10) { p(x, yy, 1, Math.min(3, y1 - yy), K.joint); p(x + 1, yy, 3, 1, K.faceDk); }
        }
        for (let x = x0; x < x1; x++) if (hashi(x, y0 + 3) > 0.72) p(x, y0 + 3, 1, hashi(x, 9) > 0.6 ? 2 : 1, K.moss);
        if (x0 > 0) { p(x0, y0, 1, h, K.faceDk); p(x0, y0, 1, 1, K.top); }
        if (x1 < PW) p(x1 - 1, y0, 1, h, K.joint);
      } else if (s.kind === 'stall') {
        // 货摊：两根木柱、一块台面、上头条纹布篷，台上摆着东西
        const cy = y0 + Math.round(h * 0.55);
        p(x0, y0 + 4, 2, h - 4, K.woodDk); p(x1 - 2, y0 + 4, 2, h - 4, K.woodDk);
        p(x0 + 2, y0 + 6, wd - 4, cy - y0 - 6, night ? '#2a2430' : '#e2d4b8');
        p(x0 - 1, cy, wd + 2, 2, K.woodHi); p(x0, cy + 2, wd, h - (cy - y0) - 2, K.wood);
        for (let y = cy + 4; y < y1 - 1; y += 4) p(x0 + 1, y, wd - 2, 1, K.woodDk);
        const goods = night ? ['#6a3a30', '#5c5a34', '#3c4c34'] : ['#c84a30', '#e0b040', '#5a8a40'];
        for (let i = 0, x = x0 + 1; x < x1 - 2; i++, x += 3) p(x, cy - 2, 2, 2, goods[i % 3]);
        for (let x = x0 - 3; x < x1 + 3; x++) {
          const stripe = Math.floor((x - x0 + 30) / 3) & 1;
          p(x, y0, 1, 4, stripe ? K.awn : K.cloth);
          if (((x - x0) & 3) !== 0) p(x, y0 + 4, 1, 1, stripe ? K.awn : K.cloth);
        }
        p(x0 - 3, y0, wd + 6, 1, K.woodDk);
      } else {
        // 粉墙黛瓦：石脚、白墙身、雨水渍、漏窗、马头墙顶
        p(x0, y0, wd, h, K.wall);
        p(x1 - 2, y0, 2, h, K.shade);
        for (let x = x0 + 1; x < x1 - 2; x++) {
          const n = hashi(x, y0 + 7);
          if (n > 0.55) { const len = 4 + Math.floor(hashi(x, 3) * (h * 0.5)); for (let y = y0 + 4; y < y0 + 4 + len; y += 1 + (y & 1)) p(x, y, 1, 1, K.stain); }
        }
        p(x0, y1 - 3, wd, 3, K.plinth); p(x0, y1 - 3, wd, 1, K.joint);
        if (h >= 28 && wd >= 8) {
          const wx = x0 + (wd >> 1) - 3, wy = y0 + 10;
          p(wx, wy, 7, 7, K.tile);
          for (let yy = 1; yy < 6; yy++) for (let xx = 1; xx < 6; xx++) p(wx + xx, wy + yy, 1, 1, ((xx + yy) & 1) ? K.win : K.tile);
        }
        // 马头墙：瓦顶挑出两格，当中拱起一级，两头翘角
        p(x0 - 2, y0, wd + 4, 3, K.tile);
        for (let x = x0 - 2; x < x1 + 2; x += 2) p(x, y0 + 1, 1, 1, K.tileHi);
        p(x0 - 2, y0 + 3, wd + 4, 1, K.joint);
        p(x0 + 1, y0 - 2, wd - 2, 2, K.tile); p(x0 + 1, y0 - 2, wd - 2, 1, K.tileHi);
        p(x0 - 3, y0 - 1, 1, 1, K.tile); p(x1 + 2, y0 - 1, 1, 1, K.tile);
      }
    }
    // 乌篷船：船身两头收窄，后半截一个黑篷，船尾一根篙
    for (const m of lay.movers) {
      const x0 = Math.round(m.x0), wd = Math.round(m.x1 - m.x0), y = Math.round(m.top);
      p(x0, y, wd, 1, K.woodHi);
      p(x0, y + 1, wd, 1, K.wood);
      for (let r = 0; r < 4; r++) p(x0 + 1 + r, y + 2 + r, wd - 2 - 2 * r, 1, r === 3 ? K.joint : K.woodDk);
      const cx = x0 + wd - 12;
      for (let r = 0; r < 6; r++) { const inset = r === 5 ? 2 : r === 4 ? 1 : 0; p(cx + inset, y - 1 - r, 9 - 2 * inset, 1, K.canopy); }
      for (let r = 1; r < 5; r += 2) p(cx + 1, y - 1 - r, 7, 1, night ? '#202430' : '#3c3e48');
      p(x0 + 2, y - 12, 1, 12, K.woodDk);
    }
  }

  function groundAt(lay, x) {
    let best = 90;
    for (const s of lay.solids) if (x >= s.x0 && x < s.x1 && s.y0 < best && s.y1 >= 90) best = s.y0;
    return best;
  }
  // 灯：石座、木杆、挑臂，下挂宫灯。返回宫灯中心（这一面的坐标）
  function lampPos(lay) { const gy = groundAt(lay, lay.lamp); return { x: Math.round(lay.lamp), y: gy - 20, gy }; }
  function lamp(c, lay, w, mirror, lit, glowA) {
    if (lay.lamp === undefined) return;
    const p = painter(c, mirror), K = PAL[w], L0 = lampPos(lay), x = L0.x, gy = L0.gy, top = gy - 30;
    p(x + 3, gy - 3, 6, 3, K.plinth); p(x + 3, gy - 3, 6, 1, K.topHi);
    p(x + 5, top, 2, gy - 3 - top, K.woodDk); p(x + 6, top, 1, gy - 3 - top, K.wood);
    p(x - 1, top, 8, 1, K.woodDk); p(x - 2, top - 1, 1, 1, K.woodDk);
    p(x, top + 1, 1, 1, K.woodDk);
    sprite(c, 'lantern', x, mirror ? PH - (top + 18) : top + 18, false, mirror);
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
  // 每一面一张暖光图：夜里宫灯、漏窗、货摊的灯照亮四周，光线被墙挡住就留下一道影子。
  // 墙和货摊挡光（地面不挡：灯本来就在地面以上）。图按（布局、亮没亮）缓存，每帧只做闪烁、分档和抖动。
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const AMB = { day: [1, 1, 1], night: [0.48, 0.54, 0.78] };
  const WARM = [1.0, 0.7, 0.4];
  const lightCache = {};
  function lightsOf(lay, w, lit) {
    const out = [];
    if (lay.lamp !== undefined) {
      const q = lampPos(lay);
      if (w === 'night') out.push({ x: q.x + 0.5, y: q.y, r: lit ? 96 : 76, i: lit ? 1.0 : 0.72 });
      else if (lit) out.push({ x: q.x + 0.5, y: q.y, r: 40, i: 0.35 });
    }
    if (w === 'night') for (const s of lay.solids) {
      if (isGround(s)) continue;
      if (s.kind === 'stall') out.push({ x: (s.x0 + s.x1) / 2, y: s.y0 + 6, r: 26, i: 0.32, own: s });
      else if (s.y1 - s.y0 >= 28 && s.x1 - s.x0 >= 8) out.push({ x: (s.x0 + s.x1) / 2, y: s.y0 + 13, r: 18, i: 0.3, own: s });
    }
    return out;
  }
  function blocked(lx, ly, px, py, s) {
    // 线段 (lx,ly)→(px,py) 穿不穿过矩形 s（板块法）
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
          const inside = x + 0.5 >= s.x0 && x + 0.5 < s.x1 && y + 0.5 >= s.y0 - 3 && y + 0.5 < s.y1;
          if (inside) continue;                        // 墙面自己朝着看的人，照得到
          if (blocked(l.x, l.y, x + 0.5, y + 0.5, s)) { f *= 0.18; break; }
        }
        m[y * PW + x] += f;
      }
    }
    return (lightCache[key] = m);
  }
  function lightPass(c) {
    const top = G.top, bot = TW.other(top), S = G.S;
    const lit = G.state === 'won';
    const mT = warmMap(S.lay[top], top, lit, idx + top + lit), mB = warmMap(S.lay[bot], bot, lit, idx + bot + lit);
    const im = c.getImageData(0, 0, PW, PH), d = im.data;
    const fl = 1 + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 17.1);       // 烛火轻轻晃
    for (let y = 0; y < PH; y++) {
      const half = y < WY ? 0 : 1, w = half ? bot : top, wy = half ? PH - 1 - y : y, m = half ? mB : mT, A = AMB[w];
      const under = half ? 0.92 : 1;                                            // 水下那一面再暗一点
      for (let x = 0; x < PW; x++) {
        let v = m[wy * PW + x] * fl;
        if (v > 0) v = Math.floor(v * 8 + B4[((y & 3) << 2) | (x & 3)]) / 8;     // 八档，4×4 抖动
        const i = (y * PW + x) * 4;
        d[i] = Math.min(255, d[i] * (A[0] + v * WARM[0] * 2.0) * under);
        d[i + 1] = Math.min(255, d[i + 1] * (A[1] + v * WARM[1] * 2.0) * under);
        d[i + 2] = Math.min(255, d[i + 2] * (A[2] + v * WARM[2] * 2.0) * under);
      }
    }
    c.putImageData(im, 0, 0);
  }
  // 影子：脚下一小团；夜里灯在旁边，影子顺着地面往背光那边拖长；白天日头在左上，影子短短往右。墙在白天也往右落一道。
  function shadows(c, lay, w, mirror, bodies) {
    const p = painter(c, mirror);
    const sh = a => `rgba(12,10,24,${a.toFixed(2)})`;
    if (w === 'day') for (const s of lay.solids) {
      if (isGround(s)) continue;
      const gy = groundAt(lay, s.x1 + 1); if (gy >= 90) continue;
      for (let k = 0; k < 9; k++) p(s.x1 + 2 + k, gy, 1, 2, sh(0.26 * (1 - k / 9)));
    }
    for (const b of bodies) {
      if (!b.ground) continue;
      const fx = Math.round(b.x), fy = Math.round(b.y);
      p(fx - 3, fy, 7, 1, sh(0.32));
      if (w === 'day') { for (let k = 0; k < 7; k++) p(fx + 3 + k, fy, 1, 1, sh(0.22 * (1 - k / 7))); continue; }
      if (lay.lamp === undefined) continue;
      const q = lampPos(lay), dx = fx - q.x - 3, r = 76;
      if (Math.abs(dx) > r) continue;
      const dir = dx >= 0 ? 1 : -1, len = Math.min(34, 6 + Math.abs(dx) * 0.45), a0 = 0.5 * (1 - Math.abs(dx) / r);
      for (let k = 0; k < len; k++) p(fx + dir * (3 + k), fy, 1, 1 + (k < len * 0.6 ? 1 : 0), sh(a0 * (1 - k / len)));
    }
  }
  // 水面灯影：上面那一面的灯在水面上拖一道碎光
  function waterGlints(c, lay, w) {
    if (lay.lamp === undefined || (w !== 'night' && G.state !== 'won')) return;
    const q = lampPos(lay), x = q.x + 1;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 22; r++) {
      const a = 0.42 * (1 - r / 22), wob = Math.round(Math.sin(r * 1.7 + t * 3.1) * (1 + r * 0.08));
      const len = 2 + ((r * 7 + Math.floor(t * 6)) % 4);
      if (((r + Math.floor(t * 5)) % 3) === 0) continue;
      c.fillStyle = `rgba(255,196,110,${(Math.floor(a * 6) / 6).toFixed(2)})`;
      c.fillRect(x - (len >> 1) + wob, WY + 1 + r, len, 1);
    }
    c.restore();
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

  function scene(c) {
    const top = G.top, bot = TW.other(top), S = G.S;
    // 上半
    bandBg(c, top, false);
    solids(c, S.lay[top], top, false);
    if (phase !== 'title') shadows(c, S.lay[top], top, false, [G.A]);
    lamp(c, S.lay[top], top, false, G.lit, G.underA ? 0.3 : 0);
    // 下半（水里，上下翻过来）
    bandBg(c, bot, true);
    for (let k = 0; k < 6; k++) R(c, 0, WY + k * 15, PW, 15, bot === 'night' ? `rgba(6,14,40,${0.2 + k * 0.05})` : `rgba(20,50,70,${0.16 + k * 0.05})`);   // 水越深越暗，分六档
    solids(c, S.lay[bot], bot, true);
    if (phase !== 'title') shadows(c, S.lay[bot], bot, true, [G.B]);
    lamp(c, S.lay[bot], bot, true, G.lit, G.underB ? 0.3 : 0);
    if (phase !== 'title') {
      traveler(c, G.A, false, false);
      traveler(c, G.B, true, true);
    }
    // 水面上下各压一道淡淡的水汽
    R(c, 0, WY, PW, 6, 'rgba(200,220,240,0.10)');
    weather(c, REG[L.region].wx);
    lightPass(c);
    // 发光的东西在光照之后叠上去，才不会被压暗
    for (const [w, mir, under] of [[top, false, G.underA], [bot, true, G.underB]]) {
      const lay = S.lay[w]; if (lay.lamp === undefined) continue;
      const q = lampPos(lay);
      if (w === 'night' || G.lit) glow(c, q.x, mir ? PH - q.y : q.y, G.lit ? 18 : under ? 14 : 11, [255, 190, 110], G.lit ? 0.6 : under ? 0.45 : 0.32);
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
    if (idx === 0 && card > 3.2 && card < 16) text(c, '← → 走   空格 跳   Shift 水上水下对调   R 重来', 0, PH - 6, 0.7 * Math.min(1, (card - 3.2) / 0.5, (16 - card) / 2), true);
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
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,10,24,0.35)');
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
      if (G && phase === 'play') {
        G.events.length = 0;
        G.step();
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
    } else if (n === 'blocked') sfx('blocked');
    else if (n === 'jump') sfx('jump', 0.5);
    else if (n === 'land') sfx('land', 0.5);
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
    else if (k === 'KeyR') { G.reset(); }
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
