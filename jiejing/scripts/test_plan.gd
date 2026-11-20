# 回放测试：用求解器（core/solve.js）找到的走法逐帧跑 Godot 版规则核心，每一景的最终状态必须和网页版一字不差。
# 用法：godot --headless --path jiejing --script res://scripts/test_plan.gd
extends SceneTree

const Core := preload("res://scripts/core.gd")

static func read_json(path: String):
	var f := FileAccess.open(path, FileAccess.READ)
	return JSON.parse_string(f.get_as_text())

func _init() -> void:
	var LV: Array = read_json("res://data/levels.json").levels
	var PL: Dictionary = read_json("res://data/plans.json")
	var ok := true
	for L in LV:
		if not PL.has(L.id):
			print("%s %s  没有解" % [L.id, L.name]); ok = false
			continue
		var G := Core.new(L)
		var frames := 0
		for r in PL[L.id].runs:
			for i in int(r[0]):
				G.step({"dir": int(r[1]), "jump": int(r[2]) != 0, "push": int(r[3]) != 0, "sel": int(r[4]) if i == 0 else -1, "undo": false})
				frames += 1
		var got := G.state_line()
		var want: String = PL[L.id].final
		var same := got == want
		print("%s %s  %d 帧  %s  %s" % [L.id, L.name, frames, got, "OK" if same else "DIFF（网页版 " + want + "）"])
		if not same:
			ok = false
	print("ALL SAME" if ok else "SOME DIFFER")
	quit(0 if ok else 1)
