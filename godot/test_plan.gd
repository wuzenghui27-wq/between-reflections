# 回放测试：用网页版求解器找到的走法跑 Godot 版逻辑，每一景的结果必须和网页版一致。
# 用法：godot --headless --path . --script res://godot/test_plan.gd
extends SceneTree

const LevelT := preload("res://godot/level.gd")
const GameT := preload("res://godot/game.gd")

func _init() -> void:
	var LV := LevelT.new()
	LV.load_all("res://shared/data/rules.json", "res://shared/data/rooms.json")
	var G := GameT.new(LV)
	var D: Dictionary = LevelT.read_json("res://shared/data/solve_plan.json")
	var ok := true
	for rp in D["rooms"]:
		var i: int = int(rp["room"])
		G.load_room(i)
		G.state = "running"
		var steps := 0
		var done := false
		for a in rp["plan"]:
			G.in_l = float(a[0]) < 0.0
			G.in_r = float(a[0]) > 0.0
			if int(a[1]) != 0:
				G.jump_buf = G.C["JUMP_BUFFER"]
			if int(a[2]) != 0:
				G.pending_switch = true
			for k in int(D["K"]):
				if G.state == "running":
					G.physics(1.0 / 60.0)
				steps += 1
				if G.room != i or G.state != "running":
					done = true
					break
			if done:
				break
		var ex: Dictionary = rp["expect"]
		var same := steps == int(ex["steps"]) and G.room == int(ex["room"]) and G.state == ex["state"] and absf(G.px - float(ex["px"])) < 0.01 and absf(G.foot - float(ex["foot"])) < 0.01
		print("景 %d %s  steps %d/%d  px %.4f/%.4f  foot %.4f/%.4f  %s" % [i + 1, LV.rooms[i].name, steps, int(ex["steps"]), G.px, float(ex["px"]), G.foot, float(ex["foot"]), "OK" if same else "DIFF"])
		if not same:
			ok = false
	print("ALL SAME" if ok else "SOME DIFFER")
	quit(0 if ok else 1)
