// 倒影之间 / Between Reflections
// 全局参数：对应 GDD 第 9 节参数表。修改数值后请重新走通全部关卡。
window.RF = window.RF || {};

RF.CFG = {
  W: 1280,              // 逻辑画面宽
  H: 720,               // 逻辑画面高
  SPEED: 100,           // 前进速度（逻辑像素/秒）
  PLAYER_SX: 320,       // 角色屏幕横向位置（约 25%）
  REAL_FOOT: 540,       // 现实脚底 y
  DREAM_FOOT: 180,      // 梦境脚底 y（与现实关于 y=360 镜像）
  MIRROR: 360,          // 湖面（两个世界的分界线）
  HALF_W: 14,           // 角色碰撞半宽
  BRIDGE_DEPLOY: 0.8,   // 桥展开时间（秒）
  FAIL_FADE: 0.6,       // 失误淡出（秒）
  READY: 1.0,           // 恢复后准备时间（秒）
  RESUME_READY: 0.8,    // 暂停继续后的准备时间（秒）
  INTRO_TIME: 3.2,      // 开场文案停留（秒）
  STEP: 1 / 60          // 固定逻辑步长
};
