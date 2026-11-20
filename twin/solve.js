// 求解器：每一景搜一条最短走法（按“动作”计，每个动作持续 K 帧），确认有解，并报告最短要几步、要换几次面。
// 用法：node twin/solve.js [景号] [--plan out.json]
const fs = require('fs'), path = require('path');
const TW = require('./core.js');
const LEVELS = require('./levels.js');
const K = 6;
const W = +(process.env.TW_W || 0.25);
const ACTS = [];
for (const mv of [1, 0, -1]) for (const jp of [0, 1]) for (const sw of (process.env.TW_NOSHIFT ? [0] : [0, 1])) ACTS.push([mv, jp, sw]);

function key(G, useClock) {
  const q = v => Math.round(v * (+process.env.TW_Q || 1));
  const b = x => [q(x.x), q(x.y), Math.round(x.vx / 4), Math.round(x.vy / 8), x.ground ? 1 : 0].join(',');
  return [G.top, b(G.A), b(G.B), useClock ? ['day', 'night'].map(w => { const m = G.S.lay[w].movers[0]; return m ? Math.round((G.clock[w] % m.period) * 10) : 0; }).join(':') : ''].join('|');
}

// 最佳优先搜索：离灯越近越先试（两种上下安排里取近的那种），再加上已走的步数，偏向短的走法
function Heap(less) {
  const a = [];
  return {
    get size() { return a.length; },
    push(v) { a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } } return top; }
  };
}

function solve(L, maxNodes) {
  const G = TW.Game(L);
  const useClock = ['day', 'night'].some(w => (L[w].movers || []).length);
  const lamp = { day: L.day.lamp, night: L.night.lamp };
  const per = TW.C.WALK * K / 60;
  const h = () => {
    const dA = w => Math.abs(G.A.x - lamp[w]), dB = w => Math.abs(G.B.x - lamp[w]);
    const now = Math.max(dA(G.top), dB(TW.other(G.top))), sw = Math.max(dA(TW.other(G.top)), dB(G.top)) + per;
    return Math.min(now, sw) / per;
  };
  const seen = new Set([key(G, useClock)]);
  const heap = Heap((x, y) => x.f < y.f);
  heap.push({ s: G.snap(), plan: [], f: h() });
  let nodes = 0;
  while (heap.size && nodes < maxNodes) {
    const n = heap.pop();
    for (const a of ACTS) {
      G.load(n.s);
      G.inL = a[0] < 0; G.inR = a[0] > 0;
      if (a[1]) G.input.jump();
      if (a[2]) G.input.shift();
      let ok = true;
      for (let k = 0; k < K; k++) {
        G.step();
        if (G.state === 'won') break;
        if (G.state !== 'running') { ok = false; break; }
      }
      nodes++;
      if (!ok) continue;
      const plan = n.plan.concat([a]);
      if (G.state === 'won') return { plan, nodes };
      const k2 = key(G, useClock);
      if (seen.has(k2)) continue;
      seen.add(k2);
      heap.push({ s: G.snap(), plan, f: plan.length * W + h() });
    }
  }
  return { plan: null, nodes };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const only = args[0] && !args[0].startsWith('--') ? +args[0] : null;
  const pi = args.indexOf('--plan');
  const out = [];
  let all = true;
  LEVELS.forEach((L, i) => {
    if (only !== null && i !== only) return;
    const t0 = Date.now();
    const r = solve(L, 3e6);
    const sw = r.plan ? r.plan.filter(a => a[2]).length : 0, jp = r.plan ? r.plan.filter(a => a[1]).length : 0;
    console.log(`景 ${i} ${L.name}  ${r.plan ? 'OK' : 'NO'}  动作 ${r.plan ? r.plan.length : '-'}（${r.plan ? (r.plan.length * K / 60).toFixed(1) + 's' : ''}） 换面 ${sw} 跳 ${jp}  搜索 ${r.nodes}  ${Date.now() - t0}ms`);
    if (!r.plan) all = false;
    out.push({ room: i, K, plan: r.plan });
  });
  if (pi >= 0) fs.writeFileSync(args[pi + 1], JSON.stringify({ K, rooms: out }));
  console.log(all ? 'ALL OK' : 'SOME UNSOLVED');
  process.exit(all ? 0 : 1);
}
module.exports = { solve, K };
