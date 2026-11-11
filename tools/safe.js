// 回溯点：失误后不退回很远的检查点，而是倒带到“几拍之前、脚踩实地”的位置。
// 沿求解器找出的能走通的路线跑一遍，每拍记下一个站在固定地面上、前方一拍多内不用操作的状态。
// 用法：node tools/safe.js . [--plan plan.json]   （改完关卡后运行，生成 js/safe.js；再跑 test/safe.js 验证）
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const dir = process.argv[2] || '.';
let planFile = process.argv.indexOf('--plan') > 0 ? process.argv[process.argv.indexOf('--plan') + 1] : null;
if (!planFile) {
  planFile = path.join(require('os').tmpdir(), 'br-plan.json');
  cp.execFileSync('node', [path.join(dir, 'test/solve.js'), dir, '--plan', planFile], { stdio: 'inherit' });
}
const plans = JSON.parse(fs.readFileSync(planFile, 'utf8'));

const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/util.js', 'js/level.js', 'js/game.js'])
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const RF = ctx.RF, C = RF.CFG, LV = RF.LEVEL, Q = RF.Q, G = RF.createGame();
const K = 3, B = C.BEAT_PX;

// 先把整条路线上的操作位置记下来
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
      if (G.state !== 'running') break;
      samples.push({ s: G.snapshot(), x: G.px });
      if (G.px >= goal && G.onGround || G.state === 'arrived') { done = true; break; }
    }
    if (done || G.state !== 'running') break;
  }
}

function solidUnder(world, x, foot) {
  for (const s of LV.solids) if (!s.ferry && !s.sink && s.x0 <= x && s.x1 >= x && Math.abs(s.y - foot) < 1 && (s.w === 'both' || s.w === world)) return s;
  return null;
}
const hazardAhead = (world, x0, x1) => LV.hazards.some(h => (h.w === 'both' || h.w === world) && h.x1 > x0 && h.x0 < x1) ||
  LV.rollers.some(h => { const meet = (h.bx0 + h.trig * h.v) / (1 + h.v); return (h.w === 'both' || h.w === world) && meet > x0 - 60 && meet < x1 + 40; }) ||
  LV.moongates.some(m => m.x > x0 - 40 && m.x < x1);

const safe = [];
let lastBeat = -1;
for (const { s, x } of samples) {
  if (!s.onGround || s.riding || s.state !== 'running') continue;
  const beat = Math.floor(x / B);
  if (beat === lastBeat) continue;
  const sol = solidUnder(s.world, x, s.foot);
  if (!sol || sol.x0 > x - 50 || sol.x1 < x + B) continue;                    // 站在平台中间，前方至少一拍实地
  if (LV.sinkers.some(k => k.bx0 - 20 < x && k.bx1 + 20 > x)) continue;
  if (LV.ferries.some(f => f.bx0 - 30 < x && f.bx1 + f.travel + 30 > x)) continue;
  if (acts.some(a => a > x - B * 0.25 && a < x + B * 1.25)) continue;          // 回来之后一拍多不用操作
  if (hazardAhead(s.world, x, x + B * 1.25)) continue;
  lastBeat = beat;
  safe.push([Math.round(x), s.world === 'day' ? 0 : 1]);
}
const out = '// 由 tools/safe.js 生成：失误后倒带回去的落脚点 [x, 0 白天 / 1 夜晚]；铃、渡船、残荷的状态按位置还原，和检查点一样\n' +
  'window.RF = window.RF || {};\nRF.SAFE = ' + JSON.stringify(safe) + ';\n';
fs.writeFileSync(path.join(dir, 'js/safe.js'), out);
console.log('safe points', safe.length, 'bytes', out.length);
