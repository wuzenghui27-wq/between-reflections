// 旅人：披斗篷、背小包的剪影，一条会发光、随风飘动的长围巾。
// sx, foot 为屏幕坐标；o.air 为空中姿态。
(function () {
  const U = RF.U, X = RF.FX;
  const rgb = U.rgb;

  // o: { phase, still, air, alpha, ink, rim, scarf, glow, t }
  function draw(sx, foot, o) {
    const ctx = X.ctx;
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.01) return;
    const f = foot;
    const sw = o.still ? 0 : Math.sin(o.phase);
    const bob = o.still ? 0 : Math.abs(Math.cos(o.phase)) * 1.5;
    const top = f - 58 - bob;
    ctx.save();
    ctx.globalAlpha = a;

    // 围巾（在身体后面，向后飘）
    const t = o.t || 0;
    const neckX = sx - 1, neckY = top + 20;
    const N = 14, pts = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      const wave = Math.sin(t * 5.2 - i * 0.55) * (2 + 7 * k) * (o.still ? 0.4 : 1);
      pts.push([neckX - 4 - i * 3.6, neckY + 2 - k * 7 + wave]);
    }
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const w = 3.2 * (1 - i / N) + 0.6; ctx[i ? 'lineTo' : 'moveTo'](pts[i][0], pts[i][1] - w); }
    for (let i = N; i >= 0; i--) { const w = 3.2 * (1 - i / N) + 0.6; ctx.lineTo(pts[i][0], pts[i][1] + w); }
    ctx.closePath();
    const sg = ctx.createLinearGradient(neckX, 0, neckX - N * 3.6, 0);
    sg.addColorStop(0, rgb(o.scarf)); sg.addColorStop(1, rgb(o.scarf, 0.35));
    ctx.fillStyle = sg; ctx.fill();
    if (o.glow > 0 && !o.ghost) {
      for (let i = 2; i <= N; i += 3) X.glow(pts[i][0], pts[i][1], 14, o.scarf, 0.32 * o.glow * a);
    }

    // 腿
    ctx.strokeStyle = rgb(o.ink); ctx.lineWidth = 3.6; ctx.lineCap = 'round';
    ctx.beginPath();
    if (o.air) {
      ctx.moveTo(sx - 2, f - 16); ctx.lineTo(sx - 7, f - 7); ctx.lineTo(sx - 3, f - 2);
      ctx.moveTo(sx + 2, f - 16); ctx.lineTo(sx + 8, f - 9); ctx.lineTo(sx + 5, f - 3);
    } else {
      ctx.moveTo(sx - 2, f - 16); ctx.lineTo(sx - 2 + sw * 6, f - 1);
      ctx.moveTo(sx + 2, f - 16); ctx.lineTo(sx + 2 - sw * 6, f - 1);
    }
    ctx.stroke();

    // 背包
    ctx.fillStyle = rgb(U.mix(o.ink, o.scarf, 0.25));
    X.roundRect(ctx, sx - 15, top + 22, 9, 17, 4); ctx.fill();

    // 斗篷：上窄下宽的柔和水滴形
    const swing = o.still ? 0 : Math.sin(o.phase * 0.5) * 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, top + 14);
    ctx.bezierCurveTo(sx + 10, top + 18, sx + 12 + swing, f - 22, sx + 11 + swing, f - 14);
    ctx.quadraticCurveTo(sx, f - 11, sx - 12 - swing, f - 14);
    ctx.bezierCurveTo(sx - 12 - swing, f - 24, sx - 9, top + 18, sx, top + 14);
    ctx.closePath();
    ctx.fillStyle = rgb(o.ink); ctx.fill();
    // 受光一侧的亮边
    if (o.rim) {
      ctx.strokeStyle = rgb(o.rim, 0.85); ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(sx + 3, top + 15);
      ctx.bezierCurveTo(sx + 10, top + 19, sx + 12 + swing, f - 22, sx + 11 + swing, f - 14);
      ctx.stroke();
    }

    // 兜帽和头
    ctx.fillStyle = rgb(o.ink);
    ctx.beginPath(); ctx.ellipse(sx + 1, top + 6, 8.2, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - 6, top + 2); ctx.quadraticCurveTo(sx - 12, top - 2, sx - 13, top + 6); ctx.quadraticCurveTo(sx - 9, top + 5, sx - 6, top + 9); ctx.fill();
    // 脸：一小片暖光（朝前）
    ctx.fillStyle = rgb(o.face || [255, 236, 210], 0.95);
    ctx.beginPath(); ctx.ellipse(sx + 4.5, top + 7, 3.2, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    if (o.rim) {
      ctx.strokeStyle = rgb(o.rim, 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sx + 1, top + 6, 8.6, -1.4, 0.4); ctx.stroke();
    }
    // 围巾领口
    ctx.fillStyle = rgb(o.scarf);
    X.roundRect(ctx, sx - 7, top + 13, 14, 5, 2.5); ctx.fill();

    if (o.glow > 0 && !o.ghost) {
      X.glow(sx + 4, top + 8, 22, o.face || [255, 236, 210], 0.35 * o.glow * a);
      X.glow(sx, f - 30, 60, o.scarf, 0.18 * o.glow * a);
    }
    ctx.restore();
  }

  RF.Traveler = { draw };
})();
