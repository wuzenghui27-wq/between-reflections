// 求解器公用部分：在 node 里载入游戏逻辑，从某个检查点搜一组“切换 / 跳”走到目标。
const fs = require('fs'), path = require('path'), vm = require('vm');
function load(dir) {
  const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/config.js', 'js/util.js', 'js/level.js', 'js/game.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  const RF = ctx.RF;
  return { RF, C: RF.CFG, LV: RF.LEVEL, G: RF.createGame() };
}
const K = 3, ACTS = [[0, 0], [0, 1], [1, 0], [1, 1]];
function solveSegment(E, i, limit) {
  const { C, LV, G } = E;
  G.loadCheckpoint(i); G.state = 'running';
  const goal = i + 1 < LV.checkpoints.length ? LV.checkpoints[i + 1].x + 2 : LV.endX - 2;
  const seen = new Set(), plan = [];
  let nodes = 0;
  function dfs(tick) {
    if (++nodes > (limit || 400000)) return false;
    const key = tick + '|' + G.world + '|' + Math.round(G.foot / 3) + '|' + Math.round(G.vy / 80) + '|' + G.onGround + '|' + !!G.hopUsed + '|' + Object.keys(G.gates).length + '|' + LV.ferries.map(f => f.on ? 1 : 0).join('') + '|' + LV.sinkers.filter(k => k.stood > 0).length;
    if (seen.has(key)) return false; seen.add(key);
    const snap = G.snapshot();
    for (const [sw, jp] of ACTS) {
      G.restore(snap);
      if (sw) G.pendingSwitch = true;
      if (jp) G.jumpBuf = C.JUMP_BUFFER;
      let ok = true;
      for (let k = 0; k < K; k++) {
        G.physicsOnly(C.STEP);
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
// 沿一条求解路线摆铜钱（每半拍一枚，起跳 / 翻面附近和空中才摆）
function coinsAlong(E, plans) {
  const { C, LV, G } = E, HALF = C.BEAT_PX / 2;
  const samples = [], acts = [];
  for (const { cp: i, plan } of plans) {
    G.loadCheckpoint(i); G.state = 'running';
    const goal = i + 1 < LV.checkpoints.length ? LV.checkpoints[i + 1].x + 2 : LV.endX - 2;
    const at = {}; for (const p of plan) at[p.t] = p;
    for (let tick = 0; tick < 100000; tick += K) {
      const p = at[tick];
      if (p) { if (p.sw) G.pendingSwitch = true; if (p.jp) G.jumpBuf = C.JUMP_BUFFER; acts.push(G.px); }
      let done = false;
      for (let k = 0; k < K; k++) {
        G.physicsOnly(C.STEP);
        samples.push({ x: G.px, foot: G.foot, world: G.world, ground: G.onGround });
        if (G.px >= goal && G.onGround || G.state === 'arrived') { done = true; break; }
      }
      if (done || G.state !== 'running') break;
    }
  }
  samples.sort((a, b) => a.x - b.x);
  const near = x => { let lo = 0, hi = samples.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (samples[m].x < x) lo = m + 1; else hi = m; } return samples[lo]; };
  const coins = [];
  for (let x = HALF * 4; x < LV.endX - C.BEAT_PX * 4; x += HALF) {
    const s = near(x); if (!s || Math.abs(s.x - x) > 8) continue;
    const busy = acts.some(a => x > a - C.BEAT_PX * 0.75 && x < a + C.BEAT_PX * 1.25);
    if (!busy && s.ground) continue;
    if (LV.lanterns.some(l => Math.abs(l.x - x) < 40)) continue;
    if (LV.checkpoints.some(c => Math.abs(c.x - x) < 30)) continue;
    coins.push({ x: Math.round(x), y: Math.round(s.foot - 34), w: s.world });
  }
  return coins;
}
module.exports = { load, solveSegment, coinsAlong };
