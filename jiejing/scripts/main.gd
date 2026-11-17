# 借景 · Godot 主场景：读关卡、按 60 帧一秒推进规则核心、画面、输入、音效。
# 画面内部 320×180（project.godot 里整数倍放大 + 黑边），所有东西对齐整像素，最近邻，无 mipmap。
extends Node2D

const Core := preload("res://scripts/core.gd")

const GOLD := Color("E0A64A")
const RED := Color("B8352A")
const INK := Color("1B1A1F")
const INK3 := Color("55555C")
const INK1 := Color("B4AFA2")
const PAPER := Color("EFE8D8")

var LV: Array = []
var ART: Dictionary = {}
var tex := {}
var G: Core
var li := 0
var level_t := 0
var next_t := -1
var shake := [0, 0, 0]
var flash = null
var bloom_at = null
var walk_dist := 0.0
var players := []
var sfx := {}
var note := 0

# 输入
var pressed := {}
var wheel_sel := 0
var drag = null

@onready var noise: Sprite2D = $Noise
@onready var ui: Node2D = $UI

static func read_json(path: String):
	var f := FileAccess.open(path, FileAccess.READ)
	return JSON.parse_string(f.get_as_text())

func _ready() -> void:
	LV = read_json("res://data/levels.json").levels
	ART = read_json("res://data/art.json")
	for n in ["char_traveler", "props_lamp", "paper_noise"]:
		tex[n] = load("res://art/%s.png" % n)
	for L in LV:
		tex[L.id + "_bg"] = load("res://art/levels/%s_bg.png" % L.id)
		for k in 3:
			tex[L.id + "_L%d" % k] = load("res://art/levels/%s_L%d.png" % [L.id, k])
	for n in ["knock_hi", "knock_lo", "locked", "fall", "win"]:
		sfx[n] = load("res://audio/%s.wav" % n)
	for i in 8:
		sfx["pluck%d" % i] = load("res://audio/pluck%d.wav" % i)
	for i in 6:
		var p := AudioStreamPlayer.new()
		add_child(p)
		players.append(p)
	noise.texture = tex.paper_noise
	ui.draw.connect(_draw_ui)
	start(0)

func start(i: int) -> void:
	li = posmod(i, LV.size())
	G = Core.new(LV[li])
	level_t = 0; next_t = -1; flash = null; bloom_at = null

func play(n: String) -> void:
	if not sfx.has(n):
		return
	for p in players:
		if not p.playing:
			p.stream = sfx[n]; p.play()
			return
	players[0].stream = sfx[n]; players[0].play()

# ------------------------------------------------------------ 输入
func _input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo:
		pressed[e.physical_keycode] = true
	elif e is InputEventMouseButton:
		if e.pressed and e.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			wheel_sel += 1
		elif e.pressed and e.button_index == MOUSE_BUTTON_WHEEL_UP:
			wheel_sel -= 1
		elif e.button_index == MOUSE_BUTTON_LEFT:
			drag = {"acc": 0.0} if e.pressed else null
	elif e is InputEventMouseMotion and drag != null:
		# 换算成画面里的像素（视口已经按 320×180 处理过缩放）
		drag.acc += e.relative.x

func once(k: int) -> bool:
	var v: bool = pressed.get(k, false)
	pressed.erase(k)
	return v

func held(k: int) -> bool:
	return Input.is_physical_key_pressed(k)

func cycle_sel(d: int) -> int:
	var P: Array = G.pushable
	if P.is_empty():
		return -1
	var i: int = P.find(G.sel)
	return P[posmod(i + d, P.size())]

func read_input() -> Dictionary:
	var shift := held(KEY_SHIFT)
	var sel := -1
	if once(KEY_TAB) or once(KEY_E) or (shift and once(KEY_UP)):
		sel = cycle_sel(1)
	if once(KEY_Q) or (shift and once(KEY_DOWN)):
		sel = cycle_sel(-1)
	if wheel_sel != 0:
		sel = cycle_sel(1 if wheel_sel > 0 else -1)
		wheel_sel = 0
	var dir := int(held(KEY_RIGHT) or held(KEY_D)) - int(held(KEY_LEFT) or held(KEY_A))
	var push := shift
	if drag != null:
		push = true
		var sp: float = Core.PUSH[G.sel] if G.sel >= 0 else 0.5
		if absf(drag.acc) >= 0.5:
			dir = 1 if drag.acc > 0 else -1
			drag.acc -= dir * sp
		else:
			dir = 0
	var jump := (not push) and (once(KEY_SPACE) or once(KEY_UP) or once(KEY_W))
	var undo := once(KEY_Z) or once(KEY_BACKSPACE)
	if once(KEY_R):
		start(li)
	if once(KEY_N):
		start(li + 1)
	if once(KEY_P):
		start(li - 1)
	pressed.clear()
	return {"dir": dir, "jump": jump, "push": push, "sel": sel, "undo": undo}

