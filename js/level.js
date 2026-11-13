// 关卡数据：“一景一题”。每一关正好一屏（1280 宽），一关挨一关排在一条线上。
// 每关的目标：点亮这一关的宫灯，尽头的院门就会打开，走出去进下一关。
// 坐标：每关里用相对这一关左边的像素写（0–1280），地面默认在 CFG.GROUND。
// 每样东西标明属于哪一面：day（白天）、night（夜晚）或 both（两面都有）。
// 规则“昼动夜静”：movers 白天跟着时间动，夜里停在那一刻。
(function () {
  const C = RF.CFG, B = C.BEAT_PX, G0 = C.GROUND, RW = C.W;

  const LISTS = ['solids', 'hazards', 'bells', 'lanterns', 'mirages', 'ferries', 'moongates', 'rollers', 'sinkers', 'eaves', 'calls', 'chimes', 'movers', 'zones', 'checkpoints', 'regions', 'texts', 'rooms', 'decos', 'plates', 'crates'];
  const L = { endX: 0, version: 0, mode: 'rooms', diff: 1 };
  LISTS.forEach(k => { L[k] = []; });
  let ox = 0, gateN = 0, room = null;

  // ------------------------------------------------------------ 一关里能放的东西（x 都是相对本关左边）
  const THIN = { boat: 1, firefly: 1, ice: 1, plank: 1, eave: 1, moored: 1 };
  // 地面 / 平台：从 x0 到 x1，顶面在 y
  function ground(x0, x1, y, w, kind) {
    const s = { x0: ox + x0, x1: ox + x1, y: y === undefined ? G0 : y, w: w || 'both', kind: kind || 'ground' };
    if (THIN[s.kind]) s.thin = true;
    L.solids.push(s); return s;
  }
  const HZ = {
    stall: [56, 100], door: [40, 132], gate: [36, 140], drum: [60, 92], beacon: [40, 112],
    pile: [20, 90], block: [32, 28], rock: [40, 32], shard: [40, 28], mani: [44, 36], yak: [70, 80]
  };
  // 挡路的东西（实心的：两边挡人，顶上能站）
  function box(x, w, kind, y) {
    const [wd, ht] = HZ[kind], base = y === undefined ? G0 : y;
    const h = { x0: ox + x - wd / 2, x1: ox + x + wd / 2, y0: base - ht, y1: base, w: w || 'both', kind };
    L.hazards.push(h); return h;
  }
  // 宫灯（本关目标）：点亮后，本关尽头的院门打开
  function lamp(x, y, w) {
    const l = { i: L.lanterns.length, x: ox + x, y: (y === undefined ? G0 : y) - 34, w: w || 'both', room: L.rooms.length };
    L.lanterns.push(l); room.lamps.push(l.i); return l;
  }
  // 铃 + 门：碰响铃（只在一面有），门在两面都打开
  function bellGate(bx, by, bw, gx, gy, kind) {
    const id = 'g' + (++gateN);
    L.bells.push({ id, x: ox + bx, y: by, w: bw, kind: kind || 'bell' });
    const g = box(gx, 'both', 'gate', gy); g.gate = id; g.style = kind || 'bell';
  }
  // 木箱：白天能推、能浮、顺水漂；夜里推不动，潮落后搁在石板上
  function crate(x, y, tx) {
    const s = C.CRATE, by = y === undefined ? G0 : y;
    L.crates.push({ crate: true, ix: ox + x, iy: by, w: s, h: s, x0: ox + x - s / 2, x1: ox + x + s / 2, y0: by - s, y1: by, vy: 0, room: L.rooms.length, wet: false, float: false, tx: tx === undefined ? null : ox + tx });
  }
  // 踏石 + 门：人或倒影压在踏石上，门才开着；一松就关
  function plateGate(px, py, gx, gy) {
    const id = 'p' + (++gateN);
    L.plates.push({ id, x: ox + px, y: py === undefined ? G0 : py, hw: 30, down: false });
    const g = box(gx, 'both', 'gate', gy); g.gate = id; g.style = 'plate';
  }
  // 飞檐：白天升到 yd，夜里落到 yn，站在上面切换就被抬上去 / 放下来
  function eave(x0, x1, yd, yn) {
    const s = ground(x0, x1, yd, 'both', 'eave'); s.eave = true; s.yd = yd; s.yn = yn;
    L.eaves.push(s); return s;
  }
  // 昼动夜静的踏板。period：多少拍走一个来回 / 一圈（一拍 0.625 秒）
  function wheel(cx, cy, r, n, period, hw, style) {
    const g = L.movers.length;
    for (let k = 0; k < n; k++) L.movers.push({ kind: 'wheel', style, cx: ox + cx, cy, r, period, phase: k / n * Math.PI * 2, hw: hw || 24, group: g, w: 'both', x0: 0, x1: 0, y: 0 });
  }
  const swing = (cx, cy, r, amp, period, phase, hw) => L.movers.push({ kind: 'swing', cx: ox + cx, cy, r, amp, period, phase: phase || 0, hw: hw || 28, w: 'both', x0: 0, x1: 0, y: 0 });
  const drift = (cx, cy, amp, period, phase, hw, style) => L.movers.push({ kind: 'drift', style, cx: ox + cx, cy, amp, period, phase: phase || 0, hw: hw || 40, w: 'both', x0: 0, x1: 0, y: 0 });
  const hint = (t, dur, tag) => { room.hint = { text: t, dur: dur || 6, tag }; };

  // 一关：name 题名；world 进来时是白天还是夜里；fn 里摆东西。出口的院门自动加在右边。
  function R(name, world, fn, opt) {
    opt = opt || {};
    room = { i: L.rooms.length, name, line: opt.line || '', x0: ox, x1: ox + RW, world, lamps: [], region: L.regions.length - 1,
             sx: ox + (opt.sx || 70), sy: opt.sy || G0, exitY: opt.exitY || G0 };
    fn();
    const eg = box(1225, 'both', 'gate', room.exitY); eg.gate = 'exit' + room.i; eg.exit = true; eg.style = 'bell';
    room.exit = eg.gate;
    L.rooms.push(room);
    L.checkpoints.push({ x: room.sx, world, region: room.region });
    ox += RW;
  }
  function region(id, no, name, line, weathers) {
    if (L.regions.length) L.regions[L.regions.length - 1].x1 = ox;
    L.regions.push({ id, no, name, line, weathers, pace: 1, x0: ox, x1: Infinity });
  }

  // 陈设（不挡路，只是布景）：willow 柳树、rail 石栏杆、lotus 荷叶、spr 图集里的小物件
  function deco(kind, x, x1, o) {
    L.decos.push(Object.assign({ kind, x: ox + x, x1: ox + (x1 === undefined ? x : x1), y: G0, w: 'both' }, o || {}));
  }
  const sprite = (name, x, y) => deco('spr', x, undefined, { name, y: y === undefined ? G0 : y });

  // ============================================================ 关卡
  const TIDE = G0 + 50;      // 落潮才露出来的石板：白天沉在水下，夜里露出水面
  function build() {
    // ------------------------------------------------------------ 第一站 江南烟雨：水涨船高
    region('jiangnan', '第一站', '江南烟雨', '白天水涨，夜里落潮', { rain: 5, fog: 3, clear: 2 });

    R('落潮', 'day', () => {
      hint('', 8, 'switch');
      ground(0, 430);
      box(250, 'both', 'block');
      ground(430, 850, TIDE, 'night', 'steps');             // 落潮才露出来的石板桥
      ground(850, 1280);
      lamp(1040);
      deco('willow', 130); deco('rail', 300, 426); sprite('stonelamp', 60);
      deco('lotus', 520); deco('lotus', 705); sprite('reed', 880);
      deco('rail', 858, 960); deco('willow', 1150, undefined, { flip: true });
    }, { line: '夜里水退，石板出水' });

    R('浮箱', 'night', () => {
      ground(0, 360);
      crate(240, G0, 872);
      ground(900, 1280, G0 - 100);                         // 高岸：涨潮时从箱子上才够得着
      lamp(1040, G0 - 100);
      deco('willow', 90); deco('rail', 20, 150); sprite('post', 346);
      deco('lotus', 520); deco('lotus', 760);
      deco('rail', 910, 1000, { y: G0 - 100 }); sprite('stonelamp', 1150, G0 - 100);
    }, { line: '白天推得动，水涨箱也高', exitY: G0 - 100 });

    R('水车', 'day', () => {
      ground(0, 420);
      wheel(630, G0 - 40, 96, 4, 10, 26);
      ground(830, 1040, TIDE, 'night', 'steps');
      ground(1040, 1280);
      lamp(1130);
      deco('willow', 150); deco('rail', 250, 416); sprite('stonelamp', 40);
      deco('lotus', 470); deco('lotus', 790); sprite('reed', 1060);
    }, { line: '白天它转，夜里它停' });

    R('压石', 'day', () => {
      ground(0, 300);
      crate(190, G0, 600);
      ground(300, 820, TIDE, 'night', 'steps');
      ground(820, 1280);
      plateGate(600, TIDE, 1010, G0);
      lamp(1110);
      deco('willow', 70); deco('rail', 20, 130); sprite('post', 288);
      deco('lotus', 420); sprite('reed', 840); deco('rail', 850, 950); sprite('stonelamp', 1170);
    }, { line: '水停的那一刻，箱子落在哪里' });

    R('夜铃', 'day', () => {
      ground(0, 300);
      crate(190, G0, 677);
      box(715, 'both', 'pile', G0 + 92);                    // 河心一根木桩，漂来的箱子会被它挡住
      ground(300, 900, TIDE, 'night', 'steps');
      ground(900, 1280);
      bellGate(668, G0 - 180, 'night', 1010, G0);
      lamp(1110);
      deco('willow', 80); deco('rail', 20, 140); sprite('post', 288);
      deco('lotus', 430); deco('lotus', 820); sprite('reed', 920); deco('rail', 1040, 1080); sprite('stonelamp', 1170);
    }, { line: '铜铃只在夜里响' });
  }

  // ------------------------------------------------------------ 搭建
  L.build = function () {
    LISTS.forEach(k => { L[k].length = 0; });
    ox = 0; gateN = 0;
    build();
    L.regions[L.regions.length - 1].x1 = ox;
    L.totalX = ox; L.endX = ox;
    L.solids.sort((a, b) => a.x0 - b.x0);
    L.hazards.sort((a, b) => a.x0 - b.x0);
    L.coins = [];
    L.version++;
    return L;
  };
  L.paceAt = () => 1;
  L.regionAt = function (px) {
    for (let i = L.regions.length - 1; i >= 0; i--) if (px >= L.regions[i].x0) return i;
    return 0;
  };
  L.roomAt = px => Math.max(0, Math.min(L.rooms.length - 1, Math.floor(px / RW)));
  L.build();
  RF.LEVEL = L;
})();
