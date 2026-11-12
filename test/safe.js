// 验证回溯落脚点：从 js/safe.js 的每个落脚点出发，求解器都要能走到下一个检查点。
// 用法：node test/safe.js <gamedir> [--diff 0.88] [--shard i/n]
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2];
const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/util.js', 'js/level.js', 'js/safe.js', 'js/game.js'])
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const RF = ctx.RF, C = RF.CFG, LV = RF.LEVEL, G = RF.createGame();
const di = process.argv.indexOf('--diff'); if (di > 0) LV.diff = +process.argv[di + 1];
const si = process.argv.indexOf('--shard'); const [sh, sn] = si > 0 ? process.argv[si + 1].split('/').map(Number) : [0, 1];
const DT = C.STEP, K = 3, ACTS = [[0, 0], [0, 1], [1, 0], [1, 1]];

function solveFrom(x, world) {
  G.loadAt(x, world); G.state = 'running';
  const next = LV.checkpoints.find(c => c.x > x + C.BEAT_PX * 2);
  const goal = next ? next.x + 2 : LV.endX - 2;
  const seen = new Set(); let nodes = 0;
  function dfs(tick) {
    if (++nodes > 400000) return false;
    const key = tick + '|' + G.world + '|' + Math.round((G.dclock || 0) * 8) + '|' + Math.round(G.foot / 3) + '|' + Math.round(G.vy / 80) + '|' + G.onGround + '|' + !!G.hopUsed + '|' + Object.keys(G.gates).length + '|' + LV.ferries.map(f => f.on ? 1 : 0).join('') + '|' + LV.sinkers.filter(k => k.stood > 0).length;
    if (seen.has(key)) return false; seen.add(key);
    const snap = G.snapshot();
    for (const [sw, jp] of ACTS) {
      G.restore(snap);
      if (sw) G.pendingSwitch = true;
      if (jp) G.jumpBuf = C.JUMP_BUFFER;
      let ok = true;
      for (let k = 0; k < K; k++) {
        G.physicsOnly(DT);
        if (G.state === 'failing') { ok = false; break; }
        if (G.px >= goal && G.onGround || G.state === 'arrived') return true;
      }
      if (ok && dfs(tick + K)) return true;
    }
    G.restore(snap);
    return false;
  }
  return { ok: dfs(0), nodes };
}
const S = RF.SAFE;
let bad = 0, n = 0;
for (let i = sh; i < S.length; i += sn) {
  const r = solveFrom(S[i][0], S[i][1] ? 'night' : 'day'); n++;
  if (!r.ok) { bad++; console.log('FAIL', i, S[i][0], S[i][1] ? 'night' : 'day', 'nodes', r.nodes); }
}
console.log(bad ? 'SOME FAILED' : 'ALL OK', 'checked', n, 'bad', bad);
