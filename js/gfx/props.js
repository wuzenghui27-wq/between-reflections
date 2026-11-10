// 近景：地面（按区域换质感）、障碍、铃铛与门、灯、海市蜃楼，以及另一面的预告轮廓。
(function () {
  const C = RF.CFG, U = RF.U, X = RF.FX, LV = RF.LEVEL;
  const H = C.H, rgb = U.rgb;

  // ------------------------------------------------------------ 地面
  function ground(c, s, x0, x1, p, rid, e) {
    const y = s.y, w = x1 - x0;
    const g = c.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, rgb(p.ground)); g.addColorStop(1, rgb(U.mix(p.ground, p.deep || p.roof, 0.6)));
    c.fillStyle = g; c.fillRect(x0, y, w, H - y);
    const line = a => { c.strokeStyle = rgb(p.roof, a); c.lineWidth = 1; };
    switch (rid) {
      case 'jiangnan': {     // 石砌河岸
        line(0.22);
        for (let yy = y + 12, r = 0; yy < H; yy += 20, r++) {
          c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke();
          for (let xx = Math.ceil((s.x0 + (r % 2) * 22) / 44) * 44 - (s.x0 - x0) + (r % 2) * 22; xx < x1; xx += 44) {
            c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx, yy + 20); c.stroke();
          }
        }
        c.fillStyle = rgb(p.gtop); c.fillRect(x0, y, w, 7);
        break;
      }
      case 'huizhou': {      // 青石板路 + 砖墙
        line(0.2);
        for (let yy = y + 16; yy < H; yy += 10) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }
        c.fillStyle = rgb(p.gtop); c.fillRect(x0, y, w, 8);
        line(0.35);
        for (let xx = Math.ceil(s.x0 / 38) * 38 - (s.x0 - x0); xx < x1; xx += 38) { c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y + 8); c.stroke(); }
        break;
      }
      case 'karst': {        // 梯田：泥墙 + 水面 + 稻苗
        c.fillStyle = rgb(p.gtop); c.fillRect(x0, y, w, 5);
        c.fillStyle = rgb(p.paddy, 0.85); c.fillRect(x0, y + 1, w, 3);
        c.strokeStyle = rgb(p.leaf || p.gtop); c.lineWidth = 1.4;
        for (let xx = Math.ceil(s.x0 / 12) * 12 - (s.x0 - x0); xx < x1; xx += 12) {
          c.beginPath(); c.moveTo(xx, y + 1); c.lineTo(xx - 2, y - 6); c.moveTo(xx, y + 1); c.lineTo(xx + 3, y - 5); c.stroke();
        }
        line(0.18);
        for (let yy = y + 14; yy < H; yy += 16) { c.beginPath(); c.moveTo(x0, yy + Math.sin(yy) * 2); c.lineTo(x1, yy); c.stroke(); }
        if (e.world === 'night') for (let xx = x0 + 20; xx < x1; xx += 70) X.glow(xx, y + 2, 18, p.paddy, 0.25 * e.a);
        break;
      }
      case 'lingnan': {      // 骑楼下的花砖
        c.fillStyle = rgb(p.gtop); c.fillRect(x0, y, w, 10);
        for (let xx = Math.ceil(s.x0 / 20) * 20 - (s.x0 - x0), k = Math.ceil(s.x0 / 20); xx < x1; xx += 20, k++) {
          if (k % 2) { c.fillStyle = rgb(p.tile2, 0.7); c.fillRect(xx, y, Math.min(10, x1 - xx), 5); c.fillRect(xx + 10, y + 5, Math.min(10, x1 - xx - 10), 5); }
        }
        line(0.25);
        for (let yy = y + 22; yy < H; yy += 12) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }
        break;
      }
      case 'danxia': {       // 红色条纹岩
        const cols = [p.ground, p.gtop, p.stripe2 || p.ground, p.gtop];
        for (let k = 0, yy = y; yy < H; k++, yy += 10 + (k % 3) * 4) {
          c.fillStyle = rgb(cols[k % 4], 0.55); c.fillRect(x0, yy, w, 5 + (k % 2) * 3);
        }
        c.fillStyle = rgb(p.gtop); c.fillRect(x0, y, w, 5);
        break;
      }
      case 'tibet': {        // 岩石 + 积雪
        c.fillStyle = rgb(p.gtop);
        c.beginPath(); c.moveTo(x0, y + 8);
        for (let xx = x0; xx <= x1; xx += 10) c.lineTo(xx, y + 6 + U.hash(Math.floor((xx - x0 + s.x0) / 10), 77) * 6);
        c.lineTo(x1, y); c.lineTo(x0, y); c.fill();
        line(0.2);
        for (let yy = y + 20; yy < H; yy += 18) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy + 4); c.stroke(); }
        break;
      }
    }
  }

  function solid(c, s, cam, e, ghost) {
    const x0 = s.x0 - cam, x1 = s.x1 - cam;
    if (x1 < -40 || x0 > C.W + 40) return;
    const rid = LV.regions[LV.regionAt(s.x0)].id;
    const p = e.palOf(rid);
    if (ghost) return ghostSolid(c, s, x0, x1, e);
    switch (s.kind) {
      case 'ground': case 'shore': ground(c, s, x0, x1, p, rid, e); break;
      case 'steps': {      // 夜里露出水面的石阶：一块块青石，下面是石墩
        const top = s.y, stone = U.mix(p.gtop, [150, 170, 160], 0.35);
        for (let xx = x0 + 3, k = 0; xx < x1 - 6; xx += 42, k++) {
          const bw = Math.min(38, x1 - 3 - xx);
          c.fillStyle = rgb(U.mix(p.ground, p.water || p.deep, 0.3)); c.fillRect(xx + 4, top + 10, bw - 8, H - top);
          c.fillStyle = rgb(stone); X.roundRect(c, xx, top, bw, 12, 3); c.fill();
          c.fillStyle = rgb([255, 255, 255], 0.18); c.fillRect(xx + 2, top + 1, bw - 4, 2);
          c.fillStyle = rgb([110, 150, 110], 0.5); c.fillRect(xx + 4, top + 10, bw - 8, 3);
        }
        X.glow((x0 + x1) / 2, top, (x1 - x0) * 0.5, p.light, 0.12 * e.a);
        break;
      }
      case 'boat': {       // 乌篷船
        const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
        const bob = e.reduce ? 0 : Math.sin(e.t * 1.8 + s.x0) * 1.2;
        c.fillStyle = rgb(U.mix(p.roof, [120, 80, 50], 0.4));
        c.beginPath(); c.moveTo(x0 - 4, s.y + bob); c.lineTo(x1 + 4, s.y + bob);
        c.quadraticCurveTo(x1 - 4, s.y + 22 + bob, cx, s.y + 22 + bob); c.quadraticCurveTo(x0 + 4, s.y + 22 + bob, x0 - 4, s.y + bob); c.fill();
        c.fillStyle = rgb(p.gtop, 0.6); c.fillRect(x0, s.y + bob, x1 - x0, 3);
        c.fillStyle = rgb(p.roof);                   // 船尾的乌篷
        c.beginPath(); c.moveTo(x1 - hw * 0.55, s.y + bob); c.quadraticCurveTo(x1 - hw * 0.3, s.y - 28 + bob, x1 - 8, s.y + bob); c.fill();
        break;
      }
      case 'firefly': {    // 夜里连成路的萤火
        for (let xx = x0 + 6, k = 0; xx < x1; xx += 14, k++) {
          const fl = e.reduce ? 0.8 : 0.6 + 0.4 * Math.sin(e.t * 3 + k * 1.7);
          const yy = s.y + 2 + Math.sin(k * 1.3 + e.t * (e.reduce ? 0 : 1.5)) * 1.5;
          c.fillStyle = rgb([230, 255, 160], 0.9 * fl); c.beginPath(); c.arc(xx, yy, 2.2, 0, 7); c.fill();
          X.glow(xx, yy, 16, [200, 255, 120], 0.45 * fl * e.a);
        }
        c.strokeStyle = rgb([200, 255, 140], 0.22); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, s.y + 2); c.lineTo(x1, s.y + 2); c.stroke();
        break;
      }
      case 'pillar': {     // 雅丹石柱
        c.fillStyle = rgb(p.ground);
        c.beginPath(); c.moveTo(x0 + 4, H); c.lineTo(x0 + 1, s.y + 8); c.quadraticCurveTo(x0 + 2, s.y, x0 + 12, s.y);
        c.lineTo(x1 - 12, s.y); c.quadraticCurveTo(x1 - 2, s.y, x1 - 1, s.y + 8); c.lineTo(x1 - 6, H); c.fill();
        for (let yy = s.y + 10, k = 0; yy < H; yy += 14, k++) { c.fillStyle = rgb(k % 2 ? p.gtop : p.stripe2 || p.gtop, 0.4); c.fillRect(x0 + 3, yy, x1 - x0 - 8, 5); }
        c.fillStyle = rgb(p.gtop); c.fillRect(x0 + 6, s.y, x1 - x0 - 12, 4);
        if (e.world === 'night') X.glow((x0 + x1) / 2, s.y, 50, [200, 180, 255], 0.18 * e.a);
        break;
      }
      case 'ice': {        // 夜里结冰的湖面
        c.fillStyle = rgb([190, 220, 255], 0.55); c.fillRect(x0, s.y, x1 - x0, 10);
        c.fillStyle = rgb([240, 250, 255], 0.85); c.fillRect(x0, s.y, x1 - x0, 2);
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
        for (let xx = x0 + 20; xx < x1 - 10; xx += 46) { c.beginPath(); c.moveTo(xx, s.y + 2); c.lineTo(xx + 12, s.y + 9); c.lineTo(xx + 20, s.y + 4); c.stroke(); }
        X.glow((x0 + x1) / 2, s.y + 4, (x1 - x0) * 0.45, [170, 210, 255], 0.22 * e.a);
        break;
      }
    }
  }

  // 另一面的预告：只画轮廓
  function previewCol(e) { return e.world === 'day' ? [36, 74, 190] : [255, 214, 140]; }
  function ghostSolid(c, s, x0, x1, e) {
    const col = previewCol(e), a = e.ghostA(s.x0, s.x1);
    if (a <= 0.01) return;
    c.save();
    c.setLineDash(s.thin ? [4, 6] : [10, 6]); c.lineWidth = 3;
    c.strokeStyle = rgb(col, a);
    c.beginPath(); c.moveTo(x0, s.y); c.lineTo(x1, s.y); c.stroke();
    if (!s.thin) {
      c.lineWidth = 1.2; c.strokeStyle = rgb(col, a * 0.55);
      c.beginPath(); c.moveTo(x0, s.y); c.lineTo(x0, s.y + 40); c.moveTo(x1, s.y); c.lineTo(x1, s.y + 40); c.stroke();
      const g = c.createLinearGradient(0, s.y, 0, s.y + 50);
      g.addColorStop(0, rgb(col, a * 0.18)); g.addColorStop(1, rgb(col, 0));
      c.fillStyle = g; c.fillRect(x0, s.y, x1 - x0, 50);
    }
    c.restore();
  }

  // ------------------------------------------------------------ 障碍
  function hazard(c, h, cam, e, gates, ghost) {
    const x0 = h.x0 - cam, x1 = h.x1 - cam, cx = (x0 + x1) / 2, w = x1 - x0, y0 = h.y0, y1 = h.y1, ht = y1 - y0;
    if (x1 < -60 || x0 > C.W + 60) return;
    const rid = LV.regions[LV.regionAt(h.x0)].id, p = e.palOf(rid);
    const open = h.gate && gates[h.gate];
    if (ghost) {
      const a = e.ghostA(h.x0, h.x1); if (a <= 0.01) return;
      c.save(); c.setLineDash([5, 5]); c.lineWidth = 2; c.strokeStyle = rgb(previewCol(e), a);
      X.roundRect(c, x0, y0, w, ht, 6); c.stroke();
      c.beginPath(); c.moveTo(x0 + 6, y0 + 6); c.lineTo(x1 - 6, y1 - 6); c.moveTo(x1 - 6, y0 + 6); c.lineTo(x0 + 6, y1 - 6); c.stroke();
      c.restore(); return;
    }
    const night = e.world === 'night';
    switch (h.kind) {
      case 'stall': {      // 货摊：竹竿撑起的布篷、摆满东西的木台
        c.fillStyle = rgb(p.roof); c.fillRect(x0 + 2, y0 + 10, 3, ht - 10); c.fillRect(x1 - 5, y0 + 10, 3, ht - 10);
        c.fillStyle = rgb([196, 70, 52]); c.beginPath(); c.moveTo(x0 - 8, y0 + 22); c.lineTo(cx, y0); c.lineTo(x1 + 8, y0 + 22); c.fill();
        c.fillStyle = rgb([235, 200, 120]); for (let k = 0; k < 4; k++) c.fillRect(x0 - 8 + k * (w + 16) / 4, y0 + 18, (w + 16) / 8, 4);
        c.fillStyle = rgb([140, 96, 60]); c.fillRect(x0 - 4, y1 - 46, w + 8, 8); c.fillRect(x0, y1 - 38, 4, 38); c.fillRect(x1 - 4, y1 - 38, 4, 38);
        const goods = [[226, 140, 60], [120, 170, 80], [230, 200, 90], [200, 80, 60]];
        for (let k = 0; k < 5; k++) { c.fillStyle = rgb(goods[k % 4]); c.beginPath(); c.arc(x0 + 6 + k * (w - 12) / 4, y1 - 52, 6, 0, 7); c.fill(); }
        break;
      }
      case 'door': case 'gate': {   // 宅门 / 上锁的院门
        const red = h.kind === 'gate';
        c.fillStyle = rgb(p.roof); c.fillRect(x0 - 8, y0 - 6, w + 16, 10);
        RF.Regions.roof(c, x0 - 14, y0 - 20, w + 28, 16, rgb(p.roof));
        const leaf = red ? [150, 40, 34] : U.mix(p.roof, [110, 70, 40], 0.5);
        if (open) {
          const t = Math.min(1, 1 - (e.flash(h.gate) || 0) / 1.2);
          const lw = U.lerp(w / 2, 5, U.ease(t));
          c.fillStyle = rgb(leaf, 0.9); c.fillRect(x0 - 2, y0 + 4, lw, ht - 4); c.fillRect(x1 + 2 - lw, y0 + 4, lw, ht - 4);
          if (night) X.glow(cx, y0 + ht / 2, 50, p.light, 0.25 * e.a);
        } else {
          c.fillStyle = rgb(leaf); c.fillRect(x0, y0 + 4, w, ht - 4);
          c.strokeStyle = rgb(p.roof, 0.6); c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, y0 + 4); c.lineTo(cx, y1); c.stroke();
          c.fillStyle = rgb([230, 180, 70]);
          for (let yy = y0 + 18; yy < y1 - 10; yy += 18) for (const dx of [-w * 0.3, w * 0.3]) { c.beginPath(); c.arc(cx + dx, yy, 1.8, 0, 7); c.fill(); }
          if (red) {   // 锁
            c.fillStyle = rgb([230, 190, 80]); c.fillRect(cx - 6, y0 + ht * 0.48, 12, 10);
            c.strokeStyle = rgb([230, 190, 80]); c.lineWidth = 2; c.beginPath(); c.arc(cx, y0 + ht * 0.48, 5, Math.PI, 0); c.stroke();
            X.glow(cx, y0 + ht * 0.5, 22, [255, 200, 90], 0.35 * e.a);
          } else { c.fillStyle = rgb([200, 160, 70]); c.beginPath(); c.arc(cx - 6, y0 + ht * 0.5, 3, 0, 7); c.arc(cx + 6, y0 + ht * 0.5, 3, 0, 7); c.fill(); }
        }
        break;
      }
      case 'lion': {       // 醒狮
        const bob = e.reduce ? 0 : Math.abs(Math.sin(e.t * 6 + h.x0)) * 4;
        c.fillStyle = rgb([60, 40, 40]); c.fillRect(x0 + 10, y1 - 26, 5, 26); c.fillRect(x1 - 15, y1 - 26, 5, 26);
        c.fillStyle = rgb([230, 190, 80]); c.beginPath(); c.ellipse(cx + 6, y1 - 34 - bob, w * 0.55, 18, 0, 0, 7); c.fill();
        c.fillStyle = rgb([214, 52, 42]); c.beginPath(); c.ellipse(cx + 8, y0 + 30 - bob, 30, 30, 0, 0, 7); c.fill();
        c.fillStyle = rgb([255, 240, 220]); c.beginPath(); c.ellipse(cx + 8, y0 + 4 - bob, 24, 8, 0, 0, 7); c.fill();
        c.fillStyle = rgb([255, 255, 255]); c.beginPath(); c.arc(cx + 2, y0 + 24 - bob, 7, 0, 7); c.arc(cx + 20, y0 + 24 - bob, 7, 0, 7); c.fill();
        c.fillStyle = rgb([20, 20, 30]); c.beginPath(); c.arc(cx + 4, y0 + 25 - bob, 3, 0, 7); c.arc(cx + 22, y0 + 25 - bob, 3, 0, 7); c.fill();
        c.fillStyle = rgb([240, 200, 60]); c.fillRect(cx - 6, y0 + 44 - bob, 30, 6);
        c.strokeStyle = rgb([255, 255, 255], 0.8); c.lineWidth = 2;
        for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(cx - 20 + k * 2, y0 + 10 + k * 7 - bob); c.lineTo(cx - 30, y0 + 14 + k * 8 - bob); c.stroke(); }
        break;
      }
      case 'rack': {       // 夜市灯架
        c.fillStyle = rgb([90, 60, 40]); c.fillRect(x0 + 4, y0, 4, ht); c.fillRect(x1 - 8, y0, 4, ht); c.fillRect(x0 - 4, y0, w + 8, 5);
        for (let k = 0; k < 3; k++) RF.Regions.redLantern(c, e, x0 + 6 + k * (w - 12) / 2, y0 + 10 + (k % 2) * 30, 1.1);
        c.fillStyle = rgb([120, 80, 50]); c.fillRect(x0 - 2, y1 - 30, w + 4, 6);
        break;
      }
      case 'crate': {      // 竹箩筐
        c.fillStyle = rgb([196, 150, 88]); X.roundRect(c, x0, y0 + 2, w, ht - 2, 5); c.fill();
        c.strokeStyle = rgb([120, 86, 44], 0.7); c.lineWidth = 1.2;
        for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x0, y0 + k * ht / 4); c.lineTo(x1, y0 + k * ht / 4); c.stroke(); }
        for (let xx = x0 + 6; xx < x1; xx += 7) { c.beginPath(); c.moveTo(xx, y0 + 2); c.lineTo(xx, y1); c.stroke(); }
        break;
      }
      case 'rock': case 'mani': {   // 石块 / 玛尼堆
        const n = h.kind === 'mani' ? 4 : 2;
        for (let k = 0; k < n; k++) {
          const rw = (w / 2) * (1 - k * 0.18), ry = y1 - (k + 0.5) * (ht / n);
          c.fillStyle = rgb(U.mix(p.ground, [200, 200, 200], 0.2 + k * 0.08));
          c.beginPath(); c.ellipse(cx + (k % 2 ? 2 : -2), ry, rw, ht / n * 0.62, 0, 0, 7); c.fill();
        }
        if (h.kind === 'mani') {
          const FL = [[60, 120, 210], [240, 240, 240], [210, 60, 50], [60, 160, 90], [240, 200, 60]];
          c.strokeStyle = rgb(p.roof, 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(cx, y0); c.lineTo(cx, y0 - 30); c.stroke();
          for (let k = 0; k < 4; k++) { c.fillStyle = rgb(FL[k], night ? 0.5 : 1); c.fillRect(cx + 1, y0 - 30 + k * 6, 10, 5); }
        }
        break;
      }
      case 'thorn': {      // 骆驼刺
        c.strokeStyle = rgb(U.mix(p.roof, [120, 140, 70], 0.6)); c.lineWidth = 1.6;
        for (let k = 0; k < 9; k++) {
          const a = -Math.PI * (0.1 + k * 0.1);
          c.beginPath(); c.moveTo(cx, y1); c.lineTo(cx + Math.cos(a) * w * 0.55, y1 + Math.sin(a) * ht); c.stroke();
        }
        break;
      }
      case 'whirl': {      // 夜里的沙旋风
        c.strokeStyle = rgb([230, 190, 160], night ? 0.55 : 0.7); c.lineWidth = 2;
        for (let k = 0; k < 9; k++) {
          const yy = y1 - k * ht / 9, rr = 6 + k * 2.2, ph = e.reduce ? k : e.t * 9 + k;
          c.beginPath(); c.ellipse(cx + Math.sin(ph * 0.4) * 3, yy, rr, 3, 0, ph % 6, ph % 6 + 4.2); c.stroke();
        }
        X.glow(cx, y0 + ht / 2, 40, [230, 180, 160], 0.12 * e.a);
        break;
      }
      case 'yak': {        // 白天在湖边吃草的牦牛
        c.fillStyle = rgb([44, 36, 34]);
        c.beginPath(); c.ellipse(cx, y1 - 42, w * 0.5, 26, 0, 0, 7); c.fill();
        c.fillRect(x0 + 8, y1 - 24, 7, 24); c.fillRect(x0 + 22, y1 - 24, 7, 24); c.fillRect(x1 - 26, y1 - 24, 7, 24); c.fillRect(x1 - 14, y1 - 24, 7, 24);
        c.beginPath(); c.ellipse(x1 - 2, y1 - 46, 13, 15, 0.3, 0, 7); c.fill();
        c.strokeStyle = rgb([230, 220, 200]); c.lineWidth = 3;
        c.beginPath(); c.moveTo(x1 - 8, y1 - 58); c.quadraticCurveTo(x1 - 14, y1 - 72, x1 - 4, y1 - 76); c.moveTo(x1 + 6, y1 - 58); c.quadraticCurveTo(x1 + 12, y1 - 70, x1 + 4, y1 - 76); c.stroke();
        c.fillStyle = rgb([70, 58, 52]); c.fillRect(x0 + 6, y1 - 26, w - 12, 6);
        break;
      }
    }
  }

  // ------------------------------------------------------------ 铃铛（铜铃 / 锣 / 转经筒）
  function bell(c, b, cam, e, gates, ghost) {
    const x = b.x - cam, y = b.y;
    if (x < -40 || x > C.W + 40) return;
    const rung = gates[b.id], fl = e.flash(b.id) || 0;
    if (ghost) {
      const a = e.ghostA(b.x, b.x) * (rung ? 0.3 : 1); if (a <= 0.01) return;
      c.save(); c.setLineDash([4, 4]); c.lineWidth = 2; c.strokeStyle = rgb(previewCol(e), a);
      c.beginPath(); c.arc(x, y, 12, 0, 7); c.stroke(); c.restore();
      return;
    }
    const sw = e.reduce ? 0 : Math.sin(e.t * 10) * fl * 0.5;
    c.fillStyle = rgb([100, 70, 45]); c.fillRect(x - 18, y - 40, 3, 64); c.fillRect(x - 18, y - 40, 22, 3);
    c.save(); c.translate(x, y - 38); c.rotate(sw);
    if (b.kind === 'gong') {
      c.strokeStyle = rgb([100, 70, 45]); c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 22); c.stroke();
      c.fillStyle = rgb([214, 168, 70]); c.beginPath(); c.arc(0, 38, 16, 0, 7); c.fill();
      c.fillStyle = rgb([240, 200, 110]); c.beginPath(); c.arc(0, 38, 6, 0, 7); c.fill();
    } else if (b.kind === 'wheel') {
      c.fillStyle = rgb([100, 70, 45]); c.fillRect(-1, 0, 2, 22);
      c.fillStyle = rgb([214, 160, 60]); X.roundRect(c, -10, 22, 20, 30, 4); c.fill();
      c.fillStyle = rgb([180, 50, 40]);
      const rot = (e.t * (rung ? 6 : 1)) % 1;
      for (let k = 0; k < 3; k++) c.fillRect(-10 + ((k / 3 + rot) % 1) * 20, 26, 3, 22);
    } else {
      c.strokeStyle = rgb([100, 70, 45]); c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 22); c.stroke();
      c.fillStyle = rgb([200, 150, 64]);
      c.beginPath(); c.moveTo(-6, 24); c.quadraticCurveTo(-8, 40, -14, 50); c.lineTo(14, 50); c.quadraticCurveTo(8, 40, 6, 24); c.closePath(); c.fill();
      c.fillStyle = rgb([150, 100, 40]); c.beginPath(); c.arc(0, 52, 3, 0, 7); c.fill();
    }
    c.restore();
    X.glow(x, y, rung ? 40 + fl * 60 : 26, [255, 210, 120], (rung ? 0.2 + fl * 0.5 : 0.35) * e.a);
    if (fl > 0) {
      c.strokeStyle = rgb([255, 230, 170], fl * 0.6); c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 20 + (1.2 - fl) * 80, 0, 7); c.stroke();
    }
  }

  // ------------------------------------------------------------ 灯（收集物）
  function lantern(c, l, cam, e, got, ghost) {
    const x = l.x - cam;
    if (x < -40 || x > C.W + 40) return;
    const fl = e.flash('l' + l.i) || 0;
    if (got[l.i] && fl <= 0) return;
    const bob = e.reduce ? 0 : Math.sin(e.t * 2 + l.i) * 4;
    const y = l.y + bob - (got[l.i] ? (1 - fl) * 60 : 0);
    if (ghost) {
      const a = e.ghostA(l.x, l.x); if (a <= 0.01 || got[l.i]) return;
      c.save(); c.setLineDash([3, 3]); c.lineWidth = 1.6; c.strokeStyle = rgb(previewCol(e), a);
      c.beginPath(); c.ellipse(x, y, 8, 10, 0, 0, 7); c.stroke(); c.restore();
      return;
    }
    const al = got[l.i] ? fl : 1;
    c.fillStyle = rgb([255, 236, 190], 0.95 * al);
    c.beginPath(); c.moveTo(x - 8, y - 10); c.lineTo(x + 8, y - 10); c.lineTo(x + 6, y + 10); c.lineTo(x - 6, y + 10); c.fill();
    c.fillStyle = rgb([255, 170, 80], 0.9 * al); c.fillRect(x - 5, y + 4, 10, 6);
    X.glow(x, y, 40 + fl * 40, [255, 200, 120], (0.55 + fl * 0.4) * al * e.a);
  }

  // ------------------------------------------------------------ 海市蜃楼：白天看得见、踩不住的桥
  function mirage(c, m, cam, e) {
    if (e.world !== 'day') return;
    const x0 = m.x0 - cam, x1 = m.x1 - cam;
    if (x1 < -20 || x0 > C.W + 20) return;
    const shimmer = e.reduce ? 0.5 : 0.5 + 0.25 * Math.sin(e.t * 4 + m.x0);
    c.save();
    c.globalAlpha = 0.42 * shimmer + 0.12;
    c.fillStyle = '#e8b48a';
    c.beginPath(); c.moveTo(x0 - 6, m.y); c.quadraticCurveTo((x0 + x1) / 2, m.y - 40, x1 + 6, m.y);
    c.lineTo(x1 + 6, m.y + 12); c.quadraticCurveTo((x0 + x1) / 2, m.y - 26, x0 - 6, m.y + 12); c.fill();
    c.strokeStyle = 'rgba(255,240,220,0.6)'; c.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      for (let xx = x0; xx <= x1; xx += 10) c.lineTo(xx, m.y + 16 + k * 6 + Math.sin(xx / 12 + e.t * 6 + k) * 2);
      c.stroke();
    }
    c.restore();
  }

  RF.Props = { solid, hazard, bell, lantern, mirage };
})();
