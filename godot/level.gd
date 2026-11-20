# 关卡：读 shared/data/rooms.json 与 rules.json，搭成逻辑坐标（一像素 = SUB 个逻辑单位）。
# 与网页版 js/level.js 一一对应，逻辑完全一致，所以 test/solve.js 验证过的每一景在这里同样能走通。
extends RefCounted

class Obj:
	extends RefCounted
	var type := ""        # solid / hazard / crate
	var x0 := 0.0
	var x1 := 0.0
	var y := 0.0
	var y0 := 0.0
	var y1 := 0.0
	var w := "both"       # 属于哪一面
	var kind := ""
	var thin := false
	var eave := false
	var yd := 0.0
	var yn := 0.0
	var gate := ""
	var exit := false
	var style := ""
	var order := 0
	# 木箱
	var ix := 0.0
	var iy := 0.0
	var cw := 0.0
	var ch := 0.0
	var vy := 0.0
	var room := 0
	var wet := false
	var floating := false
	var tx := 0.0
	var has_tx := false

class Bell:
	extends RefCounted
	var id := ""
	var x := 0.0
	var y := 0.0
	var w := "both"
	var kind := "bell"

class Lantern:
	extends RefCounted
	var i := 0
	var x := 0.0
	var y := 0.0
	var w := "both"
	var room := 0

class Plate:
	extends RefCounted
	var id := ""
	var x := 0.0
	var y := 0.0
	var hw := 30.0
	var down := false

class Mover:
	extends RefCounted
	var kind := ""
	var style := ""
	var cx := 0.0
	var cy := 0.0
	var r := 0.0
	var amp := 0.0
	var period := 1.0
	var phase := 0.0
	var hw := 24.0
	var group := 0
	var w := "both"
	var x0 := 0.0
	var x1 := 0.0
	var y := 0.0
	var dir := 1
	var ang := 0.0
	var th := 0.0

class Room:
	extends RefCounted
	var i := 0
	var name := ""
	var line := ""
	var x0 := 0.0
	var x1 := 0.0
	var world := "day"
	var lamps: Array[int] = []
	var region := 0
	var sx := 0.0
	var sy := 0.0
	var exit_y := 0.0
	var exit := ""
	var hint := {}

const THIN := {"boat": true, "firefly": true, "ice": true, "plank": true, "eave": true, "moored": true}
const HZ := {
	"stall": [56, 100], "door": [40, 132], "gate": [36, 140], "drum": [60, 92], "beacon": [40, 112],
	"pile": [20, 90], "block": [32, 28], "rock": [40, 32], "shard": [40, 28], "mani": [44, 36], "yak": [70, 80]
}

var C := {}               # 规则（逻辑单位）
var regions: Array = []   # Dictionary：id no name line weathers x0 x1
var rooms: Array[Room] = []
var solids: Array[Obj] = []
var hazards: Array[Obj] = []
var crates: Array[Obj] = []
var eaves: Array[Obj] = []
var bells: Array[Bell] = []
var lanterns: Array[Lantern] = []
var plates: Array[Plate] = []
var movers: Array[Mover] = []
var total_x := 0.0

var _ox := 0.0
var _gate_n := 0
var _room: Room
var _order := 0

static func read_json(path: String) -> Variant:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("读不到 " + path)
		return null
	return JSON.parse_string(f.get_as_text())

func load_all(rules_path: String, rooms_path: String) -> void:
	var R: Dictionary = read_json(rules_path)
	var S: float = R["SUB"]
	C = {}
	for k in R.keys():
		C[k] = R[k]
	# 长度类换成逻辑单位
	for k in ["GROUND", "HALF_W", "BODY_H", "STEP_UP", "PUSH", "DRIFT", "CRATE", "FLOAT", "WALK", "WALK_ACC", "AIR_ACC", "FALL_MAX", "GRAVITY", "JUMP_V", "EAVE_V", "FALL_LIMIT"]:
		C[k] = float(R[k]) * S
	C["W"] = float(R["W"]) * S
	C["H"] = float(R["H"]) * S
	C["PIX"] = S
	C["BEAT_SEC"] = 60.0 / float(R["BPM"])
	var water := {}
	for rid in R["WATER"].keys():
		var wl: Dictionary = R["WATER"][rid]
		var o := {}
		for k in wl.keys():
			o[k] = float(wl[k]) * S if typeof(wl[k]) != TYPE_STRING else wl[k]
		water[rid] = o
	C["WATER"] = water
	build(read_json(rooms_path))

func _s(v) -> float:
	return float(v) * float(C["PIX"])

func build(D: Dictionary) -> void:
	_ox = 0.0
	_gate_n = 0
	_order = 0
	var drooms: Array = D["rooms"]
	for ri in drooms.size():
		var rm: Dictionary = drooms[ri]
		if ri == 0 or int(drooms[ri - 1]["region"]) != int(rm["region"]):
			var g: Dictionary = D["regions"][int(rm["region"])]
			if regions.size() > 0:
				regions[regions.size() - 1]["x1"] = _ox
			regions.append({"id": g["id"], "no": g["no"], "name": g["name"], "line": g["line"], "weathers": g["weathers"], "x0": _ox, "x1": INF})
		_begin_room(rm)
		if rm.has("hint"):
			_room.hint = rm["hint"]
		for it in rm["items"]:
			_item(it)
		_end_room()
	regions[regions.size() - 1]["x1"] = _ox
	total_x = _ox
	solids.sort_custom(func(a, b): return a.x0 < b.x0 or (a.x0 == b.x0 and a.order < b.order))
	hazards.sort_custom(func(a, b): return a.x0 < b.x0 or (a.x0 == b.x0 and a.order < b.order))

