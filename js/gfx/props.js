// 近景（像素坐标）：地面、石阶、乌篷船、萤火、冰柱、冰面、障碍、铃、灯、雪桥，以及另一面的预告轮廓。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX, LV = RF.LEVEL, RG = RF.Regions;
  const P = C.PIX, PW = X.PW, PH = X.PH;
  const r = (x, y, w, h, col) => { const c = X.ctx; c.fillStyle = col; c.fillRect(x, y, w, h); };

  // 画图集里的一块：锚点（底边中点）对准 (x, y)
  function spr(name, x, y, night, alpha) {
    const a = RF.ATLAS[name]; if (!a) return;
    const img = night ? RG.spritesNight : RG.sprites; if (!img) return;
    const c = X.ctx;
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.drawImage(img, a[0], a[1], a[2], a[3], Math.round(x - a[4]), Math.round(y - a[5]), a[2], a[3]);
    if (alpha !== undefined) c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 地面
  function solid(s, e) {
    const x0 = Math.round(s.x0 / P) - e.camPix, x1 = Math.round(s.x1 / P) - e.camPix, y = Math.round(s.y / P);
    if (x1 < -4 || x0 > PW + 4) return;
    const rid = LV.regions[LV.regionAt(s.x0)].id, night = e.world === 'night', w = x1 - x0;
    const c = X.ctx;
    switch (s.kind) {
      case 'ground': case 'shore': case 'slide': {
        const ts = RG.tileset(rid, e.world);
        if (ts) {
          // 拼接图块：顶一排（左端、中间两种交替、右端），下面身块一直铺到画面底；按世界坐标挑花样，镜头动时不会闪
          const bottom = PH + 16, wx0 = x0 + e.camPix;
          const put = (ti, row, dx, dy, sw) => c.drawImage(ts, ti * 16, 0, sw, 16, dx, dy, sw, 16);
          for (let yy = y - 3, row = 0; yy < bottom; yy += 16, row++) {
            const top = row === 0, L = top ? 0 : 4, Rt = top ? 3 : 7;
            if (w <= 16) {
              const h = w >> 1;
              c.drawImage(ts, L * 16, 0, h, 16, x0, yy, h, 16);
              c.drawImage(ts, Rt * 16 + 16 - (w - h), 0, w - h, 16, x0 + h, yy, w - h, 16);
              continue;
            }
            put(L, row, x0, yy, 16);
            for (let xx = x0 + 16; xx < x1 - 16; xx += 16) {
              const v = U.hash(((xx - x0 + wx0) / 16) | 0, row + 7) > 0.5 ? 1 : 0;
              put((top ? 1 : 5) + v, row, xx, yy, Math.min(16, x1 - 16 - xx));
            }
            put(Rt, row, x1 - 16, yy, 16);
          }
        } else {
          const pat = RG.pattern(c, rid, e.world);
          pat.setTransform(new DOMMatrix([1, 0, 0, 1, -e.camPix, y]));
          c.fillStyle = pat;
          c.fillRect(x0 + 1, y, w - 2, 1); c.fillRect(x0, y + 1, w, PH + 15 - y);
        }
        // 越往下越暗：地面线附近细节最清楚，往下逐渐沉进暗色里（视线集中在可以落脚的边沿上）
        { const dk = night ? '6,8,22' : '24,16,14';
          for (let k = 0; k < 14; k++) r(x0, y + 14 + k * 3, w, 3, `rgba(${dk},${(0.05 + k * 0.012).toFixed(3)})`);
          r(x0, y + 56, w, PH + 16, `rgba(${dk},0.25)`);
          r(x0, y + 72, w, PH + 16, `rgba(${dk},0.3)`); }
        { const wxs = e.G.weather ? e.G.weather[LV.regionAt(s.x0)] : 'clear';
          if (wxs === 'snow' && rid !== 'glacier' && rid !== 'tibet') edgeLip(s, x0, x1, y, rid, e); }
        if (rid === 'wall') {         // 城墙垛口
          const col = night ? '#4a4258' : '#9a8266', top = night ? '#5e566e' : '#b4a084';
          for (let wx = Math.ceil((x0 + e.camPix) / 8) * 8; wx < x1 + e.camPix - 3; wx += 8) {
            const sx = wx - e.camPix; r(sx, y - 3, 4, 3, col); r(sx, y - 3, 4, 1, top);
          }
        }
        if (rid === 'garden') {       // 栏杆
          const col = night ? '#8a8ca8' : '#ece8de';
          r(x0, y - 4, w, 1, col);
          for (let wx = Math.ceil((x0 + e.camPix) / 10) * 10; wx < x1 + e.camPix; wx += 10) r(wx - e.camPix, y - 5, 1, 5, col);
        }
        break;
      }
      case 'steps': {      // 夜里露出的青石阶
        for (let bx = x0 + 1; bx < x1 - 2; bx += 9) {
          const bw = Math.min(8, x1 - 1 - bx);
          r(bx + 1, y + 3, bw - 2, PH + 16 - y, night ? '#2a3448' : '#5c6466');
          r(bx, y, bw, 3, night ? '#7884a0' : '#a8aca4');
          r(bx, y, bw, 1, night ? '#9aa6c4' : '#c8ccc4');
          r(bx + 1, y + 3, bw - 2, 1, '#4a6a4a');
        }
        break;
      }
      case 'boat': {       // 乌篷船：船尾有船夫撑篙，载人时随拍子撑一下
        const moving = !!s.moving;
        const bob = e.reduce ? 0 : Math.round(Math.sin(e.t * (moving ? 3.2 : 1.8) + (s.bx0 || s.x0) * 0.01) * 0.6);
        const yy = y + bob, wood = night ? '#4a3a40' : '#6a4a32', dark = night ? '#2a2028' : '#3e2a1e', rim = night ? '#7a6a6a' : '#a07a52';
        // 船尾的水波（开船时）
        if (moving && !e.reduce) {
          const wc = night ? 'rgba(190,205,255,0.5)' : 'rgba(255,255,255,0.6)';
          for (let k = 0; k < 4; k++) {
            const ph = (e.t * 2 + k * 0.25) % 1, wx = x0 - 2 - Math.round(ph * 22), ww = 3 + Math.round(ph * 6);
            r(wx, yy + 4 + (k % 2), ww, 1, wc);
          }
          r(x1, yy + 3, 2, 1, wc); r(x1 + 1, yy + 2, 1, 1, wc);     // 船头破开的浪
        }
        r(x0 - 1, yy, w + 2, 1, rim);
        r(x0, yy + 1, w, 2, wood); r(x0 + 2, yy + 3, w - 4, 2, dark); r(x0 + 5, yy + 5, w - 10, 1, dark);
        r(x0 - 2, yy - 1, 2, 1, rim); r(x1, yy - 1, 2, 1, rim);   // 两头微微翘起
        const cx0 = x0 + Math.round(w * 0.38), cx1 = x0 + Math.round(w * 0.74);    // 乌篷
        const roof = night ? '#1a1820' : '#2a2a30', rib = night ? '#2e2c38' : '#46464e';
        r(cx0, yy - 5, cx1 - cx0, 5, roof); r(cx0 + 1, yy - 6, cx1 - cx0 - 2, 1, roof); r(cx0 + 2, yy - 7, cx1 - cx0 - 4, 1, roof);
        for (let k = cx0 + 2; k < cx1; k += 3) r(k, yy - 6, 1, 5, rib);
        // 船夫：斗笠、短褂，手里一根竹篙
        const bx = x1 - 4, push = moving && !e.reduce ? (e.G.beat() % 1) : 0.6;
        const hat = night ? '#8a7a5a' : '#d8c088', coat = night ? '#2a3448' : '#3a5a7a', skin = night ? '#a88a7a' : '#e0b08a';
        r(bx - 1, yy - 4, 3, 4, coat); r(bx, yy - 6, 1, 2, skin);
        r(bx - 2, yy - 7, 5, 1, hat); r(bx - 1, yy - 8, 3, 1, hat);
        const lean = Math.round(push * 4);                       // 竹篙从高处斜插进水里
        const pc = night ? '#6a6a50' : '#b8a060';
        for (let k = 0; k < 14; k++) r(bx + 2 + Math.round((k / 14) * (3 - lean)), yy - 9 + k, 1, 1, pc);
        break;
      }
      case 'lotus': case 'floe': {     // 残荷 / 浮冰：踩上去会沉
        if (s.gone) break;
        const wl = RG.R[rid].water, wy = wl ? Math.round(wl[e.world] / P) : PH;
        const sunk = s.y - s.by, tilt = sunk > 0 ? Math.min(2, Math.round(sunk / 10)) : 0;
        const lotus = s.kind === 'lotus';
        const top = lotus ? (night ? '#3a5a4a' : '#5a8a3a') : (night ? '#b8c8e8' : '#eef6fc');
        const rim = lotus ? (night ? '#24382e' : '#3a6028') : (night ? '#7a8ab0' : '#a8cce4');
        const vein = lotus ? (night ? '#4a6a58' : '#8ab05a') : '#ffffff';
        c.save(); c.beginPath(); c.rect(x0 - 4, 0, w + 8, wy + 1); c.clip();
        const ol = '#17131c', lite = lotus ? (night ? '#5a7a68' : '#9ac85a') : '#ffffff', side = lotus ? rim : (night ? '#5a6a98' : '#7aa8cc');
        for (let i = 0; i < w; i++) {
          const k = i / (w - 1), dy = Math.round((k - 0.5) * tilt * 2), yy = y + dy;
          const ins = Math.min(i, w - 1 - i), cut = lotus && Math.abs(i - (w >> 1) - 3) < 1;   // 荷叶上的小缺口
          if (ins === 0) { r(x0 + i, yy, 1, 2, ol); continue; }
          r(x0 + i, yy - 1, 1, 1, ol);
          if (cut) { r(x0 + i, yy, 1, 1, ol); r(x0 + i, yy + 1, 1, 1, rim); r(x0 + i, yy + 2, 1, 1, ol); continue; }
          r(x0 + i, yy, 1, 1, ins > 1 && ins < 5 ? lite : top);
          r(x0 + i, yy + 1, 1, 1, top);
          r(x0 + i, yy + 2, 1, 1, side);
          r(x0 + i, yy + 3, 1, 1, ol);
          if (!lotus && ins > 1) r(x0 + i, yy + 4, 1, 1, i % 4 ? side : ol);
        }
        if (lotus) {
          const cx = x0 + (w >> 1) - 1;
          for (let k = 1; k < 5; k++) r(cx - k * 2 + 1, y + 1, 1, 1, vein), r(cx + k * 2, y + 1, 1, 1, vein);
          if (!sunk && (s.x0 / 120 | 0) % 2 === 0) {            // 一朵荷花
            const fx = x0 + 4, pk = night ? '#a07090' : '#f0a0b8', pk2 = night ? '#704a68' : '#d06a8a';
            r(fx, y - 4, 1, 3, ol); r(fx + 4, y - 4, 1, 3, ol); r(fx + 1, y - 5, 3, 1, ol);
            r(fx + 1, y - 4, 3, 3, pk); r(fx + 2, y - 4, 1, 2, pk2); r(fx + 2, y - 6, 1, 1, ol);
          }
        } else { r(x0 + 3, y, 3, 1, vein); r(x1 - 7, y, 2, 1, vein); }
        c.restore();
        if (sunk > 0 && !e.reduce) {                // 往下沉时冒出的水圈
          const wc = night ? 'rgba(190,205,255,0.5)' : 'rgba(255,255,255,0.6)';
          r(x0 - 2, Math.min(y, wy) + 1, 2, 1, wc); r(x1, Math.min(y, wy) + 1, 2, 1, wc);
        } else if (s.stood > 0 && !e.reduce) {
          r(x0 + ((e.t * 30) | 0) % 2, y - 1, w - 1, 1, 'rgba(255,255,255,0.35)');   // 刚踩上去：叶面一抖
        }
        break;
      }
      case 'firefly': {    // 萤火连成的路
        for (let fx = x0 + 1, k = 0; fx < x1; fx += 3, k++) {
          const on = e.reduce ? 1 : 0.55 + 0.45 * Math.sin(e.t * 3 + k * 1.7);
          const fy = y + (k % 2) - (on > 0.8 ? 1 : 0);
          r(fx, fy, 1, 1, `rgba(220,255,150,${(0.5 + on * 0.5).toFixed(2)})`);
          if (k % 2 === 0) X.glow(fx, fy, 5, [190, 255, 120], 0.45 * on);
        }
        break;
      }
      case 'pillar': {     // 冰柱
        r(x0 + 1, y + 2, w - 2, PH + 16 - y, night ? '#3a5a8a' : '#6aa0c8');
        r(x0 + 2, y + 2, 2, PH + 16 - y, night ? '#6a8ac0' : '#bfe0f2');
        r(x1 - 3, y + 2, 2, PH + 16 - y, night ? '#2a3a6a' : '#4a7aa8');
        r(x0, y, w, 2, '#f2f6fa');
        if (night) X.glow((x0 + x1) / 2, y, 12, [170, 210, 255], 0.35);
        break;
      }
      case 'eave': {       // 飞檐：琉璃瓦顶 + 红柱，白天升、夜里落；另一面的高度用虚线预告
        const img = night ? RG.spritesNight : RG.sprites, a = RF.ATLAS.eave;
        const ox = 1, oy = 1, tw = a[2] - 2;                 // 跳过描边那一圈，按瓦片平铺
        // 两根红柱，从檐下一直伸到画面底
        const pc = night ? ['#7a3a4a', '#4a2030'] : ['#c8402e', '#7a1e1c'];
        for (const px of [x0 + 3, x1 - 6]) { r(px, y + 7, 3, PH + 16 - y, pc[0]); r(px + 2, y + 7, 1, PH + 16 - y, pc[1]); r(px, y + 7, 1, PH + 16 - y, pc[1]); }
        if (img && a) {
          for (let xx = x0; xx < x1; xx += tw) {
            const ww = Math.min(tw, x1 - xx);
            c.drawImage(img, a[0] + ox, a[1] + oy - 1, ww, a[3] - 1, xx, y - 1, ww, a[3] - 1);
          }
          r(x0 - 2, y - 2, 3, 1, night ? '#8a7a50' : '#f0c858'); r(x1 - 1, y - 2, 3, 1, night ? '#8a7a50' : '#f0c858');   // 两角起翘
          r(x0 - 3, y - 3, 1, 1, night ? '#8a7a50' : '#f0c858'); r(x1 + 2, y - 3, 1, 1, night ? '#8a7a50' : '#f0c858');
        }
        const oy2 = Math.round((e.world === 'day' ? s.yn : s.yd) / P);
        const ga = e.ghostA(s.x0, s.x1);
        if (oy2 !== Math.round((e.world === 'day' ? s.yd : s.yn) / P) && ga > 0.02) {
          c.globalAlpha = ga; dashH(x0, x1, oy2, previewCol(e), 3, 2); dashH(x0, x1, oy2 + 1, previewCol(e), 3, 2);
          dashV(x0, Math.min(oy2, y), Math.max(oy2, y), previewCol(e)); dashV(x1 - 1, Math.min(oy2, y), Math.max(oy2, y), previewCol(e));
          c.globalAlpha = 1;
        }
        if (s.moving && !e.reduce) for (let k = 0; k < 4; k++) r(x0 + 2 + Math.floor(U.hash(k, (e.t * 20) | 0) * (w - 4)), y + 8 + k * 3, 1, 2, 'rgba(255,255,255,0.35)');
        break;
      }
      case 'ice': {        // 夜里结冰的湖面
        r(x0, y, w, 3, 'rgba(190,220,250,0.8)'); r(x0, y, w, 1, '#eef6ff');
        for (let k = x0 + 4; k < x1 - 4; k += 11) { r(k, y + 1, 3, 1, '#ffffff'); }
        X.glow((x0 + x1) / 2, y + 1, Math.max(8, w * 0.4), [170, 210, 255], 0.25);
        break;
      }
    }
  }

  // 地面边缘：积雪的檐、垂下的草，让方块的地面不那么生硬
  const LIP = {
    jiangnan: { grass: ['#5d7a4a', '#3e5a34'] }, autumn: { grass: ['#9aa83a', '#5a6a2a'], leaf: '#d0682a' },
    garden: null, wall: { grass: ['#7a8a4a', '#4a5a2a'] }, glacier: { snow: true }, tibet: { snow: true }
  };
  function edgeLip(s, x0, x1, y, rid, e) {
    const night = e.world === 'night', w = x1 - x0;
    const ri = LV.regionAt(s.x0), wx = e.G.weather ? e.G.weather[ri] : 'clear';
    const L0 = LIP[rid] || {}, snow = L0.snow || wx === 'snow';
    const H = (i, k) => U.hash(Math.floor(s.x0) + i * 7, k);
    if (snow) {
      const sn = night ? '#b8c4e4' : '#f6f8fc', sh = night ? '#7884b0' : '#c4d2e4';
      r(x0, y - 1, w, 2, sn); r(x0 - 1, y, 1, 2, sn); r(x1, y, 1, 2, sn);
      r(x0, y + 1, w, 1, sh);
      for (let i = 0; i < w; i += 3) if (H(i, 1) > 0.6) r(x0 + i, y - 2, 2 + (H(i, 2) > 0.5 ? 1 : 0), 1, sn);   // 雪堆起伏
      // 檐边挂的冰凌
      r(x0 - 1, y + 2, 1, 2, sh); r(x1, y + 2, 1, 3, sh); r(x0, y + 2, 1, 1, sh);
      for (let i = 4; i < w - 4; i += 9) if (H(i, 3) > 0.7) r(x0 + i, y + 2, 1, 1 + Math.floor(H(i, 4) * 2), sh);
      return;
    }
    if (L0.grass) {
      const [g1, g2] = night ? ['#2a3a4a', '#1a2434'] : L0.grass;
      // 顶上一排草尖
      for (let i = 1; i < w - 1; i++) {
        const hh = H(i, 5);
        if (hh > 0.72) r(x0 + i, y - 1, 1, 1, g1);
        if (hh > 0.93) r(x0 + i, y - 2, 1, 1, g1);
      }
      r(x0, y, w, 1, g1);
      // 两侧垂下的草
      r(x0 - 1, y, 1, 3, g2); r(x0, y + 1, 1, 4, g2); r(x0 - 1, y + 4, 1, 1, g2);
      r(x1, y, 1, 3, g2); r(x1 - 1, y + 1, 1, 5, g2); r(x1, y + 5, 1, 2, g2);
      if (L0.leaf && !night) for (let i = 2; i < w - 2; i += 5) if (H(i, 6) > 0.75) r(x0 + i, y, 1, 1, L0.leaf);
    }
  }

  // ------------------------------------------------------------ 预告轮廓（另一面独有的东西）
  function previewCol(e) { return e.world === 'day' ? '#2a4cc0' : '#ffd88a'; }
  function dashH(x0, x1, y, col, on, off) { for (let x = x0; x < x1; x += on + off) r(x, y, Math.min(on, x1 - x), 1, col); }
  function dashV(x, y0, y1, col) { for (let y = y0; y < y1; y += 4) r(x, y, 1, Math.min(2, y1 - y), col); }
  // 另一面的预告：不画虚线框，而是一层半透明、带水纹抖动的剪影，像隔着水面看见另一个世界
  function ghostSolid(s, e) {
    const a = e.ghostA(s.x0, s.x1); if (a <= 0.02) return;
    const x0 = Math.round(s.x0 / P) - e.camPix, x1 = Math.round(s.x1 / P) - e.camPix, y = Math.round(s.y / P);
    if (x1 < 0 || x0 > PW) return;
    const c = X.ctx, col = previewCol(e), t = e.reduce ? 0 : e.t;
    c.globalAlpha = Math.min(1, a * 1.1);
    for (let x = x0; x < x1; x++) {                               // 地面线：亮线 + 轻微的波动
      const wv = Math.round(Math.sin(x * 0.35 + t * 4) * 0.6);
      r(x, y + wv, 1, 1, col);
    }
    if (!s.thin) {
      for (let k = 1; k < 12; k++) {                               // 往下一层层淡开的点阵（隔点填色，不挡背景）
        c.globalAlpha = a * (0.55 - k * 0.042);
        for (let x = x0 + ((k + (t * 6 | 0)) & 1); x < x1; x += 2) r(x, y + k, 1, 1, col);
      }
      c.globalAlpha = a * 0.8;
      r(x0, y, 1, 8, col); r(x1 - 1, y, 1, 8, col);
    }
    c.globalAlpha = 1;
  }
  // 物件的剪影：用整张图集的单色剪影，左右错开一像素随时间抖，像水里的倒影
  function ghostSprite(name, x, y, a, e) {
    const img = RG.spritesGhost && RG.spritesGhost[e.world], at = RF.ATLAS[name];
    if (!img || !at) return false;
    const c = X.ctx, t = e.reduce ? 0 : e.t;
    const dx = Math.round(Math.sin(t * 5) * 0.8);
    c.globalAlpha = a * 0.55;
    c.drawImage(img, at[0], at[1], at[2], at[3], Math.round(x - at[4]) + dx, Math.round(y - at[5]), at[2], at[3]);
    c.globalAlpha = a * 0.35;
    for (let k = 0; k < at[3]; k += 3)                              // 水平的亮纹，一条条往上走
      if (((k + (t * 10 | 0)) % 6) < 2) c.drawImage(img, at[0], at[1] + k, at[2], 1, Math.round(x - at[4]) - dx, Math.round(y - at[5]) + k, at[2], 1);
    c.globalAlpha = 1;
    return true;
  }
  function ghostRect(x0, y0, x1, y1, a, e) {
    const c = X.ctx, col = previewCol(e);
    c.globalAlpha = a * 0.4;
    for (let y = y0; y < y1; y++) for (let x = x0 + ((y + (e.t * 6 | 0)) & 1); x < x1; x += 2) r(x, y, 1, 1, col);
    c.globalAlpha = a * 0.8;
    r(x0, y0, x1 - x0, 1, col); r(x0, y1 - 1, x1 - x0, 1, col);
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 障碍
  const HSPR = { stall: 'stall', door: 'door', drum: 'drum', block: 'block', rock: 'rock', shard: 'shard', mani: 'mani', yak: 'yak' };
  function hazard(h, e, gates, ghost) {
    const x0 = Math.round(h.x0 / P) - e.camPix, x1 = Math.round(h.x1 / P) - e.camPix;
    const y0 = Math.round(h.y0 / P), y1 = Math.round(h.y1 / P), cx = (x0 + x1) / 2;
    if (x1 < -12 || x0 > PW + 12) return;
    if (ghost) {
      const a = e.ghostA(h.x0, h.x1); if (a <= 0.02) return;
      const nm = h.gate ? (gates[h.gate] ? 'gate_open' : 'gate') : h.kind === 'beacon' ? 'beacon0' : HSPR[h.kind];
      if (!nm || !ghostSprite(nm, cx, y1, a, e)) ghostRect(x0, y0, x1, y1, a, e);
      return;
    }
    const night = e.world === 'night';
    if (h.gate) {
      const open = gates[h.gate];
      spr(open ? 'gate_open' : 'gate', cx, y1, night);
      if (!open) X.glow(cx, y0 + (y1 - y0) * 0.45, 6, [255, 200, 90], 0.5);
      return;
    }
    if (h.kind === 'beacon') {
      spr('beacon' + (Math.floor(e.t * 6) % 2), cx, y1, night);
      X.glow(cx, y0 + 3, 16, [255, 150, 60], 0.7);
      return;
    }
    if (h.kind === 'arch') {    // 江南石拱桥：拱起的桥面、栏杆、低矮的桥洞，两侧小洞
      const st = night ? '#5a6078' : '#a4a49a', st2 = night ? '#3e4258' : '#7a7a70', hi = night ? '#7a82a0' : '#d0d0c4', moss = night ? '#2e3a40' : '#6a7a52';
      const cxp = Math.round(cx), half = 30, base = y1 + 16;
      const deckAt = x => { const k = (x - cxp) / half; return y0 + Math.round(12 * k * k); };
      const hole = (x, hw, top) => { const k = (x - cxp) / hw; return Math.abs(k) < 1 ? Math.round(top + (base - top) * (1 - Math.sqrt(1 - k * k))) : null; };
      for (let x = cxp - half; x <= cxp + half; x++) {
        const d = deckAt(x);
        let open = hole(x, 13, y1);
        const side = Math.abs(x - cxp) - 21;                         // 两侧的小洞
        if (open === null && Math.abs(side) < 4) { const k = side / 4; open = Math.round(base - 7 + 7 * (1 - Math.sqrt(1 - k * k))); }
        const bottom = open === null ? base + 4 : open;
        r(x, d + 2, 1, bottom - d - 2, st);
        if (open !== null) r(x, open - 1, 1, 1, st2);
        r(x, d, 1, 2, hi);                                          // 桥面
        if ((x - cxp) % 5 === 0) r(x, d - 4, 1, 4, hi);              // 栏杆柱
        r(x, d - 4, 1, 1, hi);
        if ((x + Math.floor(d / 4)) % 7 === 0) r(x, d + 4, 1, Math.max(0, bottom - d - 6), st2);   // 竖向砌缝
      }
      for (let yy = y0 + 8; yy < base; yy += 4)                     // 横向砌缝（只画在桥身上）
        for (let x = cxp - half + 2; x <= cxp + half - 2; x++) {
          const o = hole(x, 13, y1);
          if (yy > deckAt(x) + 3 && (o === null || yy < o - 1) && x % 2) r(x, yy, 1, 1, st2);
        }
      for (let x = cxp - half; x <= cxp + half; x += 3) if (U.hash(x, 51) > 0.6) r(x, base + 1 + Math.floor(U.hash(x, 52) * 3), 1, 2, moss);   // 水线上的青苔
      return;
    }
    if (h.kind === 'gust') {   // 雪旋风：几圈转动的雪粒
      for (let k = 0; k < 14; k++) {
        const yy = y1 - k * (y1 - y0) / 14, rr = 2 + k * 0.35, ph = (e.reduce ? 0 : e.t * 8) + k * 0.9;
        r(Math.round(cx + Math.cos(ph) * rr), Math.round(yy), 1, 1, night ? 'rgba(200,215,255,0.9)' : 'rgba(255,255,255,0.95)');
        r(Math.round(cx - Math.cos(ph) * rr * 0.6), Math.round(yy) - 1, 1, 1, night ? 'rgba(150,170,220,0.7)' : 'rgba(210,225,240,0.8)');
      }
      return;
    }
    spr(HSPR[h.kind] || 'block', cx, y1 - (h.kind === 'drum' || h.kind === 'yak' || h.kind === 'mani' ? e.pulse : 0), night);
  }

  // ------------------------------------------------------------ 铃（铜铃 / 锣 / 转经筒）
  function bell(b, e, gates, ghost) {
    const x = Math.round(b.x / P) - e.camPix, base = Math.round((b.y + 34) / P);
    if (x < -10 || x > PW + 10) return;
    const rung = gates[b.id], fl = e.flash(b.id) || 0;
    if (ghost) {
      const a = e.ghostA(b.x, b.x) * (rung ? 0.3 : 1); if (a <= 0.02) return;
      if (!ghostSprite(b.kind === 'gong' ? 'gong' : b.kind === 'wheel' ? 'wheel' : 'bell', x, base, a, e)) ghostRect(x - 3, base - 13, x + 4, base - 6, a, e);
      return;
    }
    const shake = fl > 0 && !e.reduce ? Math.round(Math.sin(e.t * 30) * fl) : 0;
    spr(b.kind === 'gong' ? 'gong' : b.kind === 'wheel' ? 'wheel' : 'bell', x + shake, base, e.world === 'night');
    X.glow(x, base - 9, rung ? 8 + fl * 14 : 7, [255, 210, 120], rung ? 0.25 + fl * 0.5 : 0.5);
    if (fl > 0) {   // 一圈像素波纹
      const rr = Math.round((1.2 - fl) * 26) + 4, col = `rgba(255,230,170,${(fl * 0.7).toFixed(2)})`;
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; r(Math.round(x + Math.cos(a) * rr), Math.round(base - 9 + Math.sin(a) * rr), 1, 1, col); }
    }
  }

  // ------------------------------------------------------------ 灯（收集物）
  function lantern(l, e, got, ghost) {
    const x = Math.round(l.x / P) - e.camPix;
    if (x < -8 || x > PW + 8) return;
    const fl = e.flash('l' + l.i) || 0;
    if (got[l.i] && fl <= 0) return;
    const bob = e.reduce ? 0 : Math.round(Math.sin(e.t * 2 + l.i));
    const y = Math.round(l.y / P) + bob - (got[l.i] ? Math.round((1 - fl) * 14) : 0);
    if (ghost) { const a = e.ghostA(l.x, l.x); if (a > 0.02 && !got[l.i]) ghostSprite('lantern', x, y + 4, a, e); return; }
    spr('lantern', x, y + 4 - e.pulse, false, got[l.i] ? fl : 1);
    X.glow(x, y, 9 + fl * 10, [255, 190, 110], (0.7 + fl * 0.3) * (got[l.i] ? fl : 1));
  }

  // ------------------------------------------------------------ 铜钱：这一面的转着发光，另一面的只留一个小点
  function coins(e, x0, x1) {
    const G = e.G, cs = LV.coins || [];
    const night = e.world === 'night';
    for (const c of cs) {
      if (c.x < x0) continue;
      if (c.x > x1) break;
      if (G.cgot[c.i]) continue;
      const x = Math.round(c.x / P) - e.camPix, y = Math.round(c.y / P);
      if (c.w === e.world) {
        const ph = e.reduce ? 0 : Math.floor((e.t * 8 + c.i * 0.7) % 4);
        spr(['coin0', 'coin1', 'coin2', 'coin1'][ph], x, y + 3 - e.pulse, false);
        X.glow(x, y, 5, [255, 210, 110], night ? 0.35 : 0.15);
      } else if (!e.noGhost) {
        const a = e.ghostA(c.x, c.x); if (a < 0.05) continue;
        const c2 = X.ctx; c2.globalAlpha = a * 0.8;
        r(x - 1, y - 1, 3, 1, e.world === 'day' ? '#2a4cc0' : '#ffd88a'); r(x - 1, y + 1, 3, 1, e.world === 'day' ? '#2a4cc0' : '#ffd88a');
        r(x - 1, y, 1, 1, e.world === 'day' ? '#2a4cc0' : '#ffd88a'); r(x + 1, y, 1, 1, e.world === 'day' ? '#2a4cc0' : '#ffd88a');
        c2.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------ 月洞门：粉墙上一个圆洞，穿过去天色翻转
  function moongate(mg, e) {
    const x = Math.round(mg.x / P) - e.camPix, y = Math.round(mg.y / P);
    if (x < -24 || x > PW + 24) return;
    const night = e.world === 'night';
    const wall = night ? '#7c80a0' : '#ece6d8', wall2 = night ? '#5e6280' : '#cfc7b4', tile = night ? '#2a2c40' : '#4a4c52', ring = night ? '#9a9ec0' : '#b8b0a0';
    const R = 12, cy = y - 12, H = 46, half = 17;
    for (let xx = x - half; xx <= x + half; xx++) {
      const dx = xx - x;
      const inside = Math.abs(dx) < R ? Math.round(Math.sqrt(R * R - dx * dx)) : -1;
      for (let yy = y - H + 4; yy < y; yy++) {
        const dy = yy - cy;
        if (inside >= 0 && Math.abs(dy) <= inside) continue;          // 圆洞
        const d = Math.sqrt(dx * dx + dy * dy);
        r(xx, yy, 1, 1, d < R + 2 ? ring : (xx === x - half || xx === x + half ? wall2 : wall));
      }
    }
    const LV = RF.LEVEL, tib = LV.regions[LV.regionAt(mg.x)].id === 'tibet';
    if (tib) {                                      // 藏式白墙：顶上一道赭红边玛墙，拉一串经幡
      r(x - half - 1, y - H + 1, half * 2 + 3, 5, night ? '#4a2430' : '#8a2a24');
      r(x - half - 1, y - H + 1, half * 2 + 3, 1, '#17131c');
      const FL = ['#2a5cc0', '#f4f4f0', '#c83030', '#2a9a4a', '#e8c030'];
      for (let k = 0; k < 9; k++) {
        const fx = x - half - 14 + k * 4, fy = y - H - 6 + Math.round(Math.abs(k - 4) * 1.2);
        r(fx, fy, 3, 3, night ? '#6a6a88' : FL[k % 5]); r(fx, fy - 1, 4, 1, '#3a3036');
      }
    } else {
    // 墙头的瓦
    r(x - half - 2, y - H + 2, half * 2 + 5, 2, tile); r(x - half - 1, y - H + 1, half * 2 + 3, 1, tile);
    for (let xx = x - half - 1; xx <= x + half + 2; xx += 3) r(xx, y - H + 4, 1, 1, tile);
    }
    if (!e.reduce) X.glow(x, cy, 10, night ? [180, 200, 255] : [255, 236, 190], 0.25 + 0.1 * Math.sin(e.t * 3));
  }

  // ------------------------------------------------------------ 滚木：迎面滚来
  function roller(h, e, ghost) {
    const x0 = Math.round(h.x0 / P) - e.camPix, x1 = Math.round(h.x1 / P) - e.camPix;
    const y0 = Math.round(h.y0 / P), y1 = Math.round(h.y1 / P);
    if (x1 < -12 || x0 > PW + 12) return;
    if (ghost) { const a = e.ghostA(h.x0, h.x1); if (a > 0.02) ghostRect(x0, y0, x1, y1, a, e); return; }
    const night = e.world === 'night', cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1, rad = ((y1 - y0) >> 1);
    const snow = h.kind === 'snow';                 // 雪球滚石
    const bark = snow ? (night ? '#7a86a8' : '#a8bcd0') : night ? '#3a2e3a' : '#6a4a2a',
      wood = snow ? (night ? '#b8c4dc' : '#f4f8fc') : night ? '#6a5a5a' : '#c89a5a',
      ringc = snow ? (night ? '#9aa8c4' : '#d4e2ee') : night ? '#4a3e48' : '#9a6a3a';
    for (let yy = -rad - 1; yy <= rad + 1; yy++) {   // 描一圈深色外轮廓，和别的物件统一
      const hw = Math.round(Math.sqrt(Math.max(0, (rad + 1) * (rad + 1) - yy * yy)));
      r(cx - hw, cy + yy, hw * 2 + 1, 1, '#17131c');
    }
    for (let yy = -rad; yy <= rad; yy++) {
      const hw = Math.round(Math.sqrt(rad * rad - yy * yy));
      r(cx - hw, cy + yy, hw * 2 + 1, 1, bark);
      if (hw > 1) r(cx - hw + 1, cy + yy, hw * 2 - 1, 1, wood);
    }
    for (const rr of [rad - 3, rad - 6]) {          // 年轮
      if (rr <= 0) continue;
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; r(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 1, 1, ringc); }
    }
    const ang = -(h.bx0 - h.x0) / (rad * P);        // 滚动：一道裂纹跟着转
    for (let k = 0; k < rad; k++) r(Math.round(cx + Math.cos(ang) * k), Math.round(cy + Math.sin(ang) * k), 1, 1, bark);
    if (h.rolling && !e.reduce) { r(x1 + 1, y1 - 1, 2, 1, 'rgba(220,200,170,0.6)'); r(x1 + 3, y1 - 2, 1, 1, 'rgba(220,200,170,0.5)'); }
  }

  // ------------------------------------------------------------ 雪桥：白天看着结实，其实踩不住
  function mirage(m, e) {
    if (e.world !== 'day') return;
    const x0 = Math.round(m.x0 / P) - e.camPix, x1 = Math.round(m.x1 / P) - e.camPix, y = Math.round(m.y / P);
    if (x1 < 0 || x0 > PW) return;
    const c = X.ctx, w = x1 - x0;
    c.globalAlpha = e.reduce ? 0.75 : 0.62 + 0.18 * Math.sin(e.t * 3 + m.x0);
    for (let x = x0; x < x1; x++) {
      const k = (x - x0) / w, sag = Math.round(Math.sin(k * Math.PI) * 2);
      r(x, y + sag, 1, 3, '#f4f8fc'); r(x, y + sag + 3, 1, 1, '#b8d0e4');
    }
    for (let k = 0; k < 4; k++) { const cx = x0 + Math.round(w * (0.2 + k * 0.2)); r(cx, y + 2, 1, 2, '#7aa0c0'); r(cx + 1, y + 3, 1, 1, '#7aa0c0'); }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 路边摆件（只是装饰）
  const DECO_SET = {
    jiangnan: ['reed', 'stonelamp', 'post', 'tuft', 'reed'],
    garden: ['peony', 'redpost', 'stones', 'flowers'],
    autumn: ['maple', 'tuft', 'stones', 'flowers', 'maple'],
    wall: ['banner', 'stones', 'tuft'],
    glacier: ['crystal', 'pine', 'stones', 'pine'],
    tibet: ['chorten', 'flowers', 'stones', 'tuft']
  };
  let decos = null, decosV = -1;
  function buildDecos() {
    decos = []; decosV = LV.version;
    const busy = [];
    for (const h of LV.hazards) busy.push([h.x0 - 60, h.x1 + 60]);
    for (const b of LV.bells) busy.push([b.x - 50, b.x + 50]);
    for (const l of LV.lanterns) busy.push([l.x - 40, l.x + 40]);
    for (const c of LV.checkpoints) busy.push([c.x - 70, c.x + 70]);
    const free = x => !busy.some(([a, b]) => x > a && x < b);
    let k = 0;
    for (const s of LV.solids) {
      if (s.kind !== 'ground' && s.kind !== 'shore') continue;
      const rid = LV.regions[LV.regionAt(s.x0)].id, set = DECO_SET[rid];
      for (let x = s.x0 + 50; x < s.x1 - 50; x += 150 + U.hash(k, 21) * 220, k++) {
        if (!free(x) || U.hash(k, 23) < 0.25) continue;
        decos.push({ x, y: s.y, w: s.w, name: set[Math.floor(U.hash(k, 22) * set.length)] });
      }
    }
  }
  function decorations(e, x0, x1) {
    if (!decos || decosV !== LV.version) buildDecos();     // 换了模式，关卡重建过
    const night = e.world === 'night';
    for (const d of decos) {
      if (d.x < x0 || d.x > x1 || !(d.w === 'both' || d.w === e.world)) continue;
      spr(d.name, Math.round(d.x / P) - e.camPix, Math.round(d.y / P) - (d.name === 'stones' || d.name === 'post' ? 0 : e.pulse), night);
      if (d.name === 'stonelamp' || d.name === 'redpost') X.glow(Math.round(d.x / P) - e.camPix, Math.round(d.y / P) - (d.name === 'redpost' ? 12 : 7), 7, [255, 190, 110], night ? 0.6 : 0.2);
    }
    // 检查点石碑：走到过的亮着灯
    for (let i = 0; i < LV.checkpoints.length; i++) {
      const c = LV.checkpoints[i];
      if (c.x < x0 || c.x > x1 || i === 0) continue;
      const gy = RF.Q.groundAt(e.world, c.x); if (gy === null || gy === undefined) continue;
      const lit = e.G.cpIndex >= i && e.G.state !== 'title';
      const sx = Math.round(c.x / P) - e.camPix - 6, sy = Math.round(gy / P);
      spr(lit ? 'stele_lit' : 'stele', sx, sy, night);
      if (lit) X.glow(sx, sy - 12, 8, [255, 200, 110], 0.6 + (e.reduce ? 0 : 0.15 * Math.sin(e.t * 5)));
    }
  }

  // ------------------------------------------------------------ 编钟架：敲响时最右那口钟荡一下；应和段地上的拍点
  function chimes(e, x0, x1) {
    const G = e.G, night = e.world === 'night';
    for (const ch of LV.chimes) {
      if (ch.x < x0 - 60 || ch.x > x1 + 60) continue;
      const gy = RF.Q.groundAt(e.world, ch.x); if (gy === null || gy === undefined) continue;
      const fl = e.flash('ch' + ch.id) || 0;
      const sx = Math.round(ch.x / P) - e.camPix, sy = Math.round(gy / P);
      spr(fl > 0 ? 'chime1' : 'chime0', sx, sy, night);
      if (fl > 0) X.glow(sx + 5, sy - 14, 10 + fl * 30, [200, 255, 210], fl * 2.5);
    }
    for (const cl of LV.calls) {
      if (cl.x1 < x0 || cl.x > x1) continue;
      cl.beats.forEach((b, i) => {
        const bx = cl.x0 + b * C.BEAT_PX, sx = Math.round(bx / P) - e.camPix;
        const gy = RF.Q.groundAt('day', bx) || RF.Q.groundAt('night', bx); if (!gy) return;
        const sy = Math.round(gy / P) - 3;
        const heard = cl.heard > i, done = cl.echo > i, fl = e.flash('ce' + cl.id + '_' + i) || 0;
        const col = done ? '#fff2b0' : heard ? '#9ae0c0' : 'rgba(255,255,255,0.35)';
        r(sx, sy - 1, 1, 1, col); r(sx - 1, sy, 3, 1, col); r(sx, sy + 1, 1, 1, col);     // 小菱形拍点
        if (heard && !done) X.glow(sx, sy, 5, [160, 255, 200], 0.4 + (e.reduce ? 0 : 0.2 * Math.sin(e.t * 8)));
        if (fl > 0) X.glow(sx, sy, 6 + fl * 20, [255, 240, 170], fl * 1.6);
      });
    }
  }

  // ------------------------------------------------------------ 昼动夜静的踏板：水车、秋千、浮木
  // 白天沿着要走的轨迹画一串淡点（能预判它会停在哪），夜里停住时踏板边上结一点霜光。
  const WD = ['#c08a58', '#93623c', '#6a4228', '#3a2216'], WDN = ['#8a7a8a', '#625468', '#463a50', '#241c2c'];
  function board(x0, x1, y, night, e) {
    const W = night ? WDN : WD, w = x1 - x0;
    r(x0 - 1, y - 1, w + 2, 5, '#17131c');
    r(x0, y, w, 1, W[0]); r(x0, y + 1, w, 1, W[1]); r(x0, y + 2, w, 1, W[2]);
    for (let k = x0 + 3; k < x1 - 1; k += 4) r(k, y + 1, 1, 2, W[3]);          // 木板缝
    r(x0, y, 1, 3, W[2]); r(x1 - 1, y, 1, 3, W[3]);
  }
  function still(x0, x1, y, e) {          // 夜里：停住的踏板上几粒静止的冷光
    if (e.world !== 'night') return;
    for (let k = x0 + 2; k < x1; k += 5) r(k, y - 1, 1, 1, 'rgba(210,230,255,0.85)');
    X.glow((x0 + x1) / 2, y, 10, [170, 200, 255], 0.25);
  }
  function movers(e, x0, x1) {
    const night = e.world === 'night', done = {};
    const sx = x => Math.round(x / P) - e.camPix, sy = y => Math.round(y / P);
    for (const m of LV.movers) {
      if (m.cx + 400 < x0 || m.cx - 400 > x1) continue;
      if (m.kind === 'wheel') {
        if (done[m.group]) continue; done[m.group] = 1;
        const ms = LV.movers.filter(q => q.group === m.group), cx = sx(m.cx), cy = sy(m.cy), R = m.r / P;
        const W = night ? WDN : WD;
        r(cx - 1, cy, 3, PH + 16 - cy, W[2]); r(cx + 1, cy, 1, PH + 16 - cy, W[3]);   // 立柱
        if (!night) for (let k = 0; k < 48; k += 2) { const a = k / 48 * Math.PI * 2; r(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R) + 1, 1, 1, 'rgba(255,255,255,0.25)'); }
        for (let k = 0; k < 64; k++) {                                   // 轮辋
          const a = k / 64 * Math.PI * 2 + ms[0].ang * 0;
          r(Math.round(cx + Math.cos(a) * (R - 2)), Math.round(cy + Math.sin(a) * (R - 2)), 1, 1, W[1]);
        }
        for (let s2 = 0; s2 < 8; s2++) {                                 // 辐条跟着转
          const a = ms[0].ang + s2 / 8 * Math.PI * 2;
          for (let t = 2; t < R - 2; t++) r(Math.round(cx + Math.cos(a) * t), Math.round(cy + Math.sin(a) * t), 1, 1, s2 % 2 ? W[2] : W[1]);
        }
        r(cx - 2, cy - 2, 5, 5, '#17131c'); r(cx - 1, cy - 1, 3, 3, night ? '#9a8a6a' : '#e8c25a');   // 轴
        for (const q of ms) {
          const bx0 = sx(q.x0), bx1 = sx(q.x1), by = sy(q.y);
          r(Math.round((bx0 + bx1) / 2), by + 3, 1, 3, W[3]);
          board(bx0, bx1, by, night, e);
          r(bx0 + 2, by + 3, bx1 - bx0 - 4, 2, night ? '#3a5068' : '#4a7a9a');   // 挂着的水斗
          still(bx0, bx1, by, e);
        }
        continue;
      }
      if (m.kind === 'swing') {
        const px = sx(m.cx), py = sy(m.cy), bx0 = sx(m.x0), bx1 = sx(m.x1), by = sy(m.y);
        // 两根红柱撑着横梁，柱脚没进水里
        for (const qx of [px - 10, px + 9]) { r(qx, py - 2, 2, PH + 16 - py, night ? '#5a2a3a' : '#a8302a'); r(qx, py - 2, 1, PH + 16 - py, night ? '#7a3a4a' : '#d04a3a'); }
        // 横梁：小檐头
        r(px - 9, py - 3, 19, 2, night ? '#2a2c40' : '#3a3c50'); r(px - 8, py - 1, 17, 2, night ? '#7a3a4a' : '#b8302a');
        r(px - 10, py - 4, 1, 1, '#e8c25a'); r(px + 10, py - 4, 1, 1, '#e8c25a');
        if (!night) {                                                    // 摆动的弧线
          for (let k = -10; k <= 10; k++) { const th = m.amp * k / 10; r(Math.round(px + Math.sin(th) * m.r / P), Math.round(py + Math.cos(th) * m.r / P) + 4, 1, 1, 'rgba(255,255,255,0.22)'); }
        }
        const rope = night ? '#8a8070' : '#d8c8a0';
        for (const [ax, bx] of [[px - 2, bx0 + 2], [px + 2, bx1 - 3]]) {
          const n = Math.max(Math.abs(bx - ax), Math.abs(by - py));
          for (let k = 0; k <= n; k++) r(Math.round(ax + (bx - ax) * k / n), Math.round(py + (by - py) * k / n), 1, 1, rope);
        }
        board(bx0, bx1, by, night, e);
        const lx = Math.round((bx0 + bx1) / 2);                          // 板下挂一盏小红灯
        r(lx, by + 3, 1, 2, '#3a2216'); spr('lantern', lx, by + 14, night);
        X.glow(lx, by + 9, 8, [255, 180, 110], night ? 0.6 : 0.3);
        still(bx0, bx1, by, e);
        continue;
      }
      // 浮木：一截圆木，两头有年轮，下面一圈水纹
      const bx0 = sx(m.x0), bx1 = sx(m.x1), by = sy(m.y), w = bx1 - bx0;
      if (!night) for (let k = sx(m.cx - m.amp - m.hw); k <= sx(m.cx + m.amp + m.hw); k += 3) r(k, by + 5, 1, 1, 'rgba(255,255,255,0.25)');
      const L1 = night ? ['#8a7a7a', '#5e5260', '#3e3446'] : ['#b88a5a', '#8a5e38', '#5e3c24'];
      r(bx0 - 1, by - 1, w + 2, 6, '#17131c');
      r(bx0, by, w, 1, L1[0]); r(bx0, by + 1, w, 2, L1[1]); r(bx0, by + 3, w, 1, L1[2]);
      for (let k = bx0 + 4; k < bx1 - 3; k += 7) r(k, by + 1, 3, 1, L1[2]);    // 树皮纹
      r(bx1 - 2, by, 2, 4, night ? '#c8b8a0' : '#f0d8a8'); r(bx1 - 2, by + 1, 1, 2, L1[1]);   // 截面年轮
      if (!night && !e.reduce) { const k = (e.t * 6) | 0; r(bx0 - 3 - k % 3, by + 4, 3, 1, 'rgba(255,255,255,0.5)'); r(bx1 + 1 + k % 3, by + 4, 3, 1, 'rgba(255,255,255,0.5)'); }
      still(bx0, bx1, by, e);
    }
  }

  RF.Props = { movers, spr, solid, ghostSolid, hazard, bell, lantern, mirage, decorations, coins, moongate, roller, chimes };
})();
