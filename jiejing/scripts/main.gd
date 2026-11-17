# 借景 · Godot 主场景：读关卡、按 60 帧一秒推进规则核心、画面、输入、音效（与 web/play.js 一一对应）。
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
var ATL: Dictionary = {}
var tex := {}
var G: Core
var li := 0
var level_t := 0
var next_t := -1
var shake := [0, 0, 0]
var flash = null
var bloom_at = null
var walk_dist := 0.0
var land_t := 0
var players := []
var sfx := {}
var note := 0
var guided := false
var guide_fade := 0

# 输入
var pressed := {}
var wheel_sel := 0
var drag = null

@onready var noise: Sprite2D = $Noise
@onready var ui: Node2D = $UI

const SAVE := "user://jiejing.cfg"

static func read_json(path: String):
	var f := FileAccess.open(path, FileAccess.READ)
	return JSON.parse_string(f.get_as_text())

func _ready() -> void:
	LV = read_json("res://data/levels.json").levels
	ART = read_json("res://data/art.json")
	ATL = read_json("res://data/atlas.json")
	for n in ["char_traveler", "props_architecture", "ui_ink_seals", "ui_titles", "paper_noise"]:
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
	var cfg := ConfigFile.new()
	if cfg.load(SAVE) == OK:
		guided = cfg.get_value("jiejing", "guided", false)
	noise.texture = tex.paper_noise
	ui.draw.connect(_draw_ui)
	start(0)

func start(i: int) -> void:
	li = posmod(i, LV.size())
	G = Core.new(LV[li])
	level_t = 0; next_t = -1; flash = null; bloom_at = null; land_t = 0

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
		# 视口按 320×180 处理过缩放，relative 已经是画面像素
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
	var dragv = null
	if drag != null:
		push = true; dir = 0
		dragv = drag.acc
		drag.acc = 0.0
	var jump := (not push) and (once(KEY_SPACE) or once(KEY_UP) or once(KEY_W))
	var undo := once(KEY_Z) or once(KEY_BACKSPACE)
	if once(KEY_R):
		start(li)
	if once(KEY_N):
		start(li + 1)
	if once(KEY_P):
		start(li - 1)
	pressed.clear()
	var inp := {"dir": dir, "jump": jump, "push": push, "sel": sel, "undo": undo}
	if dragv != null:
		inp.drag = dragv
	return inp

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
				land_t = 6; play("knock_lo")
			"fall":
				bloom_at = {"x": Core.rnd(G.p.x + G.o[G.p.L]), "y": minf(Core.H - 8, Core.rnd(G.p.y)), "t": 0}
				play("fall")
			"undo":
				play("knock_hi")
			"push":
				if not guided:
					guided = true; guide_fade = 30
					var cfg := ConfigFile.new()
					cfg.set_value("jiejing", "guided", true)
					cfg.save(SAVE)
			"win":
				next_t = 150; play("win")
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
	if land_t > 0:
		land_t -= 1
	if guide_fade > 0:
		guide_fade -= 1
	if next_t > 0:
		next_t -= 1
		if next_t == 0:
			start(li + 1)
	queue_redraw()
	ui.queue_redraw()

# ------------------------------------------------------------ 画
func guide_on() -> bool:
	return not guided and str(LV[li].id) == "1-1" and level_t > 180

func layer_x(k: int) -> int:
	var s := 0
	if shake[k] > 0:
		s = 1 if shake[k] % 4 < 2 else -1
	if guide_on() and k == G.sel and not G.pushing:
		var t := (level_t - 180) % 180
		if t < 60:
			s += int(Core.rnd(3.0 * sin(t / 60.0 * TAU)))
	return int(Core.rnd(G.o[k])) + s

func rect_of(sheet: String, name: String) -> Rect2:
	var r: Dictionary = ATL[sheet][name]
	return Rect2(r.x, r.y, r.w, r.h)

