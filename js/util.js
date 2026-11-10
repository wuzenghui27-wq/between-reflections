// 通用小工具：数学、确定性随机、颜色。
(function () {
  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    smooth: t => t * t * (3 - 2 * t),
    ease: t => 1 - Math.pow(1 - t, 3),
    mod: (a, n) => ((a % n) + n) % n,
    // 确定性哈希：同一位置永远画出同样的景物
    hash(i, s) { const x = Math.sin(i * 127.1 + (s || 0) * 311.7) * 43758.5453; return x - Math.floor(x); },
    // 平滑一维噪声（0..1）
    noise(x, s) {
      const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
      return U.hash(i, s) * (1 - t) + U.hash(i + 1, s) * t;
    },

    hex(h) {
      h = h.replace('#', '');
      return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
    },
    mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    rgb(a, al) {
      if (al === undefined || al >= 1) return `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
      return `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al < 0 ? 0 : al.toFixed(3)})`;
    },
    palette(obj) { const p = {}; for (const k in obj) p[k] = typeof obj[k] === 'string' ? U.hex(obj[k]) : obj[k]; return p; },
    mixPalette(p, q, t) { const r = {}; for (const k in p) r[k] = U.mix(p[k], q[k], t); return r; },
    // 按权重混合多套色板：[[palette, weight], ...]
    blendPalettes(list) {
      const r = {};
      for (const k in list[0][0]) {
        const c = [0, 0, 0]; let ws = 0;
        for (const [p, w] of list) { if (w <= 0) continue; c[0] += p[k][0] * w; c[1] += p[k][1] * w; c[2] += p[k][2] * w; ws += w; }
        r[k] = ws > 0 ? [c[0] / ws, c[1] / ws, c[2] / ws] : list[0][0][k];
      }
      return r;
    }
  };
  window.RF = window.RF || {};
  RF.U = U;
})();
