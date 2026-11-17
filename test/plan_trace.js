// 把求解器的走法连同网页版逻辑跑出的结果存成 shared/data/solve_plan.json，
// Godot / Unity 版用同一份走法回放，结果要和这里逐位一致（证明两边逻辑是同一套）。
// 用法：node test/solve.js . --plan /tmp/br-plan.json && node test/plan_trace.js . /tmp/br-plan.json
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2] || '.', planFile = process.argv[3];
const ctx = { console, Math, Object, Array, JSON, Infinity, localStorage: { getItem() { return null; }, setItem() { } } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/util.js', 'js/rooms_data.js', 'js/level.js', 'js/game.js'])
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const RF = ctx.RF, C = RF.CFG, LV = RF.LEVEL, G = RF.createGame();
const plans = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const out = { note: '每个动作 [左右, 跳, 换天] 按住 6 个逻辑步（1/60 秒一步）。expect 是网页版跑完这一景时的状态（逻辑单位）。', K: 6, rooms: [] };
for (const p of plans) {
  G.loadRoom(p.room); G.state = 'running';
  let steps = 0;
  outer: for (const a of p.plan) {
    G.inL = a[0] < 0; G.inR = a[0] > 0;
    if (a[1]) G.jumpBuf = C.JUMP_BUFFER;
    if (a[2]) G.pendingSwitch = true;
    for (let k = 0; k < 6; k++) { G.physicsOnly(C.STEP); steps++; if (G.room !== p.room || G.state !== 'running') break outer; }
  }
  out.rooms.push({ room: p.room, plan: p.plan, expect: { steps, room: G.room, state: G.state, px: +G.px.toFixed(4), foot: +G.foot.toFixed(4), world: G.world } });
  console.log(p.room, steps, G.room, G.state, G.px.toFixed(4), G.foot.toFixed(4));
}
fs.writeFileSync(path.join(dir, 'shared/data/solve_plan.json'), JSON.stringify(out) + '\n');
