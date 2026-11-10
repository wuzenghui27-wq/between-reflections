// 六个地貌区域的远景：每个区域有白天与夜晚两套配色，同一组形状，只换光。
// 全部由代码绘制，只参考地貌与建筑的特征，不临摹任何照片或作品。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX;
  const W = C.W, H = C.H, rgb = U.rgb, P = U.palette;

  // ------------------------------------------------------------ 公共小件
  // 在某一视差层上，按固定间距放置景物（同一位置永远画出同样的东西）
  function items(cam, par, spacing, seed, cb, margin) {
    const off = cam * par, m = margin || 320;
    const i0 = Math.floor((off - m) / spacing), i1 = Math.floor((off + W + m) / spacing);
    for (let i = i0; i <= i1; i++) {
      const r = U.hash(i, seed);
      cb(i * spacing + r * spacing * 0.45 - off, i, r);
    }
  }
  function ridge(c, cam, par, base, amp, scale, seed, col, oct) {
    const off = cam * par;
    c.beginPath(); c.moveTo(-10, H);
    for (let sx = -10; sx <= W + 20; sx += 14) {
      const wx = (sx + off) / scale;
      let n = U.noise(wx, seed) * 0.65 + U.noise(wx * 2.3, seed + 7) * 0.25;
      if (oct) n += U.noise(wx * 6, seed + 13) * 0.1;
      c.lineTo(sx, base - n * amp);
    }
    c.lineTo(W + 20, H); c.closePath();
    c.fillStyle = col; c.fill();
  }
  function band(c, y0, y1, col, a0, a1) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgb(col, a0)); g.addColorStop(1, rgb(col, a1));
    c.fillStyle = g; c.fillRect(0, y0, W, y1 - y0);
  }
  function sky(c, p) {
    const g = c.createLinearGradient(0, 0, 0, 620);
    g.addColorStop(0, rgb(p.top)); g.addColorStop(0.55, rgb(p.mid)); g.addColorStop(1, rgb(p.bot));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function stars(c, e, n, seed) {
    if (e.world !== 'night') return;
    for (let i = 0; i < n; i++) {
      const x = U.mod(U.hash(i, seed) * W * 1.3 - e.cam * 0.02, W), y = U.hash(i, seed + 1) * 380;
      const tw = e.reduce ? 0.8 : 0.55 + 0.45 * Math.sin(e.t * (1 + U.hash(i, seed + 2) * 2) + i);
      const r = U.hash(i, seed + 3) < 0.08 ? 1.6 : 0.9;
      c.fillStyle = rgb([255, 250, 235], 0.85 * tw * e.a);
      c.fillRect(x, y, r, r);
      if (r > 1) X.glow(x, y, 6, [220, 230, 255], 0.35 * tw * e.a);
    }
  }
  function sunMoon(c, e, x, y) {
    const p = e.pal;
    if (e.world === 'day') {
      X.glow(x, y, 220, p.sun, 0.35 * e.a);
      c.fillStyle = rgb(p.sun, 0.95); c.beginPath(); c.arc(x, y, 30, 0, 7); c.fill();
    } else {
      X.glow(x, y, 160, [200, 215, 255], 0.3 * e.a);
      c.fillStyle = rgb(p.sun); c.beginPath(); c.arc(x, y, 26, 0, 7); c.fill();
      c.fillStyle = rgb(p.top, 0.12); c.beginPath(); c.arc(x - 8, y - 4, 7, 0, 7); c.arc(x + 9, y + 8, 4, 0, 7); c.fill();
    }
  }
  function clouds(c, e, y0, col, seed) {
    items(e.cam, 0.06, 420, seed, (sx, i, r) => {
      const y = y0 + r * 110, w = 120 + r * 160;
      c.fillStyle = rgb(col, (e.world === 'day' ? 0.55 : 0.18) * (0.5 + r * 0.5));
      c.beginPath(); c.ellipse(sx, y, w, 12 + r * 6, 0, 0, 7); c.ellipse(sx + w * 0.3, y - 9, w * 0.5, 11, 0, 0, 7); c.fill();
    });
  }
  // 窗户：白天是深色小格，夜里亮暖灯
  function windowRect(c, e, x, y, w, h, lit) {
    if (e.world === 'night' && lit) {
      c.fillStyle = rgb(e.pal.light, 0.9); c.fillRect(x, y, w, h);
      X.glow(x + w / 2, y + h / 2, 26, e.pal.light, 0.32 * e.a);
    } else { c.fillStyle = rgb(e.pal.roof, 0.75); c.fillRect(x, y, w, h); }
  }
  function redLantern(c, e, x, y, s) {
    s = s || 1;
    const sw = e.reduce ? 0 : Math.sin(e.t * 1.6 + x * 0.01) * 2;
    c.strokeStyle = rgb(e.pal.roof); c.lineWidth = 1; c.beginPath(); c.moveTo(x, y - 10 * s); c.lineTo(x + sw, y); c.stroke();
    c.fillStyle = rgb(e.world === 'night' ? [255, 92, 64] : [200, 52, 40]);
    c.beginPath(); c.ellipse(x + sw, y + 8 * s, 7 * s, 9 * s, 0, 0, 7); c.fill();
    c.fillStyle = rgb([230, 180, 70]); c.fillRect(x + sw - 3 * s, y - 1, 6 * s, 2); c.fillRect(x + sw - 3 * s, y + 16 * s, 6 * s, 2);
    if (e.world === 'night') X.glow(x + sw, y + 8 * s, 34 * s, [255, 110, 70], 0.5 * e.a);
  }
  // 中式屋顶：两端微微上翘
  function roof(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x - 10, y + h);
    c.quadraticCurveTo(x - 4, y + h * 0.6, x + 6, y + h * 0.35);
    c.lineTo(x + w * 0.5, y);
    c.lineTo(x + w - 6, y + h * 0.35);
    c.quadraticCurveTo(x + w + 4, y + h * 0.6, x + w + 10, y + h);
    c.closePath(); c.fill();
  }

  // ------------------------------------------------------------ 配色
  const TRAV_DAY = { ink: '#2b2833', rim: '#ffe6b5', scarf: '#d8432f', face: '#ffe9d2' };
  const TRAV_NIGHT = { ink: '#0f1120', rim: '#bcd2ff', scarf: '#ff5a3c', face: '#ffe2c4' };
  const pal = (o, night) => P(Object.assign({}, night ? TRAV_NIGHT : TRAV_DAY, o));

  const R = {};

  // ============================================================ 1 江南水乡
  R.jiangnan = {
    water: { day: 584, night: 626 },
    day: pal({ top: '#9cc6e0', mid: '#d4e8ee', bot: '#f2ece0', sun: '#fff4da', far: '#b4cad3', far2: '#97b0bb',
      wall: '#f4f2ec', roof: '#39414a', mist: '#eef3f1', water: '#86afb9', ground: '#7f8580', gtop: '#b8bab2',
      leaf: '#7a9a5e', light: '#ffd28a', deep: '#5d7f88', glow: 0.45 }),
    night: pal({ top: '#0b1430', mid: '#1c2b52', bot: '#34466e', sun: '#f2efdc', far: '#22335a', far2: '#1a2846',
      wall: '#4b5677', roof: '#121829', mist: '#2f4068', water: '#172748', ground: '#283049', gtop: '#465273',
      leaf: '#22344a', light: '#ffc66e', deep: '#0e1a33', glow: 0.95 }, true),
    back(c, e) {
      const p = e.pal;
      sky(c, p); stars(c, e, 90, 11); sunMoon(c, e, 1010, 130); clouds(c, e, 90, p.mist, 3);
      ridge(c, e.cam, 0.08, 470, 150, 380, 1, rgb(p.far));
      band(c, 380, 520, p.mist, 0, 0.6);
      ridge(c, e.cam, 0.16, 520, 90, 260, 2, rgb(p.far2));
      band(c, 470, 560, p.mist, 0, 0.7);
      // 石拱桥
      items(e.cam, 0.32, 1500, 21, (sx, i, r) => {
        if (r > 0.6) return;
        c.fillStyle = rgb(U.mix(p.wall, p.far2, 0.35));
        c.beginPath(); c.moveTo(sx - 120, 560); c.quadraticCurveTo(sx, 470, sx + 120, 560); c.lineTo(sx + 120, 572); c.lineTo(sx - 120, 572); c.fill();
        c.fillStyle = rgb(p.water, 0.95); c.beginPath(); c.ellipse(sx, 572, 46, 46, 0, Math.PI, 0); c.fill();
      });
      // 白墙黛瓦
      items(e.cam, 0.45, 210, 5, (sx, i, r) => {
        const w = 120 + r * 90, h = 62 + U.hash(i, 6) * 40, y = 578 - h;
        c.fillStyle = rgb(p.wall); c.fillRect(sx, y, w, h);
        c.fillStyle = rgb(p.roof, 0.18); c.fillRect(sx, y + h - 10, w, 10);
        roof(c, sx, y - 22, w, 24, rgb(p.roof));
        const n = Math.floor(w / 46);
        for (let k = 0; k < n; k++) windowRect(c, e, sx + 18 + k * 46, y + 18, 16, 20, U.hash(i * 7 + k, 8) > 0.35);
        if (U.hash(i, 9) > 0.55) redLantern(c, e, sx + w - 14, y + 4);
      });
      // 柳树
      items(e.cam, 0.6, 330, 7, (sx, i, r) => {
        if (r < 0.4) return;
        const y = 586;
        c.strokeStyle = rgb(U.mix(p.roof, p.leaf, 0.3)); c.lineWidth = 5;
        c.beginPath(); c.moveTo(sx, y); c.quadraticCurveTo(sx - 6, y - 60, sx + 4, y - 120); c.stroke();
        c.strokeStyle = rgb(p.leaf, 0.85); c.lineWidth = 1.4;
        const sway = e.reduce ? 0 : Math.sin(e.t * 0.9 + i) * 5;
        for (let k = 0; k < 14; k++) {
          const ox = -50 + k * 8, len = 50 + U.hash(i * 3 + k, 4) * 50;
          c.beginPath(); c.moveTo(sx + 4, y - 120); c.quadraticCurveTo(sx + ox, y - 128, sx + ox + sway, y - 120 + len); c.stroke();
        }
      });
    }
  };

  // ============================================================ 2 徽州与晋地的老宅
  R.huizhou = {
    day: pal({ top: '#a7c4d6', mid: '#dfe7e6', bot: '#f1ebdf', sun: '#fff1d6', far: '#bac8cb', far2: '#9eb0b4',
      wall: '#f2efe8', roof: '#2f3338', brick: '#9a9289', mist: '#edf0ee', ground: '#6f716f', gtop: '#a7a9a3',
      leaf: '#6f8e5a', light: '#ffd28a', deep: '#5c6a6e', glow: 0.45 }),
    night: pal({ top: '#0d1228', mid: '#1f2747', bot: '#3a3f62', sun: '#f4efd8', far: '#252d4c', far2: '#1d2440',
      wall: '#4e5472', roof: '#10131f', brick: '#33374e', mist: '#30375a', ground: '#252a40', gtop: '#424966',
      leaf: '#1f2c3c', light: '#ffc46a', deep: '#0d1226', glow: 0.95 }, true),
    back(c, e) {
      const p = e.pal;
      sky(c, p); stars(c, e, 80, 12); sunMoon(c, e, 300, 120); clouds(c, e, 80, p.mist, 4);
      // 黄山般的尖峰
      items(e.cam, 0.07, 160, 31, (sx, i, r) => {
        const h = 160 + r * 170, w = 50 + r * 40;
        c.fillStyle = rgb(p.far);
        c.beginPath(); c.moveTo(sx - w * 1.6, 520); c.lineTo(sx - w * 0.3, 520 - h * 0.85); c.lineTo(sx, 520 - h); c.lineTo(sx + w * 0.4, 520 - h * 0.8); c.lineTo(sx + w * 1.6, 520); c.fill();
      });
      band(c, 380, 540, p.mist, 0, 0.8);
      ridge(c, e.cam, 0.18, 540, 60, 240, 32, rgb(p.far2));
      band(c, 500, 570, p.mist, 0, 0.6);
      // 马头墙（徽派）与灰砖院墙（晋派）交替
      items(e.cam, 0.45, 250, 33, (sx, i, r) => {
        const jin = U.hash(Math.floor(i / 4), 34) > 0.55;
        const w = 150 + r * 80, h = 80 + U.hash(i, 35) * 50, base = 590, y = base - h;
        if (!jin) {
          // 阶梯状马头墙：白墙一级级升高，每级压一道黑瓦
          const sw = Math.min(24, w / 7), st = 16, n = 3;
          c.fillStyle = rgb(p.wall);
          for (let k = 0; k < n; k++) c.fillRect(sx + k * sw, y - k * st, w - 2 * k * sw, h + k * st);
          c.fillStyle = rgb(p.roof);
          for (let k = 0; k < n; k++) {
            const top = y - k * st - 6;
            if (k < n - 1) { c.fillRect(sx + k * sw - 4, top, sw + 8, 6); c.fillRect(sx + w - (k + 1) * sw - 4, top, sw + 8, 6); }
            else c.fillRect(sx + k * sw - 4, top, w - 2 * k * sw + 8, 6);
          }
          windowRect(c, e, sx + w * 0.45, y + 24, 14, 18, U.hash(i, 36) > 0.3);
          c.fillStyle = rgb(p.roof, 0.85); c.fillRect(sx + w * 0.45 - 6, y + h - 46, 26, 46);
        } else {
          c.fillStyle = rgb(p.brick); c.fillRect(sx, y + 10, w, h - 10);
          c.strokeStyle = rgb(p.roof, 0.15); c.lineWidth = 1;
          for (let yy = y + 18; yy < base; yy += 9) { c.beginPath(); c.moveTo(sx, yy); c.lineTo(sx + w, yy); c.stroke(); }
          roof(c, sx - 4, y - 10, w + 8, 22, rgb(p.roof));
          // 窑洞式拱窗
          for (let k = 0; k < 2; k++) {
            const ax = sx + w * (0.28 + k * 0.44);
            if (e.world === 'night' && U.hash(i * 2 + k, 37) > 0.3) { c.fillStyle = rgb(p.light, 0.85); X.glow(ax, y + 46, 30, p.light, 0.3 * e.a); }
            else c.fillStyle = rgb(p.roof, 0.7);
            c.beginPath(); c.moveTo(ax - 12, y + 62); c.lineTo(ax - 12, y + 40); c.arc(ax, y + 40, 12, Math.PI, 0); c.lineTo(ax + 12, y + 62); c.fill();
          }
          if (U.hash(i, 38) > 0.5) redLantern(c, e, sx + 16, y + 12);
        }
      });
      // 牌坊
      items(e.cam, 0.62, 1300, 39, (sx, i, r) => {
        if (r > 0.55) return;
        const col = rgb(U.mix(p.wall, p.brick, 0.4));
        c.fillStyle = col;
        for (const dx of [-70, -26, 26, 70]) c.fillRect(sx + dx - 6, 450, 12, 140);
        c.fillRect(sx - 84, 470, 168, 14); c.fillRect(sx - 60, 438, 120, 12);
        roof(c, sx - 92, 452, 184, 18, rgb(p.roof)); roof(c, sx - 52, 420, 104, 18, rgb(p.roof));
      });
    }
  };

  // ============================================================ 3 峰林与梯田
  R.karst = {
    day: pal({ top: '#8fc2dc', mid: '#cfe6e4', bot: '#eef0dc', sun: '#fff6df', far: '#9fc0bf', far2: '#7fa79e',
      near: '#5f8e6c', mist: '#f1f5ef', ground: '#7a5d43', gtop: '#86b25d', paddy: '#bfe0e4', roof: '#3a4a40',
      leaf: '#5e8b4d', light: '#ffe08a', deep: '#5f8478', glow: 0.45 }),
    night: pal({ top: '#07122a', mid: '#13284a', bot: '#24456a', sun: '#eef2dc', far: '#173052', far2: '#132845',
      near: '#0f2238', mist: '#25426a', ground: '#2a2a3a', gtop: '#2c4a4a', paddy: '#2c4f7a', roof: '#0c1622',
      leaf: '#13283a', light: '#d4ff8a', deep: '#0a1628', glow: 1.0 }, true),
    back(c, e) {
      const p = e.pal;
      sky(c, p); stars(c, e, 110, 13); sunMoon(c, e, 860, 110); clouds(c, e, 120, p.mist, 5);
      // 层层峰林：圆润的馒头峰
      const layer = (par, spacing, seed, base, hMin, hVar, col) => items(e.cam, par, spacing, seed, (sx, i, r) => {
        const h = hMin + r * hVar, w = 34 + U.hash(i, seed + 1) * 30;
        c.fillStyle = col;
        c.beginPath(); c.moveTo(sx - w * 1.5, base);
        c.bezierCurveTo(sx - w * 1.1, base - h * 0.5, sx - w, base - h, sx, base - h);
        c.bezierCurveTo(sx + w, base - h, sx + w * 1.1, base - h * 0.5, sx + w * 1.5, base);
        c.fill();
      });
      layer(0.06, 90, 41, 500, 120, 160, rgb(p.far));
      band(c, 340, 520, p.mist, 0, 0.75);
      layer(0.14, 120, 42, 540, 110, 140, rgb(p.far2));
      band(c, 430, 560, p.mist, 0, 0.7);
      layer(0.26, 170, 43, 590, 90, 120, rgb(p.near));
      // 远处梯田的等高线
      c.strokeStyle = rgb(p.paddy, e.world === 'day' ? 0.5 : 0.35); c.lineWidth = 1.2;
      for (let k = 0; k < 7; k++) {
        const y = 560 + k * 9, off = e.cam * 0.32;
        c.beginPath();
        for (let sx = 0; sx <= W; sx += 20) c.lineTo(sx, y + Math.sin((sx + off) / 90 + k) * 4);
        c.stroke();
      }
      band(c, 520, 720, p.deep, 0, 0.85);
    }
  };

  // ============================================================ 4 骑楼与围屋
  const FACADES = ['#e7b77a', '#a9cbbd', '#e9d6b0', '#d99c86', '#c9b6d8', '#b8d0a5'];
  R.lingnan = {
    day: pal({ top: '#7fb8e2', mid: '#c9e2ec', bot: '#f6ead6', sun: '#fff0cf', far: '#a9c3c6', far2: '#c7a98a',
      roof: '#4a3a34', wall: '#efe2c9', mist: '#f4ece0', ground: '#9c6b52', gtop: '#d9b48f', tile2: '#6f8f7f',
      light: '#ffd07a', deep: '#6b5a52', glow: 0.5 }),
    night: pal({ top: '#120f2c', mid: '#2a1f4a', bot: '#4d3560', sun: '#f6ecd8', far: '#2a2b4f', far2: '#3b2f4a',
      roof: '#140f1c', wall: '#4b3f5c', mist: '#3a2e55', ground: '#3a2a33', gtop: '#6a4a4e', tile2: '#2c3c48',
      light: '#ffc35e', deep: '#140f22', glow: 1.0 }, true),
    back(c, e) {
      const p = e.pal;
      sky(c, p); stars(c, e, 50, 14); sunMoon(c, e, 1080, 150); clouds(c, e, 70, p.mist, 6);
      ridge(c, e.cam, 0.06, 470, 90, 300, 51, rgb(p.far));
      // 客家围屋：圆形土楼
      items(e.cam, 0.16, 520, 52, (sx, i, r) => {
        const rw = 110 + r * 60, rh = 22, top = 470 - r * 10, bot = 540;
        c.fillStyle = rgb(p.far2);
        c.beginPath(); c.ellipse(sx, bot, rw, rh, 0, 0, Math.PI); c.lineTo(sx - rw, top); c.ellipse(sx, top, rw, rh, 0, Math.PI, 0, true); c.closePath(); c.fill();
        c.fillStyle = rgb(p.roof, 0.85); c.beginPath(); c.ellipse(sx, top, rw + 6, rh + 4, 0, Math.PI, 0); c.ellipse(sx, top + 3, rw - 16, rh - 6, 0, 0, Math.PI, true); c.fill();
        for (let k = 0; k < 9; k++) {
          const a = Math.PI * (0.12 + k * 0.095), wx = sx - Math.cos(a) * rw * 0.92, wy = top + 22 + Math.sin(a) * 6;
          windowRect(c, e, wx - 2, wy, 4, 6, U.hash(i * 9 + k, 53) > 0.4);
          windowRect(c, e, wx - 2, wy + 22, 4, 6, U.hash(i * 9 + k, 54) > 0.5);
        }
      });
      band(c, 430, 560, p.mist, 0, 0.6);
      // 骑楼街：底层连续拱廊，上层满洲窗
      items(e.cam, 0.5, 190, 55, (sx, i, r) => {
        const w = 186, h = 170 + r * 50, base = 592, y = base - h;
        const col = U.hex(FACADES[Math.floor(U.hash(i, 56) * FACADES.length)]);
        const fc = e.world === 'day' ? col : U.mix(col, p.wall, 0.75);
        c.fillStyle = rgb(fc); c.fillRect(sx, y, w, h);
        c.fillStyle = rgb(U.mix(fc, p.roof, 0.25)); c.fillRect(sx - 3, y - 6, w + 6, 10);
        // 山花
        c.beginPath(); c.moveTo(sx + w * 0.3, y - 6); c.quadraticCurveTo(sx + w / 2, y - 30, sx + w * 0.7, y - 6); c.fill();
        // 拱廊
        c.fillStyle = rgb(p.roof, 0.8);
        for (let k = 0; k < 3; k++) {
          const ax = sx + 14 + k * 58;
          c.beginPath(); c.moveTo(ax, base); c.lineTo(ax, base - 46); c.arc(ax + 22, base - 46, 22, Math.PI, 0); c.lineTo(ax + 44, base); c.fill();
          if (e.world === 'night') X.glow(ax + 22, base - 30, 30, p.light, 0.22 * e.a);
        }
        // 满洲窗：彩色玻璃
        const rows = Math.floor((h - 90) / 44);
        for (let rr = 0; rr < rows; rr++) for (let k = 0; k < 3; k++) {
          const wx = sx + 22 + k * 56, wy = y + 16 + rr * 44;
          const lit = e.world === 'night' && U.hash(i * 31 + rr * 3 + k, 57) > 0.35;
          const gc = [[230, 90, 80], [90, 170, 140], [240, 200, 90], [110, 140, 220]][(rr + k + i) % 4];
          c.fillStyle = lit ? rgb(U.mix(gc, [255, 230, 170], 0.4)) : rgb(e.world === 'day' ? U.mix(gc, [255, 255, 255], 0.35) : U.mix(gc, p.roof, 0.7));
          c.fillRect(wx, wy, 30, 26);
          c.strokeStyle = rgb(p.roof, 0.6); c.lineWidth = 1;
          c.strokeRect(wx, wy, 30, 26); c.beginPath(); c.moveTo(wx + 15, wy); c.lineTo(wx + 15, wy + 26); c.moveTo(wx, wy + 13); c.lineTo(wx + 30, wy + 13); c.stroke();
          if (lit) X.glow(wx + 15, wy + 13, 24, gc, 0.3 * e.a);
        }
        // 夜里的招牌
        if (U.hash(i, 58) > 0.45) {
          const bx = sx + w - 22, by = y + 30;
          c.fillStyle = e.world === 'night' ? 'rgba(255,120,90,0.95)' : rgb(U.mix(p.roof, [180, 60, 50], 0.6));
          c.fillRect(bx, by, 12, 60);
          if (e.world === 'night') X.glow(bx + 6, by + 30, 40, [255, 110, 90], 0.45 * e.a);
        }
      });
    }
  };

  // ============================================================ 5 丹霞与雅丹
  R.danxia = {
    day: pal({ top: '#5ea8e0', mid: '#bcdcec', bot: '#f6e2c0', sun: '#fff3d0', far: '#d98a64', far2: '#c4653f',
      stripe: '#f0c27a', stripe2: '#b8484a', mist: '#f7e6cc', ground: '#a8452f', gtop: '#d9774c', roof: '#5a2a22',
      light: '#ffd58a', deep: '#8a3a2a', glow: 0.5 }),
    night: pal({ top: '#050a1e', mid: '#121a3c', bot: '#2c2446', sun: '#f3ecd8', far: '#3a2238', far2: '#2c1a2e',
      stripe: '#5a3446', stripe2: '#2a1426', mist: '#2a2244', ground: '#3a1c24', gtop: '#5a2c32', roof: '#140a12',
      light: '#ffcf80', deep: '#0e0816', glow: 1.0 }, true),
    back(c, e) {
      const p = e.pal;
      sky(c, p);
      // 银河
      if (e.world === 'night') {
        c.save(); c.translate(640, 200); c.rotate(-0.35);
        const g = c.createLinearGradient(0, -90, 0, 90);
        g.addColorStop(0, 'rgba(160,170,255,0)'); g.addColorStop(0.5, rgb([190, 180, 255], 0.22 * e.a)); g.addColorStop(1, 'rgba(160,170,255,0)');
        c.fillStyle = g; c.fillRect(-900, -90, 1800, 180); c.restore();
        for (let k = 0; k < 6; k++) X.glow(200 + k * 180, 330 - k * 60, 120, [170, 160, 255], 0.12 * e.a);
      }
      stars(c, e, 220, 15);
      sunMoon(c, e, 980, 120);
      // 彩色条纹的丹霞山
      const off = e.cam * 0.1;
      c.save();
      ridge(c, e.cam, 0.1, 520, 170, 330, 61, rgb(p.far));
      c.clip();
      const cols = [p.far, p.stripe, p.far2, p.stripe2, p.far, p.stripe];
      for (let k = 0; k < 18; k++) {
        c.fillStyle = rgb(cols[k % cols.length], 0.55);
        c.beginPath();
        for (let sx = 0; sx <= W + 20; sx += 20) c.lineTo(sx, 360 + k * 14 + Math.sin((sx + off) / 160 + k * 0.6) * 18);
        for (let sx = W + 20; sx >= 0; sx -= 20) c.lineTo(sx, 368 + k * 14 + Math.sin((sx + off) / 160 + k * 0.6) * 18);
        c.fill();
      }
      c.restore();
      band(c, 430, 560, p.mist, 0, 0.55);
      // 雅丹：被风削成船形的土台
      items(e.cam, 0.3, 360, 62, (sx, i, r) => {
        const w = 120 + r * 120, h = 50 + U.hash(i, 63) * 50, base = 590;
        c.fillStyle = rgb(U.mix(p.far2, p.roof, 0.35));
        c.beginPath(); c.moveTo(sx - w * 0.6, base);
        c.lineTo(sx - w * 0.5, base - h * 0.7); c.quadraticCurveTo(sx - w * 0.42, base - h, sx - w * 0.2, base - h);
        c.lineTo(sx + w * 0.3, base - h * 0.92); c.quadraticCurveTo(sx + w * 0.55, base - h * 0.6, sx + w * 0.62, base);
        c.fill();
        c.strokeStyle = rgb(p.stripe, 0.25); c.lineWidth = 2;
        for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(sx - w * 0.5, base - h * k * 0.2); c.lineTo(sx + w * 0.55, base - h * k * 0.2); c.stroke(); }
      });
      band(c, 560, 720, p.deep, 0.3, 0.95);
      // 白天的热浪
      if (e.world === 'day' && !e.reduce) {
        c.strokeStyle = 'rgba(255,240,220,0.12)'; c.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          const y = 520 + k * 12; c.beginPath();
          for (let sx = 0; sx <= W; sx += 16) c.lineTo(sx, y + Math.sin(sx / 40 + e.t * 3 + k) * 2);
          c.stroke();
        }
      }
    }
  };

  // ============================================================ 6 雪域圣湖
  R.tibet = {
    water: { day: 586, night: 568, frozen: 'night' },
    day: pal({ top: '#2f7fd0', mid: '#8cc2ea', bot: '#e4eef2', sun: '#fffaf0', far: '#7f9cc0', far2: '#5f7fa8',
      snow: '#f7fbff', mist: '#eaf2f8', water: '#3f8fc8', ground: '#6b6a72', gtop: '#e9eef4', roof: '#33333d',
      light: '#ffe2a0', deep: '#3c6c9a', glow: 0.45 }),
    night: pal({ top: '#030820', mid: '#0c1a44', bot: '#1e3466', sun: '#f6f3e6', far: '#1c2c55', far2: '#142247',
      snow: '#b8c8ec', mist: '#1d2f5c', water: '#0c1a3e', ground: '#22243a', gtop: '#8a9ac4', roof: '#0a0c18',
      light: '#ffd890', deep: '#06102a', glow: 1.0 }, true),
    back(c, e) {
      const p = e.pal;
      sky(c, p); stars(c, e, 260, 16); sunMoon(c, e, 640, 110);
      // 雪山
      const peaks = (par, spacing, seed, base, hMin, hVar, col) => items(e.cam, par, spacing, seed, (sx, i, r) => {
        const h = hMin + r * hVar, w = 90 + U.hash(i, seed + 1) * 70;
        const pts = [[sx - w * 1.4, base], [sx - w * 0.45, base - h * 0.62], [sx - w * 0.2, base - h * 0.78], [sx, base - h], [sx + w * 0.3, base - h * 0.74], [sx + w * 0.55, base - h * 0.6], [sx + w * 1.4, base]];
        c.fillStyle = col; c.beginPath(); pts.forEach((q, k) => c[k ? 'lineTo' : 'moveTo'](q[0], q[1])); c.fill();
        c.fillStyle = rgb(p.snow);
        c.beginPath(); c.moveTo(pts[1][0] + w * 0.18, pts[1][1] + h * 0.1);
        for (let k = 2; k <= 4; k++) c.lineTo(pts[k][0], pts[k][1]);
        c.lineTo(pts[5][0] - w * 0.12, pts[5][1] + h * 0.08);
        c.lineTo(sx + w * 0.18, base - h * 0.6); c.lineTo(sx, base - h * 0.7); c.lineTo(sx - w * 0.2, base - h * 0.56);
        c.fill();
      });
      peaks(0.05, 300, 71, 520, 170, 140, rgb(p.far));
      band(c, 400, 540, p.mist, 0, 0.5);
      peaks(0.12, 380, 72, 560, 110, 110, rgb(p.far2));
      // 白塔与经幡
      items(e.cam, 0.4, 700, 73, (sx, i, r) => {
        if (r < 0.5) {
          const b = 588;
          c.fillStyle = rgb(U.mix(p.snow, p.far2, 0.15));
          c.fillRect(sx - 30, b - 18, 60, 18); c.fillRect(sx - 22, b - 30, 44, 12);
          c.beginPath(); c.ellipse(sx, b - 30, 20, 22, 0, Math.PI, 0); c.fill();
          c.fillRect(sx - 4, b - 76, 8, 26);
          c.fillStyle = rgb([210, 170, 80]); c.beginPath(); c.arc(sx, b - 80, 5, 0, 7); c.fill();
        }
        const x0 = sx + 60, x1 = sx + 300, y0 = 470 + r * 20;
        c.strokeStyle = rgb(p.roof, 0.6); c.lineWidth = 1;
        c.beginPath(); c.moveTo(x0, 590); c.lineTo(x0, y0); c.moveTo(x1, 590); c.lineTo(x1, y0 + 10); c.stroke();
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, y0 + 50, x1, y0 + 10); c.stroke();
        const FL = [[60, 120, 210], [245, 245, 245], [210, 60, 50], [60, 160, 90], [240, 200, 60]];
        for (let k = 1; k < 16; k++) {
          const tt = k / 16, fx = U.lerp(x0, x1, tt), fy = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * (y0 + 50) + tt * tt * (y0 + 10);
          const fl = e.reduce ? 0 : Math.sin(e.t * 3 + k) * 2;
          c.fillStyle = rgb(e.world === 'day' ? FL[k % 5] : U.mix(FL[k % 5], p.far2, 0.6));
          c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 9 + fl, fy + 1); c.lineTo(fx + 8 + fl, fy + 12); c.lineTo(fx, fy + 11); c.fill();
        }
      });
      band(c, 540, 600, p.mist, 0, 0.5);
    }
  };

  RF.Regions = { R, items, ridge, band, redLantern, roof };
})();
