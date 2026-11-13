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

  // sx、foot 为逻辑坐标；o: { weather, region, state: run|air|idle, dist, alpha, night, vy, landT, t }
  function draw(sx, foot, o) {
    const [outfit, pose] = look(o.weather, o.region);
    let fr;
    if (o.state === 'air') fr = (o.vy || 0) < 120 ? 'up' : 'fall';
    else if (o.state === 'run' && o.slide) fr = 'land';                    // 冰滑道上压低身子
    else if (o.state === 'run') fr = (o.landT !== undefined && o.landT < 0.09) ? 'land' : Math.floor(o.dist / 20) % 8;
    else fr = Math.floor((o.t || 0) / 0.7) % 4 === 3 ? 'idle1' : 'idle0';
    const a = RF.ATLAS[`t_${outfit}_${pose}_${fr}`];
    const img = o.night ? RG.spritesDim : RG.sprites;
    if (!a || !img) return;
    const c = X.ctx, x = Math.round(sx / P), y = Math.round(foot / P);
    c.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    let kx = 1, ky = 1;
    if (!o.still) {
      if (o.state === 'air' && (o.vy || 0) < -380) { kx = 0.9; ky = 1.1; }
      else if (o.state !== 'air' && o.landT !== undefined && o.landT < 0.11) { const k = 1 - o.landT / 0.11; kx = 1 + 0.14 * k; ky = 1 - 0.14 * k; }
    }
    if (o.flip || kx !== 1) {
      const w = Math.round(a[2] * kx), h = Math.round(a[3] * ky), ax = Math.round(a[4] * kx), ay = a[5] - (a[3] - h);
      c.save(); c.translate(x, 0); if (o.flip) c.scale(-1, 1);
      c.drawImage(img, a[0], a[1], a[2], a[3], -ax, y - ay, w, h); c.restore();
    }
    else c.drawImage(img, a[0], a[1], a[2], a[3], x - a[4], y - a[5], a[2], a[3]);
    c.globalAlpha = 1;
    if (o.night && !o.noGlow) X.glow(x, y - 12, 12, [190, 205, 255], 0.08 * (o.alpha || 1));
  }

  RF.Traveler = { draw, look };
})();
