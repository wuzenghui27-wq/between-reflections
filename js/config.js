// 倒影之间 / Between Reflections · v0.3
// 全局参数。改动速度、节拍或跳跃后，请用 test/solve.js 重新验证全部关卡可以走通。
window.RF = window.RF || {};

RF.CFG = {
  W: 1280,              // 逻辑画面宽
  H: 720,               // 逻辑画面高
  STEP: 1 / 60,         // 固定逻辑步长

  BPM: 96,              // 音乐速度
  BEAT_PX: 120,         // 一拍对应的路程（逻辑像素）；速度 = BEAT_PX * BPM / 60
  get SPEED() { return this.BEAT_PX * this.BPM / 60; },   // 192 像素/秒
  get BEAT_SEC() { return 60 / this.BPM; },

  PLAYER_SX: 300,       // 角色在屏幕上的横向位置
  GROUND: 560,          // 默认地面高度（脚底 y）
  HALF_W: 10,           // 角色碰撞半宽
  BODY_H: 52,           // 角色碰撞高度
  STEP_UP: 12,          // 不用跳就能迈上的高度

  GRAVITY: 1900,        // 重力（像素/秒²）
  JUMP_V: 640,          // 起跳速度 → 跳高约 108 像素，滞空约 0.67 秒
  COYOTE: 0.09,         // 离开地面后仍可起跳的时间
  JUMP_BUFFER: 0.12,    // 提前按跳的缓冲
  FALL_LIMIT: 790,      // 脚底低于此值算掉落

  SWITCH_WIPE: 0.42,    // 整页切换光波时长
  PREVIEW_AHEAD: 760,   // 另一面预告轮廓显示到角色前方多远
  FAIL_FADE: 0.55,      // 失误淡出
  READY: 0.9,           // 回到检查点后的准备时间
  RESUME_READY: 0.8,    // 暂停后继续的准备时间
  INTRO_TIME: 3.0       // 开场文案停留
};
