// 自动求解：从每个检查点出发，搜索一组“切换 / 跳”操作走到下一个检查点。
// 用法：node solve.js <gamedir> [--plan out.json]
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2];
const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/util.js', 'js/level.js', 'js/game.js'])
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const RF = ctx.RF, C = RF.CFG, LV = RF.LEVEL;
const G = RF.createGame();
const di = process.argv.indexOf('--diff'); if (di > 0) LV.diff = +process.argv[di + 1];   // 难度：整体步速倍数
const DT = C.STEP, K = 3;   // 每 K 帧做一次决定
const ACTS = [[0, 0], [0, 1], [1, 0], [1, 1]];

function solveSegment(i) {
  G.loadCheckpoint(i); G.state = 'running';
  const goal = i + 1 < LV.checkpoints.length ? LV.checkpoints[i + 1].x + 2 : LV.endX - 2;
  const seen = new Set();
  const plan = [];
  let nodes = 0;
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
        if (G.px >= goal && G.onGround || G.state === 'arrived') { plan.push({ t: tick, sw, jp }); return true; }
      }
      if (!ok) continue;
      plan.push({ t: tick, sw, jp });
      if (dfs(tick + K)) return true;
      plan.pop();
    }
    G.restore(snap);
    return false;
  }
  const ok = dfs(0);
  return { ok, nodes, plan: plan.filter(p => p.sw || p.jp), lastX: G.px };
}

let all = true, totSw = 0, totJp = 0;
const out = [];
for (let i = 0; i < LV.checkpoints.length; i++) {
  const r = solveSegment(i);
  const sw = r.plan.filter(p => p.sw).length, jp = r.plan.filter(p => p.jp).length;
  totSw += sw; totJp += jp;
  const cp = LV.checkpoints[i];
  console.log(`cp${i} x=${cp.x} ${LV.regions[cp.region].name} ${r.ok ? 'OK' : 'FAIL at ' + Math.round(r.lastX)}  switch ${sw} jump ${jp} nodes ${r.nodes}`);
  if (!r.ok) all = false;
  out.push({ cp: i, plan: r.plan });
}
console.log(all ? 'ALL OK' : 'SOME FAILED', 'switches', totSw, 'jumps', totJp, 'length', (function () { let t = 0; for (let x = 0; x < LV.endX; x += 10) t += 10 / (C.SPEED * LV.paceAt(x)); return t; })().toFixed(1) + 's', 'lanterns', LV.lanterns.length);
const pi = process.argv.indexOf('--plan');
if (pi > 0) fs.writeFileSync(process.argv[pi + 1], JSON.stringify(out));
