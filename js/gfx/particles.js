// 小粒子：起跳 / 落地扬尘、水花、拾灯火星、浮起的像素数字，以及失误时的震屏。
// 位置用逻辑坐标（世界 x、屏幕 y），画的时候换成像素。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX;
  const P = C.PIX;
  const list = [];
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // 3×5 像素数字与符号
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
    '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
    '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', 'x': '000101010101000',
    '/': '001001010100100', ' ': '000000000000000'
  };
  function text(ctx, str, x, y, col, shadow) {
    let cx = Math.round(x - (str.length * 4 - 1) / 2);
    y = Math.round(y);
    for (const ch of str) {
      const g = FONT[ch];
      if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') {
        const px = cx + (i % 3), py = y + ((i / 3) | 0);
        if (shadow) { ctx.fillStyle = shadow; ctx.fillRect(px + 1, py + 1, 1, 1); }
        ctx.fillStyle = col; ctx.fillRect(px, py, 1, 1);
      }
      cx += 4;
    }
  }

  function add(o) { if (list.length < 220) list.push(Object.assign({ t: 0, vx: 0, vy: 0, g: 0, life: 0.5, size: 1 }, o)); }

  const FX = {
    shake: 0,
    clear() { list.length = 0; FX.shake = 0; },
    dust(x, y, n, cols, spread) {
      for (let i = 0; i < n; i++) {
        const dir = i % 2 ? 1 : -1;
        add({ x: x + dir * rnd() * 10, y: y - 2, vx: dir * (30 + rnd() * 70) * (spread || 1) - 40, vy: -20 - rnd() * 50, g: 160,
          life: 0.3 + rnd() * 0.25, col: cols[i % cols.length], size: rnd() < 0.35 ? 2 : 1 });
      }
    },
    splash(x, y, col) {
      for (let i = 0; i < 10; i++) add({ x: x + (rnd() - 0.5) * 16, y, vx: (rnd() - 0.5) * 120, vy: -120 - rnd() * 140, g: 900, life: 0.5, col, size: 1 });
    },
    sparks(x, y, col, n) {
      for (let i = 0; i < (n || 12); i++) {
        const a = rnd() * Math.PI * 2, s = 60 + rnd() * 110;
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 120, life: 0.45 + rnd() * 0.3, col, size: 1, glow: true });
      }
    },
    float(x, y, str, col) { add({ x, y, vy: -46, life: 0.9, str, col, kind: 'text' }); },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.t += dt;
        if (p.t >= p.life) { list.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'text') p.vy *= 0.94;
      }
      FX.shake = Math.max(0, FX.shake - dt * 14);
    },
    draw(ctx, camPix) {
      for (const p of list) {
        const k = p.t / p.life, x = Math.round(p.x / P) - camPix, y = Math.round(p.y / P);
        if (p.kind === 'text') {
          if (k > 0.75 && Math.floor(p.t * 20) % 2) continue;          // 快消失时闪两下
          text(ctx, p.str, x, y, p.col, '#1b1720');
          continue;
        }
        if (k > 0.6 && (Math.floor(p.t * 30) % 2)) continue;
        ctx.fillStyle = p.col;
        const s = k > 0.5 ? 1 : p.size;
        ctx.fillRect(x, y, s, s);
        if (p.glow) X.glow(x, y, 4, [255, 210, 130], (1 - k) * 0.5);
      }
    },
    text
  };
  RF.Particles = FX;
})();
