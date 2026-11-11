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
      case 'ground': case 'shore': {
        const pat = RG.pattern(c, rid, e.world);
        pat.setTransform(new DOMMatrix([1, 0, 0, 1, -e.camPix, y]));
        c.fillStyle = pat; c.fillRect(x0, y, w, PH - y);
        r(x0, y, 1, PH - y, 'rgba(0,0,0,0.25)'); r(x1 - 1, y, 1, PH - y, 'rgba(0,0,0,0.35)');
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
          r(bx + 1, y + 3, bw - 2, PH - y, night ? '#2a3448' : '#5c6466');
          r(bx, y, bw, 3, night ? '#7884a0' : '#a8aca4');
          r(bx, y, bw, 1, night ? '#9aa6c4' : '#c8ccc4');
          r(bx + 1, y + 3, bw - 2, 1, '#4a6a4a');
        }
        break;
      }
      case 'boat': {       // 乌篷船
        const bob = e.reduce ? 0 : Math.round(Math.sin(e.t * 1.8 + s.x0) * 0.6);
        const yy = y + bob, wood = night ? '#4a3a40' : '#6a4a32', dark = night ? '#2a2028' : '#3e2a1e';
        r(x0 - 1, yy, w + 2, 1, night ? '#7a6a6a' : '#a07a52');
        r(x0, yy + 1, w, 2, wood); r(x0 + 2, yy + 3, w - 4, 2, dark); r(x0 + 5, yy + 5, w - 10, 1, dark);
        const cx0 = x1 - Math.round(w * 0.45), cx1 = x1 - 3;    // 船尾的乌篷
        r(cx0, yy - 5, cx1 - cx0, 5, night ? '#1a1820' : '#2a2a30');
        r(cx0 + 1, yy - 6, cx1 - cx0 - 2, 1, night ? '#1a1820' : '#2a2a30');
        for (let k = cx0 + 2; k < cx1; k += 3) r(k, yy - 5, 1, 4, night ? '#2e2c38' : '#46464e');
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
        r(x0 + 1, y + 2, w - 2, PH - y, night ? '#3a5a8a' : '#6aa0c8');
        r(x0 + 2, y + 2, 2, PH - y, night ? '#6a8ac0' : '#bfe0f2');
        r(x1 - 3, y + 2, 2, PH - y, night ? '#2a3a6a' : '#4a7aa8');
        r(x0, y, w, 2, '#f2f6fa');
        if (night) X.glow((x0 + x1) / 2, y, 12, [170, 210, 255], 0.35);
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

  // ------------------------------------------------------------ 预告轮廓（另一面独有的东西）
  function previewCol(e) { return e.world === 'day' ? '#2a4cc0' : '#ffd88a'; }
  function dashH(x0, x1, y, col, on, off) { for (let x = x0; x < x1; x += on + off) r(x, y, Math.min(on, x1 - x), 1, col); }
  function dashV(x, y0, y1, col) { for (let y = y0; y < y1; y += 4) r(x, y, 1, Math.min(2, y1 - y), col); }
  function ghostSolid(s, e) {
    const a = e.ghostA(s.x0, s.x1); if (a <= 0.02) return;
    const x0 = Math.round(s.x0 / P) - e.camPix, x1 = Math.round(s.x1 / P) - e.camPix, y = Math.round(s.y / P);
    if (x1 < 0 || x0 > PW) return;
    const c = X.ctx; c.globalAlpha = a;
    const col = previewCol(e);
    dashH(x0, x1, y, col, s.thin ? 1 : 3, 2);
    if (!s.thin) { dashH(x0, x1, y + 1, col, 3, 2); dashV(x0, y, y + 10, col); dashV(x1 - 1, y, y + 10, col); }
    c.globalAlpha = 1;
  }
  function ghostRect(x0, y0, x1, y1, a, e) {
    const c = X.ctx; c.globalAlpha = a;
    const col = previewCol(e);
    dashH(x0, x1, y0, col, 2, 2); dashH(x0, x1, y1 - 1, col, 2, 2); dashV(x0, y0, y1, col); dashV(x1 - 1, y0, y1, col);
    for (let k = 0; k < Math.min(x1 - x0, y1 - y0); k += 2) { r(x0 + k, y0 + Math.round(k * (y1 - y0) / (x1 - x0)), 1, 1, col); }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ 障碍
  const HSPR = { stall: 'stall', door: 'door', drum: 'drum', block: 'block', rock: 'rock', shard: 'shard', mani: 'mani', yak: 'yak' };
  function hazard(h, e, gates, ghost) {
    const x0 = Math.round(h.x0 / P) - e.camPix, x1 = Math.round(h.x1 / P) - e.camPix;
    const y0 = Math.round(h.y0 / P), y1 = Math.round(h.y1 / P), cx = (x0 + x1) / 2;
    if (x1 < -12 || x0 > PW + 12) return;
    if (ghost) { const a = e.ghostA(h.x0, h.x1); if (a > 0.02) ghostRect(x0, y0, x1, y1, a, e); return; }
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
    if (h.kind === 'gust') {   // 雪旋风：几圈转动的雪粒
      for (let k = 0; k < 14; k++) {
        const yy = y1 - k * (y1 - y0) / 14, rr = 2 + k * 0.35, ph = (e.reduce ? 0 : e.t * 8) + k * 0.9;
        r(Math.round(cx + Math.cos(ph) * rr), Math.round(yy), 1, 1, night ? 'rgba(200,215,255,0.9)' : 'rgba(255,255,255,0.95)');
        r(Math.round(cx - Math.cos(ph) * rr * 0.6), Math.round(yy) - 1, 1, 1, night ? 'rgba(150,170,220,0.7)' : 'rgba(210,225,240,0.8)');
      }
      return;
    }
    spr(HSPR[h.kind] || 'block', cx, y1, night);
  }

  // ------------------------------------------------------------ 铃（铜铃 / 锣 / 转经筒）
  function bell(b, e, gates, ghost) {
    const x = Math.round(b.x / P) - e.camPix, base = Math.round((b.y + 34) / P);
    if (x < -10 || x > PW + 10) return;
    const rung = gates[b.id], fl = e.flash(b.id) || 0;
    if (ghost) {
      const a = e.ghostA(b.x, b.x) * (rung ? 0.3 : 1); if (a <= 0.02) return;
      ghostRect(x - 3, base - 13, x + 4, base - 6, a, e); return;
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
    if (ghost) { const a = e.ghostA(l.x, l.x); if (a > 0.02 && !got[l.i]) ghostRect(x - 3, y - 4, x + 4, y + 5, a, e); return; }
    spr('lantern', x, y + 4, false, got[l.i] ? fl : 1);
    X.glow(x, y, 9 + fl * 10, [255, 190, 110], (0.7 + fl * 0.3) * (got[l.i] ? fl : 1));
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

  RF.Props = { spr, solid, ghostSolid, hazard, bell, lantern, mirage };
})();
