// 由共用数据生成网页版要读的文件，并把 js/config.js 的规则导出给 Godot / Unity。
// 改了 shared/data/rooms.json 或 js/config.js 以后跑：node tools/sync_data.js .
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2] || '.';
const rooms = JSON.parse(fs.readFileSync(path.join(dir, 'shared/data/rooms.json'), 'utf8'));
fs.writeFileSync(path.join(dir, 'js/rooms_data.js'), '// 由 tools/sync_data.js 从 shared/data/rooms.json 生成，不要手改。\nwindow.RF = window.RF || {};\nRF.ROOMS = ' + JSON.stringify(rooms) + ';\n');
const ctx = { console, Math }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'js/config.js'), 'utf8'), ctx);
const C = ctx.RF.CFG, P = C.PIX;
// 长度类（像素 / 逻辑单位）统一换成像素；时间、比例、拍数原样
const LEN = ['GROUND', 'HALF_W', 'BODY_H', 'STEP_UP', 'PUSH', 'DRIFT', 'CRATE', 'FLOAT', 'WALK', 'WALK_ACC', 'AIR_ACC', 'FALL_MAX', 'GRAVITY', 'JUMP_V', 'EAVE_V', 'FALL_LIMIT'];
const rules = { unit: 'px', note: '长度、速度、加速度都以 320×180 画面的像素为单位。运行时乘以 SUB 换成逻辑单位（与网页版逻辑完全一致）。', SUB: P, W: C.W / P, H: C.H / P, STEP: C.STEP, BPM: C.BPM };
for (const k of LEN) rules[k] = C[k] / P;
for (const k of ['JUMP_CUT', 'SHIFT_HOP', 'COYOTE', 'JUMP_BUFFER', 'SWITCH_WIPE']) rules[k] = C[k];
rules.WATER = {};
for (const r in C.WATER) { rules.WATER[r] = {}; for (const k in C.WATER[r]) rules.WATER[r][k] = typeof C.WATER[r][k] === 'number' ? C.WATER[r][k] / P : C.WATER[r][k]; }
fs.writeFileSync(path.join(dir, 'shared/data/rules.json'), JSON.stringify(rules, null, 2) + '\n');
console.log('rooms', rooms.rooms.length, '→ js/rooms_data.js；rules → shared/data/rules.json');
