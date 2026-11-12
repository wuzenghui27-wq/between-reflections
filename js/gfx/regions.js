// 六个区域的背景（assets/bg 的像素画贴图，原生 320×180，游戏里整数倍放大）、地面花纹、水面 / 深谷、天气粒子。
// 背景按“区域 × 天气”挑图，走过一个区域时依次淡入下一张；夜里换成 assets/bg/night 的夜景像素画。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX, LV = RF.LEVEL;
  const PW = X.PW, PH = X.PH, P = C.PIX;

  // ------------------------------------------------------------ 区域设定
  const R = {
    jiangnan: { bg: { rain: ['8536', '8537'], fog: ['8538', '8539'], clear: ['8539', '8535', '8538'] },
      water: { day: 584, night: 626 }, waterCol: ['#5d7f88', '#1f2d4a'], tile: 'stone', glow: 0.7 },
    garden: { bg: { clear: ['8532', '8531', '8535'], snow: ['8534', '8533'], rain: ['8531', '8532'] },
      water: { day: 600, night: 600 }, waterCol: ['#5a8aa8', '#1a2848'], tile: 'marble', glow: 0.7 },
    autumn: { bg: { clear: ['8522', '8519', '8521'], wind: ['8520', '8522', '8521'], snow: ['8518', '8519'] },
      water: { day: 600, night: 600 }, waterCol: ['#2f7a72', '#10283a'], tile: 'earth', glow: 0.8 },
    wall: { bg: { clear: ['8530'], wind: ['8530'], snow: ['8528'] },
      abyss: ['#3a3040', '#0c0a18'], tile: 'brick', glow: 0.8 },
    glacier: { bg: { clear: ['8524', '8525', '8526'], fog: ['8527', '8526'], snow: ['8527', '8524'] },
      abyss: ['#3a4658', '#0a1020'], tile: 'ice', glow: 0.8 },
    tibet: { bg: { clear: ['8523'], snow: ['8518', '8523'] },
      water: { day: 586, night: 568, frozen: 'night' }, waterCol: ['#3a78a8', '#0c1a3e'], tile: 'snowrock', glow: 0.8 }
  };
  // 夜景：作者提供的夜景像素画（新背景像素/夜间真实N → assets/bg/night/nN.png），按画面内容分到各站；没载入时退回把白天的图压暗
  const NIGHT_BG = {
    jiangnan: ['n2', 'n12', 'n5'],   // 白墙水巷与乌篷船、灯笼河街与石拱桥、雨后灯笼老街
    garden: ['n3', 'n10', 'n11'],    // 灯火楼阁、樱花水榭、宫殿与画舫
    autumn: ['n9', 'n7'],            // 黄昏河谷村落、廊下望山村灯火
    wall: ['n6'],                    // 悬崖栈道与瀑布（险峻山势，接长城的深谷）
    glacier: ['n1'],                 // 群山云海下的山村
    tibet: ['n4', 'n8']              // 雪山湖畔、湖边山城
  };
  const ALL_NIGHT = Object.values(NIGHT_BG).flat();
  const ALL_BG = [...new Set(Object.values(R).flatMap(r => Object.values(r.bg).flat()))];

  // ------------------------------------------------------------ 背景色调（js/bgtone.js）：前景往背景的颜色上靠
  const TONE = RF.BGTONE || {};
  const meanHex = list => {
    const cs = list.map(c => U.hex(c)).filter(Boolean);
    if (!cs.length) return null;
    const m = [0, 1, 2].map(i => Math.round(cs.reduce((a, c) => a + c[i], 0) / cs.length));
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const REGTONE = {};
  for (const id in R) {
    const ids = [...new Set(Object.values(R[id].bg).flat())];
    REGTONE[id] = { low: meanHex(ids.map(b => TONE[b] && TONE[b].low).filter(Boolean)), hor: meanHex(ids.map(b => TONE[b] && TONE[b].hor).filter(Boolean)) };
  }

  // ------------------------------------------------------------ 载入
  const IMG = {}, NIGHT = {};
  let spritesGhost = null;
  let sprites = null, spritesNight = null, spritesDim = null, curRid = null, tilesImg = null;
  const TSET = {};
  const TROW = ['jiangnan', 'garden', 'autumn', 'wall', 'glacier', 'tibet'];
  const spritesReg = {};
  function load(done) {
    const list = ALL_BG.map(id => ['bg/' + id + '.png', id]).concat(ALL_NIGHT.map(id => ['bg/night/' + id + '.png', 'n:' + id]), [['sprites.png', '__sprites'], ['tiles.png', '__tiles']]);
    let left = list.length;
    list.forEach(([file, id]) => {
      const im = new Image();
      im.onload = im.onerror = () => {
        if (im.naturalWidth) {
          if (id === '__sprites') {
            sprites = im;
            spritesNight = tint(im, '#7684c0');
            spritesDim = tint(im, '#aab2d8');
            spritesGhost = { day: silhouette(im, '#4a6cf0'), night: silhouette(im, '#ffe0a0') };
            // 每站的人物与道具带一点这一站背景的色温
            for (const id in R) if (REGTONE[id].hor) spritesReg[id] = mixTint(im, REGTONE[id].hor, 0.14);
          } else if (id === '__tiles') tilesImg = im;
          else if (id.startsWith('n:')) NIGHT[id] = im;
          else { IMG[id] = im; NIGHT[id] = X.nightOf(im); }
        }
        if (--left === 0) { buildTiles(); RF.Regions.ready = true; done(); }
      };
      im.src = 'assets/' + file;
    });
  }
  // 往某个颜色上靠 a（0~1），保留明暗与透明
  function mixTint(im, col, a) {
    const c = X.canvas(im.width, im.height), x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  // 剪影：另一面的预告用。描边那一圈（最暗的像素）提成亮色，里面按原图明暗留一层淡淡的单色，
  // 远看是一道发光的轮廓，近看还认得出门钉、窗格这些细节，像水里映出来的东西。
  function silhouette(im, col) {
    // 只用合成模式（不读像素），本地直接打开 index.html 也能用
    const W = im.width, H = im.height;
    const flat = X.canvas(W, H), f = flat.getContext('2d');
    f.drawImage(im, 0, 0); f.globalCompositeOperation = 'source-in'; f.fillStyle = col; f.fillRect(0, 0, W, H);
    const ero = X.canvas(W, H), o = ero.getContext('2d');              // 往里收一圈
    o.drawImage(flat, 0, 0); o.globalCompositeOperation = 'destination-in';
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(flat, dx, dy);
    const ring = X.canvas(W, H), r = ring.getContext('2d');            // 本体减去收进去的那块 = 最外一圈发光轮廓
    r.drawImage(flat, 0, 0); r.globalCompositeOperation = 'destination-out'; r.drawImage(ero, 0, 0);
    const body = X.canvas(W, H), b = body.getContext('2d');            // 本体：保留明暗的单色
    b.drawImage(im, 0, 0); b.globalCompositeOperation = 'color'; b.fillStyle = col; b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'screen'; b.globalAlpha = 0.35; b.drawImage(flat, 0, 0);
    b.globalCompositeOperation = 'destination-in'; b.globalAlpha = 1; b.drawImage(im, 0, 0);
    const c = X.canvas(W, H), x = c.getContext('2d');
    x.globalAlpha = 0.42; x.drawImage(body, 0, 0);
    x.globalAlpha = 1; x.drawImage(ring, 0, 0);
    return c;
  }
  function tint(im, col) {
    const c = X.canvas(im.width, im.height), x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0);   // 保留原来的透明
    return c;
  }

  // ------------------------------------------------------------ 地面花纹（16×72 的图块，横向重复）
  const TW = 16, TH = 72;
  const TILE = {}, PAT = {};
  function makeTile(kind) {
    const c = X.canvas(TW, TH), x = c.getContext('2d');
    const r = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
    const h = (i, j) => U.hash(i * 17 + j * 131, kind.length);
    switch (kind) {
      case 'stone':      // 江南青石驳岸
        r(0, 0, TW, TH, '#77797a');
        for (let y = 2, row = 0; y < TH; y += 5, row++) {
          r(0, y, TW, 1, '#55585b');
          const off = row % 2 ? 4 : 12;
          r(off, y, 1, 5, '#55585b');
          for (let i = 0; i < 3; i++) r((h(row, i) * TW) | 0, y + 1 + ((h(i, row) * 3) | 0), 1, 1, '#8a8c8c');
        }
        r(0, 0, TW, 2, '#b5b7b0'); r(0, 2, TW, 1, '#5d6b52');
        r(3, 3, 2, 1, '#6f8a58'); r(11, 3, 1, 1, '#6f8a58');
        break;
      case 'marble':     // 汉白玉台基
        r(0, 0, TW, TH, '#d8d4ca');
        r(0, 0, TW, 1, '#f4f1ea'); r(0, 3, TW, 1, '#a9a49a');
        for (let y = 4; y < TH; y += 8) { r(0, y + 7, TW, 1, '#b4afa4'); r(0, y, 1, 8, '#b4afa4'); r(2, y + 2, 12, 4, '#cbc6bb'); r(3, y + 3, 10, 2, '#e2ded4'); }
        break;
      case 'earth':      // 秋山：草皮 + 泥土 + 落叶
        r(0, 0, TW, TH, '#6a4a30');
        for (let i = 0; i < 18; i++) r((h(i, 1) * TW) | 0, 3 + ((h(i, 2) * (TH - 3)) | 0), 1 + (i % 2), 1, i % 3 ? '#57391f' : '#7d5a3a');
        r(0, 0, TW, 2, '#8a9a3a'); r(0, 2, TW, 1, '#5a6a2a');
        r(2, 0, 2, 1, '#d0682a'); r(9, 1, 1, 1, '#e0a030'); r(13, 0, 1, 1, '#b8402a');
        break;
      case 'brick':      // 长城城砖
        r(0, 0, TW, TH, '#8a6a4c');
        r(0, 0, TW, 2, '#a89478'); r(0, 2, TW, 1, '#5a4430');
        for (let y = 3, row = 0; y < TH; y += 4, row++) {
          r(0, y + 3, TW, 1, '#5a4430');
          const off = row % 2 ? 0 : 4;
          r(off, y, 1, 3, '#5a4430'); r(off + 8, y, 1, 3, '#5a4430');
          if (h(row, 3) > 0.6) r(off + 2, y + 1, 3, 1, '#9a7a5a');
        }
        break;
      case 'ice':        // 冰川：积雪 + 冰 + 岩
        r(0, 0, TW, TH, '#4a4e5a');
        for (let i = 0; i < 10; i++) r((h(i, 4) * TW) | 0, 6 + ((h(i, 5) * (TH - 6)) | 0), 2, 1, '#5e6878');
        r(0, 0, TW, 2, '#f2f6fa'); r(0, 2, TW, 2, '#a8d4ec'); r(0, 4, TW, 1, '#6aa0c4');
        r(4, 4, 2, 2, '#a8d4ec'); r(12, 4, 1, 3, '#a8d4ec');
        break;
      case 'snowrock':   // 雪域：岩石 + 厚雪
        r(0, 0, TW, TH, '#6a645e');
        for (let i = 0; i < 12; i++) r((h(i, 6) * TW) | 0, 4 + ((h(i, 7) * (TH - 4)) | 0), 2, 1, '#57514c');
        r(0, 0, TW, 3, '#f4f6fa'); r(0, 3, TW, 1, '#c8d0dc');
        r(3, 3, 3, 1, '#f4f6fa'); r(10, 3, 2, 2, '#f4f6fa');
        break;
    }
    return c;
  }
  function buildTiles() {
    for (const id in R) {
      // 地面花纹往这一站背景下半截的颜色上靠，和画面成一体
      const base = makeTile(R[id].tile), lo = REGTONE[id].low;
      const d = lo ? mixTint(base, lo, 0.3) : base;
      TILE[id] = { day: d, night: tint(d, '#6a78b4') };
    }
  }
  // 地面拼接图块（tools/terrain_art.py → assets/tiles.png）：每站一行，往这站背景的颜色上靠一点，夜里压暗
  function tileset(rid, world) {
    if (!tilesImg) return null;
    const k = rid + world;
    if (!TSET[k]) {
      const row = TROW.indexOf(rid); if (row < 0) return null;
      const c = X.canvas(128, 16), x = c.getContext('2d');
      x.drawImage(tilesImg, 0, row * 16, 128, 16, 0, 0, 128, 16);
      const lo = REGTONE[rid].low, d = lo ? mixTint(c, lo, 0.16) : c;
      TSET[rid + 'day'] = d; TSET[rid + 'night'] = tint(d, '#6a78b4');
    }
    return TSET[k];
  }
  function pattern(ctx, rid, world) {
    const key = rid + world;
    if (!PAT[key]) PAT[key] = ctx.createPattern(TILE[rid][world], 'repeat');
    return PAT[key];
  }

  // ------------------------------------------------------------ 背景
  // 某个横坐标该显示哪张图（以及与下一张的过渡）
  function bgAt(G, px, world) {
    const ri = LV.regionAt(px), reg = LV.regions[ri], rid = reg.id;
    const w = (G.weather && G.weather[ri]) || 'clear';
    let list = R[rid].bg[w] || R[rid].bg.clear || Object.values(R[rid].bg)[0];
    if (world === 'night') { const nl = (NIGHT_BG[rid] || []).map(id => 'n:' + id).filter(id => NIGHT[id]); if (nl.length) list = nl; }
    const len = Math.max(1, Math.min(reg.x1, LV.totalX || reg.x1) - reg.x0) || 1;
    const t = U.clamp((px - reg.x0) / len, 0, 0.9999) * list.length;
    const k = Math.floor(t), f = t - k;
    const cur = list[k], next = list[k + 1];
    const fade = next && f > 0.82 ? U.smooth((f - 0.82) / 0.18) : 0;
    return { cur, next, fade, rid, weather: w };
  }
  function drawImg(ctx, id, world, a) {
    const im = world === 'night' ? NIGHT[id] : IMG[id];
    if (!im) return;
    ctx.globalAlpha = a; ctx.drawImage(im, 0, 0); ctx.globalAlpha = 1;
  }
  // 区域交界处的过渡
  function regionMix(centre) {
    for (let k = 1; k < LV.regions.length; k++) {
      const bx = LV.regions[k].x0;
      if (Math.abs(centre - bx) < 420) return { a: k - 1, b: k, t: U.smooth((centre - bx + 420) / 840) };
    }
    return { a: LV.regionAt(centre), b: null, t: 0 };
  }
  const shownBg = {};     // 每站当前显示的背景图（水面倒影用）
  function backdrop(ctx, G, world, centre) {
    const m = regionMix(centre);
    const A = bgAt(G, m.b === null ? centre : Math.min(centre, LV.regions[m.b].x0 - 1), world);
    shownBg[A.rid] = A.fade > 0.5 && A.next ? A.next : A.cur;
    curRid = A.rid;
    drawImg(ctx, A.cur, world, 1);
    if (A.next && A.fade > 0) drawImg(ctx, A.next, world, A.fade);
    if (m.b !== null && m.t > 0) {
      const B = bgAt(G, LV.regions[m.b].x0 + 1, world);
      drawImg(ctx, B.cur, world, m.t);
      shownBg[B.rid] = B.cur;
      if (m.t > 0.5) curRid = B.rid;
    }
    return m;
  }

  // ------------------------------------------------------------ 水面 / 深谷（缺口处看到的东西）
  function lowland(ctx, rid, world, t, camPix, a) {
    const cfg = R[rid];
    ctx.globalAlpha = a;
    if (cfg.water) {
      const wy = Math.round(cfg.water[world] / P);
      const col = cfg.waterCol[world === 'day' ? 0 : 1];
      // 水面倒映这一站的背景：把水线以上的画面上下翻过来，再罩一层水色
      const id = shownBg[rid], im = id && (world === 'night' ? NIGHT[id] : IMG[id]);
      const hgt = PH + 16 - wy, s = wy + (X.oy || 0);
      if (im && s - hgt > -hgt) {
        ctx.save(); ctx.translate(0, 2 * wy); ctx.scale(1, -1);
        const sy = Math.max(0, s - hgt), sh = s - sy;
        if (sh > 0) ctx.drawImage(im, 0, sy, PW, sh, 0, wy - sh, PW, sh);
        ctx.restore();
        ctx.globalAlpha = a * 0.32; ctx.fillStyle = col; ctx.fillRect(0, wy, PW, hgt);
        ctx.globalAlpha = a;
      } else { ctx.fillStyle = col; ctx.fillRect(0, wy, PW, hgt); }
      ctx.fillStyle = 'rgba(0,0,10,0.25)'; ctx.fillRect(0, wy + 12, PW, PH + 16);
      if (cfg.water.frozen === world) {
        ctx.fillStyle = '#c8e0f4'; ctx.fillRect(0, wy, PW, 1);
        ctx.fillStyle = 'rgba(200,224,244,0.35)'; ctx.fillRect(0, wy + 1, PW, 2);
      } else {
        ctx.fillStyle = world === 'day' ? 'rgba(255,255,255,0.45)' : 'rgba(255,214,140,0.35)';
        for (let k = 0; k < 18; k++) {
          const yy = wy + 1 + (k % 6) * 3, xx = U.mod(Math.floor(U.hash(k, 9) * PW - camPix * (0.7 + (k % 6) * 0.05) + t * 6), PW + 20) - 10;
          ctx.fillRect(xx, yy, 4 + (k % 4) * 2, 1);
        }
      }
    } else {
      // 深谷：从这一站背景下半截的颜色渐暗下去
      const lo = REGTONE[rid].low ? U.hex(REGTONE[rid].low) : null;
      let top0 = lo ? U.mix(lo, U.hex(cfg.abyss[0]), 0.4) : U.hex(cfg.abyss[0]);
      if (world === 'night') top0 = U.mix(top0, U.hex(cfg.abyss[1]), 0.6);
      const c0 = '#' + top0.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), c1 = cfg.abyss[1];
      const top = 150;
      for (let y = top; y < PH + 16; y += 2) {
        ctx.fillStyle = U.rgb(U.mix(U.hex(c0), U.hex(c1), (y - top) / (PH - top)), world === 'day' ? 1 : 1);
        ctx.fillRect(0, y, PW, 2);
      }
      // 抖动的边：像素风的雾气
      ctx.fillStyle = 'rgba(200,210,230,0.18)';
      for (let x = 0; x < PW; x += 2) if (U.hash(Math.floor(x + camPix * 0.5), 3) > 0.5) ctx.fillRect(x, top - 1, 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 天气
  const W_DARK = { rain: 'rgba(20,30,50,0.22)', fog: 'rgba(200,206,214,0.18)', snow: 'rgba(220,230,245,0.08)' };
  function weatherBack(ctx, w, world, t, camPix) {
    if (W_DARK[w]) { ctx.fillStyle = W_DARK[w]; ctx.fillRect(0, 0, PW, PH); }
    if (w === 'fog') {
      for (let b = 0; b < 4; b++) {
        const y0 = 70 + b * 22;
        for (let x = -8; x < PW + 8; x += 4) {
          const n = U.noise((x + camPix * (0.3 + b * 0.1) + t * 4) / 40, b + 3);
          if (n < 0.35) continue;
          ctx.fillStyle = `rgba(226,230,236,${(0.10 + n * 0.18) * (world === 'night' ? 0.6 : 1)})`;
          ctx.fillRect(x, y0 + Math.round(Math.sin(x / 30 + b) * 2), 4, 6 + b * 2);
        }
      }
    }
  }
  function weatherFront(ctx, w, world, t, camPix, reduce) {
    const sp = reduce ? 0.35 : 1;
    if (w === 'rain') {
      ctx.fillStyle = world === 'day' ? 'rgba(210,225,245,0.55)' : 'rgba(160,180,230,0.5)';
      for (let i = 0; i < 140; i++) {
        const x = U.mod(Math.floor(U.hash(i, 1) * 360 - t * 40 * sp - camPix), 360) - 20;
        const y = U.mod(Math.floor(U.hash(i, 2) * 200 + t * 230 * sp), 200) - 10;
        ctx.fillRect(x, y, 1, 4);
      }
      ctx.fillStyle = 'rgba(220,235,255,0.5)';
      for (let i = 0; i < 14; i++) {      // 地上的水花
        const ph = (t * 3 + U.hash(i, 5)) % 1;
        if (ph > 0.3) continue;
        const x = Math.floor(U.hash(i + Math.floor(t * 3 + U.hash(i, 5)), 6) * PW);
        ctx.fillRect(x - 1, 139, 1, 1); ctx.fillRect(x + 1, 139, 1, 1); ctx.fillRect(x, 138, 1, 1);
      }
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 110; i++) {
        const big = i % 5 === 0;
        const x = U.mod(Math.floor(U.hash(i, 3) * 340 + Math.sin(t * 0.8 + i) * 5 - camPix * (big ? 1.1 : 0.7) - t * 6 * sp), 340) - 10;
        const y = U.mod(Math.floor(U.hash(i, 4) * 190 + t * (big ? 22 : 13) * sp), 190) - 5;
        ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
      }
    } else if (w === 'wind') {
      const cols = ['#d0682a', '#e0a030', '#b8402a', '#c88a2a'];
      for (let i = 0; i < 34; i++) {
        const x = U.mod(Math.floor(U.hash(i, 7) * 360 - t * (90 + U.hash(i, 8) * 60) * sp - camPix * 0.4), 360) - 20;
        const y = Math.floor(30 + U.hash(i, 9) * 130 + Math.sin(t * 3 + i) * 6);
        ctx.fillStyle = cols[i % 4];
        ctx.fillRect(x, y, 2, 1); if (i % 3 === 0) ctx.fillRect(x + 1, y + 1, 1, 1);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 8; i++) {
        const x = U.mod(Math.floor(U.hash(i, 11) * 400 - t * 220 * sp), 400) - 40;
        ctx.fillRect(x, Math.floor(40 + U.hash(i, 12) * 100), 16 + (i % 3) * 8, 1);
      }
    }
  }

  // ------------------------------------------------------------ 近景剪影（比地面走得快，拉出纵深）
  const FG = {
    jiangnan: { col: ['#17251f', '#080b16'], hi: '#2e4a3a', kinds: ['reed', 'reed', 'grass', 'rock'], top: 'willow' },
    garden: { col: ['#241a1e', '#0a0a16'], hi: '#4a3a3a', kinds: ['grass', 'rock', 'grass'], top: 'eave' },
    autumn: { col: ['#2a160e', '#0c0a14'], hi: '#6a3a1a', kinds: ['grass', 'rock', 'grass', 'reed'], top: 'maple' },
    wall: { col: ['#211a18', '#0a0a14'], hi: '#4a3a30', kinds: ['rock', 'grass', 'rock'], top: null },
    glacier: { col: ['#18202e', '#080c18'], hi: '#e8f0f8', kinds: ['rock', 'rock', 'grass'], top: null },
    tibet: { col: ['#1a1e2c', '#080a16'], hi: '#e8eef6', kinds: ['rock', 'grass', 'rock'], top: 'flags' }
  };
  function foreground(ctx, rid, world, t, camPix, reduce) {
    const f = FG[rid]; if (!f) return;
    const col = f.col[world === 'day' ? 0 : 1], hi = world === 'day' ? f.hi : '#2a3050';
    const SL = 54, k0 = Math.floor(camPix * 1.5 / SL) - 1;
    for (let k = k0; k < k0 + PW / SL + 3; k++) {
      if (U.hash(k, 31) < 0.42) continue;
      const x = Math.round(k * SL + U.hash(k, 32) * 30 - camPix * 1.5);
      const kind = f.kinds[Math.floor(U.hash(k, 33) * f.kinds.length)];
      const sway = reduce ? 0 : Math.sin(t * 1.6 + k);
      ctx.fillStyle = col;
      if (kind === 'rock') {
        const w = 14 + Math.floor(U.hash(k, 34) * 16), h = 5 + Math.floor(U.hash(k, 35) * 6);
        for (let i = 0; i < w; i++) {
          const yy = Math.round(Math.sin(i / (w - 1) * Math.PI) * h);
          ctx.fillRect(x + i, PH - yy - 1, 1, yy + 1);
        }
        ctx.fillStyle = hi;
        for (let i = 2; i < w - 2; i++) if (i % 3) ctx.fillRect(x + i, PH - Math.round(Math.sin(i / (w - 1) * Math.PI) * h) - 1, 1, 1);
      } else {
        // 一丛草 / 芦苇：底下一团，叶片有粗有细
        const reed = kind === 'reed', n = reed ? 7 : 11, tall = reed ? 26 : 13, w = n * 2;
        for (let i = 0; i < w; i++) {
          const yy = Math.round(Math.sin(i / (w - 1) * Math.PI) * 4) + 1;
          ctx.fillRect(x + i, PH - yy, 1, yy);
        }
        for (let i = 0; i < n; i++) {
          const h = Math.round(tall * (0.45 + U.hash(k * 7 + i, 36) * 0.65)), bx = x + 1 + i * 2;
          const lean = (i - n / 2) / n * 4 + sway * 1.2;
          for (let y = 0; y < h; y++) {
            const bend = Math.round((y / h) * (y / h) * lean);
            ctx.fillRect(bx + bend, PH - 3 - y, y < h * 0.6 ? 2 : 1, 1);
          }
          if (reed && i % 2 === 0) { const bend = Math.round(lean); ctx.fillRect(bx + bend - 1, PH - 3 - h - 3, 2, 4); }
        }
      }
    }
    // 顶上垂下的东西：柳条 / 枫叶 / 屋檐 / 经幡
    if (!f.top) return;
    const TS = 260, t0 = Math.floor(camPix * 1.3 / TS) - 1;
    for (let k = t0; k < t0 + 3; k++) {
      if (U.hash(k, 41) < 0.55) continue;
      const x = Math.round(k * TS + U.hash(k, 42) * 80 - camPix * 1.3);
      ctx.fillStyle = col;
      if (f.top === 'willow') {
        // 柳条：从画面上沿垂下，一条条带着叶子
        const lc = world === 'day' ? ['#2e4a2a', '#456a32', '#1e3420'] : ['#0c1220', '#141c2c', '#080c18'];
        for (let i = 0; i < 12; i++) {
          const len = 8 + Math.floor(U.hash(k * 9 + i, 43) * 22), sx = x + i * 3 + Math.floor(U.hash(k * 9 + i, 46) * 3);
          for (let y = 0; y < len; y++) {
            const dx = Math.round(Math.sin(t * 1.3 + i * 0.7 + y / 9) * (y / len) * (reduce ? 0 : 2));
            ctx.fillStyle = lc[2]; ctx.fillRect(sx + dx, y, 1, 1);
            if (y % 3 === 1) { ctx.fillStyle = lc[(i + y) % 2]; ctx.fillRect(sx + dx + ((y >> 1) % 2 ? 1 : -1), y, 1, 2); }
          }
        }
      } else if (f.top === 'maple') {
        ctx.fillRect(x - 10, 0, 50, 4); ctx.fillRect(x, 4, 30, 3); ctx.fillRect(x + 6, 7, 16, 2);
        const lc = world === 'day' ? ['#a83a1a', '#d0682a', '#7a2a14'] : ['#2a1a2a', '#3a2238', '#1a1222'];
        for (let i = 0; i < 26; i++) {
          ctx.fillStyle = lc[i % 3];
          ctx.fillRect(x - 8 + Math.floor(U.hash(k * 31 + i, 44) * 46), Math.floor(U.hash(k * 31 + i, 45) * 12), 2, 2);
        }
      } else if (f.top === 'eave') {
        for (let i = 0; i < 60; i++) { const y = Math.max(0, 8 - Math.floor(i / 6)); ctx.fillRect(x + i, 0, 1, y + 2); }
        ctx.fillStyle = world === 'day' ? '#a83a2a' : '#3a1a2a'; ctx.fillRect(x, 10, 2, 6); ctx.fillRect(x - 1, 16, 4, 1);
      } else if (f.top === 'flags') {
        const cols = ['#3a6ab0', '#f4f1ea', '#b8322a', '#4aa04a', '#e8c25a'];
        for (let i = 0; i < 70; i++) { const y = Math.round(6 + (i - 35) * (i - 35) / 140); ctx.fillStyle = col; ctx.fillRect(x + i, y, 1, 1); }
        for (let i = 3, j = 0; i < 68; i += 5, j++) {
          const y = Math.round(6 + (i - 35) * (i - 35) / 140) + 1, fl = reduce ? 0 : Math.round(Math.sin(t * 4 + j) * 1);
          ctx.fillStyle = world === 'day' ? cols[j % 5] : '#2a3050';
          ctx.fillRect(x + i + fl, y, 3, 4);
        }
      }
    }
  }

  RF.Regions = {
    R, load, foreground, backdrop, regionMix, lowland, pattern, tileset, weatherBack, weatherFront, bgAt,
    get sprites() { return (curRid && spritesReg[curRid]) || sprites; }, get spritesNight() { return spritesNight; }, get spritesDim() { return spritesDim; }, get spritesGhost() { return spritesGhost; }
  };
})();