func _begin_room(rm: Dictionary) -> void:
	_room = Room.new()
	_room.i = rooms.size()
	_room.name = rm["name"]
	_room.line = rm.get("line", "")
	_room.x0 = _ox
	_room.x1 = _ox + float(C["W"])
	_room.world = rm["world"]
	_room.region = regions.size() - 1
	_room.sx = _ox + _s(rm["sx"])
	_room.sy = _s(rm["sy"])
	_room.exit_y = _s(rm["exitY"])

func _end_room() -> void:
	var eg := _box(1225.0, "both", "gate", _room.exit_y)
	eg.gate = "exit%d" % _room.i
	eg.exit = true
	eg.style = "bell"
	_room.exit = eg.gate
	rooms.append(_room)
	_ox += float(C["W"])

func _item(it: Dictionary) -> void:
	match it["t"]:
		"ground":
			_ground(_s(it["x0"]), _s(it["x1"]), _s(it["y"]), it["w"], it["kind"])
		"box":
			_box(_s(it["x"]), it["w"], it["kind"], _s(it["y"]))
		"lamp":
			var l := Lantern.new()
			l.i = lanterns.size()
			l.x = _ox + _s(it["x"])
			l.y = _s(it["y"]) - 34.0
			l.w = it["w"]
			l.room = rooms.size()
			lanterns.append(l)
			_room.lamps.append(l.i)
		"bellGate":
			_gate_n += 1
			var b := Bell.new()
			b.id = "g%d" % _gate_n
			b.x = _ox + _s(it["bx"])
			b.y = _s(it["by"])
			b.w = it["bw"]
			b.kind = it.get("kind", "bell")
			bells.append(b)
			var g := _box(_s(it["gx"]), "both", "gate", _s(it["gy"]))
			g.gate = b.id
			g.style = b.kind
		"crate":
			var s: float = C["CRATE"]
			var c := Obj.new()
			c.type = "crate"
			c.ix = _ox + _s(it["x"])
			c.iy = _s(it["y"])
			c.cw = s
			c.ch = s
			c.x0 = c.ix - s / 2.0
			c.x1 = c.ix + s / 2.0
			c.y0 = c.iy - s
			c.y1 = c.iy
			c.room = rooms.size()
			if it.has("tx") and it["tx"] != null:
				c.has_tx = true
				c.tx = _ox + _s(it["tx"])
			crates.append(c)
		"plateGate":
			_gate_n += 1
			var p := Plate.new()
			p.id = "p%d" % _gate_n
			p.x = _ox + _s(it["px"])
			p.y = _s(it["py"])
			plates.append(p)
			var g2 := _box(_s(it["gx"]), "both", "gate", _s(it["gy"]))
			g2.gate = p.id
			g2.style = "plate"
		"eave":
			var e := _ground(_s(it["x0"]), _s(it["x1"]), _s(it["yd"]), "both", "eave")
			e.eave = true
			e.yd = _s(it["yd"])
			e.yn = _s(it["yn"])
			eaves.append(e)
		"wheel":
			var gi := movers.size()
			var n: int = int(it["n"])
			for k in n:
				var m := Mover.new()
				m.kind = "wheel"
				m.style = it.get("style", "") if it.get("style") != null else ""
				m.cx = _ox + _s(it["cx"])
				m.cy = _s(it["cy"])
				m.r = _s(it["r"])
				m.period = float(it["period"])
				m.phase = float(k) / float(n) * PI * 2.0
				m.hw = _s(it["hw"])
				m.group = gi
				movers.append(m)
		"swing":
			var m2 := Mover.new()
			m2.kind = "swing"
			m2.cx = _ox + _s(it["cx"])
			m2.cy = _s(it["cy"])
			m2.r = _s(it["r"])
			m2.amp = float(it["amp"])
			m2.period = float(it["period"])
			m2.phase = float(it.get("phase", 0))
			m2.hw = _s(it["hw"])
			movers.append(m2)
		"drift":
			var m3 := Mover.new()
			m3.kind = "drift"
			m3.style = it.get("style", "") if it.get("style") != null else ""
			m3.cx = _ox + _s(it["cx"])
			m3.cy = _s(it["cy"])
			m3.amp = _s(it["amp"])
			m3.period = float(it["period"])
			m3.phase = float(it.get("phase", 0))
			m3.hw = _s(it["hw"])
			movers.append(m3)
		"deco":
			pass      # 陈设已经烘焙进底层图
		_:
			push_error("rooms.json: 不认识的东西 " + str(it["t"]))

func _ground(x0: float, x1: float, y: float, w: String, kind: String) -> Obj:
	var s := Obj.new()
	s.type = "solid"
	s.x0 = _ox + x0
	s.x1 = _ox + x1
	s.y = y
	s.w = w
	s.kind = kind
	s.thin = THIN.has(kind)
	s.order = _order
	_order += 1
	solids.append(s)
	return s

func _box(x: float, w: String, kind: String, base: float) -> Obj:
	var sz: Array = HZ[kind]
	var h := Obj.new()
	h.type = "hazard"
	h.x0 = _ox + x - float(sz[0]) / 2.0
	h.x1 = _ox + x + float(sz[0]) / 2.0
	h.y0 = base - float(sz[1])
	h.y1 = base
	h.w = w
	h.kind = kind
	h.order = _order
	_order += 1
	hazards.append(h)
	return h

func region_at(px: float) -> int:
	for i in range(regions.size() - 1, -1, -1):
		if px >= float(regions[i]["x0"]):
			return i
	return 0
