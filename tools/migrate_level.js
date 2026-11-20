// 一次性迁移：把 js/level.js 里手写的 build() 关卡转成 shared/data/rooms.json（像素格为单位，320×180 一格一单位）。
// 用法：node tools/migrate_level.js .
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || '.';
const src = fs.readFileSync(path.join(dir, 'js/level.js'), 'utf8');
const body = src.slice(src.indexOf('function build() {') + 'function build() {'.length, src.indexOf('// ------------------------------------------------------------ 搭建'));
const P = 4, G0 = 560;
const px = v => (v === undefined || v === null ? v : Math.round(v / P));
const out = { unit: 'px', note: '坐标以 320×180 画面的像素为单位；y 是脚底/底边；w 是属于哪一面：day / night / both', regions: [], rooms: [] };
let room = null;
const it = o => { for (const k in o) if (o[k] === undefined) delete o[k]; room.items.push(o); };
const api = {
  region(id, no, name, line, weathers) { out.regions.push({ id, no, name, line, weathers }); },
  R(name, world, fn, opt) {
    opt = opt || {};
    room = { name, line: opt.line || '', world, region: out.regions.length - 1, sx: px(opt.sx || 70), sy: px(opt.sy || G0), exitY: px(opt.exitY || G0), items: [] };
    fn(); out.rooms.push(room);
  },
  ground: (x0, x1, y, w, kind) => it({ t: 'ground', x0: px(x0), x1: px(x1), y: px(y === undefined ? G0 : y), w: w || 'both', kind: kind || 'ground' }),
  night: (x0, x1, y, kind) => api.ground(x0, x1, y, 'night', kind),
  day: (x0, x1, y, kind) => api.ground(x0, x1, y, 'day', kind),
  box: (x, w, kind, y) => it({ t: 'box', x: px(x), y: px(y === undefined ? G0 : y), w: w || 'both', kind }),
  lamp: (x, y, w) => it({ t: 'lamp', x: px(x), y: px(y === undefined ? G0 : y), w: w || 'both' }),
  bellGate: (bx, by, bw, gx, gy, kind) => it({ t: 'bellGate', bx: px(bx), by: px(by), bw, gx: px(gx), gy: px(gy === undefined ? G0 : gy), kind: kind || 'bell' }),
  crate: (x, y, tx) => it({ t: 'crate', x: px(x), y: px(y === undefined ? G0 : y), tx: px(tx) }),
  plateGate: (pxx, py, gx, gy) => it({ t: 'plateGate', px: px(pxx), py: px(py === undefined ? G0 : py), gx: px(gx), gy: px(gy === undefined ? G0 : gy) }),
  eave: (x0, x1, yd, yn) => it({ t: 'eave', x0: px(x0), x1: px(x1), yd: px(yd), yn: px(yn) }),
  wheel: (cx, cy, r, n, period, hw, style) => it({ t: 'wheel', cx: px(cx), cy: px(cy), r: px(r), n, period, hw: px(hw || 24), style }),
  swing: (cx, cy, r, amp, period, phase, hw) => it({ t: 'swing', cx: px(cx), cy: px(cy), r: px(r), amp, period, phase: phase || 0, hw: px(hw || 28) }),
  drift: (cx, cy, amp, period, phase, hw, style) => it({ t: 'drift', cx: px(cx), cy: px(cy), amp: px(amp), period, phase: phase || 0, hw: px(hw || 40), style }),
  hint: (text, dur, tag) => { room.hint = { text, dur: dur || 6, tag }; },
  deco: (kind, x, x1, o) => it(Object.assign({ t: 'deco', kind, x: px(x), x1: px(x1 === undefined ? x : x1), y: px(G0) }, o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'y' ? px(v) : v])) : {})),
  sprite: (name, x, y) => api.deco('spr', x, undefined, { name, y: y === undefined ? G0 : y })
};
const C = { WATER: { tibet: { night: 568 } } }, B = 120, RW = 1280;
new Function(...Object.keys(api), 'C', 'B', 'G0', 'RW', 'TIDE', body.slice(0, body.lastIndexOf('}')))(...Object.values(api), C, B, G0, RW, G0 + 50);
fs.writeFileSync(path.join(dir, 'shared/data/rooms.json'), require('./fmt_json')(out));
console.log(out.regions.length, 'regions', out.rooms.length, 'rooms', out.rooms.reduce((a, r) => a + r.items.length, 0), 'items');
