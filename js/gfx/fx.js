// 像素画布：所有画面先画进 320×180 的小画布（一格 = 4 个逻辑像素），再不加平滑地放大到屏幕。
// 发光单独画在同样大小的光层上，放大时保留柔和，叠在像素画上面。
(function () {
  const C = RF.CFG, U = RF.U;
  const PW = C.W / C.PIX, PH = C.H / C.PIX;     // 320 × 180

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  const X = {
    PW, PH,
    out: null, outW: 1, outH: 1,
    buf: null, ctx: null, glowC: null, g: null, blurC: null, bctx: null,
    mute: false, lowFx: false, oy: 0,
    buf2: null, ctx2: null, mask: null, mctx: null, dith: null,

    init(cv) {
      X.out = cv.getContext('2d');
      X.buf = canvas(PW, PH); X.ctx = X.buf.getContext('2d');
      X.glowC = canvas(PW, PH); X.g = X.glowC.getContext('2d');
      X.blurC = canvas(PW / 4, PH / 4); X.bctx = X.blurC.getContext('2d');
      // 切换过渡用：另一面先画进第二块画布，再用带像素抖动边的圆形遮罩叠上来
      X.buf2 = canvas(PW, PH); X.ctx2 = X.buf2.getContext('2d');
      X.mask = canvas(PW, PH); X.mctx = X.mask.getContext('2d');
      const dp = n => {               // n = 4 格里有几格不透明
        const c = canvas(2, 2), x = c.getContext('2d'); x.fillStyle = '#000';
        [[0, 0], [1, 1], [1, 0], [0, 1]].slice(0, n).forEach(([a, b]) => x.fillRect(a, b, 1, 1));
        return X.mctx.createPattern(c, 'repeat');
      };
      X.dith = [dp(1), dp(2), dp(3)];
    },
    setOut(w, h) { X.outW = w; X.outH = h; },

    beginGlow() {
      X.g.globalCompositeOperation = 'source-over';
      X.g.clearRect(0, 0, PW, PH);
      X.g.globalCompositeOperation = 'lighter';
    },
    // 柔光（像素坐标）
    glow(x, y, r, col, a) {
      if (X.mute || a <= 0.003 || r <= 0) return;
      y += X.oy;
      const g = X.g, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, U.rgb(col, a));
      gr.addColorStop(0.4, U.rgb(col, a * 0.4));
      gr.addColorStop(1, U.rgb(col, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    },

    // 放大到屏幕：像素层不平滑，光层平滑叠加
    present(glowStrength, shx, shy) {
      const o = X.out;
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
      o.imageSmoothingEnabled = false;
      if (shx || shy) {            // 震屏：整体挪几个像素，边缘补暗色
        const k = X.outW / PW;
        o.fillStyle = '#0c0a14'; o.fillRect(0, 0, X.outW, X.outH);
        o.setTransform(1, 0, 0, 1, Math.round(shx * k), Math.round(shy * k));
      }
      o.drawImage(X.buf, 0, 0, X.outW, X.outH);
      o.imageSmoothingEnabled = true;
      o.globalCompositeOperation = 'lighter';
      o.globalAlpha = glowStrength;
      o.drawImage(X.glowC, 0, 0, X.outW, X.outH);
      if (!X.lowFx) {
        X.bctx.clearRect(0, 0, X.blurC.width, X.blurC.height);
        X.bctx.drawImage(X.glowC, 0, 0, X.blurC.width, X.blurC.height);
        o.globalAlpha = glowStrength * 0.7;
        o.drawImage(X.blurC, 0, 0, X.outW, X.outH);
      }
      o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    },

    // 夜景：把白天的画压暗、偏蓝，亮部保留一点
    nightOf(img) {
      const w = img.width, h = img.height, c = canvas(w, h), x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = '#3a4a8c'; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'multiply';
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5a6aa8'); g.addColorStop(1, '#8a92b8');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
      return c;
    },
    canvas,
    // 圆形遮罩：中心实心，边上三圈 75% / 50% / 25% 的像素点，像水墨洇开
    dissolve(cx, cy, rr) {
      const m = X.mctx, B = 4;
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.clearRect(0, 0, PW, PH);
      m.fillStyle = '#000';
      if (rr - B * 3 > 0) { m.beginPath(); m.arc(cx, cy, rr - B * 3, 0, 7); m.fill(); }
      for (let k = 0; k < 3; k++) {
        const r1 = rr - B * (2 - k), r0 = Math.max(0, r1 - B);
        if (r1 <= 0) continue;
        m.fillStyle = X.dith[2 - k];
        m.beginPath(); m.arc(cx, cy, r1, 0, 7); if (r0 > 0) m.arc(cx, cy, r0, 0, 7, true); m.fill();
      }
      const c2 = X.ctx2;
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.globalCompositeOperation = 'destination-in'; c2.drawImage(X.mask, 0, 0);
      c2.globalCompositeOperation = 'source-over';
    },

    rect(x, y, w, h, col) { X.ctx.fillStyle = col; X.ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  };
  RF.FX = X;
})();
