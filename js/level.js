// 关卡数据：六个地貌区域连成一条路线。
// 单位：拍（beat）。一拍 = CFG.BEAT_PX 像素 ≈ 0.625 秒，所以机关天然落在音乐节拍上。
// 每段地面、障碍、铃铛、灯都标明属于哪一面：day（白天）、night（夜晚）或 both（两面都有）。
(function () {
  const C = RF.CFG, B = C.BEAT_PX, G0 = C.GROUND;

  const L = {
    solids: [], hazards: [], bells: [], lanterns: [], mirages: [],
    checkpoints: [], regions: [], texts: [], endX: 0
  };
  let x = 0, gy = G0, gateN = 0;

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
  const height = y => { gy = y; };
  const at = o => x + o * B;

  // ------------------------------------------------------------ 物件
  const HZ = {
    stall: [56, 100], door: [40, 132], gate: [36, 140], drum: [60, 92], beacon: [40, 112],
    block: [32, 28], rock: [40, 32], shard: [40, 28], mani: [44, 36], gust: [40, 124], yak: [70, 80]
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
  function region(id, no, name, line, weathers) {
    if (L.regions.length) L.regions[L.regions.length - 1].x1 = x;
    L.regions.push({ id, no, name, line, weathers, x0: x, x1: Infinity });
  }

  // ============================================================ 1 江南水乡：切换 + 水位
  region('jiangnan', '第一站', '江南烟雨', '白天水涨，夜里落潮', { rain: 5, fog: 3, clear: 2 });
  height(G0);
  cp('day');
  walk(9);
  text(-5, '前面的石阶只在夜里露出水面。按 Shift 切到夜晚。', 6, 'switch');
  only(3, 'night', 'steps', G0 + 6);
  lantern(-1.5, 'night', 30);
  walk(4);
  text(-3.5, '白天水高，乌篷船才浮得起来。再按 Shift 回到白天。', 5, 'switch2');
  only(3, 'day', 'boat', G0 + 2);
  walk(4);
  lantern(-2, 'night');                           // 只在夜里亮的灯：多留一会儿夜里才拿得到
  only(3, 'night', 'steps', G0 + 6);
  walk(3);
  only(2.5, 'day', 'boat', G0 + 2);
  lantern(-1.2, 'day', 40);
  walk(3);
  only(3, 'night', 'steps', G0 + 6);
  walk(3);
  cp('night');
  text(-2, '看前方淡淡的轮廓：那是另一面的路。', 4);
  only(2, 'day', 'boat', G0 + 2);
  walk(2);
  only(2, 'night', 'steps', G0 + 6);
  walk(1.5);
  only(2, 'day', 'boat', G0 + 2);
  lantern(-1, 'day', 30);
  walk(1.5);
  only(3, 'night', 'steps', G0 + 6);
  walk(1);
  only(2, 'day', 'boat', G0 + 2);
  walk(1);
  split(3, { kind: 'boat', y: G0 + 2 }, { kind: 'steps', y: G0 + 6 });   // 两面都能走：喘口气
  lantern(-1.5, 'night', 30);
  walk(5);

  // ============================================================ 2 徽派与晋派古建：门与铃
  region('garden', '第二站', '宫苑园林', '白天货摊挡路，夜里宫门紧闭', { clear: 4, snow: 3, rain: 2 });
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
  text(-4.5, '院门上了锁。去另一面碰响铜铃，门就开了。', 5, 'bell');
  bellGate(-2.5, 'night', -0.5);
  walk(4);
  cp('day');
  bellGate(-3, 'day', -0.6);
  walk(3);
  haz(-1.2, 'day', 'stall');
  walk(3);
  haz(-1.5, 'night', 'door');
  walk(2.5);
  haz(-1, 'day', 'stall');
  lantern(-1, 'night', 0);
  walk(3);
  bellGate(-2.4, 'night', -0.4);
  walk(2);
  haz(-1, 'night', 'door');
  walk(2);
  haz(-1, 'day', 'stall');
  walk(2.5);
  bellGate(-2.2, 'day', -0.4);
  walk(5);

  // ============================================================ 3 喀斯特峰林与梯田：跳跃 + 萤火
  region('autumn', '第三站', '秋山湖泊', '踏着山石，往高处走', { clear: 4, wind: 4, snow: 2 });
  cp('day');
  walk(6);
  text(-5, '山石一层比一层高。按空格（或 ↑）跳上去。', 5, 'jump');
  height(G0 - 60); walk(3);
  height(G0 - 120); walk(3);
  lantern(-1.5, 'both', 70);
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
  lantern(-1.5, 'day', 40);
  height(G0 - 60); walk(2);
  height(G0); walk(5);

  // ============================================================ 4 岭南骑楼与客家围屋：节奏段
  region('wall', '第四站', '长城', '白天战鼓，夜里烽火', { clear: 5, snow: 3, wind: 2 });
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
  walk(2);
  bellGate(-1.6, 'night', -0.3, 'gong');
  walk(2);
  haz(-1, 'night', 'beacon');
  walk(1.5);
  haz(-0.75, 'day', 'drum');
  walk(1.5);
  haz(-0.75, 'night', 'beacon');
  walk(5);

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

  // ============================================================ 6 青藏高原与雪域圣湖：终章
  region('tibet', '终点', '雪域圣湖', '天上的星，落进湖里', { clear: 6, snow: 4 });
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
  walk(1.5);
  only(2, 'night', 'ice', G0 + 4);
  lantern(-1, 'night', 50);
  walk(1.5);
  haz(-0.8, 'day', 'yak');
  walk(1.5);
  height(G0 - 60); walk(2);
  height(G0); walk(1.5);
  only(3, 'night', 'ice', G0 + 4);
  walk(12, 'shore');
  L.endX = x - 5 * B;
  L.regions[L.regions.length - 1].x1 = x;
  L.totalX = x;

  // 按位置排好，便于查找
  L.solids.sort((a, b) => a.x0 - b.x0);
  L.hazards.sort((a, b) => a.x0 - b.x0);
  L.regionAt = function (px) {
    for (let i = L.regions.length - 1; i >= 0; i--) if (px >= L.regions[i].x0) return i;
    return 0;
  };
  RF.LEVEL = L;
})();
