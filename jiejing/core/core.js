// 借景 · Borrowed Scenery —— 规则核心（只管规则，不碰画面和声音）。
// 网页试玩、求解器和 Godot 版（scripts/core.gd，逐行对照移植）都以它为准；两边用同一份回放核对。
//
// 一景是一幅横向画卷，分成至多三层：远（0）、中（1）、近（2）。每层只能左右推，偏移 o 在 [min, max] 之间。
// 每层上画着几条“墨线”（可以走的线，折线，x 递增）。旅人属于某一层，只在这一层的线上走、跳、落。
// 走到线的尽头时，如果别的层有一条线在屏幕上正好接上（高差 ≤ 1 像素，缝 ≤ 2 像素），她就“借过去”，从此属于那一层。
// 站在普通墨线上时，脚下这一层推不动（得先借到别的层上去）；站在船（boat）上，可以推船所在的层，人跟着走。推层和走路不能同时做。
// 推层时离“接缝点”±3 像素会被吸住（变慢），松手就吸上去；不在吸附范围内则落到最近的整数像素。
// 走到同层、同一条线上宫灯 ±4 像素内并站稳，灯亮，过关。掉出画面：墨晕一下，回到最近的落脚点（不死）。
// 每次开始推层、每次借过去之前存一步，Z 退回。
// 鼠标拖层：层直接跟着鼠标走（远 0.4、中 0.7、近 1.0 倍），接缝点 ±3 像素内阻尼减半，松手吸准。
// 走出线端后 6 帧内还能起跳（不至于反应不及走空）。
// 框景（第二卷）：近层上的月洞门、漏窗是“框”。被框住的目标层只在框里存在：框外看不见、也走不上去；
//   目标层的线被框的左右边裁成几段，段的两端就是框边，走到框边就要借到别层去。站在框里时，带框的层推不动。
//
// 约定：所有坐标是 320×180 画面里的像素，y 向下增大。时间按固定 60 帧一秒走，没有随机数。
// 取整一律用 rnd(v) = floor(v + 0.5)（GDScript 的 round 对 -0.5 的处理与 JS 不同，所以不用内置 round）。
(function (root) {
  'use strict';
  const C = {
    W: 320, H: 180,
    WALK: 40 / 60,              // 每帧走 2/3 像素
    PUSH: [20 / 60, 32 / 60, 48 / 60],   // 远、中、近三层每帧推多少像素（远处的东西推起来慢）
    SNAP: 3, SNAP_SLOW: 0.35,   // 吸附半径、吸附范围内的减速
    GLOW: 5,                    // 5 像素以内亮起预光（画面用）
    GAP: 2, DY: 1.01,           // 借过去：缝不超过 2 像素、高差不超过 1 像素
    GRAV: 0.25, HOP: Math.sqrt(2 * 0.25 * 10),   // 跳 10 像素高
    FALL_MAX: 4, FALL_Y: 200, BLOOM: 36,          // 掉出画面后墨晕 0.6 秒
    LAMP: 4, HALF: 2,
    PAR: [0.4, 0.7, 1.0], DRAG_SLOW: 0.5,         // 鼠标拖层的跟手倍数、接缝处阻尼
    COYOTE: 6,                                    // 走出线端后还能起跳的帧数
  };
  const rnd = v => Math.floor(v + 0.5);

  // ------------------------------------------------------------ 关卡数据 → 运行时
  // 关卡（data/levels.json）：
  // { id, name, en, layers: [ { o, min, max, lines: [ { pts: [[x,y],...] } ] } x3 ],
  //   start: { layer, line, x }, lamp: { layer, line, x },
  //   frames: [ { layer, x1, x2, y1, y2, target, kind } ] }   框：长在 layer 层上（层内坐标），框里只露出 target 层
  // 线的点坐标是层内坐标；屏幕 x = 层内 x + 该层偏移 o。y 不随推动变。
  function build(L) {
    const S = { id: L.id, layers: [], start: L.start, lamp: L.lamp, frames: (L.frames || []).map(f => ({ layer: f.layer, x1: f.x1, x2: f.x2, y1: f.y1, y2: f.y2, target: f.target })) };
    S.isTarget = [false, false, false];
    S.hasFrames = [false, false, false];
    for (const f of S.frames) { S.isTarget[f.target] = true; S.hasFrames[f.layer] = true; }
    for (let i = 0; i < 3; i++) {
      const d = (L.layers && L.layers[i]) || { o: 0, min: 0, max: 0, lines: [] };
      S.layers.push({
        o0: d.o || 0, min: d.min === undefined ? (d.o || 0) : d.min, max: d.max === undefined ? (d.o || 0) : d.max,
        lines: (d.lines || []).map(l => ({ pts: l.pts, x1: l.pts[0][0], x2: l.pts[l.pts.length - 1][0], boat: !!l.boat }))
      });
    }
    return S;
  }
  function yAt(line, x) {
    const p = line.pts;
    if (x <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (x <= p[i][0]) {
        const a = p[i - 1], b = p[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    return p[p.length - 1][1];
  }

  // ------------------------------------------------------------ 一局
  function Game(level) {
    const S = build(level);
    const G = { S, C, rnd, yAt };
    G.reset = function () {
      G.o = S.layers.map(l => l.o0);
      G.pushable = [];
      for (let i = 0; i < 3; i++) if (S.layers[i].max > S.layers[i].min) G.pushable.push(i);
      G.sel = G.pushable.length ? G.pushable[0] : -1;
      const st = S.start;
      G.p = { L: st.layer, line: st.line, x: st.x, y: yAt(S.layers[st.layer].lines[st.line], st.x), vx: 0, vy: 0, ground: true, face: 1, coyote: 0 };
      G.foot = { L: st.layer, line: st.line, x: st.x };
      G.bloom = 0; G.won = false; G.wonT = 0; G.frame = 0;
      G.pushing = false; G.pushDir = 0;
      G.undo = [];
      G.events = [];
      G.snapCache = {};
    };
    G.reset();
    const emit = (n, a) => G.events.push([n, a]);
    const oi = k => rnd(G.o[k]);
    G.oi = oi;
    G.line = () => S.layers[G.p.L].lines[G.p.line];
    // 屏幕坐标
    G.sx = () => G.p.x + G.o[G.p.L];

    function snapshot() {
      return { o: G.o.slice(), p: Object.assign({}, G.p), foot: Object.assign({}, G.foot), sel: G.sel };
    }
    function restore(s) {
      G.o = s.o.slice(); G.p = Object.assign({}, s.p); G.foot = Object.assign({}, s.foot); G.sel = s.sel;
      G.bloom = 0; G.pushing = false; G.pushDir = 0;
    }
    G.snapshot = snapshot; G.restore = restore;

    // ---- 框景：第 j 层第 bi 条线现在露出来的几段（层内 x 区间）。不是被框的层就是整条线。
    G.pieces = function (j, bi) {
      const b = S.layers[j].lines[bi];
      if (!S.isTarget[j]) return [[b.x1, b.x2]];
      const out = [], oj = oi(j);
      for (const f of S.frames) {
        if (f.target !== j) continue;
        const of = oi(f.layer);
        const a1 = Math.max(b.x1, f.x1 + of - oj), a2 = Math.min(b.x2, f.x2 + of - oj);
        if (a2 - a1 >= 1) out.push([a1, a2]);
      }
      out.sort((u, v) => u[0] - v[0]);
      return out;
    };
    // 她脚下这一段的左右端（层内 x）
    G.span = function () {
      const ps = G.pieces(G.p.L, G.p.line), x = G.p.x;
      for (const q of ps) if (x >= q[0] - 1e-6 && x <= q[1] + 1e-6) return q;
      return ps.length ? ps[0] : [x, x];
    };

    // 现在能不能推第 k 层：站在这一层的普通线上推不动；站在框里时，带框的层也推不动
    G.canPush = function (k) {
      const p = G.p;
      if (!p.ground) return true;
      if (k === p.L && !G.line().boat) return false;
      if (S.isTarget[p.L]) for (const f of S.frames) if (f.target === p.L && f.layer === k) return false;
      return true;
    };

    // ---- 接缝点：第 k 层推到哪些（整数）偏移时，某两段线的端点在屏幕上正好对上（同高，缝为 0），且这对端点会随第 k 层移动。
    // 其他层的偏移不变时结果不变，所以按其他层的偏移缓存。
    G.snapPoints = function (k) {
      const A = S.layers[k];
      const key = k + ':' + G.o.map((v, j) => j === k ? '*' : oi(j)).join(',');
      if (G.snapCache[key]) return G.snapCache[key];
      const save = G.o[k], out = [];
      for (let v = A.min; v <= A.max; v++) {
        G.o[k] = v;
        const ends = [];       // [屏幕 x, y, 层, 左端=-1/右端=1, 会不会随第 k 层动]
        for (let j = 0; j < 3; j++) {
          const oj = oi(j);
          S.layers[j].lines.forEach((b, bi) => {
            for (const q of G.pieces(j, bi)) {
              // 端点是线本来的端点：随本层动；是被框边裁出来的：随带框的层动
              const m1 = q[0] === b.x1 ? j === k : S.hasFrames[k] && S.isTarget[j];
              const m2 = q[1] === b.x2 ? j === k : S.hasFrames[k] && S.isTarget[j];
              ends.push([q[0] + oj, yAt(b, q[0]), j, -1, m1]);
              ends.push([q[1] + oj, yAt(b, q[1]), j, 1, m2]);
            }
          });
        }
        const lefts = new Map();
        for (const f of ends) if (f[3] === -1) { const l = lefts.get(f[0]); if (l) l.push(f); else lefts.set(f[0], [f]); }
        let hit = false;
        for (const e of ends) {
          if (e[3] !== 1) continue;
          const l = lefts.get(e[0]);
          if (!l) continue;
          for (const f of l) {
            if (f[2] === e[2]) continue;
            if (!e[4] && !f[4]) continue;
            if (Math.abs(e[1] - f[1]) <= C.DY) { hit = true; break; }
          }
          if (hit) break;
        }
        // 被框的线的折点正好落在框边上（框里露出的一段坡正好从框边起坡）也算接缝
        if (!hit) for (const f of S.frames) {
          if (f.target !== k && f.layer !== k) continue;
          const t = f.target, ot = oi(t), of = oi(f.layer);
          for (const b of S.layers[t].lines) for (let i = 1; i < b.pts.length - 1; i++) {
            const vx = b.pts[i][0] + ot;
            if (vx === f.x1 + of || vx === f.x2 + of) { hit = true; break; }
          }
          if (hit) break;
        }
        if (hit) out.push(v);
      }
      G.o[k] = save;
      G.snapCache[key] = out;
      return out;
    };
    function nearestSnap(k, v) {
      let best = null, bd = 1e9;
      for (const s of G.snapPoints(k)) { const d = Math.abs(s - v); if (d < bd || (d === bd && s < best)) { bd = d; best = s; } }
      return { s: best, d: bd };
    }
    G.nearestSnap = nearestSnap;
    // 假设第 k 层停在 v 时（其他层不变）松手会落到哪
    G.settleAt = function (k, v, restoreTo) { const o = G.o[k]; const r = G.settle(k, v); G.o[k] = restoreTo === undefined ? o : restoreTo; return r; };
    // 松手后落到哪：吸附范围内吸上去，否则取整
    G.settle = function (k, v) {
      const n = nearestSnap(k, v);
      if (n.s !== null && n.d <= C.SNAP) return n.s;
      return Math.min(S.layers[k].max, Math.max(S.layers[k].min, rnd(v)));
    };

    // ---- 借过去：她在第 L 层第 a 条线的 dir 端（dir=1 右端），找别层能接上的线
    G.findTransfer = function (dir) {
      const L = G.p.L, a = G.line(), sp = G.span();
      const end = dir > 0 ? sp[1] : sp[0];
      const ex = end + oi(L);
      const ey = yAt(a, end);
      let best = null;
      for (let j = 2; j >= 0; j--) {            // 近层优先
        if (j === L) continue;
        const B = S.layers[j], oj = oi(j);
        for (let bi = 0; bi < B.lines.length; bi++) {
          const b = B.lines[bi];
          for (const q of G.pieces(j, bi)) {
            const bx1 = q[0] + oj, bx2 = q[1] + oj;
            let sx;
            if (dir > 0) { if (!(bx1 <= ex + C.GAP && bx2 >= ex + C.GAP)) continue; sx = Math.max(ex, bx1); }
            else { if (!(bx2 >= ex - C.GAP && bx1 <= ex - C.GAP)) continue; sx = Math.min(ex, bx2); }
            const dy = Math.abs(yAt(b, sx - oj) - ey);
            if (dy > C.DY) continue;
            if (!best || dy < best.dy) best = { L: j, line: bi, x: sx - oj, dy, lo: q[0], hi: q[1] };
          }
        }
      }
      return best;
    };

    // ------------------------------------------------------------ 每帧
    // input: { dir: -1|0|1, jump: bool（这一帧按下）, push: bool（按住 Shift）, sel: -1 | 层号, undo: bool }
    G.step = function (inp) {
      G.events.length = 0;
      G.frame++;
      if (G.won) { G.wonT++; return; }
      if (inp.undo && G.undo.length) { restore(G.undo.pop()); emit('undo'); return; }
      if (inp.sel >= 0 && G.pushable.indexOf(inp.sel) >= 0 && inp.sel !== G.sel) { G.sel = inp.sel; emit('sel', G.sel); }

      // 墨晕中：等它散了回到落脚点
      if (G.bloom > 0) {
        G.bloom--;
        if (G.bloom === 0) {
          const f = G.foot, l = S.layers[f.L].lines[f.line];
          Object.assign(G.p, { L: f.L, line: f.line, x: f.x, y: yAt(l, f.x), vx: 0, vy: 0, ground: true });
          emit('respawn');
        }
        return;
      }

      // ---- 推层（只在站稳时）
      const p = G.p;
      const wantPush = inp.push && p.ground && G.sel >= 0;
      const dragging = inp.drag !== undefined && inp.drag !== null;
      if (wantPush && (inp.dir !== 0 || dragging)) {
        const k = G.sel, A = S.layers[k];
        const d = dragging ? Math.sign(inp.drag) : inp.dir;
        if (!G.canPush(k)) { if (!G.pushing && d !== 0) emit('locked', k); p.vx = 0; return; }
        if (!G.pushing || (d !== 0 && G.pushDir !== d)) {
          if (!G.pushing) G.undo.push(snapshot());
          G.pushing = true;
          if (d !== 0) { G.pushDir = d; emit('push', k); }
        }
        let v = dragging ? inp.drag * C.PAR[k] : C.PUSH[k] * inp.dir;
        const n = nearestSnap(k, G.o[k]);
        if (n.s !== null && n.d <= C.SNAP) v *= dragging ? C.DRAG_SLOW : C.SNAP_SLOW;
        G.o[k] = Math.min(A.max, Math.max(A.min, G.o[k] + v));
        p.vx = 0;
        return;
      }
      if (G.pushing) {       // 松手：吸上去或取整
        const k = G.sel, s = G.settle(k, G.o[k]);
        const snapped = s !== rnd(G.o[k]) || Math.abs(s - G.o[k]) > 1e-9;
        G.o[k] = s; G.pushing = false; G.pushDir = 0;
        emit('settle', [k, snapped]);
        // 退一步如果什么都没变，就不占一格
        const top = G.undo[G.undo.length - 1];
        if (top && top.o[k] === G.o[k]) G.undo.pop();
      }
      if (inp.push) { p.vx = 0; return; }   // 按住 Shift 不走

      // ---- 走、跳、落（都在自己这一层的层内坐标里算）
      const lay = S.layers[p.L];
      if (inp.dir) p.face = inp.dir;
      if (p.ground) {
        if (inp.jump) {
          p.ground = false; p.vy = -C.HOP; p.vx = inp.dir * C.WALK; p.coyote = 0; emit('hop');
        } else {
          p.vx = inp.dir * C.WALK;
          let nx = p.x + p.vx;
          const a = G.line(), sp = G.span();
          if (nx > sp[1] || nx < sp[0]) {
            const dir = nx > sp[1] ? 1 : -1;
            const t = G.findTransfer(dir);
            if (t) {
              G.undo.push(snapshot());
              const over = dir > 0 ? nx - sp[1] : nx - sp[0];
              p.L = t.L; p.line = t.line; p.x = t.x + over;
              const b = G.line();
              p.x = Math.min(t.hi, Math.max(t.lo, p.x));
              p.y = yAt(b, p.x);
              emit('borrow', t.L);
            } else {
              p.x = nx; p.ground = false; p.vy = 0; p.coyote = C.COYOTE; emit('edge');
            }
          } else {
            p.x = nx; p.y = yAt(a, nx);
          }
        }
      }
      if (!p.ground) {
        if (inp.jump && p.coyote > 0 && p.vy >= 0) { p.vy = -C.HOP; p.coyote = 0; emit('hop'); }
        if (p.coyote > 0) p.coyote--;
        p.vx = inp.dir * C.WALK;
        const py = p.y;
        p.vy = Math.min(C.FALL_MAX, p.vy + C.GRAV);
        p.x += p.vx; p.y += p.vy;
        if (p.vy > 0) {
          for (let i = 0; i < lay.lines.length; i++) {
            const l = lay.lines[i];
            if (p.x < l.x1 || p.x > l.x2) continue;
            if (S.isTarget[p.L] && !G.pieces(p.L, i).some(q => p.x >= q[0] && p.x <= q[1])) continue;
            const ly = yAt(l, p.x);
            if (py <= ly + 0.001 && p.y >= ly) {
              p.y = ly; p.ground = true; p.vy = 0; p.line = i; emit('land');
              break;
            }
          }
        }
        if (!p.ground && p.y > C.FALL_Y) { G.bloom = C.BLOOM; emit('fall'); }
      }

      // ---- 落脚点、灯
      if (p.ground) {
        const sp = G.span();
        if (p.x >= sp[0] + 3 && p.x <= sp[1] - 3) { G.foot.L = p.L; G.foot.line = p.line; G.foot.x = p.x; }
        const lm = S.lamp;
        if (p.L === lm.layer && p.line === lm.line && Math.abs(p.x - lm.x) <= C.LAMP) { G.won = true; emit('win'); }
      }
    };

    // 给画面：某层现在的屏幕偏移（整数）
    G.screenOffset = k => (G.pushing && k === G.sel ? rnd(G.o[k]) : oi(k));
    return G;
  }

  const JJ = { C, Game, yAt, rnd, build };
  if (typeof module !== 'undefined') module.exports = JJ; else root.JJ = JJ;
})(this);
