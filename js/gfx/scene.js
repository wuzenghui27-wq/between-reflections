// “一景一题”的布景和机关画法（像素坐标）：落潮石板桥、夜泊画舫、水车、柳树、石栏杆、荷叶，
// 以及点灯后飞向院门的光、院门打开时漏出来的光。都是程序画的，不占图集。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX, LV = RF.LEVEL, RG = RF.Regions;
  const P = C.PIX, PW = X.PW, PH = X.PH;
  const r = (x, y, w, h, col) => { const c = X.ctx; c.fillStyle = col; c.fillRect(x, y, w, h); };
  const INK = '#17131c';
  const waterY = (rid, world) => { const w = RG.R[rid].water; return w ? Math.round(w[world] / P) : PH + 20; };

  // ------------------------------------------------------------ 落潮石板桥：石板搭在一排石墩上
  const STONE_D = ['#dfe2da', '#b4b9b0', '#8a908a', '#646a66', '#3e4442'], STONE_N = ['#b4bedc', '#8690b0', '#5c6688', '#3a4260', '#222840'];
  function tideSteps(s, x0, x1, y, rid, e) {
    const night = e.world === 'night', S = night ? STONE_N : STONE_D, w = x1 - x0, wy = waterY(rid, e.world);
    const wx0 = x0 + e.camPix, bottom = PH + 16;
    // 石墩
    const n = Math.max(2, Math.round(w / 15) + 1);
    for (let k = 0; k < n; k++) {
      const px = Math.round(x0 + 1 + (w - 8) * k / (n - 1));
      r(px, y + 3, 6, bottom - y, S[3]); r(px, y + 3, 1, bottom - y, S[2]); r(px + 5, y + 3, 1, bottom - y, S[4]);
      for (let yy = y + 6; yy < wy + 4; yy += 4) r(px + 1, yy, 4, 1, S[4]);                     // 石缝
      r(px, y + 4, 6, 2, night ? '#2e4a48' : '#4e6a4a'); r(px + 1 + (k % 3), y + 6, 2, 1, night ? '#2e4a48' : '#4e6a4a');   // 水线上的青苔
      r(px - 1, y + 3, 8, 1, S[2]);                                                                // 墩帽
      if (!e.reduce) {                                                                             // 墩脚的水沫
        const f = Math.floor(e.t * 3 + k) % 4, fc = night ? 'rgba(200,214,255,0.7)' : 'rgba(255,255,255,0.8)';
        r(px - 1 - (f & 1), wy, 2, 1, fc); r(px + 5 + (f >> 1), wy, 2, 1, fc);
      }
    }
    // 石板：三像素厚，接缝错开
    r(x0, y, w, 1, S[0]); r(x0, y + 1, w, 1, S[1]); r(x0, y + 2, w, 1, S[2]); r(x0, y + 3, w, 1, INK);
    r(x0, y, 1, 3, S[2]); r(x1 - 1, y, 1, 3, S[3]);
    for (let jx = Math.ceil((wx0 + 3) / 13) * 13 - e.camPix; jx < x1 - 3; jx += 13) { r(jx, y, 1, 3, S[3]); r(jx + 1, y, 1, 1, '#ffffff'); }
    for (let xx = x0 + 2; xx < x1 - 2; xx++) {                                                    // 刚出水：板面上的水渍和青苔
      const h = U.hash(xx + wx0, 31);
      if (h > 0.86) r(xx, y, 1, 1, night ? '#3e5e5a' : '#6a8a5a'); else if (h < 0.1) r(xx, y + 1, 1, 1, S[2]);
    }
    // 刚落潮的头一两秒：板底往下滴水
    const sw = e.G.swT;
    if (sw < 1.6 && !e.reduce) {
      const dc = night ? 'rgba(200,220,255,0.85)' : 'rgba(255,255,255,0.85)';
      for (let xx = x0 + 4; xx < x1 - 3; xx += 5) {
        const ph = (sw * 1.6 + U.hash(xx + wx0, 7)) % 1, dy = y + 4 + Math.round(ph * ph * (wy - y - 4));
        if (dy < wy && U.hash(xx + wx0, 8) > sw / 1.6 - 0.2) r(xx, dy, 1, 2, dc);
      }
    }
  }
  // 白天看过去：石板沉在水面下，一片随水纹晃动的暗影，上面偶尔闪一点波光
  function tideGhost(s, x0, x1, y, rid, e, a) {
    const c = X.ctx, t = e.reduce ? 0 : e.t, w = x1 - x0;
    for (let k = 0; k < 6; k++) {                    // 水下的石板：发白的石色，越深越淡
      c.globalAlpha = Math.min(1, a * (1.15 - k * 0.17));
      const dx = Math.round(Math.sin(t * 1.8 + k * 0.9) * (k < 2 ? 0.6 : 1.3));
      r(x0 + dx, y + k, w, 1, k === 0 ? '#c4dcdc' : k < 3 ? '#8fb0b4' : '#5f8890');
    }
    c.globalAlpha = a * 0.5;
    for (let jx = x0 + 12; jx < x1 - 3; jx += 13) r(jx + Math.round(Math.sin(t * 1.8) * 0.6), y, 1, 3, '#3a5a62');
    c.globalAlpha = a * 0.9;
    for (let k = 0; k < Math.ceil(w / 9); k++) {
      const ph = (t * 0.5 + U.hash(k, 3)) % 1, xx = x0 + 2 + Math.floor(U.hash(k, 5) * (w - 6));
      if (ph < 0.3) r(xx + Math.round(ph * 6), y + (k % 2), 3 - (ph > 0.2 ? 1 : 0), 1, '#d8ecf0');
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 夜泊的画舫：舫顶（y）可以站
  function huafang(s, x0, x1, y, rid, e) {
    const night = e.world === 'night', wy = waterY(rid, e.world), w = x1 - x0;
    const TILE = night ? ['#4a5878', '#2e3a58', '#1c2440'] : ['#6a7480', '#4a525c', '#2e343c'];
    const WOOD = night ? ['#8a4a48', '#5e2e36', '#3a1c26'] : ['#b8583c', '#8a3a2a', '#5a2218'];
    const HULL = night ? ['#6a5a5a', '#42363c', '#261e26'] : ['#8a6a4a', '#5e4630', '#3a2a1e'];
    const hy = wy - 5;                                                   // 船身
    r(x0 - 6, hy - 1, w + 12, 7, INK);
    r(x0 - 5, hy, w + 10, 1, HULL[0]); r(x0 - 4, hy + 1, w + 8, 2, HULL[1]); r(x0 - 2, hy + 3, w + 4, 2, HULL[2]);
    r(x0 - 7, hy - 2, 3, 2, HULL[0]); r(x1 + 4, hy - 2, 3, 2, HULL[0]); r(x0 - 8, hy - 3, 2, 1, HULL[0]); r(x1 + 6, hy - 3, 2, 1, HULL[0]);   // 两头翘起
    for (let k = x0 - 3; k < x1 + 3; k += 4) r(k, hy + 1, 1, 1, HULL[0]);
    // 舱：红柱、花窗（夜里窗里亮着）
    const cy0 = y + 5, ch = hy - cy0;
    r(x0, cy0, w, ch, WOOD[2]);
    r(x0, cy0, w, 1, WOOD[0]); r(x0, hy - 2, w, 2, WOOD[1]);                                     // 额枋和栏板
    for (let k = x0 + 1; k < x1 - 1; k += 2) r(k, hy - 2, 1, 1, WOOD[0]);
    const cols = Math.max(2, Math.round(w / 10));
    for (let k = 0; k <= cols; k++) { const px = Math.round(x0 + (w - 2) * k / cols); r(px, cy0, 2, ch, WOOD[0]); r(px + 1, cy0, 1, ch, WOOD[1]); }
    for (let k = 0; k < cols; k++) {
      const a = Math.round(x0 + (w - 2) * k / cols) + 3, b = Math.round(x0 + (w - 2) * (k + 1) / cols) - 1;
      r(a, cy0 + 2, b - a, ch - 5, night ? '#ffd27a' : '#e8dcc0');
      for (let xx = a + 1; xx < b; xx += 2) r(xx, cy0 + 2, 1, ch - 5, night ? '#c8863a' : '#a89878');   // 窗棂
      r(a, cy0 + 2 + ((ch - 5) >> 1), b - a, 1, night ? '#c8863a' : '#a89878');
      if (night) X.glow((a + b) / 2, cy0 + ch / 2, 9, [255, 200, 120], 0.45);
    }
    // 舫顶：平脊，两头起翘的瓦檐
    r(x0 - 3, y + 3, w + 6, 2, INK);
    r(x0 - 1, y, w + 2, 1, TILE[0]); r(x0 - 1, y + 1, w + 2, 1, TILE[1]);
    r(x0 - 2, y + 2, w + 4, 1, TILE[1]); r(x0 - 3, y + 3, w + 6, 1, TILE[2]);
    for (let k = x0 - 1; k < x1 + 1; k += 3) { r(k, y + 2, 1, 1, TILE[0]); r(k + 1, y + 3, 1, 1, TILE[1]); }
    r(x0 - 4, y + 2, 2, 1, TILE[0]); r(x0 - 5, y + 1, 1, 1, TILE[0]); r(x1 + 2, y + 2, 2, 1, TILE[0]); r(x1 + 4, y + 1, 1, 1, TILE[0]);
    // 檐角各挂一盏小红灯，随风轻轻晃
    for (const [lx, ph] of [[x0 - 3, 0], [x1 + 2, 1.7]]) {
      const sw = e.reduce ? 0 : Math.round(Math.sin(e.t * 1.6 + ph) * 0.7);
      r(lx, y + 4, 1, 2, INK); r(lx - 1 + sw, y + 6, 3, 3, night ? '#ff7a4a' : '#d8402e'); r(lx + sw, y + 6, 1, 3, night ? '#ffe0a0' : '#f08a5a'); r(lx + sw, y + 9, 1, 1, '#f2c850');
      if (night) X.glow(lx + sw, y + 7, 7, [255, 150, 90], 0.6);
    }
    // 缆绳拴在岸上
    for (let k = 0; k < 5; k++) r(x1 + 6 + k, hy - 3 + Math.round(Math.sin(k / 4 * Math.PI) * 1.5) - k, 1, 1, night ? '#8a8070' : '#c8b890');
    // 水面上的灯影
    if (night && !e.reduce) for (let k = 0; k < 5; k++) {
      const ph = (e.t * 0.7 + k * 0.21) % 1;
      r(x0 + 2 + k * Math.round(w / 5) + Math.round(Math.sin(e.t * 2 + k) * 1), wy + 2 + k % 3 * 2, 3, 1, `rgba(255,200,120,${(0.5 * (1 - ph)).toFixed(2)})`);
    }
  }

  // ------------------------------------------------------------ 水车：木架、双层轮辋、辐条、竹筒；白天舀水溅水，夜里水珠停在半空
  const WD = ['#d09a62', '#a06c40', '#6e4628', '#3e2416'], WDN = ['#9a8a9c', '#6c5e74', '#4a3e56', '#261e30'];
  function line(x0, y0, x1, y1, col, th) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) r(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), th || 1, th || 1, col);
  }
  function circle(cx, cy, R, col, n) {
    n = n || Math.round(R * 7);
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; r(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R), 1, 1, col); }
  }
  function waterwheel(ms, cx, cy, R, rid, e) {
    const night = e.world === 'night', W = night ? WDN : WD, wy = waterY(rid, e.world), ang = ms[0].ang;
    const dc = e.G.dclock, wc = night ? 'rgba(200,220,255,0.9)' : 'rgba(255,255,255,0.9)';
    // 后面的木架：人字撑 + 横档，脚插在水里
    for (const d of [-1, 1]) {
      line(cx + d * 2, cy - 2, cx + d * 13, PH + 12, W[3], 2);
      line(cx + d * 2, cy - 2, cx + d * 13, PH + 12, W[2], 1);
    }
    r(cx - 9, cy + 14, 19, 2, W[3]); r(cx - 9, cy + 14, 19, 1, W[2]);
    // 轮辋（外圈两层、内圈一层）
    circle(cx, cy, R - 1, INK); circle(cx, cy, R - 2, W[1]); circle(cx, cy, R - 3, W[2]); circle(cx, cy, R - 4, INK);
    circle(cx, cy, R * 0.5, W[2]);
    // 辐条
    for (let k = 0; k < 8; k++) {
      const a = ang + k / 8 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      line(cx + ca * 3, cy + sa * 3, cx + ca * (R - 3), cy + sa * (R - 3), k % 2 ? W[2] : W[1]);
    }
    // 竹筒：挂在轮辋外沿，转到水里舀水
    for (let k = 0; k < 8; k++) {
      const a = ang + (k + 0.5) / 8 * Math.PI * 2, bx = Math.round(cx + Math.cos(a) * (R - 1)), by = Math.round(cy + Math.sin(a) * (R - 1));
      if (by > wy + 1) continue;
      r(bx - 2, by - 1, 4, 3, INK); r(bx - 1, by - 1, 2, 2, night ? '#8aa07a' : '#c8d07a'); r(bx - 1, by, 2, 1, night ? '#5a7058' : '#8a9a4a');
    }
    // 轴
    r(cx - 3, cy - 3, 7, 7, INK); r(cx - 2, cy - 2, 5, 5, W[1]); r(cx - 1, cy - 1, 3, 3, night ? '#b0a070' : '#f2c850'); r(cx, cy, 1, 1, INK);
    // 水：筒里的水沿着轮子右上方洒下来（跟着白天的钟走，夜里就停在半空）
    for (let k = 0; k < 14; k++) {
      const ph = (dc * 0.9 + k / 14 + U.hash(k, 3) * 0.3) % 1, a0 = -Math.PI / 2 + 0.3 + U.hash(k, 5) * 0.9;
      const sx0 = cx + Math.cos(a0) * (R - 1), sy0 = cy + Math.sin(a0) * (R - 1);
      const dx = sx0 + ph * 4, dy = sy0 + ph * ph * (wy - sy0);
      if (dy >= wy) continue;
      r(Math.round(dx), Math.round(dy), 1, night ? 1 : 2, wc);
      if (night && k % 3 === 0) X.glow(Math.round(dx), Math.round(dy), 3, [190, 215, 255], 0.5);
    }
    // 轮子入水的地方：水沫
    for (let k = 0; k < 6; k++) {
      const ph = (dc * 1.3 + k / 6) % 1, xx = cx - 12 + k * 5 + Math.round(ph * 3);
      r(xx, wy - (ph < 0.4 ? 1 : 0), 2, 1, wc);
    }
  }

  // ------------------------------------------------------------ 陈设
  function willow(d, x, y, e) {
    const night = e.world === 'night', t = e.reduce ? 0 : e.t, f = d.flip ? -1 : 1;
    const T = night ? ['#3a3444', '#221e2c'] : ['#6a5440', '#3e3026'];
    const G = night ? ['#35585a', '#234048', '#4f7a6c'] : ['#7fa85a', '#557f44', '#b4d074'];
    // 树干：往一边斜，越往上越细
    let tx = x;
    for (let k = 0; k < 30; k++) {
      tx = x + f * Math.round(k * k / 150);
      const wd = k < 5 ? 5 : k < 16 ? 4 : 3;
      r(tx - (wd >> 1), y - 1 - k, wd, 1, T[0]); r(tx - (wd >> 1) + (f > 0 ? wd - 1 : 0), y - 1 - k, 1, 1, T[1]);
      if (k % 7 === 3) r(tx - 1, y - 1 - k, 1, 1, T[1]);
    }
    const top = y - 31;
    line(tx, top + 2, tx - 9, top - 6, T[0], 2); line(tx, top + 2, tx + 10, top - 5, T[0], 2); line(tx, top, tx + f * 2, top - 9, T[0], 2);
    // 树冠：三团叶子叠在一起，上亮下暗
    for (const [ox, oy, rx, ry] of [[-9, -8, 10, 5], [8, -9, 11, 5], [0, -13, 12, 6]]) {
      for (let dx = -rx; dx <= rx; dx++) {
        const h = Math.round(ry * Math.sqrt(1 - (dx / (rx + 0.5)) * (dx / (rx + 0.5))));
        for (let dy = -h; dy <= h; dy++) {
          const n = U.hash(tx + ox + dx + 200, top + oy + dy);
          const col = dy < -h + 2 && n > 0.35 ? G[2] : dy > h - 2 || n < 0.25 ? G[1] : G[0];
          r(tx + ox + dx, top + oy + dy, 1, 1, col);
        }
      }
    }
    // 垂下来的柳丝：越往下摆得越开
    for (let i = 0; i < 16; i++) {
      const bx = tx - 17 + Math.round(i * 2.3), len = 12 + Math.round(U.hash(i, 17) * 14), y0 = top - 5 + Math.round(U.hash(i, 19) * 3);
      for (let j = 0; j < len; j++) {
        const sway = Math.round(Math.sin(t * 1.2 + i * 0.6 + j * 0.12) * j / len * 2.2 + j / len * 1.2);
        const col = j > len - 3 ? G[2] : (i + j) % 3 ? G[0] : G[1];
        r(bx + sway, y0 + j, 1, 1, col);
        if (j % 3 === 1) r(bx + sway + ((i + j) & 1 ? 1 : -1), y0 + j, 1, 1, G[1]);
      }
    }
  }
  function rail(x0, x1, y, e) {
    const night = e.world === 'night', S = night ? ['#7c88ac', '#56608a', '#363e60'] : ['#e4e6de', '#b0b6ae', '#7e867f'];
    const w = x1 - x0, n = Math.max(1, Math.round(w / 11));
    r(x0, y - 7, w, 1, S[0]); r(x0, y - 6, w, 1, S[1]); r(x0, y - 2, w, 1, S[1]); r(x0, y - 1, w, 1, S[2]);
    for (let k = 0; k < n; k++) {                                         // 栏板中间镂一朵小花
      const a = Math.round(x0 + w * k / n), b = Math.round(x0 + w * (k + 1) / n), m = (a + b) >> 1;
      r(m - 1, y - 4, 3, 1, S[1]); r(m, y - 5, 1, 3, S[1]);
    }
    for (let k = 0; k <= n; k++) {                                        // 望柱：莲花头
      const px = Math.round(x0 + (w - 2) * k / n);
      r(px, y - 9, 2, 9, S[0]); r(px + 1, y - 9, 1, 9, S[1]); r(px - 1, y - 10, 4, 1, S[1]); r(px, y - 11, 2, 1, S[0]);
    }
  }
  function lotus(d, x, rid, e) {
    const night = e.world === 'night', wy = waterY(rid, e.world);
    const G = night ? ['#2e5a56', '#1e4044'] : ['#6aa05a', '#3e7a48'];
    const bob = e.reduce ? 0 : Math.round(Math.sin(e.t * 1.4 + d.x * 0.02) * 0.6);
    const pad = (px, w) => { r(px, wy + bob, w, 1, G[0]); r(px + 1, wy - 1 + bob, w - 2, 1, G[1]); r(px + (w >> 1), wy + bob, 1, 1, G[1]); };
    pad(x - 6, 6); pad(x + 2, 5); pad(x - 1, 7 - 2);
    // 一枝荷花：白天开着，夜里合成花苞
    r(x + 4, wy - 5 + bob, 1, 5, G[1]);
    if (night) { r(x + 4, wy - 7 + bob, 1, 2, '#b07a9a'); }
    else { r(x + 3, wy - 7 + bob, 3, 2, '#f2a8b8'); r(x + 4, wy - 8 + bob, 1, 1, '#ffd0d8'); r(x + 4, wy - 6 + bob, 1, 1, '#f2c850'); }
  }
  function decos(e, x0, x1, spr) {
    const night = e.world === 'night';
    for (const d of LV.decos) {
      if (d.x1 < x0 - 100 || d.x > x1 + 100 || !(d.w === 'both' || d.w === e.world)) continue;
      const x = Math.round(d.x / P) - e.camPix, y = Math.round(d.y / P), rid = LV.regions[LV.regionAt(d.x)].id;
      if (d.kind === 'willow') willow(d, x, y, e);
      else if (d.kind === 'rail') rail(x, Math.round(d.x1 / P) - e.camPix, y, e);
      else if (d.kind === 'lotus') lotus(d, x, rid, e);
      else if (d.kind === 'spr') {
        spr(d.name, x, y, night);
        if (d.name === 'stonelamp') X.glow(x, y - 7, 7, [255, 190, 110], night ? 0.6 : 0.2);
      }
    }
  }

  // ------------------------------------------------------------ 点灯以后：一串光点从灯飞到院门，门里漏出光来
  function clearFx(G, e) {
    const room = LV.rooms[G.room]; if (!room) return;
    const fl = e.flash(room.exit) || 0, open = G.gates[room.exit];
    const gate = LV.hazards.find(h => h.gate === room.exit); if (!gate) return;
    const gx = Math.round((gate.x0 + gate.x1) / 2 / P) - e.camPix, gy = Math.round(gate.y1 / P);
    if (open) {                                                            // 门开着：门洞里暖光，地上一片光
      const k = fl > 0.6 ? 0 : fl > 0 ? 1 - fl / 0.6 : 1, tw = e.reduce ? 1 : 0.85 + 0.15 * Math.sin(e.t * 3);
      if (k > 0) {
        X.glow(gx, gy - 16, 16, [255, 214, 140], 0.75 * k * tw);
        for (let j = 0; j < 4; j++) { const wdt = Math.round((14 + j * 5) * k); r(gx - wdt - 2, gy + j, wdt, 1, `rgba(255,220,150,${(0.5 - j * 0.1) * k * tw})`); }
        if (!e.reduce) for (let j = 0; j < 5; j++) {                        // 门里飘出来的光尘
          const ph = (e.t * 0.35 + j * 0.2) % 1;
          r(gx - 3 - Math.round(ph * 16), gy - 6 - Math.round(ph * 14 + Math.sin(e.t * 2 + j) * 2), 1, 1, `rgba(255,236,180,${(0.9 * (1 - ph) * k).toFixed(2)})`);
        }
      }
    }
    if (fl > 0.5) {                                                        // 光点沿一道弧飞过去
      const l = LV.lanterns[room.lamps[room.lamps.length - 1]];
      const lx = Math.round(l.x / P) - e.camPix, ly = Math.round(l.y / P), p = 1 - (fl - 0.5) / 0.7;
      for (let j = 0; j < 9; j++) {
        const q = U.clamp(p * 1.25 - j * 0.03, 0, 1); if (q <= 0 || q >= 1) continue;
        const x = lx + (gx - lx) * q, y = ly + (gy - 18 - ly) * q - Math.sin(q * Math.PI) * 14;
        r(Math.round(x), Math.round(y), j ? 1 : 2, j ? 1 : 2, j < 3 ? '#fff6d8' : 'rgba(255,214,140,0.8)');
        if (j === 0) X.glow(Math.round(x), Math.round(y), 8, [255, 220, 150], 0.9);
      }
    } else if (fl > 0.3) {                                                 // 到了：门上一圈光
      const k = (0.5 - fl) / 0.2, rr = 4 + Math.round(k * 18);
      circle(gx, gy - 17, rr, `rgba(255,230,170,${(1 - k).toFixed(2)})`, 30);
      X.glow(gx, gy - 17, 22, [255, 230, 170], 1 - k);
    }
  }

  // ------------------------------------------------------------ 木箱、踏石、木桩
  function crates(e) {
    const night = e.world === 'night', W = night ? WDN : WD, G = e.G;
    for (const c of LV.crates) {
      const x0 = Math.round(c.x0 / P) - e.camPix, x1 = Math.round(c.x1 / P) - e.camPix, y0 = Math.round(c.y0 / P), y1 = Math.round(c.y1 / P);
      if (x1 < -4 || x0 > PW + 4) continue;
      const w = x1 - x0, h = y1 - y0, rid = LV.regions[LV.regionAt(c.x0)].id, wy = waterY(rid, e.world);
      r(x0 - 1, y0 - 1, w + 2, h + 2, INK);
      r(x0, y0, w, h, W[1]);
      for (let k = 1; k < h; k += 3) r(x0 + 1, y0 + k + 1, w - 2, 1, W[2]);                    // 木板缝
      r(x0, y0, w, 1, W[0]); r(x0, y0, 1, h, W[0]); r(x1 - 1, y0, 1, h, W[2]); r(x0, y1 - 1, w, 1, W[3]);
      line(x0 + 2, y0 + 2, x1 - 3, y1 - 3, W[3]); line(x1 - 3, y0 + 2, x0 + 2, y1 - 3, W[3]);   // 交叉的加固木条
      line(x0 + 2, y0 + 1, x1 - 3, y1 - 4, W[0]); line(x1 - 3, y0 + 1, x0 + 2, y1 - 4, W[0]);
      const iron = night ? '#59607c' : '#3c3a44';
      for (const [ix, iy] of [[x0, y0], [x1 - 2, y0], [x0, y1 - 2], [x1 - 2, y1 - 2]]) r(ix, iy, 2, 2, iron);   // 四角包铁
      const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;                                         // 中间一方红纸
      r(mx - 2, my - 2, 4, 4, night ? '#8a3a44' : '#c8402e'); r(mx - 1, my - 1, 2, 2, night ? '#c8a070' : '#f2c850');
      if (y1 > wy) {                                                                           // 泡在水里：水线和水沫
        const c2 = X.ctx; c2.globalAlpha = 0.45; r(x0 - 1, wy + 1, w + 2, y1 - wy, night ? '#1c2a4a' : '#3c6470'); c2.globalAlpha = 1;
        const wc = night ? 'rgba(200,220,255,0.8)' : 'rgba(255,255,255,0.85)', f = e.reduce ? 0 : Math.floor(e.t * 3) % 3;
        r(x0 - 2 - (f & 1), wy, 3, 1, wc); r(x1 - 1 + (f >> 1), wy, 3, 1, wc);
        if (c.float && !night && !e.reduce) for (let k = 0; k < 3; k++) { const ph = (e.t * 0.9 + k * 0.33) % 1; r(x0 - 4 - Math.round(ph * 10), wy + 1 + (k & 1), 3 + Math.round(ph * 3), 1, 'rgba(255,255,255,0.6)'); }
      }
      if (night) {                                                                             // 夜里推不动：几粒静止的冷光
        for (let k = x0 + 2; k < x1; k += 5) r(k, y0 - 1, 1, 1, 'rgba(210,230,255,0.85)');
      } else if (G.pushT > 0 && !e.reduce && Math.abs(c.y1 - G.foot) < 14) {                   // 正被推着：箱脚蹭起一点灰
        const side = G.px < c.x0 ? x1 : x0 - 2;
        r(side, y1 - 1 - (Math.floor(e.t * 12) & 1), 2, 1, 'rgba(230,224,208,0.8)');
      }
    }
  }
  function plates(e) {
    const night = e.world === 'night', c = X.ctx;
    for (const p of LV.plates) {
      const x = Math.round(p.x / P) - e.camPix, y = Math.round(p.y / P), hw = Math.round(p.hw / P);
      if (x < -20 || x > PW + 20) continue;
      const rid = LV.regions[LV.regionAt(p.x)].id, under = y >= waterY(rid, e.world);
      const S = night ? STONE_N : STONE_D, jade = p.down ? '#9ff2c8' : (night ? '#4f9a84' : '#5aa88a');
      const dy = p.down ? 1 : 0, wob = under && !e.reduce ? Math.round(Math.sin(e.t * 1.8) * 0.6) : 0;
      if (under) c.globalAlpha = 0.6;
      r(x - hw - 1 + wob, y - 2 + dy, hw * 2 + 2, 3 - dy, INK);
      r(x - hw + wob, y - 2 + dy, hw * 2, 1, S[0]); if (!dy) r(x - hw + wob, y - 1, hw * 2, 1, S[2]);
      r(x - 3 + wob, y - 2 + dy, 6, 1, jade); r(x - 1 + wob, y - 2 + dy, 2, 1, '#eafff4');      // 中间一枚玉纹，和它管的门上那枚一样
      c.globalAlpha = 1;
      X.glow(x, y - 2, p.down ? 12 : 6, [140, 240, 200], p.down ? 0.7 : (e.reduce ? 0.25 : 0.2 + 0.1 * Math.sin(e.t * 3)));
      // 门楣上的玉纹：压住时亮
      const gate = LV.hazards.find(h => h.gate === p.id);
      if (gate) {
        const gx = Math.round((gate.x0 + gate.x1) / 2 / P) - e.camPix, gy = Math.round(gate.y0 / P);
        r(gx - 2, gy - 4, 5, 5, INK); r(gx - 1, gy - 3, 3, 3, jade); r(gx, gy - 2, 1, 1, '#eafff4');
        X.glow(gx, gy - 2, p.down ? 10 : 5, [140, 240, 200], p.down ? 0.8 : 0.3);
      }
    }
  }
  function pile(h, x0, x1, y0, e) {
    const night = e.world === 'night', W = night ? WDN : WD, cx = (x0 + x1) >> 1, rid = LV.regions[LV.regionAt(h.x0)].id, wy = waterY(rid, e.world);
    r(x0 - 1, y0 - 1, x1 - x0 + 2, PH + 16 - y0, INK);
    r(x0, y0, x1 - x0, PH + 16 - y0, W[2]); r(x0, y0, 1, PH + 16 - y0, W[1]); r(x0, y0, x1 - x0, 1, W[0]);
    for (let yy = y0 + 4; yy < wy + 14; yy += 5) r(x0 + 1 + (yy & 1), yy, 2, 1, W[3]);
    r(x0 - 1, y0 + 2, x1 - x0 + 2, 2, night ? '#8a8070' : '#d8c8a0');                           // 缠着的缆绳
    if (wy > y0 + 5) r(x0, y0 + 5, x1 - x0, Math.min(wy - y0 - 5, 4), night ? '#2e4a48' : '#4e6a4a');   // 落潮露出的青苔
    // 桩顶插一根竹篙，挑着一面小旗，好让人远远看见
    for (let k = 1; k < 16; k++) r(cx, y0 - k, 1, 1, night ? '#7a8a6a' : '#b8c070');
    const fw = e.reduce ? 0 : Math.round(Math.sin(e.t * 2.2) * 1);
    r(cx + 1, y0 - 15, 5 + fw, 1, night ? '#9a4a52' : '#e04a34'); r(cx + 1, y0 - 14, 4 + fw, 1, night ? '#9a4a52' : '#e04a34'); r(cx + 1, y0 - 13, 2, 1, night ? '#6a2a38' : '#b02a24');
    const wc = night ? 'rgba(200,220,255,0.7)' : 'rgba(255,255,255,0.8)', f = e.reduce ? 0 : Math.floor(e.t * 3) % 3;
    r(x0 - 2 - (f & 1), wy, 2, 1, wc); r(x1 + (f >> 1), wy, 2, 1, wc);
  }

  RF.Scene = { crates, plates, pile, tideSteps, tideGhost, huafang, waterwheel, decos, clearFx, waterY };
})();
