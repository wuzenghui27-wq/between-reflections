# 借景 · Borrowed Scenery

Game Off 2026（主题 SHIFT）参赛作品。水墨像素风，320×180。整幅画卷分远、中、近三层，推动一层（Shift + ←→），让不同层的墨线在眼前接上，就能“借”过去。

- `core/core.js`：规则核心（网页试玩和求解器用）；`scripts/core.gd` 是逐行移植的 Godot 版。
- `core/solve.js`：验关求解器。`node core/solve.js` 验证每一景有解；`--nopush` / `--nocarry` / `--nohop` / `--lock=k` 验证去掉某条规则后无解；`--write` 写出回放用的 `data/plans.json`。
- `data/levels.json`：关卡；`data/art.json`：烘焙出的层图偏移。
- `tools/art.py`：全部美术用代码按 12 色调色板逐像素画出（索引色 PNG）；`tools/sfx.py`：音效全部代码合成。
- Godot：本目录就是 Godot 4 工程。回放核对：`godot --headless --path . --script res://scripts/test_plan.gd`（应输出 ALL SAME）。
- 网页试玩：`web/index.html`（需从 `jiejing/` 起一个静态服务器）。

操作：←→ 走，空格/↑ 跳，按住 Shift + ←→ 推当前层，Tab / Q / E 换层（或滚轮换层、按住鼠标拖），Z 退一步，R 重来。

没有使用任何外部素材；AI 参与了代码与美术生成，详见提交说明。
