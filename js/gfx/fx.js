// 光效基础：主画布 + 低分辨率“光层”。
// 发光物体在光层上画一次柔光，最后以叠加方式放大合成，得到便宜又柔和的泛光（bloom）。
(function () {
  const C = RF.CFG, U = RF.U;
  const W = C.W, H = C.H;
  const GS = 0.25;          // 光层分辨率比例
  const BS = 1 / 16;        // 大范围柔光层比例

  const X = {
    ctx: null, g: null, k: [1, 1],
    canvas: null, glowCanvas: null, blurCanvas: null, bctx: null,

    init(canvas) {
      X.canvas = canvas;
      X.ctx = canvas.getContext('2d');
      X.glowCanvas = document.createElement('canvas');
      X.glowCanvas.width = Math.round(W * GS); X.glowCanvas.height = Math.round(H * GS);
      X.g = X.glowCanvas.getContext('2d');
      X.blurCanvas = document.createElement('canvas');
      X.blurCanvas.width = Math.round(W * BS); X.blurCanvas.height = Math.round(H * BS);
      X.bctx = X.blurCanvas.getContext('2d');
    },
    setScale(kx, ky) { X.k = [kx, ky]; },

    screenTransform() {
      const [kx, ky] = X.k;
      X.ctx.setTransform(kx, 0, 0, ky, 0, 0);
      X.g.setTransform(GS, 0, 0, GS, 0, 0);
    },
    mute: false,

    beginGlow() {
      X.g.setTransform(1, 0, 0, 1, 0, 0);
      X.g.globalCompositeOperation = 'source-over';
      X.g.clearRect(0, 0, X.glowCanvas.width, X.glowCanvas.height);
      X.g.globalCompositeOperation = 'lighter';
      X.g.setTransform(GS, 0, 0, GS, 0, 0);
    },

    // 在光层上画一团柔光
    glow(x, y, r, col, a) {
      if (X.mute || a <= 0.003 || r <= 0) return;
      const g = X.g;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, U.rgb(col, a));
      gr.addColorStop(0.35, U.rgb(col, a * 0.45));
      gr.addColorStop(1, U.rgb(col, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    },

    // 合成泛光
    composeGlow(strength) {
      const ctx = X.ctx;
      X.screenTransform();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = strength;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(X.glowCanvas, 0, 0, W, H);
      X.bctx.clearRect(0, 0, X.blurCanvas.width, X.blurCanvas.height);
      X.bctx.imageSmoothingEnabled = true;
      X.bctx.drawImage(X.glowCanvas, 0, 0, X.blurCanvas.width, X.blurCanvas.height);
      if (!X.lowFx) {
        ctx.globalAlpha = strength * 0.6;
        ctx.drawImage(X.blurCanvas, 0, 0, W, H);
      }
      ctx.restore();
    },

    // 倒影：先把 [y0, y0+h) 拷到缓冲画布，再以 axis 为轴翻到另一侧
    reflect(y0, h, axis, alpha) {
      const ctx = X.ctx, [kx, ky] = X.k;
      const bw = Math.round(W * kx), bh = Math.round(h * ky);
      if (!X.buf) { X.buf = document.createElement('canvas'); X.bufCtx = X.buf.getContext('2d'); }
      if (X.buf.width !== bw || X.buf.height !== bh) { X.buf.width = bw; X.buf.height = bh; }
      X.bufCtx.clearRect(0, 0, bw, bh);
      X.bufCtx.drawImage(X.canvas, 0, Math.round(y0 * ky), bw, bh, 0, 0, bw, bh);
      ctx.save();
      ctx.setTransform(kx, 0, 0, -ky, 0, 2 * axis * ky);
      ctx.globalAlpha = alpha;
      ctx.drawImage(X.buf, 0, 0, bw, bh, 0, y0, W, h);
      ctx.restore();
    },

    roundRect(c, x, y, w, h, r) {
      c.beginPath();
      if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
      if (Array.isArray(r)) r = r[0];
      r = Math.min(r, w / 2, Math.abs(h) / 2);
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
  };
  RF.FX = X;
})();
