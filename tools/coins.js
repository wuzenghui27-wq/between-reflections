// 引路铜钱：先用自动求解找出一条能走通的路线，再沿这条路线在“起跳 / 翻面”附近摆铜钱。
// 铜钱每半拍一枚，所以一路吃过去，叮叮声正好落在八分音符上。
// 用法：node tools/coins.js .   （改完关卡后运行，生成 js/coins.js）
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const dir = process.argv[2] || '.';
const planFile = path.join(require('os').tmpdir(), 'br-plan.json');
cp.execFileSync('node', [path.join(dir, 'test/solve.js'), dir, '--plan', planFile], { stdio: 'inherit' });
const plans = JSON.parse(fs.readFileSync(planFile, 'utf8'));

const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/util.js', 'js/level.js', 'js/game.js'])
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const RF = ctx.RF, C = RF.CFG, LV = RF.LEVEL, G = RF.createGame();
const K = 3, HALF = C.BEAT_PX / 2;

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
const out = '// 由 tools/coins.js 生成：沿一条验证过能走通的路线摆的铜钱 [x, y, 0 白天 / 1 夜晚]\n' +
  'window.RF = window.RF || {};\nRF.COINS = ' + JSON.stringify(coins.map(c => [c.x, c.y, c.w === 'day' ? 0 : 1])) + ';\n';
fs.writeFileSync(path.join(dir, 'js/coins.js'), out);
console.log('coins', coins.length, 'actions', acts.length);
