// 关卡数据：一条连续的湖畔路线，三章，六个景观点。
// 所有坐标为世界横向坐标（逻辑像素）。速度 100 时，100 像素 = 1 秒。
// 数据与逻辑分开：机关数据不负责换景，景色数据不负责开桥。
(function () {
  const R = 'real', D = 'dream';

  const L = {
    holes: { real: [], dream: [] },   // 路面缺口 {world,x0,x1,bridge}
    bridges: [],                      // {id,world,x0,x1,shape,hint}
    plates: [],                       // {id,world,x,bridge,shape}
    obstacles: [],                    // {world,x,w}
    checkpoints: [],                  // {x,world,preopen:[]}
    texts: [],                        // {x,text,dur,tutorial}
    chapters: [],                     // {x,no,name}
    scenes: [],                       // {id,x,mood,name}
    endX: 18300
  };

  let bridgeSeq = 0;
  function hole(world, x0, x1, bridge) {
    L.holes[world].push({ world, x0, x1, bridge: bridge || null });
  }
  function bridgeOver(world, x0, x1, shape, hint) {
    const id = 'B' + (++bridgeSeq);
    hole(world, x0, x1, id);
    L.bridges.push({ id, world, x0, x1, shape, hint: hint || null });
    return id;
  }
  function plate(world, x, bridge, shape) {
    L.plates.push({ id: 'P' + (L.plates.length + 1), world, x, bridge, shape });
  }
  function obstacle(world, x, w) { L.obstacles.push({ world, x, w: w || 44 }); }
  function cp(x, world, preopen) { L.checkpoints.push({ x, world, preopen: preopen || [] }); }
  function text(x, t, dur, extra) { L.texts.push(Object.assign({ x, text: t, dur: dur || 4 }, extra || {})); }
  function chapter(x, no, name) { L.chapters.push({ x, no, name }); }
  function scene(id, x, mood, name) { L.scenes.push({ id, x, mood, name }); }

  // ---------------------------------------------------------------- 景观点
  scene('V01', 0,     'A', '初入梦境');
  scene('V02', 2700,  'A', '发光的树冠');
  scene('V03', 5000,  'B', '远山离开湖面');
  scene('V04', 7200,  'B', '天上的鱼群');
  scene('V05', 11000, 'C', '湖面连接星河');
  scene('V06', 15600, 'C', '月亮与光轮');

  // ================================================================ 第一章
  chapter(0, '第一章', '湖面另一边');
  cp(0, R);
  text(150, '按 Shift 走进另一边', 99, { tutorial: true });

  // 宽松换路：湖岸断开，梦境完整
  hole(R, 1500, 1900);
  text(1050, '湖岸的路断了，去另一边走吧', 4);
  // 梦境被挡，回到湖岸
  obstacle(D, 2500);
  text(2020, '那边被挡住了，回到湖岸', 4);

  // 第一次石板开桥：现实石板 → 梦境荷叶桥
  cp(2800, R);
  text(2880, '踩过发光石板，另一边的桥会展开', 4);
  const b1 = bridgeOver(D, 3200, 4000, 'ring', '桥连成实线了，现在可以过去');
  plate(R, 3300, b1, 'ring');
  obstacle(R, 3760);
  // V02 观景，然后安全返回
  text(4400, '看够了，就回到湖岸', 4);
  obstacle(D, 4900);

  // ================================================================ 第二章
  chapter(5200, '第二章', '漂浮的远方');
  cp(5200, R);
  hole(R, 5600, 6000);
  text(5280, '去梦里看看', 3);

  // 梦境石板 → 现实木桥
  cp(6100, D);
  text(6160, '梦里的石板，也能接上湖岸的路', 4);
  const b2 = bridgeOver(R, 6400, 7200, 'leaf');
  plate(D, 6500, b2, 'leaf');
  obstacle(D, 6960);

  // V04 鱼群观景（两个世界均安全，约 12 秒）
  text(7450, '慢一点也没关系，看看天上', 4);

  // 需要等待的机关：梦境缺口从更早处开始
  cp(8400, R);
  obstacle(D, 8650);
  text(8760, '先别急，等桥完全展开', 4);
  const b3 = bridgeOver(D, 8800, 9800, 'diamond');
  plate(R, 9100, b3, 'diamond');
  obstacle(R, 9560);
  obstacle(D, 10500);

  // ================================================================ 第三章
  chapter(11000, '第三章', '星河的尽头');
  cp(11100, R);
  text(11200, '两组石板，一前一后', 4);
  // 组合：现实石板开梦境桥，再由梦境石板开现实桥
  const b4 = bridgeOver(D, 11600, 12500, 'ring');
  plate(R, 11700, b4, 'ring');
  obstacle(R, 12160);
  const b5 = bridgeOver(R, 12500, 13300, 'leaf');
  plate(D, 12600, b5, 'leaf');
  obstacle(D, 13060);

  // 安全观景，然后最后一组
  cp(14300, R);
  hole(R, 14800, 15100);
  const b6 = bridgeOver(R, 15300, 16100, 'star');
  plate(D, 15400, b6, 'star');
  obstacle(D, 15860);
  cp(15980, R, [b6]);
  const b7 = bridgeOver(D, 16100, 16900, 'diamond');
  plate(R, 16200, b7, 'diamond');
  obstacle(R, 16660);
  // 之后两个世界都安全，直到观景台

  // 预计算：缺口按坐标排序
  L.holes.real.sort((a, b) => a.x0 - b.x0);
  L.holes.dream.sort((a, b) => a.x0 - b.x0);

  RF.LEVEL = L;
})();
