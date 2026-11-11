// 存档与收集：难度、各站最好成绩、云游纪录、诗笺（每站四盏灯 → 一首唐诗的四句）、成就印章。
// 只存在本机浏览器里（localStorage）。
(function () {
  const KEY = 'between-reflections:save';
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { data = {}; }
  data.diff = data.diff || 'normal';
  data.station = data.station || {};       // 区域 id → { mark, score }
  data.endless = data.endless || { score: 0, dist: 0, leg: 0 };
  data.poems = data.poems || {};           // 区域 id → [true, false, …]
  data.ach = data.ach || {};               // 成就 id → 获得的时间
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { } }

  // 公版唐诗：每站一首，和那一站的景对得上
  const POEMS = {
    jiangnan: { title: '枫桥夜泊', author: '唐 · 张继', lines: ['月落乌啼霜满天', '江枫渔火对愁眠', '姑苏城外寒山寺', '夜半钟声到客船'] },
    garden: { title: '秋夕', author: '唐 · 杜牧', lines: ['银烛秋光冷画屏', '轻罗小扇扑流萤', '天阶夜色凉如水', '卧看牵牛织女星'] },
    autumn: { title: '山行', author: '唐 · 杜牧', lines: ['远上寒山石径斜', '白云生处有人家', '停车坐爱枫林晚', '霜叶红于二月花'] },
    wall: { title: '出塞', author: '唐 · 王昌龄', lines: ['秦时明月汉时关', '万里长征人未还', '但使龙城飞将在', '不教胡马度阴山'] },
    glacier: { title: '江雪', author: '唐 · 柳宗元', lines: ['千山鸟飞绝', '万径人踪灭', '孤舟蓑笠翁', '独钓寒江雪'] },
    tibet: { title: '夜宿山寺', author: '唐 · 李白', lines: ['危楼高百尺', '手可摘星辰', '不敢高声语', '恐惊天上人'] }
  };
  const ORDER = ['jiangnan', 'garden', 'autumn', 'wall', 'glacier', 'tibet'];

  // 成就印章：[id, 印文（两字）, 名字, 说明]
  const ACH = [
    ['arrive', '抵达', '初到圣湖', '走完一次旅程'],
    ['allJia', '六甲', '一路甲等', '一次旅程里六站都拿到「甲」'],
    ['lamps', '灯明', '灯火通明', '一次旅程收齐 24 盏灯'],
    ['clean', '无失', '一气呵成', '不失误走完任意一站'],
    ['combo', '踏歌', '踏歌而行', '连续踩拍 16 次'],
    ['coins', '囊钱', '囊中铜钱', '一趟收 100 枚铜钱'],
    ['hop', '借力', '借力而上', '一趟里空中借力 15 次'],
    ['cloud', '云游', '云游五百步', '云游走满 500 步'],
    ['leg8', '八程', '行过八程', '云游走到第八程'],
    ['poem', '一笺', '一笺诗', '集齐一首诗'],
    ['poems', '六笺', '诗满六笺', '集齐全部六首诗'],
    ['hard', '逆风', '逆风而行', '在「困难」下走完旅程']
  ];

  const M = {
    data, save, POEMS, ORDER, ACH,
    setDiff(d) { data.diff = d; save(); },
    // 收到某站第 k 盏灯：点亮那一句；返回这句诗（第一次点亮时）或 null
    lightLine(rid, k) {
      const p = POEMS[rid]; if (!p || k < 0 || k >= p.lines.length) return null;
      const arr = data.poems[rid] = data.poems[rid] || [];
      const fresh = !arr[k];
      arr[k] = true; save();
      return { line: p.lines[k], fresh, full: p.lines.every((_, i) => arr[i]) };
    },
    poemDone(rid) { const a = data.poems[rid] || []; return POEMS[rid].lines.every((_, i) => a[i]); },
    award(id) {
      if (data.ach[id]) return null;
      data.ach[id] = Date.now(); save();
      return ACH.find(a => a[0] === id) || null;
    },
    recordStation(rid, mark, score) {
      const b = data.station[rid];
      const better = !b || score > b.score;
      if (better) { data.station[rid] = { mark, score }; save(); }
      return better;
    },
    recordEndless(score, dist, leg) {
      const e = data.endless, better = score > e.score;
      e.score = Math.max(e.score, score); e.dist = Math.max(e.dist, dist); e.leg = Math.max(e.leg, leg);
      save(); return better;
    }
  };
  RF.Meta = M;
})();
