// 自动求解：对每一关做广度优先搜索（左右走 / 跳 / 切换），确认从开头能走到下一关。
// 用法：node test/solve.js <gamedir> [--plan out.json]
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2] || '.';
const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/util.js', 'js/level.js', 'js/game.js'])
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const RF = ctx.RF, C = RF.CFG, LV = RF.LEVEL;
const G = RF.createGame();
const DT = C.STEP, K = 6;            // 每 6 帧（0.1 秒）做一次决定
const ACTS = [];
for (const mv of [1, 0, -1]) for (const jp of [0, 1]) ACTS.push([mv, jp, 0]);
ACTS.push([0, 0, 1], [1, 0, 1], [-1, 0, 1]);

function solveRoom(i) {
  G.loadRoom(i); G.state = 'running';
  const r = LV.rooms[i];
  const per = Math.max(0, ...LV.movers.filter(m => m.cx >= r.x0 && m.cx < r.x1).map(m => m.period));
  const key = () => [Math.round((G.px - r.x0) / 8), Math.round(G.foot / 8), Math.round(G.vy / 120), Math.sign(G.vx), G.onGround ? 1 : 0, G.world[0],
    per ? Math.round((G.dclock % per) * 4) : 0, Object.keys(G.gates).length, Object.keys(G.got).length, LV.crates.filter(c => c.room === i).map(c => Math.round((c.x0 - r.x0) / 8) + ':' + Math.round(c.y1 / 8)).join(','), LV.eaves.map(e => Math.round(e.y / 8)).join(',')].join('|');
  // 最佳优先：先试“离目标近”的状态（灯亮没亮、铃响没响、离灯 / 出口多远），搜不到再慢慢铺开
  const lamp = LV.lanterns.find(l => l.room === i);
  const score = () => {
    const got = Object.keys(G.got).length, gates = Object.keys(G.gates).length;
    const bell = LV.bells.find(b => b.x >= r.x0 && b.x < r.x1 && !G.gates[b.id]);
    let tx = G.got[lamp.i] ? r.x1 + 40 : lamp.x, ty = G.got[lamp.i] ? G.foot : lamp.y + 34;
    if (bell) { tx = bell.x; ty = bell.y + 110; }
    // 有木箱的关：先把箱子弄到该去的地方（推下水、跟着它漂），再去找灯
    const cr = LV.crates.find(c => c.room === i && c.tx !== null);
    if (cr && !G.got[lamp.i] && !(gates > gates0)) {
      const cx = (cr.x0 + cr.x1) / 2, d = Math.abs(cx - cr.tx);
      if (d > 34) return -(got * 4000 + gates * 2500) + 3000 + d * 3 + Math.abs(G.px - (cr.float ? cx : cr.x0 - 14)) + (cr.float ? Math.abs(G.foot - cr.y0) * 0.5 : 0) + (G.world === 'night' ? 150 : 0);
    }
    return -(got * 4000 + gates * 2500) + Math.abs(tx - G.px) + Math.abs(ty - G.foot) * 0.6;
  };
  const gates0 = Object.keys(G.gates).length;
  const seen = new Set([key()]);
  const heap = [];
  const push = n => { heap.push(n); let k = heap.length - 1; while (k > 0) { const p2 = (k - 1) >> 1; if (heap[p2].f <= heap[k].f) break; [heap[p2], heap[k]] = [heap[k], heap[p2]]; k = p2; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let c = k * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[k].f <= heap[c].f) break; [heap[k], heap[c]] = [heap[c], heap[k]]; k = c; } } return top; };
  push({ s: G.snapshot(), prev: null, act: null, d: 0, f: score() });
  let nodes = 0;
  while (heap.length && nodes < 1200000) {
    const node = pop();
    for (const a of ACTS) {
      G.restore(node.s);
      G.inL = a[0] < 0; G.inR = a[0] > 0;
      if (a[1]) G.jumpBuf = C.JUMP_BUFFER;
      if (a[2]) G.pendingSwitch = true;
      let dead = false;
      for (let k = 0; k < K; k++) { G.physicsOnly(DT); if (G.state !== 'running') { dead = true; break; } if (G.room !== i) break; }
      nodes++;
      if (G.room !== i || G.state === 'arrived') {
        const plan = [a]; for (let n = node; n.prev; n = n.prev) plan.push(n.act);
        G.state = 'running';
        return { ok: true, nodes, plan: plan.reverse() };
      }
      if (dead) { G.state = 'running'; continue; }
      const k2 = key(); if (seen.has(k2)) continue; seen.add(k2);
      push({ s: G.snapshot(), prev: node, act: a, d: node.d + 1, f: score() + (node.d + 1) * 3 });
    }
  }
  return { ok: false, nodes, plan: [] };
}

let all = true; const out = [];
const ri = process.argv.indexOf('--room'), onlyRoom = ri > 0 ? +process.argv[ri + 1] - 1 : -1;
for (let i = 0; i < LV.rooms.length; i++) {
  if (onlyRoom >= 0 && i !== onlyRoom) continue;
  const r = solveRoom(i), room = LV.rooms[i];
  const sw = r.plan.filter(p => p[2]).length, jp = r.plan.filter(p => p[1]).length;
  console.log(`关 ${i + 1} ${LV.regions[room.region].name}·${room.name} ${r.ok ? 'OK' : 'FAIL'}  最短 ${(r.plan.length * K * DT).toFixed(1)}s 切换 ${sw} 跳 ${jp} nodes ${r.nodes}`);
  if (!r.ok) all = false;
  out.push({ room: i, plan: r.plan });
}
console.log(all ? 'ALL OK' : 'SOME FAILED', 'rooms', LV.rooms.length);
const pi = process.argv.indexOf('--plan');
if (pi > 0) fs.writeFileSync(process.argv[pi + 1], JSON.stringify(out));
process.exit(all ? 0 : 1);