# ------------------------------------------------------------ 每帧（物理帧 = 60 帧一秒）
func _physics_process(_dt: float) -> void:
	level_t += 1
	var inp := read_input()
	var before: float = G.p.x
	G.step(inp)
	for ev in G.events:
		var n: String = ev[0]
		var a = ev[1]
		match n:
			"locked":
				shake[a] = 8; play("locked")
			"settle":
				if a[1]:
					flash = {"t": 18, "k": a[0], "borrow": false}
					play("pluck%d" % [2, 4, 5, 6, 3][note % 5]); note += 1
				else:
					play("knock_lo")
			"borrow":
				flash = {"t": 14, "k": a, "borrow": true}
				play("pluck%d" % [0, 2, 4, 5, 7][note % 5]); note += 1
			"hop":
				play("knock_hi")
			"land":
				play("knock_lo")
			"fall":
				bloom_at = {"x": Core.rnd(G.p.x + G.o[G.p.L]), "y": minf(Core.H - 8, Core.rnd(G.p.y)), "t": 0}
				play("fall")
			"undo":
				play("knock_hi")
			"win":
				next_t = 120; play("win")
	walk_dist += absf(G.p.x - before)
	for k in 3:
		if shake[k] > 0:
			shake[k] -= 1
	if flash != null:
		flash.t -= 1
		if flash.t <= 0:
			flash = null
	if bloom_at != null:
		bloom_at.t += 1
	if next_t > 0:
		next_t -= 1
		if next_t == 0:
			start(li + 1)
	queue_redraw()
	ui.queue_redraw()

# ------------------------------------------------------------ 画
func layer_x(k: int) -> int:
	var s := 0
	if shake[k] > 0:
		s = 1 if shake[k] % 4 < 2 else -1
	return int(Core.rnd(G.o[k])) + s

func traveler_frame() -> int:
	var p: Dictionary = G.p
	if G.pushing:
		return 10 + ((G.frame >> 3) & 1)
	if not p.ground:
		return 8 if p.vy < 0 else 9
	if p.vx != 0:
		return 2 + (int(floor(walk_dist / 3.0)) % 6)
	return (G.frame >> 5) & 1

func px(x: float, y: float, c: Color) -> void:
	draw_rect(Rect2(x, y, 1, 1), c)

func draw_traveler() -> void:
	if G.bloom > 0:
		return
	var p: Dictionary = G.p
	var f := traveler_frame()
	var x := int(Core.rnd(p.x + G.o[p.L])) - 8
	var y := int(Core.rnd(p.y)) - 16
	var src := Rect2((f % 8) * 16, (f >> 3) * 16, 16, 16)
	if p.face < 0:
		draw_texture_rect_region(tex.char_traveler, Rect2(x + 16, y, -16, 16), src)
	else:
		draw_texture_rect_region(tex.char_traveler, Rect2(x, y, 16, 16), src)

func draw_lamp() -> void:
	var lm: Dictionary = G.lamp
	var line: Dictionary = G.layers[lm.layer].lines[lm.line]
	var x := int(Core.rnd(lm.x + G.o[lm.layer]))
	var y := int(Core.rnd(Core.y_at(line, lm.x)))
	if G.won:
		draw_texture_rect_region(tex.props_lamp, Rect2(x - 3, y - 29, 24, 24), Rect2(36, 0, 24, 24))
		var f := 1 + ((G.won_t >> 3) & 1)
		draw_texture_rect_region(tex.props_lamp, Rect2(x - 3, y - 28, 12, 28), Rect2(f * 12, 0, 12, 28))
	else:
		draw_texture_rect_region(tex.props_lamp, Rect2(x - 3, y - 28, 12, 28), Rect2(0, 0, 12, 28))

