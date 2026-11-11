// 唐朝旅人：幞头、圆领袍、乌皮靴。衣服与动作随天气变：
// 晴天手持书卷或一手背后，下雨撑油纸伞，起雾背手，起风袍角翻飞，下雪披红斗篷。
(function () {
  const C = RF.CFG, X = RF.FX, RG = RF.Regions;
  const P = C.PIX;

  function look(weather, regionIndex) {
    switch (weather) {
      case 'rain': return ['rain', 'umbrella'];
      case 'snow': return ['snow', 'cloak'];
      case 'fog': return ['fog', 'back'];
      case 'wind': return regionIndex % 2 ? ['wind', 'book'] : ['wind', 'back'];
      default: return regionIndex % 2 ? ['clear', 'back'] : ['clear', 'book'];
    }
  }

  // sx、foot 为逻辑坐标；o: { weather, region, state: run|air|idle, dist, alpha, night }
  function draw(sx, foot, o) {
    const [outfit, pose] = look(o.weather, o.region);
    let fr = 'idle';
    if (o.state === 'air') fr = 'jump';
    else if (o.state === 'run') fr = Math.floor(o.dist / 26) % 6;
    const a = RF.ATLAS[`t_${outfit}_${pose}_${fr}`];
    const img = o.night ? RG.spritesDim : RG.sprites;
    if (!a || !img) return;
    const c = X.ctx, x = Math.round(sx / P), y = Math.round(foot / P);
    c.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    c.drawImage(img, a[0], a[1], a[2], a[3], x - a[4], y - a[5] + 1, a[2], a[3]);
    c.globalAlpha = 1;
    if (o.night) X.glow(x, y - 10, 14, [190, 205, 255], 0.22 * (o.alpha || 1));
  }

  RF.Traveler = { draw, look };
})();
