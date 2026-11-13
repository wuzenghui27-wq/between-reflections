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
  BODY_H: 60,           // 角色碰撞高度
  PIX: 4,               // 一个像素格 = 4 个逻辑像素（画面内部 320×180，放大 4 倍）
  STEP_UP: 12,          // 不用跳就能迈上的高度

  WALK: 190,            // 走路速度（像素/秒）
  WALK_ACC: 2600,       // 地面上起步 / 刹住的加速度
  AIR_ACC: 1500,        // 空中左右调整的加速度
  FALL_MAX: 900,        // 最大下落速度

  GRAVITY: 1900,        // 重力（像素/秒²）
  JUMP_V: 640,          // 起跳速度 → 跳高约 108 像素，滞空约 0.67 秒
  JUMP_CUT: 0.45,       // 松开跳键时，还在上升就把速度砍到这个比例（轻点跳得低，按住跳得高）
  EAVE_V: 520,          // 飞檐升降的速度（像素/秒）
  SHIFT_HOP: 0.72,      // 空中翻面借力：再弹起的速度（相对起跳），约 55 像素
  COYOTE: 0.09,         // 离开地面后仍可起跳的时间
  JUMP_BUFFER: 0.12,    // 提前按跳的缓冲
  FALL_LIMIT: 790,      // 脚底低于此值算掉落

  SWITCH_WIPE: 0.42,    // 整页切换光波时长
  PREVIEW_AHEAD: 760,   // 另一面预告轮廓显示到角色前方多远
  FAIL_FADE: 0.55,      // 失误淡出
  READY: 0.9,           // 回到检查点后的准备时间
  REWIND_BEATS: 3,      // 失误后至少往回倒几拍
  REWIND_TIME: 0.6,     // 倒带画面的时长
  RESUME_READY: 0.8,    // 暂停后继续的准备时间
  INTRO_TIME: 3.0       // 开场文案停留
};
