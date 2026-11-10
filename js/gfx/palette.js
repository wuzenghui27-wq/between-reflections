// 配色：现实世界随旅程从午后金光走到黄昏、星夜；梦境按三种氛围混合。
// 方向：柔和的大面积渐变、空气透视（越远越接近天空色）、少量高亮的暖光与冷光。
(function () {
  const U = RF.U, P = U.palette;

  // 现实：sky0 = 天空上缘（靠湖面分界），sky1 = 地平线附近
  const REAL = {
    day: P({
      sky0: '#F4C9A8', sky1: '#FFF0D9', sun: '#FFF6E4', sunGlow: '#FFD59A',
      far: '#EBCDB9', mid: '#D7AE9C', near: '#B69087', fog: '#FBE5CC',
      meadow: '#9DAE8E', meadowHi: '#E9E0B4', tree: '#7F9A83', treeHi: '#D9E3B6', treeShade: '#5F7A6C',
      path: '#D9BC9A', pathHi: '#FFF3DD', pathShade: '#9A7A65',
      water: '#C7B3A6', waterDeep: '#8F8193', ink: '#2E2433', rim: '#FFE7BF', mote: '#FFE2A8'
    }),
    dusk: P({
      sky0: '#E58E86', sky1: '#FFD3A0', sun: '#FFE7C2', sunGlow: '#FFB077',
      far: '#E1A8A6', mid: '#C48A98', near: '#9C6F86', fog: '#F9C8A6',
      meadow: '#8C8A86', meadowHi: '#F2C9A0', tree: '#77707F', treeHi: '#F0BE98', treeShade: '#56506A',
      path: '#C9A08C', pathHi: '#FFE1C2', pathShade: '#86636A',
      water: '#C08E97', waterDeep: '#7A5F7E', ink: '#2A1F30', rim: '#FFD0A0', mote: '#FFC890'
    }),
    night: P({
      sky0: '#1A1F45', sky1: '#3E3C73', sun: '#F7EFD2', sunGlow: '#9FB2F0',
      far: '#353C6F', mid: '#2B3060', near: '#222651', fog: '#454884',
      meadow: '#262B55', meadowHi: '#7B86C9', tree: '#20264B', treeHi: '#7180C2', treeShade: '#171B3A',
      path: '#5A5784', pathHi: '#B9C3F2', pathShade: '#2F2D56',
      water: '#2A3062', waterDeep: '#141834', ink: '#0F0D1E', rim: '#C8D4FF', mote: '#CFE0FF'
    })
  };

  // 梦境：sky0 = 靠湖面分界（屏幕中线），sky1 = 梦境地面一侧
  const DREAM = {
    A: P({
      sky0: '#7385D0', sky1: '#1D2660', far: '#8E8FD6', cloud: '#C9CBF5', cloudHi: '#F6F2FF', cloudShade: '#6C70B8',
      tree: '#5562A8', treeHi: '#A6F0E0', treeShade: '#2F3878', path: '#93A6E6', pathHi: '#D9FFF6', pathShade: '#46549A',
      water: '#2B3577', waterDeep: '#121844', glow: '#9EF0E1', gold: '#FFE3A3', ink: '#1B1E44', rim: '#B9FFF0', mote: '#BFF6EC'
    }),
    B: P({
      sky0: '#9A78CE', sky1: '#211A58', far: '#B49BE0', cloud: '#D9C6F4', cloudHi: '#FFF4FF', cloudShade: '#7A62B4',
      tree: '#6B54A8', treeHi: '#F2D2FF', treeShade: '#3A2C72', path: '#A79AE0', pathHi: '#F3E6FF', pathShade: '#51448F',
      water: '#2D2468', waterDeep: '#130F3C', glow: '#E9C8FF', gold: '#FFE3A3', ink: '#1C1640', rim: '#F2DDFF', mote: '#EBD4FF'
    }),
    C: P({
      sky0: '#3A3F8E', sky1: '#070A26', far: '#4B4F99', cloud: '#5D63AE', cloudHi: '#C8CFFF', cloudShade: '#2C3070',
      tree: '#2E3477', treeHi: '#FFE3A3', treeShade: '#161A48', path: '#6E7CC4', pathHi: '#FFF1C8', pathShade: '#2C3373',
      water: '#121640', waterDeep: '#05071C', glow: '#FFE3A3', gold: '#FFE7AE', ink: '#0B0C26', rim: '#FFF0C8', mote: '#FFF0C8'
    })
  };

  // f = 旅程进度 0..1
  function real(f) {
    if (f < 0.25) return REAL.day;
    if (f < 0.55) return U.mixPalette(REAL.day, REAL.dusk, U.smooth((f - 0.25) / 0.3));
    if (f < 0.8) return U.mixPalette(REAL.dusk, REAL.night, U.smooth((f - 0.55) / 0.25));
    return REAL.night;
  }
  function dream(moodW) {
    return U.blendPalettes([[DREAM.A, moodW.A], [DREAM.B, moodW.B], [DREAM.C, moodW.C]]);
  }

  RF.Palette = { real, dream, REAL, DREAM };
})();
