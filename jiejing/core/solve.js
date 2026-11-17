// 借景 · 验关求解器。
// 在“宏动作”层面做广度优先搜索：走到线的一端、迈出去（借过去/落下）、在端点起跳、把某层推到某个位置。
// 走、迈、跳都用真的规则核心逐帧跑出来；推层直接用 settle() 算落点（执行时逐帧推，回放会再核一遍）。
// 找到解后，把宏动作展开成逐帧按键，从头逐帧回放核对能过关，写进 data/plans.json（Godot 回放测试也用它）。
//
// 用法：node jiejing/core/solve.js [关卡号…] [--nopush] [--nocarry] [--nohop] [--write]
//   --nopush   不许推层（每一景都应当无解）
//   --nocarry  不许推自己脚下那一层（“乘船”应当无解）
//   --nohop    不许跳（用到跳的景应当无解）
//   --write    把找到的解写进 data/plans.json
const fs = require('fs'), path = require('path');
const JJ = require('./core.js');
const ROOT = path.join(__dirname, '..');
const LV = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels.json'), 'utf8')).levels;

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const pick = args.filter(a => !a.startsWith('--'));
const NOFRAME = flag('--noframe');   // 被框住的层一律不许踏上去（应当无解）
const NOPUSH = flag('--nopush'), NOCARRY = flag('--nocarry'), NOHOP = flag('--nohop');
const LOCK = (args.find(a => a.startsWith('--lock=')) || '--lock=-1').slice(7) | 0;   // --lock=k：第 k 层不许推

const I = (dir, o) => Object.assign({ dir, jump: false, push: false, sel: -1, undo: false }, o || {});

function keyOf(G) {
  const p = G.p;
  return G.o.join(',') + '|' + p.L + ':' + p.line + ':' + Math.round(p.x * 8);
}

// 逐帧执行一个宏动作，返回按键序列；失败返回 null。G 会被推进。
function runMacro(G, m) {
  const ins = [];
  const go = inp => { ins.push(inp); G.step(inp); };
  const p = G.p;
  if (m.t === 'walk') {
    // 一直走，直到再走一步就会越过线端（停在端点前不到 1 像素）；经过宫灯就赢
    const a = G.span(), lim = m.dir > 0 ? a[1] - 0.05 : a[0] + 0.05;
    const ok = () => (m.dir > 0 ? p.x + JJ.C.WALK <= lim : p.x - JJ.C.WALK >= lim);
    if (!ok()) return null;
    for (let n = 0; n < 1200 && ok(); n++) { go(I(m.dir)); if (G.won) return ins; }
    go(I(0));
    return ins;
  }
  if (m.t === 'off' || m.t === 'hop') {
    const a = G.span(), end = m.dir > 0 ? a[1] : a[0];
    if (Math.abs(p.x - end) > 1.5) return null;
    const L0 = p.L, line0 = p.line;
    if (m.t === 'hop') go(I(m.dir, { jump: true }));
    let air = !p.ground;
    for (let n = 0; n < 400; n++) {
      if (G.won) return ins;
      if (G.bloom > 0) { while (G.bloom > 0) go(I(0)); go(I(0)); return ins; }
      if (p.ground && (air || p.L !== L0 || p.line !== line0)) {
        // 落稳或借过去了：再往前走几帧离开端点，停下
        for (let k = 0; k < 6 && !G.won; k++) { const b = G.span(); if ((m.dir > 0 && p.x >= b[1] - 1) || (m.dir < 0 && p.x <= b[0] + 1)) break; go(I(m.dir)); }
        go(I(0));
        return ins;
      }
      if (!p.ground) air = true;
      go(I(m.dir));
    }
    return null;
  }
  if (m.t === 'push') {
    const k = m.k, v = m.v;
    let first = true;
    for (let n = 0; n < 2000; n++) {
      const cur = JJ.rnd(G.o[k]);
      if (cur === v) break;
      go(I(cur < v ? 1 : -1, { push: true, sel: first ? k : -1 }));
      first = false;
    }
    if (JJ.rnd(G.o[k]) !== v) return null;
    go(I(0));            // 松开 Shift：吸上去或取整
    return ins;
  }
  return null;
}