# 接缝点（与 core 的 snap_points 一样，多带接缝处的屏幕位置，给预光用）
func joints(k: int) -> Array:
	var out := []
	var A: Dictionary = G.layers[k]
	for j in 3:
		if j == k:
			continue
		var oj: float = Core.rnd(G.o[j])
		for a in A.lines:
			for b in G.layers[j].lines:
				var ar: Array = a.pts[a.pts.size() - 1]
				var al: Array = a.pts[0]
				var bl: Array = b.pts[0]
				var br: Array = b.pts[b.pts.size() - 1]
				if absf(ar[1] - bl[1]) <= 1.01:
					out.append({"s": bl[0] + oj - ar[0], "x": bl[0] + oj, "y": bl[1], "end": ar[0]})
				if absf(al[1] - br[1]) <= 1.01:
					out.append({"s": br[0] + oj - al[0], "x": br[0] + oj, "y": br[1], "end": al[0]})
	var res := []
	for q in out:
		if q.s >= A.min and q.s <= A.max:
			res.append(q)
	return res

func draw_glow() -> void:
	var k: int = G.sel
	if k < 0:
		return
	var o: float = G.o[k]
	for q in joints(k):
		var d := absf(q.s - o)
		if d > Core.GLOW or d < 0.5:
			continue
		var ex := Core.rnd(q.end + o)
		var a := minf(ex, q.x)
		var b := maxf(ex, q.x)
		for x in range(int(a) - 1, int(b) + 2):
			if (x + (G.frame >> 2)) % 3 != 0:
				px(x, q.y - 1, GOLD)
		px(q.x, q.y - 3, GOLD); px(q.x, q.y + 3, GOLD)
	if flash != null and not flash.borrow:
		for q in joints(flash.k):
			if q.s == Core.rnd(G.o[flash.k]):
				var r: float = 18 - flash.t
				for i in 8:
					var an := i * PI / 4.0
					px(Core.rnd(q.x + cos(an) * r * 0.4), Core.rnd(q.y - 1 + sin(an) * r * 0.3), GOLD)

func draw_bloom() -> void:
	if bloom_at == null:
		return
	var t: int = bloom_at.t
	if t > 40:
		bloom_at = null
		return
	var r := 2.0 + t * 0.35
	for i in 24:
		if (i + t) % 5 == 0:
			continue
		var an := i / 24.0 * TAU + (i % 3)
		var rr := r * (0.6 + ((i * 37) % 10) / 20.0)
		px(Core.rnd(bloom_at.x + cos(an) * rr), Core.rnd(bloom_at.y - 4 + sin(an) * rr * 0.6), INK)

func _draw() -> void:
	var L: Dictionary = LV[li]
	var A: Dictionary = ART.levels[L.id]
	draw_texture(tex[L.id + "_bg"], Vector2.ZERO)
	for k in 3:
		draw_texture(tex[L.id + "_L%d" % k], Vector2(layer_x(k) + int(A.layers[k].dx), 0))
		if int(L.lamp.layer) == k:
			draw_lamp()
		if G.p.L == k:
			draw_traveler()
	draw_glow()
	draw_bloom()

# 纸纹之上：选层提示、淡入淡出
func _draw_ui() -> void:
	var k: int = G.sel
	if k >= 0:
		var o := Core.rnd(G.o[k])
		for l in G.layers[k].lines:
			for pt in [l.pts[0], l.pts[l.pts.size() - 1]]:
				ui.draw_rect(Rect2(pt[0] + o, pt[1] - 2, 1, 1), GOLD)
	if not G.pushable.is_empty():
		for i in 3:
			var can: bool = G.pushable.has(i)
			var on := i == k
			var c := RED if on else (INK3 if can else INK1)
			ui.draw_rect(Rect2(8, 8 + i * 4, [6, 9, 12][i], 2 if on else 1), c)
	if next_t >= 0 and next_t < 40:
		ui.draw_rect(Rect2(0, 0, Core.W, Core.H), Color(PAPER, (40 - next_t) / 40.0))
	if level_t < 30:
		ui.draw_rect(Rect2(0, 0, Core.W, Core.H), Color(PAPER, (30 - level_t) / 30.0))
