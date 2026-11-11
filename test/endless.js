// 云游验证：用几个随机种子拼出整条路，逐个检查点求解。
// 用法：node test/endless.js . [种子数] [难度倍数]
const { load, solveSegment } = require('./lib.js');
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2] || '.', N = +(process.argv[3] || 3), D = +(process.argv[4] || 1);
const E = load(dir), LV = E.LV;
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'js/chunks.js'), 'utf8').replace(/RF\./g, 'window.RF.').replace('window.RF = window.RF || {};', 'window.RF = {};'), ctx);
const range = ctx.window.RF.CHUNK_RANGE;
let bad = 0;
for (let seed = 1; seed <= N; seed++) {
  LV.diff = D;
  LV.build('endless', { seed: seed * 7919, range }); E.G.reset();
  let fails = [];
  for (let i = 0; i < LV.checkpoints.length; i++) {
    const r = solveSegment(E, i, 150000);
    if (!r.ok) fails.push(i + ':' + LV.checkpoints[i].chunk);
  }
  bad += fails.length;
  console.log('seed', seed * 7919, 'cps', LV.checkpoints.length, 'beats', Math.round(LV.endX / 120), fails.length ? 'FAIL ' + fails.join(' ') : 'OK');
}
console.log(bad ? 'SOME FAILED' : 'ENDLESS ALL OK');