// 有意义的推法：只有当某条线的端点和别层的线“能接上/不能接上”的关系变化时，偏移才有区别。
// 对第 k 层的每个偏移 v 算一个“接得上哪些”的指纹，指纹相同的连续区间只取中间一个，再加上所有接缝点。
const ICACHE = new Map();
function interesting(G, k) {
  const ck = G.S.id + '|' + k + '|' + G.o.map((v, j) => j === k ? '*' : v).join(',');
  if (ICACHE.has(ck)) return ICACHE.get(ck);
  const A = G.S.layers[k], save = G.o[k], tg = new Set();
  let prev = null, runStart = A.min;
  const sig = () => {
    let s = '';
    for (let j = 0; j < 3; j++) for (let li = 0; li < G.S.layers[j].lines.length; li++) for (const q of G.pieces(j, li)) for (const dir of [-1, 1]) {
      const p0 = G.p; G.p = { L: j, line: li, x: (q[0] + q[1]) / 2, y: 0, ground: true };
      const t = G.findTransfer(dir); G.p = p0;
      s += t ? t.L + '.' + t.line + '.' + t.lo + ';' : '-;';
    }
    return s;
  };
  for (let v = A.min; v <= A.max + 1; v++) {
    let cur = null;
    if (v <= A.max) { G.o[k] = v; cur = sig(); }
    if (cur !== prev) {
      if (prev !== null) tg.add(G.settleAt(k, Math.floor((runStart + v - 1) / 2), save));
      prev = cur; runStart = v;
    }
  }
  G.o[k] = save;
  for (const s of G.snapPoints(k)) tg.add(s);
  ICACHE.set(ck, tg);
  return tg;
}
// 搜索时走路不逐帧算：直接走到端点（经过宫灯就算赢）
function fastWalk(G, m) {
  const p = G.p, a = G.line(), sp = G.span(), lim = m.dir > 0 ? sp[1] - 0.05 : sp[0] + 0.05, W = JJ.C.WALK, lm = G.S.lamp;
  const ok = () => (m.dir > 0 ? p.x + W <= lim : p.x - W >= lim);
  if (!ok()) return null;
  const onLamp = p.L === lm.layer && p.line === lm.line;
  for (let n = 0; n < 1200 && ok(); n++) {
    p.x = p.x + m.dir * W;
    if (onLamp && Math.abs(p.x - lm.x) <= JJ.C.LAMP) { G.won = true; return []; }
  }
  p.y = JJ.yAt(a, p.x); p.face = m.dir;
  return [];
}
function solve(L) {
  const G = JJ.Game(L);
  const start = G.snapshot();
  const seen = new Map();
  const q = [{ s: start, path: [] }];
  seen.set(keyOf(G), true);
  let found = null, expanded = 0;
  while (q.length && !found) {
    const node = q.shift(); expanded++;
    if (expanded > 400000) break;
    const ms = [];
    for (const dir of [-1, 1]) { ms.push({ t: 'walk', dir }, { t: 'off', dir }); if (!NOHOP) ms.push({ t: 'hop', dir }); }
    if (!NOPUSH) {
      G.restore(node.s);
      for (const k of G.pushable) {
        if (!G.canPush(k) || k === LOCK || (NOCARRY && k === G.p.L)) continue;
        const tg = interesting(G, k);
        for (const v of tg) if (v !== JJ.rnd(G.o[k])) ms.push({ t: 'push', k, v });
      }
    }
    for (const m of ms) {
      G.restore(node.s);
      if (!G.p.ground) continue;
      const ins = m.t === 'walk' ? fastWalk(G, m) : runMacro(G, m);
      if (!ins) continue;
      if (G.won) { found = node.path.concat([m]); break; }
      if (G.bloom > 0 || !G.p.ground) continue;
      if (NOFRAME && G.S.isTarget[G.p.L]) continue;
      const k = keyOf(G);
      if (seen.has(k)) continue;
      seen.set(k, true);
      q.push({ s: G.snapshot(), path: node.path.concat([m]) });
    }
  }
  return { plan: found, states: seen.size };
}

// 宏动作展开成逐帧按键，从头回放核对
function expand(L, plan) {
  const G = JJ.Game(L);
  let all = [];
  for (const m of plan) {
    const ins = runMacro(G, m);
    if (!ins) return null;
    all = all.concat(ins);
  }
  // 再从头纯按键回放一遍
  const H = JJ.Game(L);
  for (const inp of all) H.step(inp);
  return { ins: all, won: H.won, frames: all.length, final: stateLine(H) };
}
function stateLine(G) {
  const p = G.p;
  return [G.o.map(v => v.toFixed(3)).join(','), p.L, p.line, p.x.toFixed(3), p.y.toFixed(3), G.won ? 1 : 0].join(' ');
}
// 压缩：相同按键连成一段 [帧数, dir, jump, push, sel]
function rle(ins) {
  const out = [];
  for (const i of ins) {
    const r = [1, i.dir, i.jump ? 1 : 0, i.push ? 1 : 0, i.sel];
    const last = out[out.length - 1];
    if (last && last[1] === r[1] && last[2] === r[2] && last[3] === r[3] && last[4] === r[4] && !r[2] && r[4] < 0) last[0]++;
    else out.push(r);
  }
  return out;
}

const plans = {};
let bad = 0;
for (const L of LV) {
  if (pick.length && !pick.includes(L.id)) continue;
  const t0 = Date.now();
  const r = solve(L);
  const ms = Date.now() - t0;
  if (!r.plan) { console.log(`${L.id} ${L.name}: 无解（${r.states} 个状态，${ms}ms）`); bad++; continue; }
  const e = expand(L, r.plan);
  const desc = r.plan.map(m => m.t === 'push' ? `推${'远中近'[m.k]}→${m.v}` : (m.t === 'walk' ? '走' : m.t === 'off' ? '迈' : '跳') + (m.dir > 0 ? '→' : '←')).join(' ');
  console.log(`${L.id} ${L.name}: ${e && e.won ? '有解' : '回放失败'} ${r.plan.length} 步 ${e ? (e.frames / 60).toFixed(1) + ' 秒' : ''}（${r.states} 个状态，${ms}ms）\n    ${desc}`);
  if (!e || !e.won) { bad++; continue; }
  plans[L.id] = { runs: rle(e.ins), final: e.final };
}
if (flag('--write') && !NOPUSH && !NOCARRY && !NOHOP && !NOFRAME && LOCK < 0) {
  const f = path.join(ROOT, 'data/plans.json');
  const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  Object.assign(old, plans);
  fs.writeFileSync(f, JSON.stringify(old, null, 0).replace(/\],\[/g, '],\n[') + '\n');
  console.log('写入', f);
}
process.exitCode = bad ? 1 : 0;
