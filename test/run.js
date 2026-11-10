// 连续通关：每到一处，从当前状态搜索到下一个检查点，再用真实的 update（带事件）执行。
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2];
const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/util.js', 'js/level.js', 'js/game.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
const RF = ctx.RF, C = RF.CFG, LV = RF.LEVEL, G = RF.createGame();
const K = 3, ACTS = [[0, 0], [0, 1], [1, 0], [1, 1]];
function plan(goal) {
  const seen = new Set(), out = [];
  const st0 = G.state; G.state = 'running';
  function dfs(tick) {
    const key = tick + '|' + G.world + '|' + Math.round(G.foot / 3) + '|' + Math.round(G.vy / 80) + '|' + G.onGround + '|' + Object.keys(G.gates).length;
    if (seen.has(key)) return false; seen.add(key);
    const snap = G.snapshot();
    for (const [sw, jp] of ACTS) {
      G.restore(snap); if (sw) G.pendingSwitch = true; if (jp) G.jumpBuf = C.JUMP_BUFFER;
      let ok = true, done = false;
      for (let k = 0; k < K; k++) { G.physicsOnly(C.STEP); if (G.state !== 'running' && G.state !== 'arrived') { ok = false; break; } if ((G.px >= goal && G.onGround) || G.state === 'arrived') { done = true; break; } }
      if (!ok) { G.state = 'running'; continue; }
      out.push([sw, jp]); if (done || dfs(tick + K)) return true; out.pop();
    }
    G.restore(snap); return false;
  }
  const s = G.snapshot(); const ok = dfs(0); G.restore(s); G.state = st0; return ok ? out : null;
}
let fails = 0, lan = 0, ev = {}, planning = false;
['fail', 'bell', 'lantern', 'region', 'checkpoint', 'switched', 'jump', 'arrive', 'ended'].forEach(n => G.on(n, () => { if (!planning) ev[n] = (ev[n] || 0) + 1; }));
G.start(); G.inputSwitch(); G.inputSwitch && 0;
let guard = 0;
while (G.state !== 'ended' && guard++ < 200) {
  if (G.state !== 'running') { G.update(C.STEP); guard--; continue; }
  const next = LV.checkpoints[G.cpIndex + 1]; const goal = next ? next.x + 2 : LV.endX;
  planning = true; const p = plan(goal); planning = false;
  if (!p) { console.log('no plan at', G.px); break; }
  for (const [sw, jp] of p) { if (sw) G.inputSwitch(); if (jp) G.inputJump(); for (let k = 0; k < K; k++) G.update(C.STEP); if (G.state !== 'running') break; }
}
for (let i = 0; i < 600 && G.state !== 'ended'; i++) G.update(C.STEP);
console.log('state', G.state, 'time', G.stats.time.toFixed(1), 'events', JSON.stringify(ev));
