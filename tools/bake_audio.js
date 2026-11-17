// 把网页版 Web Audio 实时合成的音乐和音效离线录成 .ogg，给 Godot / Unity 用（引擎里没有 Web Audio）。
// 音乐：每站白天、夜里各一段 64 拍（96 BPM，40 秒）的循环，白天和夜里节拍对齐，换天时两段同位交叉淡入；
// 混响尾巴折回开头，循环接缝不断。音效：每个一段。
// 用法：node tools/bake_audio.js .    （需要 Playwright 和 ffmpeg）
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { chromium } = require('playwright');
const dir = path.resolve(process.argv[2] || '.');
const OUT = path.join(dir, 'shared/audio');
const SR = 44100, BEATS = 64, TAIL = 4;
const SFX = ['switch_night', 'switch_day', 'jump', 'land', 'bell', 'lantern', 'gate', 'blocked', 'splash', 'region', 'arrive', 'step0', 'step1', 'ui', 'board', 'freeze'];

function serve() {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
  const srv = http.createServer((q, r) => {
    const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res(srv)));
}

// 页面里：把 AudioContext 换成离线的，录一段，返回两个声道的采样
async function render(page, job) {
  return page.evaluate(async ({ job, SR, BEATS, TAIL }) => {
    const A = RF.Audio, C = RF.CFG;
    const bs = C.BEAT_SEC, len = job.kind === 'music' ? BEATS * bs + TAIL : job.dur;
    window.__offline = new (class extends OfflineAudioContext { get state() { return 'running'; } })(2, Math.ceil(SR * len), SR);
    A.__reset && A.__reset();
    const ctx = A._ctx();
    if (job.kind === 'music') {
      A.setNight(job.night); A.setLayer(2);
      for (let n = 0; n < BEATS * 2; n++) A._step(n, n / 2 * bs, job.rid);
    } else {
      A.setNight(false); A.setLayer(2);
      A._step(0, 0, 'jiangnan');                 // 定下和弦与音色（切换、跳的音按当前和弦来）
      const name = job.name;
      if (name.startsWith('switch')) A.sfx('switch', { night: name === 'switch_night', onBeat: false });
      else if (name.startsWith('step')) A.sfx('step', +name.slice(4));
      else A.sfx(name);
    }
    const buf = await ctx.startRendering();
    const L = Array.from(buf.getChannelData(0)), R = Array.from(buf.getChannelData(1));
    return { L, R };
  }, { job, SR, BEATS, TAIL });
}

function wav(L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const cl = v => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) { b.writeInt16LE(cl(L[i]), 44 + i * 4); b.writeInt16LE(cl(R[i]), 46 + i * 4); }
  return b;
}
function ogg(L, R, name) {
  const tmp = path.join(os.tmpdir(), 'br_' + name + '.wav');
  fs.writeFileSync(tmp, wav(L, R));
  cp.execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '5', path.join(OUT, name + '.ogg')]);
  fs.unlinkSync(tmp);
}
// 去掉开头 / 结尾的静音（音效用）
function trim(L, R) {
  let e = L.length - 1;
  while (e > 0 && Math.abs(L[e]) < 1e-4 && Math.abs(R[e]) < 1e-4) e--;
  return [L.slice(0, e + 1 + 441), R.slice(0, e + 1 + 441)];
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage();
  await page.addInitScript(() => {
    // audio.js 里 new AudioContext() 时拿到的是我们准备好的离线 context
    window.AudioContext = function () { return window.__offline; };
  });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForFunction(() => RF.Audio && RF.Audio._step);
  // 每段都要一个新的 context：把 audio.js 的 ctx 清掉后重新 init
  await page.evaluate(() => {
    const A = RF.Audio;
    A.__reset = () => { A.__forceInit(); };
  });
  const regions = JSON.parse(fs.readFileSync(path.join(dir, 'shared/data/rooms.json'), 'utf8')).regions.map(r => r.id);
  const SRn = SR;
  const jobs = [];
  for (const rid of regions) for (const night of [false, true]) jobs.push({ kind: 'music', rid, night, name: `music_${rid}_${night ? 'night' : 'day'}` });
  for (const s of SFX) jobs.push({ kind: 'sfx', name: 'sfx_' + s, dur: 4 });
  for (const job of jobs) {
    let { L, R } = await render(page, job);
    if (job.kind === 'music') {
      const n = Math.round(BEATS * 60 / 96 * SRn);
      for (let i = n; i < L.length; i++) { L[i - n] += L[i]; R[i - n] += R[i]; }     // 尾巴折回开头
      L = L.slice(0, n); R = R.slice(0, n);
    } else[L, R] = trim(L, R);
    ogg(L, R, job.name);
    console.log(job.name, (L.length / SRn).toFixed(2) + 's');
  }
  await b.close(); srv.close();
})();
