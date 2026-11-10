// 声音：全部由 Web Audio 实时合成。
// 音乐跟着旅人走过的路程打拍子（一拍 = CFG.BEAT_PX 像素），所以障碍永远落在鼓点上。
// 每个区域一种五声音阶与音色；夜里更柔、更空。
(function () {
  const KEY = 'between-reflections:sound';
  const CFG = RF.CFG;
  let ctx = null, master, musicBus, musicLP, delay, delayFb, delayWet, reverb, reverbWet, sfxBus, ambGain, ambLP;
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { }

  let night = false, nextIdx = null;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const PENTA = [0, 2, 4, 7, 9];                       // 宫 商 角 徵 羽
  const PROG = [0, 9, 5, 7];                           // I vi IV V
  // 区域：主音、音色、鼓的力度、是否有木鱼 / 锣
  const STYLE = {
    jiangnan: { root: 62, lead: 'pluck', kick: 0.06, wood: 0, gong: 0, seed: 1 },
    huizhou: { root: 67, lead: 'pluck', kick: 0.08, wood: 0.05, gong: 0, seed: 2 },
    karst: { root: 64, lead: 'marimba', kick: 0.08, wood: 0.03, gong: 0, seed: 3 },
    lingnan: { root: 60, lead: 'pluck', kick: 0.13, wood: 0.07, gong: 0.06, seed: 4 },
    danxia: { root: 57, lead: 'marimba', kick: 0.09, wood: 0, gong: 0.03, seed: 5 },
    tibet: { root: 65, lead: 'bell', kick: 0.06, wood: 0, gong: 0.04, seed: 6 }
  };

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 0.8 : 0; master.connect(ctx.destination);

    musicBus = ctx.createGain(); musicBus.gain.value = 0.34;
    musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 3200; musicLP.Q.value = 0.3;
    delay = ctx.createDelay(1.5); delay.delayTime.value = CFG.BEAT_SEC * 0.75;
    delayFb = ctx.createGain(); delayFb.gain.value = 0.3;
    delayWet = ctx.createGain(); delayWet.gain.value = 0.12;
    musicBus.connect(musicLP);
    musicBus.connect(delay); delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayWet); delayWet.connect(musicLP);
    musicLP.connect(master);

    reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8);
    }
    reverb.buffer = ir;
    reverbWet = ctx.createGain(); reverbWet.gain.value = 0.3;
    reverb.connect(reverbWet); reverbWet.connect(master);
    musicLP.connect(reverb);

    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    const send = ctx.createGain(); send.gain.value = 0.3; sfxBus.connect(send); send.connect(reverb);

    // 环境声：滤波噪声（白天像风与水，夜里更低沉）
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    ambLP = ctx.createBiquadFilter(); ambLP.type = 'lowpass'; ambLP.frequency.value = 700;
    ambGain = ctx.createGain(); ambGain.gain.value = 0;
    src.connect(ambLP); ambLP.connect(ambGain); ambGain.connect(master); src.start();
    ambGain.gain.setTargetAtTime(0.07, ctx.currentTime, 2);
  }

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  function tone(freq, t, o) {
    o = o || {};
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || 0.2));
    const g = ctx.createGain();
    env(g, t, o.a || 0.005, o.g || 0.1, o.d || 0.4);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + (o.a || 0.005) + (o.d || 0.4) + 0.05);
  }
  function noise(t, dur, g, freq, bus, q) {
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const gg = ctx.createGain(); env(gg, t, 0.002, g, dur);
    s.connect(f); f.connect(gg); gg.connect(bus || sfxBus); s.start(t);
  }
  // 乐器
  function lead(kind, m, t, g) {
    const f = mtof(m), bus = musicBus;
    if (kind === 'pluck') {            // 类似琵琶 / 古筝的拨弦
      tone(f, t, { type: 'triangle', g: g, d: 0.9, bus });
      tone(f * 2, t, { type: 'sine', g: g * 0.35, d: 0.35, bus });
      tone(f * 1.006, t, { type: 'sine', to: f, glide: 0.08, g: g * 0.3, d: 0.6, bus });
    } else if (kind === 'marimba') {
      tone(f, t, { g: g * 1.1, d: 0.5, bus }); tone(f * 4, t, { g: g * 0.12, d: 0.08, bus });
    } else {                           // 铃
      tone(f, t, { g: g * 0.8, d: 1.6, bus }); tone(f * 2.76, t, { g: g * 0.2, d: 0.7, bus }); tone(f * 5.4, t, { g: g * 0.06, d: 0.3, bus });
    }
  }
  function flute(m, t, g, dur) {
    const o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), gg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(m);
    v.frequency.value = 5.2; vg.gain.value = mtof(m) * 0.008; v.connect(vg); vg.connect(o.frequency);
    gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.12); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gg); gg.connect(musicBus); o.start(t); v.start(t); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05);
  }

  // 第 n 个八分音符
  function step(n, t, rid) {
    const S = STYLE[rid] || STYLE.jiangnan;
    const beat = n / 2, onBeat = n % 2 === 0, bar = Math.floor(beat / 4), bi = beat % 4;
    const chordRoot = S.root + PROG[bar % 4];
    const h = k => { const x = Math.sin((n + k) * 12.9898 + S.seed * 78.233) * 43758.5453; return x - Math.floor(x); };
    // 鼓：每拍一下，夜里更轻
    if (onBeat) {
      const kg = S.kick * (night ? 0.6 : 1) * (bi === 0 ? 1.3 : 1);
      tone(110, t, { to: 42, glide: 0.12, g: kg, d: 0.22, bus: musicBus });
    } else if (S.wood && !night) noise(t, 0.05, S.wood, 1800, musicBus, 6);
    if (S.gong && n % 32 === 0) { tone(mtof(S.root - 24), t, { g: S.gong, d: 2.4, bus: musicBus }); tone(mtof(S.root - 24) * 2.3, t, { g: S.gong * 0.4, d: 1.6, bus: musicBus }); }
    // 低音与和声垫
    if (n % 8 === 0) {
      tone(mtof(chordRoot - 24), t, { type: 'sine', a: 0.02, g: 0.09, d: CFG.BEAT_SEC * 3.6, bus: musicBus });
      const pg = night ? 0.035 : 0.02;
      [0, 7, 16].forEach(iv => tone(mtof(chordRoot - 12 + iv), t, { type: 'triangle', a: 0.5, g: pg, d: CFG.BEAT_SEC * 4, bus: musicBus }));
    }
    // 旋律：在五声音阶上随机游走（种子固定，每次经过同一段都一样）
    const r = h(0);
    if (r < (night ? 0.35 : 0.55)) {
      const deg = Math.floor(h(1) * 7) + (bi < 2 ? 0 : 2);
      const m = S.root + PENTA[deg % 5] + 12 * Math.floor(deg / 5) + (night ? 12 : 0);
      if (night) { if (onBeat && h(2) < 0.6) flute(m, t, 0.035, CFG.BEAT_SEC * 1.4); else lead('bell', m, t, 0.03); }
      else lead(S.lead, m, t, 0.06);
    }
  }

  const A = {
    get enabled() { return enabled; },
    init,
    unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    startMusic() { A.unlock(); },
    // 每帧调用：pos = 当前拍位置（可以是小数），playing = 旅人正在走
    tick(pos, playing, rid) {
      if (!ctx || ctx.state !== 'running') return;
      if (!playing) { nextIdx = null; return; }
      const p8 = pos * 2;
      if (nextIdx === null || Math.abs(nextIdx - p8) > 4) nextIdx = Math.ceil(p8);
      const ahead = 0.3 / CFG.BEAT_SEC * 2;
      while (nextIdx < p8 + ahead) {
        const t = ctx.currentTime + Math.max(0, (nextIdx - p8) / 2 * CFG.BEAT_SEC);
        step(nextIdx, t, rid);
        nextIdx++;
      }
    },
    pause() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setEnabled(v) {
      enabled = v;
      try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) { }
      if (ctx) master.gain.setTargetAtTime(v ? 0.8 : 0, ctx.currentTime, 0.05);
    },
    setNight(v) {
      night = v;
      if (!ctx) return;
      const t = ctx.currentTime;
      musicLP.frequency.setTargetAtTime(v ? 1900 : 3200, t, 0.08);
      reverbWet.gain.setTargetAtTime(v ? 0.55 : 0.3, t, 0.15);
      delayWet.gain.setTargetAtTime(v ? 0.3 : 0.12, t, 0.1);
      ambLP.frequency.setTargetAtTime(v ? 380 : 700, t, 0.3);
    },
    sfx(name, arg) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.005;
      switch (name) {
        case 'switch': {
          const up = !!arg.night;
          if (up) { tone(392, t, { to: 196, glide: 0.25, g: 0.06, d: 0.3 }); }
          else { tone(523, t, { to: 1046, glide: 0.2, g: 0.05, d: 0.3 }); }
          noise(t, 0.25, 0.05, up ? 600 : 2400, sfxBus, 0.7);
          if (arg.onBeat) [0, 4, 7].forEach((iv, k) => tone(mtof(72 + iv + (up ? -12 : 0)), t + k * 0.03, { type: 'triangle', g: 0.05, d: 0.7 }));
          break;
        }
        case 'jump': tone(300, t, { to: 520, glide: 0.12, g: 0.035, d: 0.14 }); break;
        case 'land': noise(t, 0.06, 0.04, 500, sfxBus, 1); break;
        case 'bell': [988, 1319, 1976].forEach((f, k) => tone(f, t + k * 0.04, { g: 0.06, d: 1.6 })); break;
        case 'lantern': [1568, 2093].forEach((f, k) => tone(f, t + k * 0.07, { type: 'triangle', g: 0.05, d: 0.5 })); break;
        case 'fail': tone(330, t, { to: 196, glide: 0.4, type: 'triangle', g: 0.07, a: 0.02, d: 0.6 }); break;
        case 'checkpoint': tone(784, t, { g: 0.035, d: 0.5 }); break;
        case 'region': [523, 659, 784, 1046].forEach((f, k) => tone(f, t + k * 0.16, { type: 'triangle', g: 0.04, a: 0.04, d: 1.2 })); break;
        case 'arrive': [261.6, 329.6, 392, 523.3, 659.3, 784].forEach((f, k) => tone(f, t + k * 0.14, { type: k < 2 ? 'sine' : 'triangle', a: 0.4, g: 0.05, d: 4 })); break;
        case 'ui': tone(880, t, { g: 0.03, d: 0.08 }); break;
      }
    }
  };
  RF.Audio = A;
})();
