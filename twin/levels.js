// 十六景（先做第一站江南）。坐标见 core.js 开头：每一面 320×90，y = 90 是水面。
// 实心块 [x0, y0, x1, y1]；地面写到 90。
(function (root) {
  const G0 = 80;                       // 常用地面高度
  const ground = (x0, x1, y) => [x0, y === undefined ? G0 : y, x1, 90];
  const wall = (x0, x1, h, kind) => kind ? [x0, G0 - h, x1, G0, kind] : [x0, G0 - h, x1, G0];   // kind：'stall' 货摊（只管画法）          // 立在地面上的墙、货摊、门
  const LEVELS = [
    // 1 同行：一面有墙、一面没有。往右走，被墙挡住的那个停下，另一个接着走——借墙把两个人错开。
    { name: '同行', line: '水里的你，和你一起走', region: 'jiangnan', top: 'day', a: [20, G0], b: [20, G0],
      day: { solids: [ground(0, 320), wall(150, 166, 40)], lamp: 142 },
      night: { solids: [ground(0, 320)], lamp: 262 } },
    // 2 潮落：白天水涨，河当中过不去；夜里潮落，石板露出来。换面，让走得过去的那个去对岸。
    { name: '潮落', line: '夜里潮落，石板出水', region: 'jiangnan', top: 'day', a: [20, G0], b: [20, G0],
      day: { solids: [ground(0, 110), ground(190, 320), wall(96, 104, 44)], lamp: 280 },
      night: { solids: [ground(0, 320), ground(120, 180, G0 + 4)], lamp: 88 } },
    // 3 画舫：白天河上一条船来回；夜里没有河，两道墙。浮在上面的那一面船在走，沉到水下，船就停在那一刻的位置。
    //   先坐船把一个人送过河；船回到这岸时换面，让船停在这岸；另一个人上船，再换面，船载着她过去。
    { name: '画舫', line: '水上的船在走，水下的船停着', region: 'jiangnan', top: 'day', a: [20, G0], b: [20, G0],
      day: { solids: [ground(0, 100), ground(220, 320)], lamp: 284, movers: [{ x: 160, y: 82, w: 26, ax: 48, period: 5 }] },
      night: { solids: [ground(0, 320), wall(96, 104, 44), wall(290, 300, 44)], lamp: 284 } },
    // 4 夜市：白天货摊摆出来挡路，夜里收了；夜里潮落露出石板，白天是河。灯一盏在河对岸，一盏在货摊后面。
    { name: '夜市', line: '白天摆摊，夜里潮落', region: 'jiangnan', top: 'night', a: [16, G0], b: [16, G0],
      day: { solids: [ground(0, 130), ground(200, 320), wall(60, 72, 34, 'stall'), wall(250, 262, 34, 'stall')], lamp: 240 },
      night: { solids: [ground(0, 320), ground(130, 200, G0 + 3), wall(176, 184, 44)], lamp: 100 } },
  ];
  if (typeof module !== 'undefined') module.exports = LEVELS; else root.TW_LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
