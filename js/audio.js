// 声音：全部由 Web Audio 实时合成，不使用外部音频文件。
// 一段轻柔循环音乐 + 湖水环境声 + 反馈音；梦境时音色更亮、带回声。
(function () {
  const KEY = 'between-reflections:sound';
  let ctx = null, master, musicBus, musicLP, delay, delayFb, delayWet, sfxBus, ambGain, ambBP;
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 无痕模式等 */ }

  let schedTimer = null, nextBeat = 0, beat = 0, dream = false, musicOn = false;
  const BEAT = 0.82;
  // C 大调五声 —— 和弦进行 I - vi - IV - V(sus)
  const CHORDS = [
    [48, 55, 64, 67],
    [45, 52, 60, 64],
    [41, 48, 57, 64],
    [43, 50, 59, 62]
  ];
  const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);

    musicBus = ctx.createGain(); musicBus.gain.value = 0.32;
    musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 1700; musicLP.Q.value = 0.3;
    delay = ctx.createDelay(1.5); delay.delayTime.value = BEAT * 0.75;
    delayFb = ctx.createGain(); delayFb.gain.value = 0.35;
    delayWet = ctx.createGain(); delayWet.gain.value = 0.12;
    musicBus.connect(musicLP);
    musicBus.connect(delay); delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayWet); delayWet.connect(musicLP);
    musicLP.connect(master);

    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);

    // 湖水环境声：滤波噪声 + 慢速起伏
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    ambBP = ctx.createBiquadFilter(); ambBP.type = 'lowpass'; ambBP.frequency.value = 600;
    ambGain = ctx.createGain(); ambGain.gain.value = 0.0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.05;
    lfo.connect(lfoAmt); lfoAmt.connect(ambGain.gain);
    src.connect(ambBP); ambBP.connect(ambGain); ambGain.connect(master);
    src.start(); lfo.start();
    ambGain.gain.setTargetAtTime(0.09, ctx.currentTime, 2);
  }

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }

  function tone(freq, t, opt) {
    opt = opt || {};
    const o = ctx.createOscillator();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + (opt.glide || 0.25));
    const g = ctx.createGain();
    env(g, t, opt.a || 0.01, opt.g || 0.1, opt.d || 0.5);
    o.connect(g); g.connect(opt.bus || sfxBus);
    o.start(t); o.stop(t + (opt.a || 0.01) + (opt.d || 0.5) + 0.05);
  }

  // ---------------------------------------------------------------- 音乐
  function scheduleBeat(t, i) {
    const bar = Math.floor(i / 4) % CHORDS.length;
    const chord = CHORDS[bar];
    if (i % 4 === 0) {
      chord.forEach((m, k) => {
        tone(mtof(m), t, { type: k === 0 ? 'sine' : 'triangle', a: 1.1, g: k === 0 ? 0.09 : 0.045, d: BEAT * 4 + 0.6, bus: musicBus });
      });
    }
    // 轻柔的拨弦：按固定种子选择，保证每轮一致又不机械
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    if (r < 0.62) {
      const pool = PENTA.filter(m => chord.some(c => (m - c) % 12 === 0) || r < 0.25);
      const m = pool[Math.floor(r * 997) % pool.length] + (dream ? 12 : 0);
      tone(mtof(m), t + (r < 0.3 ? BEAT / 2 : 0), { type: 'sine', a: 0.008, g: dream ? 0.06 : 0.075, d: 1.4, bus: musicBus });
    }
  }
  function scheduler() {
    if (!ctx || !musicOn) return;
    while (nextBeat < ctx.currentTime + 0.4) {
      scheduleBeat(nextBeat, beat);
      nextBeat += BEAT; beat++;
    }
  }

  const A = {
    get enabled() { return enabled; },
    init,
    unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    startMusic() {
      init(); if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (musicOn) return;
      musicOn = true; nextBeat = ctx.currentTime + 0.1; beat = 0;
      schedTimer = setInterval(scheduler, 90);
    },
    pause() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setEnabled(on) {
      enabled = on;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { }
      if (ctx) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
    },
    setDream(on) {
      dream = on;
      if (!ctx) return;
      const t = ctx.currentTime;
      musicLP.frequency.setTargetAtTime(on ? 2800 : 1700, t, 0.15);
      delayWet.gain.setTargetAtTime(on ? 0.34 : 0.12, t, 0.15);
      ambBP.frequency.setTargetAtTime(on ? 1100 : 600, t, 0.3);
    },
    // ---------------------------------------------------------- 反馈音
    sfx(name, arg) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.005;
      switch (name) {
        case 'switch':
          if (arg) { tone(520, t, { to: 780, glide: 0.22, g: 0.07, d: 0.35 }); tone(780, t + 0.04, { to: 1170, glide: 0.2, g: 0.035, d: 0.35 }); }
          else { tone(780, t, { to: 520, glide: 0.22, g: 0.07, d: 0.35 }); tone(390, t + 0.04, { to: 330, glide: 0.2, g: 0.04, d: 0.35 }); }
          break;
        case 'plate':
          tone(659, t, { type: 'triangle', g: 0.09, d: 0.5 });
          tone(988, t + 0.09, { type: 'triangle', g: 0.07, d: 0.6 });
          break;
        case 'deploy':
          for (let k = 0; k < 5; k++) tone(880 + k * 110, t + k * 0.15, { g: 0.025, d: 0.18 });
          break;
        case 'bridge':
          [1047, 1319, 1568].forEach((f, k) => tone(f, t + k * 0.02, { g: 0.07, d: 1.4 }));
          tone(2093, t + 0.05, { g: 0.025, d: 1.0 });
          break;
        case 'fail':
          tone(392, t, { to: 262, glide: 0.5, type: 'triangle', g: 0.07, a: 0.04, d: 0.7 });
          break;
        case 'checkpoint':
          tone(784, t, { g: 0.04, d: 0.5 });
          break;
        case 'chapter':
          [523, 659, 784].forEach((f, k) => tone(f, t + k * 0.18, { type: 'triangle', g: 0.04, a: 0.05, d: 1.2 }));
          break;
        case 'arrive':
          [261.6, 329.6, 392, 493.9, 587.3, 784].forEach((f, k) =>
            tone(f, t + k * 0.12, { type: k < 2 ? 'sine' : 'triangle', a: 0.6, g: 0.06, d: 4.5 }));
          break;
        case 'ui':
          tone(880, t, { g: 0.03, d: 0.08 });
          break;
      }
    }
  };
  RF.Audio = A;
})();
