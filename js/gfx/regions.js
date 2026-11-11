// 六个区域的背景（来自 assets/bg 的像素画）、地面花纹、水面 / 深谷、天气粒子。
// 背景按“区域 × 天气”挑图，走过一个区域时依次淡入下一张；夜里用压暗偏蓝的版本。
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
  const ALL_BG = [...new Set(Object.values(R).flatMap(r => Object.values(r.bg).flat()))];

  // ------------------------------------------------------------ 载入
  const IMG = {}, NIGHT = {};
  let sprites = null, spritesNight = null, spritesDim = null;
  function load(done) {
    const list = ALL_BG.map(id => ['bg/' + id + '.png', id]).concat([['sprites.png', '__sprites']]);
    let left = list.length;
    list.forEach(([file, id]) => {
      const im = new Image();
      im.onload = im.onerror = () => {
        if (im.naturalWidth) {
          if (id === '__sprites') {
            sprites = im;
            spritesNight = tint(im, '#7684c0');
            spritesDim = tint(im, '#aab2d8');
          } else { IMG[id] = im; NIGHT[id] = X.nightOf(im); }
        }
        if (--left === 0) { buildTiles(); RF.Regions.ready = true; done(); }
      };
      im.src = 'assets/' + file;
    });
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
      const k = R[id].tile;
      if (!TILE[k]) { const d = makeTile(k); TILE[k] = { day: d, night: tint(d, '#6a78b4') }; }
    }
  }
  function pattern(ctx, rid, world) {
    const key = rid + world;
    if (!PAT[key]) PAT[key] = ctx.createPattern(TILE[R[rid].tile][world], 'repeat');
    return PAT[key];
  }

  // ------------------------------------------------------------ 背景
  // 某个横坐标该显示哪张图（以及与下一张的过渡）
  function bgAt(G, px) {
    const ri = LV.regionAt(px), reg = LV.regions[ri], rid = reg.id;
    const w = (G.weather && G.weather[ri]) || 'clear';
    const list = R[rid].bg[w] || R[rid].bg.clear || Object.values(R[rid].bg)[0];
    const len = Math.min(reg.x1, LV.totalX) - reg.x0;
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
  function backdrop(ctx, G, world, centre) {
    const m = regionMix(centre);
    const A = bgAt(G, m.b === null ? centre : Math.min(centre, LV.regions[m.b].x0 - 1));
    drawImg(ctx, A.cur, world, 1);
    if (A.next && A.fade > 0) drawImg(ctx, A.next, world, A.fade);
    if (m.b !== null && m.t > 0) {
      const B = bgAt(G, LV.regions[m.b].x0 + 1);
      drawImg(ctx, B.cur, world, m.t);
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
      ctx.fillStyle = col; ctx.fillRect(0, wy, PW, PH - wy);
      ctx.fillStyle = 'rgba(0,0,10,0.25)'; ctx.fillRect(0, wy + 12, PW, PH);
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
      const [c0, c1] = cfg.abyss;
      const top = 150;
      for (let y = top; y < PH; y += 2) {
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
    R, load, foreground, backdrop, regionMix, lowland, pattern, weatherBack, weatherFront, bgAt,
    get sprites() { return sprites; }, get spritesNight() { return spritesNight; }, get spritesDim() { return spritesDim; }
  };
})();
