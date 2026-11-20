// 把网页试玩版打成一个单文件 HTML（脚本、关卡数据、图片全部内联）。
// 用法：node jiejing/tools/single_html.js <输出路径>
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..'), out = process.argv[2] || path.join(R, 'build/jiejing.html');
const files = {};
const add = (rel) => { files['./' + rel] = rel.endsWith('.json') ? JSON.parse(fs.readFileSync(path.join(R, rel), 'utf8')) : 'data:image/png;base64,' + fs.readFileSync(path.join(R, rel)).toString('base64'); };
add('data/levels.json'); add('data/art.json'); add('data/atlas.json');
for (const f of fs.readdirSync(path.join(R, 'art'))) if (f.endsWith('.png')) add('art/' + f);
for (const f of fs.readdirSync(path.join(R, 'art/levels'))) if (f.endsWith('.png')) add('art/levels/' + f);
let play = fs.readFileSync(path.join(R, 'web/play.js'), 'utf8');
play = play.replace("const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(src); i.src = src; });",
  "const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(src); i.src = window.JJ_FILES[src]; });")
  .replace("const getJSON = u => fetch(u).then(r => r.json());", "const getJSON = u => Promise.resolve(window.JJ_FILES[u]);");
if (!play.includes('JJ_FILES[src]') || !play.includes('JJ_FILES[u]')) throw new Error('play.js 里的加载代码变了，替换没成功');
const core = fs.readFileSync(path.join(R, 'core/core.js'), 'utf8');
const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>借景 试玩</title>
<style>
  html, body { height: 100%; margin: 0; background: #000; overflow: hidden; }
  canvas { display: block; touch-action: none; image-rendering: pixelated; }
</style>
</head>
<body>
<canvas id="c" tabindex="0" aria-label="借景：←→ 走，空格跳，按住 Shift 加 ←→ 推层，Tab 换层，Z 退一步，R 重来"></canvas>
<script>window.JJ_FILES = ${JSON.stringify(files)};</script>
<script>
${core}
</script>
<script data-base=".">
${play}
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
