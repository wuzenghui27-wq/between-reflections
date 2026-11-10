// 近景道具：道路、缺口、桥、光柱石板、障碍、灯盏、观景台。
// 以“现实坐标”作画（脚底 y=540），梦境自动镜像。
(function () {
  const C = RF.CFG, LV = RF.LEVEL, U = RF.U, X = RF.FX;
  const W = C.W, FOOT = C.REAL_FOOT;
  const rgb = U.rgb;

  function solidSegments(world, a, b) {
    const segs = []; let s = a;
    for (const h of LV.holes[world]) {
      if (h.x1 <= a || h.x0 >= b) continue;
      if (h.x0 > s) segs.push([s, h.x0]);
      s = Math.max(s, h.x1);
    }
    if (s < b) segs.push([s, b]);
    return segs;
  }

  // 道路：顶面受光，侧面渐暗，边缘一条细高光
  function path(world, e, p) {
    const ctx = X.ctx, camX = e.camX, dream = world === 'dream';
    const segs = solidSegments(world, camX - 40, camX + W + 40);
    for (const [a, b] of segs) {
      const x = a - camX, w = b - a;
      // 路身：顶面亮、侧面暗，下面一道柔和的投影落在水上
      const sh = ctx.createLinearGradient(0, FOOT + 10, 0, FOOT + 26);
      sh.addColorStop(0, rgb(p.pathShade, 0.55)); sh.addColorStop(1, rgb(p.pathShade, 0));
      ctx.fillStyle = sh; ctx.fillRect(x + 4, FOOT + 10, w - 8, 16);
      const g = ctx.createLinearGradient(0, FOOT - 1, 0, FOOT + 12);
      g.addColorStop(0, rgb(p.path)); g.addColorStop(0.45, rgb(p.path)); g.addColorStop(1, rgb(p.pathShade));
      ctx.fillStyle = g;
      X.roundRect(ctx, x, FOOT - 1, w, 13, 6); ctx.fill();
      ctx.strokeStyle = rgb(p.pathHi, 0.95); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x + 6, FOOT - 0.2); ctx.lineTo(x + w - 6, FOOT - 0.2); ctx.stroke();
      if (dream) {
        // 梦境道路：沿边缘的微光
        const step = 70;
        for (let i = Math.ceil(a / step); i <= Math.floor(b / step); i++) {
          const gx = i * step - camX + U.hash(i, 9) * 30;
          if (gx < x + 8 || gx > x + w - 8) continue;
          const tw = e.reduce ? 0.7 : 0.5 + 0.5 * Math.sin(e.t * 2 + i);
          X.glow(gx, FOOT, 16, p.pathHi, 0.4 * tw);
        }
      }
      // 缺口处路沿的柔光，暗示路在这里断开
      for (const [ex, dir] of [[x, 1], [x + w, -1]]) {
        if (ex < -20 || ex > W + 20) continue;
        if (Math.abs(ex - (a - camX)) < 1 && a <= camX - 39) continue;
        if (Math.abs(ex - (b - camX)) < 1 && b >= camX + W + 39) continue;
        X.glow(ex + dir * 2, FOOT + 2, 18, p.pathHi, 0.35);
      }
    }
  }

  function bridgeProgress(G, b) {
    const s = G.bridges[b.id];
    if (!s || s.state === 'closed') return 0;
    if (s.state === 'open') return 1;
    return U.clamp(s.t / C.BRIDGE_DEPLOY, 0, 1);
  }

  // 形状记号：圆环 / 叶片 / 菱形 / 星形
  function shapePath(c, kind, x, y, r) {
    c.beginPath();
    switch (kind) {
      case 'ring': c.arc(x, y, r, 0, Math.PI * 2); c.moveTo(x + r * 0.5, y); c.arc(x, y, r * 0.5, 0, Math.PI * 2, true); break;
      case 'leaf': c.moveTo(x - r, y); c.quadraticCurveTo(x, y - r * 1.3, x + r, y); c.quadraticCurveTo(x, y + r * 1.3, x - r, y); break;
      case 'diamond': c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 0.85, y); c.lineTo(x, y + r * 1.2); c.lineTo(x - r * 0.85, y); c.closePath(); break;
      case 'star':
        for (let k = 0; k < 8; k++) { const an = -Math.PI / 2 + k * Math.PI / 4; const rr = k % 2 ? r * 0.4 : r * 1.2; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
        c.closePath(); break;
    }
  }
  function shape(kind, x, y, r, col, lit, a) {
    const ctx = X.ctx;
    if (lit) X.glow(x, y, r * 4, col, 0.7 * a);
    shapePath(ctx, kind, x, y, r);
    ctx.fillStyle = rgb(col, (lit ? 1 : 0.35) * a); ctx.fill('evenodd');
    ctx.lineWidth = 1.2; ctx.strokeStyle = rgb(lit ? [255, 255, 255] : col, (lit ? 0.7 : 0.8) * a); ctx.stroke();
  }

  function bridges(world, e, p) {
    const ctx = X.ctx, G = e.G, dream = world === 'dream';
    const markCol = dream ? p.glow : p.rim;
    for (const b of LV.bridges) {
      if (b.world !== world) continue;
      const x0 = b.x0 - e.camX, x1 = b.x1 - e.camX;
      if (x1 < -60 || x0 > W + 60) continue;
      const prog = bridgeProgress(G, b);
      const flash = G.flashes[b.id] || 0;
      const n = Math.max(1, Math.round((b.x1 - b.x0) / 26));
      const pw = (b.x1 - b.x0) / n;
      const filled = prog >= 1 ? n : Math.floor(prog * n);
      for (let k = 0; k < n; k++) {
        const bx = x0 + k * pw;
        if (bx + pw < -10 || bx > W + 10) continue;
        const on = k < filled;
        const cx = bx + pw / 2;
        if (dream) {
          // 荷叶
          ctx.beginPath(); ctx.ellipse(cx, FOOT + 3, pw * 0.55, 7.5, 0, 0, Math.PI * 2);
          if (on) {
            const g = ctx.createLinearGradient(0, FOOT - 4, 0, FOOT + 10);
            g.addColorStop(0, rgb([214, 255, 240])); g.addColorStop(1, rgb([96, 170, 168]));
            ctx.fillStyle = g; ctx.fill();
            ctx.strokeStyle = rgb([228, 255, 248], 0.8); ctx.lineWidth = 1; ctx.stroke();
            X.glow(cx, FOOT + 2, 26, p.glow, 0.28 + 0.5 * flash);
          } else {
            ctx.setLineDash([3, 4]); ctx.strokeStyle = rgb(p.glow, 0.7); ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
          }
        } else {
          // 木板
          if (on) {
            const g = ctx.createLinearGradient(0, FOOT - 1, 0, FOOT + 10);
            g.addColorStop(0, rgb([236, 202, 160])); g.addColorStop(1, rgb([150, 108, 82]));
            ctx.fillStyle = g;
            X.roundRect(ctx, bx + 1.5, FOOT - 1, pw - 3, 10, 2.5); ctx.fill();
            ctx.strokeStyle = rgb([255, 240, 214], 0.8); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(bx + 3, FOOT - 0.5); ctx.lineTo(bx + pw - 3, FOOT - 0.5); ctx.stroke();
            if (flash > 0) X.glow(cx, FOOT + 2, 24, p.rim, 0.6 * flash);
          } else {
            ctx.setLineDash([4, 4]); ctx.strokeStyle = rgb(p.rim, 0.85); ctx.lineWidth = 1.4;
            X.roundRect(ctx, bx + 1.5, FOOT - 1, pw - 3, 10, 2.5); ctx.stroke(); ctx.setLineDash([]);
          }
        }
        // 展开中的最新一片闪一下
        if (prog > 0 && prog < 1 && k === filled) X.glow(cx, FOOT, 30, markCol, 0.8);
      }
      if (prog >= 1) {
        ctx.strokeStyle = rgb(dream ? p.glow : [255, 236, 200], 0.55); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x0, FOOT - 22); ctx.quadraticCurveTo((x0 + x1) / 2, FOOT - 10, x1, FOOT - 22); ctx.stroke();
      }
      // 桥头的记号柱
      const blink = prog > 0 && prog < 1 ? 0.55 + 0.45 * Math.sin(e.t * 18) : 1;
      for (const ex of [x0 - 8, x1 + 8]) {
        if (ex < -20 || ex > W + 20) continue;
        ctx.strokeStyle = rgb(p.pathShade); ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex, FOOT); ctx.lineTo(ex, FOOT - 24); ctx.stroke();
        shape(b.shape, ex, FOOT - 33, 6.5, markCol, prog >= 1, blink);
      }
    }
  }

  // 光柱石板：未踩时一道柔和的光柱，踩下后光柱冲高再归于平静
  function plates(world, e, p) {
    const ctx = X.ctx, G = e.G, dream = world === 'dream';
    const col = dream ? p.glow : p.rim;
    for (const pl of LV.plates) {
      if (pl.world !== world) continue;
      const x = pl.x - e.camX;
      if (x < -80 || x > W + 80) continue;
      const fired = G.firedPlates.has(pl.id);
      const flash = G.flashes[pl.id] || 0;
      const pulse = e.reduce ? 0.8 : 0.65 + 0.35 * Math.sin(e.t * 2.6);
      const beamH = fired ? 70 + 160 * flash : 110;
      const beamA = fired ? 0.12 + 0.4 * flash : 0.22 * pulse;
      // 光柱
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, FOOT, 0, FOOT - beamH);
      g.addColorStop(0, rgb(col, beamA)); g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 16, FOOT); ctx.lineTo(x - 7, FOOT - beamH); ctx.lineTo(x + 7, FOOT - beamH); ctx.lineTo(x + 16, FOOT); ctx.fill();
      ctx.restore();
      X.glow(x, FOOT - 4, 40, col, fired ? 0.25 + 0.5 * flash : 0.28 * pulse);
      // 石板
      const sg = ctx.createLinearGradient(0, FOOT - 4, 0, FOOT + 5);
      sg.addColorStop(0, rgb(dream ? [220, 230, 255] : [255, 244, 222])); sg.addColorStop(1, rgb(p.pathShade));
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(x, FOOT, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgb(col, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
      const fy = FOOT - 26 - (e.reduce ? 0 : Math.sin(e.t * 2) * 2);
      shape(pl.shape, x, fy, 7, col, true, fired ? 1 : 0.6 + 0.4 * pulse);
    }
  }

  // 障碍：深色剪影 + 一道亮边，和背景在明暗上明显区分
  function obstacles(world, e, p) {
    const ctx = X.ctx, dream = world === 'dream';
    for (const o of LV.obstacles) {
      if (o.world !== world) continue;
      const x = o.x - e.camX;
      if (x < -80 || x > W + 80) continue;
      const w = o.w, h = 86;
      if (!dream) {
        // 倒下的老树干（立起的一截）
        ctx.beginPath();
        ctx.moveTo(x, FOOT + 2);
        ctx.lineTo(x + 2, FOOT - h + 14);
        ctx.quadraticCurveTo(x + 4, FOOT - h, x + 16, FOOT - h + 2);
        ctx.lineTo(x + 24, FOOT - h + 8);
        ctx.lineTo(x + 32, FOOT - h - 2);
        ctx.quadraticCurveTo(x + w, FOOT - h + 2, x + w - 1, FOOT - h + 18);
        ctx.lineTo(x + w, FOOT + 2);
        ctx.closePath();
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, rgb(U.mix(p.ink, [90, 64, 56], 0.6))); g.addColorStop(1, rgb(p.ink));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = rgb(p.rim, 0.95); ctx.lineWidth = 1.8; ctx.stroke();
        ctx.strokeStyle = rgb(p.rim, 0.25); ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + 10 + k * 11, FOOT - h + 22); ctx.lineTo(x + 8 + k * 11, FOOT - 8); ctx.stroke(); }
        // 一根带叶的小枝
        ctx.strokeStyle = rgb(p.ink); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + w - 2, FOOT - h + 30); ctx.quadraticCurveTo(x + w + 10, FOOT - h + 22, x + w + 16, FOOT - h + 26); ctx.stroke();
        ctx.fillStyle = rgb(p.tree);
        ctx.beginPath(); ctx.ellipse(x + w + 17, FOOT - h + 26, 6, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
      } else {
        // 梦境荆棘晶簇
        ctx.beginPath();
        ctx.moveTo(x - 4, FOOT + 2);
        ctx.lineTo(x + 4, FOOT - 52);
        ctx.lineTo(x + 12, FOOT - 34);
        ctx.lineTo(x + w * 0.45, FOOT - h - 8);
        ctx.lineTo(x + w * 0.7, FOOT - 40);
        ctx.lineTo(x + w - 2, FOOT - 62);
        ctx.lineTo(x + w + 4, FOOT + 2);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, FOOT - h, 0, FOOT);
        g.addColorStop(0, rgb([44, 34, 92])); g.addColorStop(1, rgb([14, 12, 40]));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = rgb(p.rim, 0.95); ctx.lineWidth = 1.8; ctx.stroke();
        ctx.strokeStyle = rgb(p.rim, 0.35); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + w * 0.45, FOOT - h - 8); ctx.lineTo(x + w * 0.42, FOOT); ctx.stroke();
        X.glow(x + w * 0.45, FOOT - h, 30, p.rim, 0.35);
      }
    }
  }

  // 检查点：一盏小灯，到达时点亮
  function lanterns(world, e, p) {
    const ctx = X.ctx, G = e.G, dream = world === 'dream';
    const col = dream ? p.gold : p.rim;
    LV.checkpoints.forEach((c, i) => {
      if (i === 0) return;
      const x = c.x - e.camX + 40;
      if (x < -40 || x > W + 40) return;
      const lit = G.cpIndex >= i;
      const flash = G.flashes['cp' + i] || 0;
      ctx.strokeStyle = rgb(p.pathShade); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, FOOT); ctx.lineTo(x, FOOT - 40); ctx.stroke();
      ctx.fillStyle = rgb(p.pathShade);
      X.roundRect(ctx, x - 5, FOOT - 50, 10, 11, 3); ctx.fill();
      if (lit) {
        const flick = e.reduce ? 1 : 0.85 + 0.15 * Math.sin(e.t * 9 + i);
        ctx.fillStyle = rgb([255, 246, 220]);
        ctx.beginPath(); ctx.ellipse(x, FOOT - 47, 2.4, 4.2 * flick, 0, 0, Math.PI * 2); ctx.fill();
        X.glow(x, FOOT - 46, 40 + 60 * flash, col, 0.8 * flick);
      }
    });
  }

  function deck(world, e, p) {
    const ctx = X.ctx, dream = world === 'dream';
    const x0 = LV.endX - 140 - e.camX, x1 = LV.endX + 380 - e.camX;
    if (x1 < 0 || x0 > W) return;
    const col = dream ? p.gold : [214, 178, 140];
    const g = ctx.createLinearGradient(0, FOOT - 2, 0, FOOT + 8);
    g.addColorStop(0, rgb(col, dream ? 0.8 : 1)); g.addColorStop(1, rgb(p.pathShade, dream ? 0.5 : 1));
    ctx.fillStyle = g; ctx.fillRect(x0, FOOT - 2, x1 - x0, 9);
    ctx.strokeStyle = rgb(col, 0.9); ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let x = x0 + 12; x < x1; x += 44) { ctx.beginPath(); ctx.moveTo(x, FOOT - 2); ctx.lineTo(x, FOOT - 28); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0 + 12, FOOT - 28); ctx.lineTo(x1 - 12, FOOT - 28); ctx.stroke();
    ctx.lineWidth = 3.5;
    for (let x = x0 + 30; x < x1; x += 96) { ctx.beginPath(); ctx.moveTo(x, FOOT + 7); ctx.lineTo(x, FOOT + 60); ctx.stroke(); }
    // 栏杆上的小灯
    for (let x = x0 + 56; x < x1; x += 132) {
      X.glow(x, FOOT - 32, 30, dream ? p.gold : p.rim, 0.6);
      ctx.fillStyle = rgb([255, 246, 224]); ctx.beginPath(); ctx.arc(x, FOOT - 32, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawAll(world, e, p) {
    path(world, e, p);
    deck(world, e, p);
    lanterns(world, e, p);
    bridges(world, e, p);
    plates(world, e, p);
    obstacles(world, e, p);
  }

  RF.Props = { drawAll, shapePath };
})();
