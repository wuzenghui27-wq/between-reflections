// 把界面上要用的文字用缝合像素字体按原生 12 像素画成 1x 位图（不抗锯齿：只留全亮 / 全空两种像素），
// 存成 shared/art/text.png + shared/data/text.json，Unity 版直接贴图用（Godot 版直接用字体，结果一样）。
// 用法：node tools/bake_text.js .
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const dir = path.resolve(process.argv[2] || '.');
const D = JSON.parse(fs.readFileSync(path.join(dir, 'shared/data/rooms.json'), 'utf8'));
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六'];
const S = new Set(['倒影之间', '白天种下的因，夜里结成的果', '按任意键出发', '灯都亮了。', '暂停 · Esc 继续', '← → 走   空格 跳   Shift 换天   R 重来']);
D.rooms.forEach((r, i) => { S.add(r.name); S.add(r.line); S.add(`第${NUM[i]}景`); S.add(NUM[i].slice(0, 1)); });
D.regions.forEach(g => { S.add(`${g.no} · ${g.name}`); S.add(g.line); });
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  const font = fs.readFileSync(path.join(dir, 'shared/fonts/fusion-pixel-12.woff2')).toString('base64');
  await p.setContent(`<style>@font-face{font-family:FP;src:url(data:font/woff2;base64,${font}) format('woff2');}</style><div style="font-family:FP">.</div>`);
  const res = await p.evaluate(async list => {
    await document.fonts.load('12px FP');
    const items = [];
    for (const s of list) {
      const c = document.createElement('canvas'), k = c.getContext('2d');
      k.font = '12px FP'; const w = Math.ceil(k.measureText(s).width) + 2;
      c.width = w; c.height = 16; k.font = '12px FP'; k.fillStyle = '#fff'; k.textBaseline = 'alphabetic';
      k.fillText(s, 1, 12);
      const im = k.getImageData(0, 0, w, 16);
      for (let i = 3; i < im.data.length; i += 4) { const on = im.data[i] >= 128; im.data[i] = on ? 255 : 0; im.data[i - 1] = im.data[i - 2] = im.data[i - 3] = 255; }
      k.putImageData(im, 0, 0);
      items.push({ s, c });
    }
    const W = 512; let x = 0, y = 0; const map = {};
    for (const it of items) { if (x + it.c.width > W) { x = 0; y += 17; } it.x = x; it.y = y; x += it.c.width + 1; }
    const out = document.createElement('canvas'); out.width = W; out.height = y + 16;
    const o = out.getContext('2d');
    for (const it of items) { o.drawImage(it.c, it.x, it.y); map[it.s] = [it.x, it.y, it.c.width, 16]; }
    return { png: out.toDataURL(), map };
  }, [...S]);
  fs.writeFileSync(path.join(dir, 'shared/art/text.png'), Buffer.from(res.png.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(dir, 'shared/data/text.json'), JSON.stringify({ note: '每条字：[x, y, w, h]，基线在 y+12，文字左边留 1 像素。', baseline: 12, map: res.map }, null, 0) + '\n');
  console.log(Object.keys(res.map).length, 'strings');
  await b.close();
})();
