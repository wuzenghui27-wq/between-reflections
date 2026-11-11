// 云游的小路段：逐段、逐个步速用求解器验证，记下能走通的步速范围，并沿路线摆好铜钱。
// 用法：node tools/chunks.js .   → 生成 js/chunks.js
const fs = require('fs'), path = require('path');
const { load, solveSegment, coinsAlong } = require('../test/lib.js');
const dir = process.argv[2] || '.';
const E = load(dir), LV = E.LV;
const PACES = [0.88, 1, 1.12, 1.24, 1.36, 1.52];
const range = {}, coins = {};
let bad = 0;
for (const id of LV.chunkIds) {
  const pass = [];
  for (const p of PACES) {
    LV.build('single', { id, pace: p });
    const r = solveSegment(E, 0, 200000);
    pass.push(r.ok);
    if (p === 1) {
      if (!r.ok) { console.log('FAIL', id, 'at pace 1, x', Math.round(r.lastX - LV.checkpoints[0].x)); bad++; }
      else coins[id] = coinsAlong(E, [{ cp: 0, plan: r.plan }]).map(c => [Math.round(c.x - LV.checkpoints[0].x), c.y, c.w === 'day' ? 0 : 1]);
    }
  }
  // 从 1.0 往两边数连续通过的步速
  const i1 = PACES.indexOf(1);
  let lo = i1, hi = i1;
  while (lo > 0 && pass[lo - 1]) lo--;
  while (hi < PACES.length - 1 && pass[hi + 1]) hi++;
  range[id] = pass[i1] ? [PACES[lo], PACES[hi]] : [9, 0];
  console.log(id.padEnd(10), pass.map(b => b ? 'o' : '.').join(''), range[id].join('-'), 'coins', (coins[id] || []).length);
}
LV.build('journey');
fs.writeFileSync(path.join(dir, 'js/chunks.js'),
  '// 由 tools/chunks.js 生成：云游各段能走通的步速范围 [最低, 最高]，以及沿验证路线摆的铜钱 [dx, y, 0 白天 / 1 夜晚]\n' +
  'window.RF = window.RF || {};\nRF.CHUNK_RANGE = ' + JSON.stringify(range) + ';\nRF.CHUNK_COINS = ' + JSON.stringify(coins) + ';\n');
console.log(bad ? bad + ' chunks FAILED' : 'ALL CHUNKS OK');