func spr(on: CanvasItem, t: Texture2D, src: Rect2, x: float, y: float, flip := false, a := 1.0) -> void:
	var dst := Rect2(x, y, src.size.x, src.size.y)
	if flip:
		dst = Rect2(x + src.size.x, y, -src.size.x, src.size.y)
	on.draw_texture_rect_region(t, dst, src, Color(1, 1, 1, a))

func traveler_frame() -> int:
	var p: Dictionary = G.p
	var T: Dictionary = ATL.char_traveler.frames
	if G.won:
		return int(T.bow)
	if G.pushing:
		return int(T.push)
	if not p.ground:
		return 12 if p.vy < -1 else (13 if p.vy <= 1 else 14)
	if land_t > 0:
		return 15
	if p.vx != 0:
		return 4 + (int(floor(walk_dist / 2.5)) % 8)
	return int(G.frame / 20) % 4

func px(x: float, y: float, c: Color) -> void:
	draw_rect(Rect2(x, y, 1, 1), c)

func draw_traveler() -> void:
	if G.bloom > 0:
		return
	var p: Dictionary = G.p
	var f := traveler_frame()
	var x := int(Core.rnd(p.x + G.o[p.L])) - 8
	var y := int(Core.rnd(p.y)) - 16
	spr(self, tex.char_traveler, Rect2((f % 8) * 16, (f >> 3) * 16, 16, 16), x, y, p.face < 0)

func draw_lamp() -> void:
	var lm: Dictionary = G.lamp
	var line: Dictionary = G.layers[lm.layer].lines[lm.line]
	var x := int(Core.rnd(lm.x + G.o[lm.layer]))
	var y := int(Core.rnd(Core.y_at(line, lm.x)))
	var P := "props_architecture"
	if G.won:
		spr(self, tex[P], rect_of(P, "halo"), x - 12, y - 30)
		spr(self, tex[P], rect_of(P, "lantern_on2" if ((G.won_t >> 3) & 1) != 0 else "lantern_on"), x - 8, y - 24)
		if G.won_t > 30:
			spr(self, tex.ui_ink_seals, rect_of("ui_ink_seals", "clear_seal"), x + 8, y - 30)
	else:
		spr(self, tex[P], rect_of(P, "lantern_off"), x - 8, y - 24)

# 第 k 层停在 v 时，屏幕上哪些端点正好对上（预光、吸附闪光画在这里）
func joints_at(k: int, v: float) -> Array:
	var save: float = G.o[k]
	var out := []
	G.o[k] = v
	var ends := []
	for j in 3:
		var oj: float = Core.rnd(G.o[j])
		for bi in G.layers[j].lines.size():
			var b: Dictionary = G.layers[j].lines[bi]
			for q in G.pieces(j, bi):
				ends.append([q[0] + oj, Core.y_at(b, q[0]), j, -1])
				ends.append([q[1] + oj, Core.y_at(b, q[1]), j, 1])
	for e in ends:
		if e[3] != 1:
			continue
		for f in ends:
			if f[3] == -1 and f[2] != e[2] and f[0] == e[0] and absf(e[1] - f[1]) <= 1.01 and (e[2] == k or f[2] == k or G.has_frames[k]):
				out.append({"x": e[0], "y": minf(e[1], f[1])})
	G.o[k] = save
	return out

func draw_glow() -> void:
	var k: int = G.sel
	if k < 0:
		return
	var o: float = G.o[k]
	var n := G.nearest_snap(k, o)
	if n[0] != null and n[1] >= 0.5 and n[1] <= Core.GLOW:
		var dx := int(Core.rnd(o - n[0]))
		for q in joints_at(k, n[0]):
			var a := mini(int(q.x), int(q.x) + dx)
			var b := maxi(int(q.x), int(q.x) + dx)
			var qy := int(Core.rnd(q.y))
			for x in range(a - 1, b + 2):
				if (x + (G.frame >> 2)) % 3 != 0:
					px(x, qy - 1, GOLD)
			px(q.x, qy - 3, GOLD); px(q.x, qy + 3, GOLD)
	if flash != null and not flash.borrow:
		var r: float = 18 - flash.t
		for q in joints_at(flash.k, Core.rnd(G.o[flash.k])):
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

