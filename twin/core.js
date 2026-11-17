// 倒影之间 · 新玩法“水上水下，两个你”的规则核心（不碰画面和声音，网页、求解器、引擎移植都以它为准）。
//
// 画面以水面为界分上下两半。上半是旅人 A，下半是她在水里的倒影 B；一套按键同时操纵两人。
// 每一景有两张布局：白天（day）和夜里（night）。A 在“上面那一面”，B 在“下面那一面”，永远一昼一夜。
// Shift：上下两面对调（A 进入另一面的布局，B 也是），两人位置不变；两人都要站稳，任何一人在新的一面里卡在实心东西里，就换不过去。
// 水上动、水下静：会动的机关只在浮在上面的那一面里走时间；沉到水下的那一面，时间停在沉下去的那一刻。
// 两人同时站在各自那一面的宫灯下（落地站稳），这一景就过了。掉进水里（掉出画面）就重来这一景。
//
// 坐标：每一面 320×90 像素，y 向下增大，y = 90 是水面；地面顶面一般在 76～86。B 的那一面画的时候上下翻过来，脚踩水面。
(function (root) {
  'use strict';
  const C = {
    W: 320, H: 90, STEP: 1 / 60,
    HALF_W: 2.5, BODY_H: 15, STEP_UP: 3,
    WALK: 47.5, WALK_ACC: 650, AIR_ACC: 375,
    GRAVITY: 475, JUMP_V: 160, FALL_MAX: 225,
    COYOTE: 0.09, JUMP_BUFFER: 0.12,
    FALL_LIMIT: 96,        // 脚低于这里就是掉进水里了
    LAMP_HW: 6,            // 站在灯下：离灯柱横向不超过这么多
    BOARD_H: 3,            // 机关踏板的厚度
  };
  const other = w => (w === 'day' ? 'night' : 'day');

  // ------------------------------------------------------------ 关卡 → 运行时对象
  // 关卡格式（像素）：
  // { name, line, top: 'day'|'night'（开场时浮在上面的一面）, a: [x, y], b: [x, y],
  //   day:   { solids: [[x0, y0, x1, y1], ...], lamp: x, movers: [...] },
  //   night: { ... } }
  // 实心块 [x0, y0, x1, y1]：y0 是顶面；地面写成一直到 90 的块。
  // 机关踏板 mover：{ x, y, w, ax, ay, period, phase }：踏板中心沿 (ax, ay) 的方向来回摆（正弦），一个周期 period 秒。
  function build(L) {
    const S = { name: L.name, line: L.line || '', top0: L.top || 'day', a0: L.a, b0: L.b, lay: {} };
    for (const w of ['day', 'night']) {
      const d = L[w] || {};
      S.lay[w] = {
        solids: (d.solids || []).map(s => ({ x0: s[0], y0: s[1], x1: s[2], y1: s[3], kind: s[4] || "" })),
        lamp: d.lamp,
        movers: (d.movers || []).map(m => ({ x: m.x, y: m.y, w: m.w, ax: m.ax || 0, ay: m.ay || 0, period: m.period || 4, phase: m.phase || 0, x0: 0, x1: 0, top: 0 }))
      };
    }
    return S;
  }

  function placeMovers(lay, clock) {
    for (const m of lay.movers) {
      const s = Math.sin(clock / m.period * Math.PI * 2 + m.phase);
      const cx = m.x + m.ax * s, cy = m.y + m.ay * s;
      m.x0 = cx - m.w / 2; m.x1 = cx + m.w / 2; m.top = cy;
    }
  }

  // ------------------------------------------------------------ 一局
  function Game(level) {
    const S = build(level);
    const G = { S, C, state: 'running', t: 0, top: S.top0, clock: { day: 0, night: 0 },
      inL: false, inR: false, jumpBuf: 0, pendingShift: false,
      blockedT: 0, shiftT: 9, winT: 0, lit: false, events: [] };
    const body = (p) => ({ x: p[0], y: p[1], vx: 0, vy: 0, ground: true, coyote: 0, face: 1, riding: null, landT: 9, walk: 0 });
    G.reset = function () {
      G.top = S.top0; G.clock.day = 0; G.clock.night = 0;
      G.A = body(S.a0); G.B = body(S.b0);
      G.state = 'running'; G.jumpBuf = 0; G.pendingShift = false; G.lit = false; G.winT = 0;
      placeMovers(S.lay.day, 0); placeMovers(S.lay.night, 0);
    };
    G.worldOf = who => (who === 'A' ? G.top : other(G.top));
    G.reset();

    const emit = (n, a) => G.events.push([n, a]);

    // 这一面里，横向 [l, r]、纵向 [top, bot] 的方块碰到哪个实心东西（踏板是薄板，只能从上面站，不挡身子）
    function hitSolid(lay, l, r, top, bot) {
      for (const s of lay.solids) if (r > s.x0 && l < s.x1 && bot > s.y0 && top < s.y1) return s;
      return null;
    }
    function bodyHit(lay, x, y) { return hitSolid(lay, x - C.HALF_W, x + C.HALF_W, y - C.BODY_H, y); }

    // 脚下 y 处有没有东西托着（顶面正好在 y），返回托着的东西
    function support(lay, x, y) {
      const l = x - C.HALF_W, r = x + C.HALF_W;
      for (const s of lay.solids) if (r > s.x0 && l < s.x1 && Math.abs(s.y0 - y) < 0.01) return s;
      for (const m of lay.movers) if (r > m.x0 && l < m.x1 && Math.abs(m.top - y) < 0.6) return m;
      return null;
    }

    // ------------------------------------------------------------ 输入
    G.input = { move(dir, down) { if (dir < 0) G.inL = down; else G.inR = down; },
      jump() { G.jumpBuf = C.JUMP_BUFFER; }, shift() { G.pendingShift = true; } };

    // ------------------------------------------------------------ 一个人走一步
    function stepBody(b, lay, dt, want, jump) {
      // 跳
      if (jump && (b.ground || b.coyote > 0)) { b.vy = -C.JUMP_V; b.ground = false; b.coyote = 0; b.riding = null; b.jumped = true; }
      // 站在踏板上：跟着踏板走
      if (b.ground && b.riding) {
        const m = b.riding, cx = (m.x0 + m.x1) / 2;
        if (b.rideDx !== undefined) {
          const nx = Math.max(C.HALF_W, Math.min(C.W - C.HALF_W, cx + b.rideDx));
          if (!bodyHit(lay, nx, m.top)) { b.x = nx; b.y = m.top; }
        }
      }
      // 横向
      const tv = want * C.WALK, acc = (b.ground ? C.WALK_ACC : C.AIR_ACC) * dt;
      b.vx = Math.abs(tv - b.vx) <= acc ? tv : b.vx + Math.sign(tv - b.vx) * acc;
      if (want) b.face = want;
      if (b.vx !== 0) {
        let nx = b.x + b.vx * dt;
        nx = Math.max(C.HALF_W, Math.min(C.W - C.HALF_W, nx));
        const s = bodyHit(lay, nx, b.y);
        if (!s) b.x = nx;
        else if (b.ground && s.y0 >= b.y - C.STEP_UP && !bodyHit(lay, nx, s.y0)) { b.x = nx; b.y = s.y0; }
        else {
          // 撞墙：贴着墙停下（两个人就是靠这一下错开、对齐的）
          b.x = b.vx > 0 ? s.x0 - C.HALF_W : s.x1 + C.HALF_W;
          b.vx = 0;
        }
        if (b.ground) b.walk += Math.abs(b.vx * dt);
      }
      // 纵向
      if (b.ground) {
        const sp = support(lay, b.x, b.y);
        if (sp) { b.riding = sp.period !== undefined ? sp : null; if (b.riding) b.y = sp.top; }
        else { b.ground = false; b.riding = null; b.coyote = C.COYOTE; b.vy = 0; }
      }
      if (!b.ground) {
        b.coyote = Math.max(0, b.coyote - dt);
        b.vy = Math.min(C.FALL_MAX, b.vy + C.GRAVITY * dt);
        const ny = b.y + b.vy * dt;
        if (b.vy > 0) {
          let land = Infinity, on = null;
          const l = b.x - C.HALF_W, r = b.x + C.HALF_W;
          for (const s of lay.solids) if (r > s.x0 && l < s.x1 && s.y0 >= b.y - 0.01 && s.y0 <= ny && s.y0 < land) { land = s.y0; on = null; }
          for (const m of lay.movers) if (r > m.x0 && l < m.x1 && m.top >= b.y - 0.01 - 4 && m.top <= ny + 0.01 && m.top < land) { land = m.top; on = m; }
          if (land !== Infinity) { b.y = land; b.vy = 0; b.ground = true; b.riding = on; b.landT = 0; b.landed = true; }
          else b.y = ny;
        } else {
          const s = hitSolid(lay, b.x - C.HALF_W, b.x + C.HALF_W, ny - C.BODY_H, b.y - C.BODY_H);
          if (s) { b.y = s.y1 + C.BODY_H; b.vy = 0; } else b.y = ny;
        }
      }
      b.rideDx = b.riding ? b.x - (b.riding.x0 + b.riding.x1) / 2 : undefined;
    }

    // ------------------------------------------------------------ 换面
    function tryShift() {
      // 两人都站稳了才换得过去（不能在半空里连按换面“踩着两面”过河）
      if (!G.A.ground || !G.B.ground) { G.blockedT = 0.35; emit('blocked', 'air'); return; }
      const wa = other(G.top), wb = G.top;          // A 将进入的那一面、B 将进入的那一面
      const fit = (b, w) => {
        const lay = S.lay[w], s = bodyHit(lay, b.x, b.y);
        if (!s) return { y: b.y };
        if (s.y0 >= b.y - C.STEP_UP && !bodyHit(lay, b.x, s.y0)) return { y: s.y0 };
        return null;
      };
      const fa = fit(G.A, wa), fb = fit(G.B, wb);
      if (!fa || !fb) { G.blockedT = 0.35; emit('blocked', !fa ? 'A' : 'B'); return; }
      G.A.y = fa.y; G.B.y = fb.y;
      for (const b of [G.A, G.B]) { b.riding = null; b.rideDx = undefined; }
      G.top = wa;
      G.shiftT = 0;
      emit('shift', G.top);
    }

    // ------------------------------------------------------------ 一步（固定 1/60 秒）
    G.step = function (dt) {
      dt = dt || C.STEP;
      G.t += dt; G.shiftT += dt;
      if (G.blockedT > 0) G.blockedT -= dt;
      for (const b of [G.A, G.B]) b.landT += dt;
      if (G.state === 'won') { G.winT += dt; return; }
      if (G.state === 'failing') { G.winT += dt; if (G.winT > 0.45) { G.reset(); emit('retry'); } return; }
      if (G.pendingShift) { G.pendingShift = false; tryShift(); }
      // 水上动、水下静
      G.clock[G.top] += dt;
      placeMovers(S.lay[G.top], G.clock[G.top]);
      const want = (G.inR ? 1 : 0) - (G.inL ? 1 : 0);
      let jump = false;
      if (G.jumpBuf > 0) {
        G.jumpBuf -= dt;
        if ((G.A.ground || G.A.coyote > 0) || (G.B.ground || G.B.coyote > 0)) { jump = true; G.jumpBuf = 0; }
      }
      G.A.jumped = G.B.jumped = G.A.landed = G.B.landed = false;
      stepBody(G.A, S.lay[G.worldOf('A')], dt, want, jump);
      stepBody(G.B, S.lay[G.worldOf('B')], dt, want, jump);
      if (G.A.jumped || G.B.jumped) emit('jump');
      if (G.A.landed || G.B.landed) emit('land');
      if (G.A.y > C.FALL_LIMIT || G.B.y > C.FALL_LIMIT) { G.state = 'failing'; G.winT = 0; emit('fail', G.A.y > C.FALL_LIMIT ? 'A' : 'B'); return; }
      // 两人同时站在各自那一面的灯下
      const under = (b, w) => { const lx = S.lay[w].lamp; return lx !== undefined && b.ground && Math.abs(b.x - lx) <= C.LAMP_HW; };
      const ua = under(G.A, G.worldOf('A')), ub = under(G.B, G.worldOf('B'));
      G.underA = ua; G.underB = ub;
      if (ua && ub) { G.state = 'won'; G.winT = 0; G.lit = true; emit('win'); }
    };

    // 求解器用：存档 / 读档
    G.snap = function () {
      const cp = b => [b.x, b.y, b.vx, b.vy, b.ground, b.coyote, b.riding ? S.lay.day.movers.indexOf(b.riding) + ':' + S.lay.night.movers.indexOf(b.riding) : '', b.rideDx];
      return [G.top, G.clock.day, G.clock.night, cp(G.A), cp(G.B), G.state, G.jumpBuf];
    };
    G.load = function (s) {
      G.top = s[0]; G.clock.day = s[1]; G.clock.night = s[2];
      placeMovers(S.lay.day, G.clock.day); placeMovers(S.lay.night, G.clock.night);
      const ld = (b, a, w) => {
        b.x = a[0]; b.y = a[1]; b.vx = a[2]; b.vy = a[3]; b.ground = a[4]; b.coyote = a[5]; b.rideDx = a[7];
        b.riding = null;
        if (a[6]) { const [di, ni] = a[6].split(':').map(Number); b.riding = di >= 0 ? S.lay.day.movers[di] : S.lay.night.movers[ni]; }
      };
      ld(G.A, s[3]); ld(G.B, s[4]); G.state = s[5]; G.jumpBuf = s[6]; G.pendingShift = false;
    };
    return G;
  }

  const TW = { C, Game, build, other };
  if (typeof module !== 'undefined') module.exports = TW; else root.TW = TW;
})(typeof window !== 'undefined' ? window : globalThis);
