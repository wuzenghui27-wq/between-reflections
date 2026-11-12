// 关卡数据：六个地貌区域连成一条路线。
// 单位：拍（beat）。一拍 = CFG.BEAT_PX 像素 ≈ 0.625 秒，所以机关天然落在音乐节拍上。
// 每段地面、障碍、铃铛、灯都标明属于哪一面：day（白天）、night（夜晚）或 both（两面都有）。
(function () {
  const C = RF.CFG, B = C.BEAT_PX, G0 = C.GROUND;

  const LISTS = ['solids', 'hazards', 'bells', 'lanterns', 'mirages', 'ferries', 'moongates', 'rollers', 'sinkers', 'eaves', 'calls', 'chimes', 'movers', 'zones', 'checkpoints', 'regions', 'texts'];
  const L = { endX: 0, version: 0, mode: 'journey' };
  LISTS.forEach(k => { L[k] = []; });
  let x = 0, gy = G0, gateN = 0;
  function clear() {
    LISTS.forEach(k => { L[k].length = 0; });
    x = 0; gy = G0; gateN = 0; L.endX = 0; L.coins = null; L.diff = L.diff || 1;
  }

  // ------------------------------------------------------------ 地形
  const THIN = { boat: 1, firefly: 1, ice: 1, plank: 1 };
  function seg(beats, w, kind, y) {
    const s = { x0: x, x1: x + beats * B, y: y === undefined ? gy : y, w, kind };
    if (THIN[kind]) s.thin = true;
    L.solids.push(s);
    return s;
  }
  const walk = (beats, kind) => { seg(beats, 'both', kind || 'ground'); x += beats * B; };
  const only = (beats, w, kind, y) => { seg(beats, w, kind, y); x += beats * B; };
  const split = (beats, day, night) => {
    if (day) seg(beats, 'day', day.kind || 'ground', day.y);
    if (night) seg(beats, 'night', night.kind || 'ground', night.y);
    x += beats * B;
  };
  const gap = beats => { x += beats * B; };
  // 渡船：只在白天浮着。人踩上去才开，载着人往前漂 travel 拍后靠岸停下。
  // 船身占 len 拍，后面留出 travel 拍的水面给它走。
  function ferry(len, travel, y) {
    const s = seg(len, 'day', 'boat', y === undefined ? G0 + 2 : y);
    s.ferry = true; s.bx0 = s.x0; s.bx1 = s.x1; s.travel = travel * B; s.on = false; s.p0 = 0;
    L.ferries.push(s);
    x += (len + travel) * B;
    return s;
  }
  const height = y => { gy = y; };
  const at = o => x + o * B;
  const atX = (x0, o) => x0 + o * B;

  // 月洞门：穿过就自动翻面
  const moongate = o => L.moongates.push({ x: at(o === undefined ? 0 : o), y: gy });
  // 残荷 / 浮冰：两面都在，踩上去一小会儿就往下沉
  function sinker(beats, kind, y) {
    const s = seg(beats, 'both', kind || 'lotus', y === undefined ? gy : y);
    s.thin = true; s.sink = true; s.by = s.y; s.stood = 0;
    L.sinkers.push(s); x += beats * B; return s;
  }
  // 滚木：到了跟前才开始滚，迎面朝人滚过来（world：哪一面有）
  function roller(o, w, kind) {
    const cx = at(o), r = { bx0: cx - 26, bx1: cx + 26, x0: cx - 26, x1: cx + 26, y0: gy - 52, y1: gy, w, kind: kind || 'log', v: 0.55, trig: cx - 980 };
    L.rollers.push(r); return r;
  }
  // 让滚木正好在 o 拍处和人相遇（相遇点只由位置决定，跟步速无关）
  const rollAt = (o, w, kind) => roller(o + 980 * 0.55 / 1.55 / B, w, kind);
  // 飞檐：两面都在，白天升到 yd、夜里落到 yn；站在上面切换，就被抬上去或放下来（下面是空的）
  function eave(beats, yd, yn) {
    const s = seg(beats, 'both', 'eave', yd);
    s.thin = true; s.eave = true; s.yd = yd; s.yn = yn;
    L.eaves.push(s); x += beats * B; return s;
  }
  // 昼动夜静：这些踏板白天跟着拍子动（period 拍一个来回），夜里停在那一刻。都在两面存在。
  //   水车：n 块踏板绕 (cx, cy) 转，半径 r；秋千：从 (cx, cy) 垂下 r 长的绳，摆幅 amp 弧度；浮木：在 cx 左右漂 amp。
  function wheelAt(cx, cy, r, n, period, hw, style) {
    const g = L.movers.length;
    for (let k = 0; k < n; k++) L.movers.push({ kind: 'wheel', style, cx, cy, r, period, phase: k / n * Math.PI * 2, hw: hw || 22, group: g, w: 'both', x0: 0, x1: 0, y: 0 });
  }
  const swingAt = (cx, cy, r, amp, period, phase, hw) => L.movers.push({ kind: 'swing', cx, cy, r, amp, period, phase: phase || 0, hw: hw || 26, w: 'both', x0: 0, x1: 0, y: 0 });
  const driftAt = (cx, cy, amp, period, phase, hw, style) => L.movers.push({ kind: 'drift', style, cx, cy, amp, period, phase: phase || 0, hw: hw || 38, w: 'both', x0: 0, x1: 0, y: 0 });
  // 编钟应和：编钟先敲一小节（bounds 是相对这一小节开头的拍数），下一小节同样的拍子上就是要切换的地方。
  // 每两次切换之间放一个“另一面才有”的障碍，所以照着编钟的节奏切，正好躲开。
  function callResp(bounds, w0) {
    const id = L.calls.length, x0 = x + 4 * B;
    const notes = bounds.map((b, i) => [0, 2, 4, 3, 5, 4, 7][i % 7]);   // 五声音阶上的音级
    const cl = { id, x, x0, beats: bounds.slice(), notes, heard: 0, echo: 0 };
    L.chimes.push({ x: at(-0.6), id });
    let w = w0;
    haz(4 - 0.5, w === 'day' ? 'night' : 'day', w === 'day' ? 'door' : 'stall');   // 进应和段之前先固定在 w0 这一面
    for (let i = 0; i < bounds.length; i++) {
      w = w === 'day' ? 'night' : 'day';
      const a = bounds[i], b = i + 1 < bounds.length ? bounds[i + 1] : a + 1.5;
      haz(4 + (a + b) / 2, w === 'day' ? 'night' : 'day', w === 'day' ? 'door' : 'stall');
    }
    const last = bounds[bounds.length - 1] + 1.5;
    cl.x1 = x0 + last * B;
    seg(4 + last, 'both', 'ground');
    L.calls.push(cl);
    x += (4 + last) * B;
    return w;
  }
  // 速度区：mult 倍速（音乐也跟着变快）
  const zone = (beats, mult) => L.zones.push({ x0: x, x1: x + beats * B, mult });

  // ------------------------------------------------------------ 物件
  const HZ = {
    stall: [56, 100], door: [40, 132], gate: [36, 140], drum: [60, 92], beacon: [40, 112],
    block: [32, 28], rock: [40, 32], shard: [40, 28], mani: [44, 36], gust: [40, 124], yak: [70, 80],
    arch: [60, 126]        // 低石拱桥：站在船上会撞到桥洞顶，落潮后从石阶上能走过去
  };
  function haz(o, w, kind, y) {
    const [wd, ht] = HZ[kind];
    const cx = at(o), base = y === undefined ? gy : y;
    const h = { x0: cx - wd / 2, x1: cx + wd / 2, y0: base - ht, y1: base, w, kind };
    L.hazards.push(h);
    return h;
  }
  // 门（两面都关着）+ 铃铛（只在一面）：碰响铃铛，门在两面都打开
  function bellGate(oBell, wBell, oGate, kind) {
    const id = 'g' + (++gateN);
    L.bells.push({ id, x: at(oBell), y: gy - 34, w: wBell, kind: kind || 'bell' });
    const g = haz(oGate, 'both', 'gate'); g.gate = id; g.style = kind || 'bell';
  }
  const lantern = (o, w, dy) => L.lanterns.push({ i: L.lanterns.length, x: at(o), y: gy - 30 - (dy || 0), w: w || 'both' });
  const mirage = beats => L.mirages.push({ x0: x, x1: x + beats * B, y: gy });
  const cp = world => L.checkpoints.push({ x: x + 40, world, region: L.regions.length - 1 });
  const text = (o, t, dur, tag) => L.texts.push({ x: at(o), text: t, dur: dur || 4, tag });
  // weathers：这一站可能出现的天气与权重，每次开始旅程随机抽一种
  function region(id, no, name, line, weathers, pace) {
    if (L.regions.length) L.regions[L.regions.length - 1].x1 = x;
    L.regions.push({ id, no, name, line, weathers, pace: pace || 1, x0: x, x1: Infinity });
  }

  // ============================================================ 旅程：六站连成的一条路线
  function journey() {
    // ============================================================ 1 江南水乡：切换 + 水位
    region('jiangnan', '第一站', '江南烟雨', '白天水涨，夜里落潮', { rain: 5, fog: 3, clear: 2 });
    height(G0);
    cp('day');
    walk(9);
    text(-5, '前面的石阶只在夜里露出水面。按 Shift 切到夜晚。', 6, 'switch');
    only(3, 'night', 'steps', G0 + 6);
    lantern(-1.5, 'night', 30);
    walk(4);
    text(-3.5, '端午赛龙舟：白天水高，龙舟停在岸边。切回白天跳上去，鼓一响它就载你过河。', 6, 'switch2');
    ferry(2, 2);
    walk(4);
    lantern(-2, 'night');                           // 只在夜里亮的灯：多留一会儿夜里才拿得到
    only(3, 'night', 'steps', G0 + 6);
    walk(3);
    { const f = ferry(1.5, 2); L.lanterns.push({ i: L.lanterns.length, x: f.bx0 + 2.6 * B, y: G0 - 70, w: 'day' }); }
    walk(3);
    only(3, 'night', 'steps', G0 + 6);
    walk(3);
    cp('night');
    text(-2, '看前方淡淡的轮廓：那是另一面的路。', 4);
    ferry(1.5, 1.5);
    walk(2);
    only(2, 'night', 'steps', G0 + 6);
    walk(2);
    // 低桥：白天水涨，站在船上过不去；切到夜里落潮，从桥洞下的石阶走，再跳起来切回白天落回船上
    text(-1.5, '前面桥洞太低。切到夜里从石阶下走，再跳起来切回白天，落回船上。', 7, 'bridge');
    {
      const f = ferry(1.5, 6.5), x0 = f.bx0;
      L.hazards.push({ x0: atX(x0, 4.4) - 30, x1: atX(x0, 4.4) + 30, y0: G0 - 150, y1: G0 - 24, w: 'both', kind: 'arch' });
      L.solids.push({ x0: atX(x0, 3.0), x1: atX(x0, 5.6), y: G0 + 40, w: 'night', kind: 'steps' });
      L.lanterns.push({ i: L.lanterns.length, x: atX(x0, 6.4), y: G0 - 60, w: 'day' });
    }
    walk(2);
    split(3, { kind: 'boat', y: G0 + 2 }, { kind: 'steps', y: G0 + 6 });   // 两面都能走：喘口气
    walk(3);
    // ---- 水车：白天转、夜里停。看准了切到夜里，让踏板停成过河的台阶
    cp('day');
    walk(3);
    text(-2.5, '水车白天转个不停，夜里就停在那一刻。看准时机切到夜里，让踏板停成过河的台阶。', 7, 'wheel');
    walk(1);
    { const x0 = x; gap(3.5); wheelAt(x0 + 1.75 * B, G0 - 30, 84, 4, 8, 24); }
    walk(3);
    lantern(-1.5, 'both', 40);
    walk(4);

    // ============================================================ 2 徽派与晋派古建：门与铃
    region('garden', '第二站', '宫苑园林', '白天货摊挡路，夜里宫门紧闭', { clear: 4, snow: 3, rain: 2 }, 0.9);
    cp('day');
    walk(7);
    text(-6, '白天游人摆着货摊，夜里收了摊，但宫门会关上。', 5);
    haz(-1, 'day', 'stall');
    walk(4);
    haz(-1, 'night', 'door');
    walk(3);
    haz(-1, 'day', 'stall');
    lantern(-2.5, 'night', 50);
    walk(3);
    haz(-1, 'night', 'door');
    walk(5);
    lantern(-3.2, 'day', 44);
    text(-4.5, '院门上了锁。去另一面碰响铜铃，门就开了。', 5, 'bell');
    bellGate(-2.5, 'night', -0.5);
    walk(4);
    // ---- 飞檐升降：白天升起、夜里落下。夜里走上去，切回白天就被抬上高处
    cp('day');
    walk(3);
    text(-2.5, '飞檐白天升起、夜里落下。夜里走上去，再切回白天，它会把你抬上高墙。', 6, 'eave');
    walk(1.5);
    eave(2.5, G0 - 130, G0);
    height(G0 - 130); walk(3);
    lantern(-1.5, 'both', 40);
    height(G0); walk(3);
    text(-2.5, '两段飞檐一高一低：夜里上、白天换、再夜里，一级一级往上走。', 6, 'eave2');
    walk(1);
    eave(2, G0 - 90, G0);
    eave(2, G0 - 90, G0 - 180);
    height(G0 - 180); walk(2.5);
    lantern(-1, 'night', 50);
    height(G0); walk(4);
    // ---- 编钟应和：编钟先敲一小节，下一小节照着同样的节奏切换
    cp('day');
    walk(3);
    text(-2.5, '编钟先敲一小节，你在下一小节照着同样的拍子切换，跟它应和。', 7, 'chime');
    walk(1);
    { let w = callResp([0, 1, 2, 3], 'day');
      walk(2);
      w = callResp([0, 1.5, 2.5, 3.5], w);
      lantern(-0.75, 'both', 60);
      walk(3); }
    // ---- 花灯秋千：白天荡、夜里停在半空
    cp('day');
    walk(3);
    text(-2.5, '秋千白天荡来荡去，切到夜里就停在半空。趁它荡到合适的地方让它停下。', 7, 'swing');
    walk(1);
    { const x0 = x; gap(3); swingAt(x0 + 1.5 * B, G0 - 170, 150, 0.8, 4, 0, 30); }
    walk(2.5);
    { const x0 = x; gap(3.4); swingAt(x0 + 1.0 * B, G0 - 160, 130, 0.7, 4, Math.PI, 28); swingAt(x0 + 2.4 * B, G0 - 160, 130, 0.7, 4, 0, 28); }
    walk(3);
    lantern(-1.5, 'night', 40);
    walk(2);
    // ---- 元宵走马灯：白天灯转马走，夜里灯停；挂在横杆上的踏板跟着停成台阶
    cp('day');
    walk(3);
    text(-2.5, '元宵走马灯：白天灯一直转，夜里就停住。等踏板转到脚下的高度再切到夜里。', 7, 'wheel');
    walk(1);
    { const x0 = x; gap(3.5); wheelAt(x0 + 1.75 * B, G0 - 30, 84, 4, 8, 24, 'lamp'); }
    walk(3);
    lantern(-1.5, 'both', 40);
    walk(2);
    // ---- 月洞门：穿过就自动翻面，进门前要先想好出门是哪一面
    cp('day');
    walk(3);
    text(-2.5, '穿过月洞门，天色会自己翻过来。进门前，先想好出门要哪一面。', 6, 'gate2');
    walk(2);
    haz(-1, 'night', 'door');
    walk(1.5);
    moongate();                       // 白天进 → 夜里出，货摊自己没了
    walk(1.5);
    haz(-0.6, 'day', 'stall');
    lantern(-0.6, 'night', 70);
    walk(2.5);
    moongate();                       // 夜里进 → 白天出
    walk(1.5);
    haz(-0.6, 'night', 'door');
    walk(2);
    haz(-1.2, 'day', 'stall');        // 这里得是夜里……
    walk(2);
    moongate();                       // ……可门后又是货摊：进门前一拍切回白天
    walk(1.2);
    haz(-0.4, 'day', 'stall');
    walk(1.8);
    bellGate(-1.2, 'night', -0.2);
    walk(3);
    cp('day');
    haz(-1.2, 'day', 'stall');
    walk(2);
    moongate();                       // 两道门挨着：中间那一拍被翻到另一面
    walk(1);
    haz(-0.5, 'night', 'door');
    walk(1);
    moongate();
    walk(1.2);
    haz(-0.5, 'night', 'door');
    lantern(-0.5, 'day', 70);
    walk(2);
    haz(-1, 'day', 'stall');
    walk(2);
    bellGate(-1.6, 'day', -0.3);
    walk(1);
    moongate();
    walk(1.5);
    haz(-0.6, 'night', 'door');
    walk(5);

    // ============================================================ 3 喀斯特峰林与梯田：跳跃 + 萤火
    region('autumn', '第三站', '秋山湖泊', '踏着山石，往高处走', { clear: 4, wind: 4, snow: 2 });
    cp('day');
    walk(6);
    text(-5, '山石一层比一层高。按空格（或 ↑）跳上去。', 5, 'jump');
    height(G0 - 60); walk(3);
    height(G0 - 120); walk(3);
    height(G0 - 60); walk(2);
    height(G0); walk(3);
    text(-2.5, '缺口也能跳过去。', 3);
    gap(0.7); walk(3);
    gap(0.8); walk(2);
    text(-1.5, '夜里，萤火会连成一条路。', 4);
    walk(1);
    only(4, 'night', 'firefly', G0);
    walk(3);
    cp('night');
    haz(-1.5, 'both', 'rock');
    walk(3);
    height(G0 - 60); walk(2);
    only(3, 'night', 'firefly', G0 - 110);       // 先跳，在空中切到夜里落上萤火
    lantern(-1.5, 'night', 40);
    walk(2.5);
    height(G0); walk(1.5);
    haz(-0.7, 'both', 'rock');
    walk(2);
    gap(0.75);
    walk(1.5);
    only(3, 'night', 'firefly', G0);
    walk(1.5);
    height(G0 - 60); only(2.5, 'day', 'ground');   // 只在白天的梯田：跳之前先切回白天
    walk(1);
    gap(0.6);
    height(G0 - 120); split(3, { y: G0 - 120 }, { kind: 'firefly', y: G0 - 60 });
    height(G0 - 60); walk(2);
    height(G0); walk(3);
    // ---- 残荷：踩上去半拍就往下沉，只能一拍一跳地过湖
    cp('day');
    walk(3);
    text(-2.5, '湖上的残荷一踩就往下沉。落上去就起跳，一拍一片。', 5, 'lotus');
    walk(1);
    { const LY = G0 + 28;
      gap(0.5); sinker(1, 'lotus', LY);
      gap(0.5); sinker(1, 'lotus', LY);
      gap(0.5); sinker(1, 'lotus', LY); lantern(-0.5, 'both', 40);
      gap(0.5); sinker(1, 'lotus', LY);
      gap(0.5); }
    walk(3);
    text(-2, '有的荷叶只在夜里浮着。', 3);
    walk(1);
    { const LY = G0 + 28;
      gap(0.5); sinker(1, 'lotus', LY);
      gap(0.5); sinker(1, 'lotus', LY).w = 'night';
      gap(0.5); sinker(1, 'lotus', LY);
      gap(0.5); sinker(1, 'lotus', LY).w = 'day'; lantern(-0.5, 'day', 40);
      gap(0.5); sinker(1, 'lotus', LY);
      gap(0.5); }
    walk(3);
    // ---- 浮木：白天在湖上漂来漂去，夜里湖面一静它也停住
    cp('day');
    walk(2);
    text(-1.5, '重阳放风筝：白天风大，风筝在湖上飘来飘去；夜里风一停它就定住。等它飘到正中再切。', 6, 'drift');
    walk(1);
    { const x0 = x; gap(2.5); driftAt(x0 + 1.25 * B, G0 + 8, 80, 4, 0, 40, 'kite'); }
    walk(2);
    { const x0 = x; gap(2.5); driftAt(x0 + 1.25 * B, G0 + 8, 80, 3, Math.PI / 2, 40, 'kite'); }
    walk(3);
    cp('day');
    text(-2.5, '跳到空中再切换昼夜，能借力多跳一段。', 5, 'hop');
    walk(2);
    gap(1.5);                                     // 一跳够不着：起跳后在空中翻面借力
    lantern(-0.75, 'both', 90);
    walk(3);
    height(G0 - 150); walk(2.5);                 // 高台也要借力
    height(G0); walk(4);

    // ============================================================ 4 岭南骑楼与客家围屋：节奏段
    region('wall', '第四站', '长城', '白天战鼓，夜里烽火', { clear: 5, snow: 3, wind: 2 }, 1.08);
    cp('day');
    walk(6);
    text(-5, '鼓点响起时，障碍正好落在拍子上。在两拍之间切换。', 5);
    haz(-1, 'day', 'drum');
    walk(2);
    haz(-1, 'night', 'beacon');
    walk(2);
    haz(-1, 'day', 'drum');
    walk(2);
    haz(-1, 'night', 'beacon');
    walk(2);
    haz(-1, 'both', 'block');
    walk(2);
    haz(-1, 'day', 'drum');
    lantern(-1, 'night', 60);
    walk(2);
    haz(-1, 'night', 'beacon');
    walk(3);
    cp('day');
    haz(-1, 'day', 'drum');
    walk(1.5);
    haz(-0.75, 'night', 'beacon');
    walk(1.5);
    haz(-0.75, 'day', 'drum');
    walk(1.5);
    haz(-0.75, 'both', 'block');
    walk(1.5);
    haz(-0.75, 'night', 'beacon');
    walk(1.5);
    haz(-0.75, 'day', 'drum');
    walk(2);
    haz(-1, 'both', 'block');
    lantern(-1, 'both', 70);
    text(-1, '蹴鞠：夜里城头的风流眼上卡着一只鞠，碰一下把它踢向城门，门就开了。', 5);
    walk(2);
    bellGate(-1.6, 'night', -0.3, 'cuju');
    walk(2);
    haz(-1, 'night', 'beacon');
    walk(1.5);
    haz(-0.75, 'day', 'drum');
    walk(1.5);
    haz(-0.75, 'night', 'beacon');
    walk(2.5);
    gap(1.4);                                     // 借力跳过城墙缺口
    walk(4);
    // ---- 滚木礌石：迎面滚来，正好在鼓点上撞到跟前
    cp('day');
    walk(3);
    text(-2.5, '城头滚下礌木！踩着鼓点跳过去，或者换到没有它的那一面。', 6, 'roll');
    walk(3);
    rollAt(-0.5, 'both');
    walk(3);
    rollAt(-0.5, 'day');
    walk(2);
    rollAt(-0.5, 'night');
    walk(2);
    rollAt(-0.5, 'day'); haz(-0.5, 'night', 'beacon');   // 夜里有烽火台：只能在白天跳过去
    lantern(-0.5, 'day', 80);
    walk(2);
    rollAt(-0.5, 'both');
    walk(1.5);
    haz(-0.75, 'night', 'beacon');
    walk(1.5);
    rollAt(-0.5, 'night'); haz(-0.5, 'day', 'drum');
    walk(2);
    rollAt(-0.5, 'both');
    walk(5);
    lantern(-3, 'both', 60);

    // ============================================================ 5 丹霞与雅丹：海市蜃楼
    region('glacier', '第五站', '雪山冰川', '白天的雪桥，一踩就塌', { clear: 4, fog: 3, snow: 3 });
    cp('day');
    walk(6);
    text(-5, '白天看见的雪桥，一踩就会塌。夜里才看得清真正的冰柱。', 6, 'mirage');
    mirage(4);
    only(1.2, 'night', 'pillar', G0);
    gap(0.5);
    only(1.1, 'night', 'pillar', G0 - 30);
    gap(0.4);
    only(0.8, 'night', 'pillar', G0);
    walk(4);
    haz(-1.5, 'night', 'gust');
    walk(3);
    lantern(-1, 'day', 0);
    haz(-0.8, 'both', 'shard');
    walk(3);
    cp('day');
    mirage(3);
    only(1.4, 'night', 'pillar', G0 - 50);
    gap(0.5);
    only(1.1, 'night', 'pillar', G0 - 50);
    walk(2);
    haz(-1, 'night', 'gust');
    walk(2);
    walk(2);
    // ---- 冰滑道：一路往下冲，速度和鼓点都快起来
    cp('day');
    walk(3);
    text(-2.5, '冰滑道！脚下一快，鼓点也跟着快起来。', 5, 'slide');
    walk(1);
    height(G0 - 50); walk(2);
    zone(15, 1.45);
    height(G0 - 35); walk(3, 'slide');
    haz(-0.8, 'both', 'shard');
    height(G0 - 20); walk(3, 'slide');
    haz(-1, 'night', 'gust');
    height(G0); walk(1.5, 'slide');
    mirage(2);
    only(2, 'night', 'pillar', G0);
    walk(3, 'slide');
    haz(-1, 'both', 'shard');
    walk(1.5, 'slide');
    gap(1);
    walk(3, 'slide');
    haz(-1.2, 'night', 'gust');
    lantern(-1.2, 'day', 20);
    walk(3);
    cp('day');
    split(3, { y: G0 }, null);
    haz(-1.5, 'both', 'shard');
    walk(1);
    mirage(2);
    only(2, 'night', 'pillar', G0);
    lantern(-1, 'night', 60);
    walk(1.5);
    haz(-0.7, 'night', 'gust');
    walk(2);
    haz(-1, 'both', 'shard');
    walk(5);
    lantern(-3, 'night', 50);
    // ---- 冰嬉：冰床白天被人拉着来回滑，夜里拉床的人歇下，床就停在冰河上
    cp('day');
    walk(2);
    text(-1.5, '冰嬉：冰床白天在冰河上来回滑，夜里就停下。等它滑到正中再切到夜里。', 6, 'drift');
    walk(1);
    { const x0 = x; gap(2.5); driftAt(x0 + 1.25 * B, G0 + 16, 80, 4, 0, 40, 'sled'); }
    walk(2);
    { const x0 = x; gap(2.5); driftAt(x0 + 1.25 * B, G0 + 16, 80, 3, Math.PI / 2, 40, 'sled'); }
    walk(3);

    // ============================================================ 6 青藏高原与雪域圣湖：终章
    region('tibet', '终点', '雪域圣湖', '天上的星，落进湖里', { clear: 6, snow: 4 }, 0.9);
    cp('day');
    walk(6);
    text(-5, '夜里湖面结冰，可以踩着走。', 4);
    only(3, 'night', 'ice', G0 + 4);
    walk(2);
    bellGate(-1.5, 'day', -0.3, 'wheel');
    walk(2);
    haz(-1, 'both', 'mani');
    walk(2);
    height(G0 - 60); walk(2);
    only(2.5, 'night', 'ice', G0 + 4);
    walk(0);
    height(G0); walk(2);
    lantern(-1, 'both', 70);
    cp('day');
    haz(-1, 'day', 'yak');
    walk(1.5);
    only(2, 'night', 'ice', G0 + 4);
    walk(1.5);
    bellGate(-1.2, 'night', -0.2, 'wheel');
    walk(1.5);
    haz(-0.7, 'both', 'mani');
    walk(1.5);
    gap(0.7);
    walk(3);
    // ---- 中秋河灯：莲花灯白天随波漂，夜里湖面一静就停住，连成过湖的路
    cp('day');
    walk(2);
    text(-1.5, '中秋放河灯：莲花灯白天随水漂，夜里湖面一静就停住。看准了让它停在脚下。', 6, 'drift');
    walk(1);
    { const x0 = x; gap(2.5); driftAt(x0 + 1.25 * B, G0 + 16, 80, 4, 0, 40, 'hedeng'); }
    walk(1.5);
    { const x0 = x; gap(2.5); driftAt(x0 + 1.25 * B, G0 + 16, 80, 3, Math.PI / 2, 40, 'hedeng'); }
    walk(3);
    // ---- 终章：船、门、浮冰、滚石，一路学的都用上
    cp('day');
    walk(3);
    text(-2.5, '最后一段湖面：把一路学到的都用上。', 5);
    walk(1);
    ferry(1.5, 2.5);
    walk(2);
    { const FY = G0 + 18;
      gap(0.5); sinker(1, 'floe', FY).w = 'day';
      gap(0.5); sinker(1, 'floe', FY).w = 'day'; lantern(-0.5, 'day', 40);
      gap(0.5); sinker(1, 'floe', FY).w = 'day';
      gap(0.5); }
    walk(2);
    moongate();                       // 经幡门：白天进 → 夜里出，正好踩上冰面
    walk(0.5);
    only(3, 'night', 'ice', G0 + 4);
    walk(3);
    rollAt(-1, 'both', 'snow');
    walk(2);
    rollAt(-0.5, 'night', 'snow'); haz(-0.5, 'day', 'yak');
    walk(2.5);
    moongate();
    walk(1.5);
    haz(-0.6, 'night', 'mani');
    walk(2);
    only(2, 'night', 'ice', G0 + 4);
    lantern(-1, 'night', 50);
    walk(1.5);
    haz(-0.8, 'day', 'yak');
    walk(1.5);
    gap(1.5);                                     // 最后一次借力
    lantern(-0.75, 'both', 100);
    walk(1.5);
    height(G0 - 60); walk(2);
    height(G0); walk(1.5);
    only(3, 'night', 'ice', G0 + 4);
    walk(12, 'shore');
    L.endX = x - 5 * B;
  }

  // ------------------------------------------------------------ 搭建
  L.build = function (mode) {
    clear();
    journey();
    L.regions[L.regions.length - 1].x1 = x;
    L.totalX = x;
    // 按位置排好，便于查找
    L.solids.sort((a, b) => a.x0 - b.x0);
    L.hazards.sort((a, b) => a.x0 - b.x0);
    L.mode = mode; L.version++;
    return L;
  };
  // 当前位置的步速倍数：每站自己的步调，速度区再乘上去；交界处 2 拍内平滑过渡；再乘难度
  const RAMP = 2 * B;
  L.paceAt = function (px) {
    let p = 1;
    for (let i = 0; i < L.regions.length; i++) {
      const r = L.regions[i];
      if (r.x0 - RAMP > px) break;
      const prev = i ? L.regions[i - 1].pace : 1;
      if (px >= r.x0 + RAMP) p = r.pace;
      else { const k = (px - r.x0 + RAMP) / (2 * RAMP); p = prev + (r.pace - prev) * k * k * (3 - 2 * k); }
    }
    for (const z of L.zones) {
      if (z.x0 - B > px) break;
      if (px > z.x1 + B) continue;
      const k = px < z.x0 ? (px - z.x0 + B) / B : px > z.x1 ? (z.x1 + B - px) / B : 1;
      p *= 1 + (z.mult - 1) * k;
    }
    return p * (L.diff || 1);
  };
  L.regionAt = function (px) {
    for (let i = L.regions.length - 1; i >= 0; i--) if (px >= L.regions[i].x0) return i;
    return 0;
  };
  L.build('journey');
  RF.LEVEL = L;
})();