# 一层：被框住的层只在框里画出来（按框的矩形裁切；框外由近层的粉墙挡住）
func draw_layer(L: Dictionary, A: Dictionary, k: int) -> void:
	var t: Texture2D = tex[L.id + "_L%d" % k]
	var X := layer_x(k) + int(A.layers[k].dx)
	var framed := false
	for f in L.get("frames", []):
		if int(f.target) != k:
			continue
		framed = true
		var fx := int(f.x1) + layer_x(int(f.layer))
		var rect := Rect2(fx, f.y1, f.x2 - f.x1, f.y2 - f.y1)
		var img := Rect2(X, 0, t.get_width(), t.get_height())
		var r := rect.intersection(img)
		if r.size.x > 0 and r.size.y > 0:
			draw_texture_rect_region(t, r, Rect2(r.position.x - X, r.position.y, r.size.x, r.size.y))
	if not framed:
		draw_texture(t, Vector2(X, 0))

func _draw() -> void:
	var L: Dictionary = LV[li]
	var A: Dictionary = ART.levels[L.id]
	draw_texture(tex[L.id + "_bg"], Vector2.ZERO)
	for k in 3:
		draw_layer(L, A, k)
		if int(L.lamp.layer) == k:
			draw_lamp()
		if G.p.L == k:
			draw_traveler()
	draw_glow()
	draw_bloom()

# 纸纹之上：选层提示、景名、引导、淡入淡出
func _draw_ui() -> void:
	var k: int = G.sel
	if k >= 0:
		var o := layer_x(k)
		for bi in G.layers[k].lines.size():
			var l: Dictionary = G.layers[k].lines[bi]
			for q in G.pieces(k, bi):
				for x in q:
					ui.draw_rect(Rect2(Core.rnd(x + o), Core.rnd(Core.y_at(l, x)) - 2, 1, 1), GOLD)
	if not G.pushable.is_empty():
		for i in 3:
			var can: bool = G.pushable.has(i)
			var on := i == k
			var c := RED if on else (INK3 if can else INK1)
			var w: int = [6, 9, 12][i]
			ui.draw_rect(Rect2(Core.W - 8 - w, 8 + i * 4, w, 2 if on else 1), c)
	# 景名
	if level_t <= 240:
		var a := level_t / 20.0 if level_t < 20 else ((240 - level_t) / 40.0 if level_t > 200 else 1.0)
		var T: Dictionary = ATL.ui_titles[LV[li].id]
		spr(ui, tex.ui_ink_seals, rect_of("ui_ink_seals", "title_seal"), 8, 8, false, a)
		ui.draw_texture_rect_region(tex.ui_titles, Rect2(36, 8, T.w, 16), Rect2(T.x, T.y, T.w, 16), Color(1, 1, 1, a))
		ui.draw_texture_rect_region(tex.ui_titles, Rect2(36, 21, T.w, 16), Rect2(T.x, T.y + 16, T.w, 16), Color(1, 1, 1, a))
	# 1-1 无字引导
	var ga := 0.0
	if guide_on():
		ga = minf(1.0, (level_t - 180) / 60.0) * 0.45
	elif guide_fade > 0:
		ga = guide_fade / 30.0 * 0.45
	if ga > 0:
		spr(ui, tex.ui_ink_seals, rect_of("ui_ink_seals", "icon_shift"), Core.W / 2 - 18, Core.H - 22, false, ga)
		spr(ui, tex.ui_ink_seals, rect_of("ui_ink_seals", "icon_swipe"), Core.W / 2 + 2, Core.H - 22, false, ga)
	if next_t >= 0 and next_t < 40:
		ui.draw_rect(Rect2(0, 0, Core.W, Core.H), Color(PAPER, (40 - next_t) / 40.0))
	if level_t < 30:
		ui.draw_rect(Rect2(0, 0, Core.W, Core.H), Color(PAPER, (30 - level_t) / 30.0))
