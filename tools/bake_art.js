// 把网页版的像素画面“烘焙”成 1x PNG，给 Godot / Unity 直接用（两个引擎不再各画一遍）。
// 每一景、白天 / 夜里各出：底层（背景、水面、地面、陈设、不动的障碍）、预告层（另一面的轮廓）、近景层；
// 会变的东西（门、灯、铃、踏石、木箱、飞檐、转动的机关、踏板）拼进这一景的物件图集，坐标记在 shared/data/art.json。
// 转动的东西预先画好 FRAMES 帧（引擎里不做运行时旋转）。人物用 assets/sprites.png 的图集。
// 用法：node tools/bake_art.js .     （需要 Playwright；改了关卡或画法后重跑）
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const dir = path.resolve(process.argv[2] || '.');
const OUT = path.join(dir, 'shared/art');
const FRAMES = 32;

function pageBake(FRAMES) {
  const C = RF.CFG, X = RF.FX, LV = RF.LEVEL, RG = RF.Regions, G = RF.G, P = C.PIX, PW = X.PW, PH = X.PH;
  const PR = RF.Props, SC = RF.Scene;
  const on = (o, w) => o.w === 'both' || o.w === w;
  const files = {};
  G.rollWeather(() => 0.01);                 // 每站固定一种天气（权重最大的那种在前）
  const mk = (w, h) => { const c = X.canvas(w || PW, h || PH), k = c.getContext('2d'); k.imageSmoothingEnabled = false; return c; };
  function paint(fn) {
    const c = mk(), k = c.getContext('2d'), o = X.ctx, om = X.mute;
    X.ctx = k; X.mute = true; X.oy = 0;
    try { fn(k); } finally { X.ctx = o; X.mute = om; }
    return c;
  }
  function bbox(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // 物件图集：一景一张，按行摆
  function Packer() {
    const items = [];
    return {
      add(c) { const b = bbox(c); if (!b) return null; const it = { c, b }; items.push(it); return it; },
      finish(name) {
        const W = 512; let x = 0, y = 0, rowH = 0;
        items.sort((a, b) => b.b.h - a.b.h);
        for (const it of items) { if (x + it.b.w > W) { x = 0; y += rowH + 1; rowH = 0; } it.ax = x; it.ay = y; x += it.b.w + 1; rowH = Math.max(rowH, it.b.h); }
        const H = Math.max(1, y + rowH), out = mk(W, H), k = out.getContext('2d');
        for (const it of items) k.drawImage(it.c, it.b.x, it.b.y, it.b.w, it.b.h, it.ax, it.ay, it.b.w, it.b.h);
        files[name] = out.toDataURL();
      }
    };
  }
  // 精灵记录：图集里的矩形 + 画到屏幕上的位置（相对 anchor 的偏移）
  const rec = (it, ax, ay) => it ? { r: [0, 0, it.b.w, it.b.h], it, ox: it.b.x - ax, oy: it.b.y - ay } : null;
  const fin = s => { if (!s) return null; const o = { r: [s.it.ax, s.it.ay, s.it.b.w, s.it.b.h], o: [s.ox, s.oy] }; return o; };
  const fix = v => (v && v.it ? fin(v) : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, q]) => [k, fix(q)])) : v);

  const rooms = [];
  for (const room of LV.rooms) {
    const i = room.i, rid = LV.regions[room.region].id, camPix = Math.round(room.x0 / P);
    G.loadRoom(i); G.state = 'running';
    const inRoom = x => x >= room.x0 && x < room.x1;
    const e = { world: 'day', t: 0, camPix, reduce: true, G, noGhost: false, pulse: 0, camY: 0, camYpix: 0, dip: 0,
      flash: () => 0, ghostA: (x0, x1) => (x1 < room.x0 || x0 > room.x1 ? 0 : 0.7) };
    const pk = Packer(), info = { i, rid, weather: G.weather[room.region], layers: {}, gates: [], lamps: [], bells: [], plates: [], crates: [], eaves: [], movers: [] };
    const sx = x => Math.round(x / P) - camPix;
    for (const world of ['day', 'night']) {
      e.world = world;
      const ow = world === 'day' ? 'night' : 'day', centre = room.x0 + C.W / 2;
      paint(k => RG.backdrop(k, G, world, centre));        // 定下这一站的图集色调
      const A = RG.bgAt(G, centre, world), bgId = A.fade > 0.5 && A.next ? A.next : A.cur;
      const base = paint(k => {
        k.fillStyle = world === 'night' ? '#0c1226' : '#9fb3c4'; k.fillRect(0, 0, PW, PH);
        RG.drawImg(k, bgId, world, 1);
        RG.lowland(k, rid, world, 0, camPix, 1);
        for (const s of LV.solids) if (on(s, world) && !s.eave && inRoom(s.x0)) PR.solid(s, e);
        PR.decorations(e, room.x0 - 40, room.x1 + 40);
        e.onlyTrail = true; PR.movers(e, room.x0, room.x1); e.onlyTrail = false;
        for (const h of LV.hazards) if (on(h, world) && !h.gate && inRoom(h.x0 + 1)) PR.hazard(h, e, {}, false);
      });
      const ghost = paint(() => {
        for (const s of LV.solids) if (s.w === ow && inRoom(s.x0)) PR.ghostSolid(s, e);
        for (const h of LV.hazards) if (h.w === ow && inRoom(h.x0 + 1)) PR.hazard(h, e, {}, true);
        for (const b of LV.bells) if (b.w === ow && inRoom(b.x)) PR.bell(b, e, {}, true);
        for (const l of LV.lanterns) if (l.w === ow && l.room === i) PR.lantern(l, e, {}, true);
      });
      const front = paint(k => RG.foreground(k, rid, world, 0, camPix, true));
      const name = `r${String(i + 1).padStart(2, '0')}`;
      files[`rooms/${name}_${world}.png`] = base.toDataURL();
      files[`rooms/${name}_${world}_ghost.png`] = ghost.toDataURL();
      files[`rooms/${name}_${world}_front.png`] = front.toDataURL();
      info.layers[world] = { base: `rooms/${name}_${world}.png`, ghost: `rooms/${name}_${world}_ghost.png`, front: `rooms/${name}_${world}_front.png`, bg: bgId };
    }
    // ---------------- 物件
    const both = fn => ({ day: (e.world = 'day', fn()), night: (e.world = 'night', fn()) });
    for (const h of LV.hazards) if (h.gate && inRoom(h.x0 + 1)) {
      const ax = sx(h.x0), ay = Math.round(h.y0 / P);
      info.gates.push({ id: h.gate, exit: !!h.exit, at: [ax, ay], spr: both(() => ({
        closed: rec(pk.add(paint(() => PR.hazard(h, e, {}, false))), ax, ay),
        open: rec(pk.add(paint(() => PR.hazard(h, e, { [h.gate]: true }, false))), ax, ay) })) });
    }
    for (const l of LV.lanterns) if (l.room === i) {
      const ax = sx(l.x), ay = Math.round(l.y / P);
      info.lamps.push({ i: l.i, w: l.w, at: [ax, ay], spr: both(() => ({
        unlit: rec(pk.add(paint(() => PR.lantern(l, e, {}, false))), ax, ay),
        lit: rec(pk.add(paint(() => PR.lantern(l, e, { [l.i]: true }, false))), ax, ay) })) });
    }
    for (const b of LV.bells) if (inRoom(b.x)) {
      const ax = sx(b.x), ay = Math.round(b.y / P);
      info.bells.push({ id: b.id, w: b.w, kind: b.kind, at: [ax, ay], spr: both(() => ({
        idle: rec(pk.add(paint(() => PR.bell(b, e, {}, false))), ax, ay),
        rung: rec(pk.add(paint(() => PR.bell(b, e, { [b.id]: true }, false))), ax, ay) })) });
    }
    const keepP = LV.plates.slice();
    for (const p of keepP) if (inRoom(p.x)) {
      const ax = sx(p.x), ay = Math.round(p.y / P);
      LV.plates.length = 0; LV.plates.push(p);
      info.plates.push({ id: p.id, at: [ax, ay], spr: both(() => ({
        up: (p.down = false, rec(pk.add(paint(() => SC.plates(e))), ax, ay)),
        down: (p.down = true, rec(pk.add(paint(() => SC.plates(e))), ax, ay)) })) });
      p.down = false;
    }
    LV.plates.length = 0; keepP.forEach(p => LV.plates.push(p));
    const keepC = LV.crates.slice();
    for (const c of keepC) if (c.room === i) {
      const ax = sx(c.x0), ay = Math.round(c.y0 / P);
      LV.crates.length = 0; LV.crates.push(c);
      const ow = c.y1; c.y1 = c.y0 + c.h; c.y1 = c.iy; c.y0 = c.iy - c.h;
      info.crates.push({ at: [ax, ay], spr: both(() => rec(pk.add(paint(() => SC.crates(e))), ax, ay)) });
      c.y1 = ow; c.y0 = ow - c.h;
    }
    LV.crates.length = 0; keepC.forEach(c => LV.crates.push(c));
    for (const s of LV.eaves) if (inRoom(s.x0)) {
      const keep = s.y; s.y = s.yd;
      const ax = sx(s.x0), ay = Math.round(s.y / P);
      info.eaves.push({ spr: both(() => rec(pk.add(paint(() => PR.solid(s, e))), ax, ay)) });
      s.y = keep;
    }
    // 会动的机关：每组（一只轮子 / 一架秋千 / 一只风筝）一项；轮子和秋千按相位预画 FRAMES 帧，踏板另画
    const groups = [];
    for (const m of LV.movers) if (inRoom(m.cx) && !(m.kind === 'wheel' && groups.some(g => g.kind === 'wheel' && g.group === m.group))) groups.push(m);
    for (const m of groups) {
      const g = { kind: m.kind, style: m.style || null, period: m.period, members: LV.movers.filter(q => q === m || (m.kind === 'wheel' && q.kind === 'wheel' && q.group === m.group)).map(q => LV.movers.indexOf(q)) };
      if (m.kind === 'drift') {
        G.dclock = 0; RF.placeMover(m, 0);
        const ax = sx(m.x0), ay = Math.round(m.y / P);
        e.onlyGroup = m; e.noTrail = true;
        g.spr = both(() => rec(pk.add(paint(() => PR.movers(e, room.x0, room.x1))), ax, ay));
      } else {
        e.onlyGroup = m; e.noBoards = true; e.noTrail = false;
        g.frames = both(() => {
          const fr = [];
          for (let f = 0; f < FRAMES; f++) {
            G.dclock = m.period * f / FRAMES; for (const q of LV.movers) RF.placeMover(q, G.dclock);
            fr.push(rec(pk.add(paint(() => PR.movers(e, room.x0, room.x1))), 0, 0));
          }
          return fr;
        });
        e.noBoards = false;
        G.dclock = 0; for (const q of LV.movers) RF.placeMover(q, 0);
        const ax = sx(m.x0), ay = Math.round(m.y / P);
        g.board = both(() => rec(pk.add(paint(() => PR.boardOf(m, e))), ax, ay));
      }
      e.onlyGroup = undefined; e.noTrail = false;
      info.movers.push(g);
    }
    G.dclock = 0; for (const q of LV.movers) RF.placeMover(q, 0);
    const name = `rooms/r${String(i + 1).padStart(2, '0')}_objects.png`;
    pk.finish(name);
    info.objects = name;
    rooms.push(fix(info));
  }
  // 人物等图集：各站色调的白天图、夜里压暗的图
  const sheet = img => { const c = mk(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL(); };
  const sprites = {};
  for (const r of LV.regions) {
    paint(k => RG.backdrop(k, G, 'day', r.x0 + C.W / 2));
    files[`sprites/sprites_${r.id}.png`] = sheet(RG.sprites); sprites[r.id] = `sprites/sprites_${r.id}.png`;
  }
  files['sprites/sprites_night.png'] = sheet(RG.spritesNight);
  files['sprites/sprites_dim.png'] = sheet(RG.spritesDim);
  return { files, art: { note: '由 tools/bake_art.js 生成。坐标都是 320×180 画面的像素；r = 图集里的 [x, y, w, h]；o = 相对 at（或机关的逻辑位置）的偏移。', frames: FRAMES,
    sprites, spritesNight: 'sprites/sprites_night.png', spritesDim: 'sprites/sprites_dim.png', atlas: RF.ATLAS, rooms } };
}

// file:// 下画布会被“污染”导不出图，起一个本地静态服务器
function serve() {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
  const srv = http.createServer((q, r) => {
    const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res(srv)));
}

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await p.waitForFunction(() => RF.Regions && RF.Regions.ready, null, { timeout: 30000 });
  const res = await p.evaluate(pageBake, FRAMES);
  if (errs.length) console.log('page errors:', errs);
  let n = 0;
  for (const [name, url] of Object.entries(res.files)) {
    const f = path.join(OUT, name); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); n++;
  }
  fs.writeFileSync(path.join(dir, 'shared/data/art.json'), JSON.stringify(res.art) + '\n');
  console.log('wrote', n, 'png +', 'shared/data/art.json');
  await b.close(); srv.close();
})();
