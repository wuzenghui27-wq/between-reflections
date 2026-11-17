# 倒影之间 · Godot 版主场景：读共用数据、跑逻辑（固定 60 步/秒）、按 320×180 像素格画面。
# 画面全部来自 shared/art 里烘焙好的 1x 像素图；位置一律取整到像素；不做运行时缩放和旋转（左右镜像除外）。
extends Node2D

const LevelT := preload("res://godot/level.gd")
const GameT := preload("res://godot/game.gd")
const WIPE := preload("res://godot/wipe.gdshader")
const REFLECT := preload("res://godot/reflect.gdshader")
const PW := 320
const PH := 180
const NUM := ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"]
const INK := Color8(23, 19, 28)
const PAPER := Color8(246, 238, 220)
const CINNABAR := Color8(196, 50, 38)

var LV: LevelT
var G: GameT
var art: Dictionary
var P := 4.0
var tex := {}             # 路径 → Texture2D
var font: FontFile
var base_node: Node2D
var wipe_node: Sprite2D
var refl_nodes: Array[Sprite2D] = []   # 倒影：最多同时三景（换景时镜头滑过）
var refl_mask := {}       # "景,昼夜" → 水面遮罩
var top_node: Node2D
var glow_node: Node2D     # 光：加色叠加
var ui_node: Node2D       # 暗角、淡出、界面
var glows: Array = []     # [x, y, r, Color(0..1), a]
var vignette: Dictionary = {}
var acc := 0.0
var card_t := 99.0        # 题名卡计时
var card_room := 0
var start_at := 0
var autoplay := false     # --autoplay：按 shared/data/solve_plan.json 的走法自己走（录屏核对画面用）
var plan: Dictionary = {}
var plan_step := 0
var plan_room := -1
# 声音：每站白天、夜里各一段同长的循环，两条同时放，换天时只换音量（节拍不断）
var music := {}           # "day"/"night" → AudioStreamPlayer
var music_rid := ""
var sfx_pool: Array[AudioStreamPlayer] = []
var sfx_i := 0
var step_n := 0

func _ready() -> void:
	LV = LevelT.new()
	LV.load_all("res://shared/data/rules.json", "res://shared/data/rooms.json")
	P = LV.C["PIX"]
	art = LevelT.read_json("res://shared/data/art.json")
	G = GameT.new(LV)
	G.ev.connect(_on_ev)
	font = load("res://shared/fonts/fusion-pixel-12.woff2")
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--at="):
			start_at = int(a.substr(5))
		if a == "--autoplay":
			autoplay = true
	if autoplay:
		plan = LevelT.read_json("res://shared/data/solve_plan.json")
		G.start(start_at)
		G.begin_running()
	base_node = Node2D.new()
	add_child(base_node)
	base_node.draw.connect(_draw_base)
	for k in 3:
		var rs := Sprite2D.new()
		rs.centered = false
		rs.material = ShaderMaterial.new()
		rs.material.shader = REFLECT
		rs.visible = false
		add_child(rs)
		refl_nodes.append(rs)
	wipe_node = Sprite2D.new()
	wipe_node.centered = false
	wipe_node.material = ShaderMaterial.new()
	wipe_node.material.shader = WIPE
	wipe_node.visible = false
	add_child(wipe_node)
	top_node = Node2D.new()
	add_child(top_node)
	top_node.draw.connect(_draw_top)
	glow_node = Node2D.new()
	var gm := CanvasItemMaterial.new()
	gm.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	glow_node.material = gm
	add_child(glow_node)
	glow_node.draw.connect(_draw_glows)
	ui_node = Node2D.new()
	add_child(ui_node)
	ui_node.draw.connect(_draw_overlay)
	for w in ["day", "night"]:
		var mp := AudioStreamPlayer.new()
		mp.volume_db = -80.0
		add_child(mp)
		music[w] = mp
	for k in 8:
		var sp := AudioStreamPlayer.new()
		add_child(sp)
		sfx_pool.append(sp)
	vignette["day"] = _make_vignette(Color8(30, 20, 10), 0.2)
	vignette["night"] = _make_vignette(Color8(4, 6, 24), 0.5)

func T(path: String) -> Texture2D:
	if not tex.has(path):
		tex[path] = load("res://shared/art/" + path)
	return tex[path]

# 暗角：在 320×180 的格子上逐像素算好，做成一张图
func _make_vignette(col: Color, a: float) -> Texture2D:
	var im := Image.create(PW, PH, false, Image.FORMAT_RGBA8)
	var c := Vector2(PW / 2.0, PH / 2.0)
	for y in PH:
		for x in PW:
			var d := (Vector2(x + 0.5, y + 0.5) - c).length()
			var k := clampf((d - PH * 0.45) / (PH * 0.98 - PH * 0.45), 0.0, 1.0)
			im.set_pixel(x, y, Color(col.r, col.g, col.b, a * k))
	return ImageTexture.create_from_image(im)

# ------------------------------------------------------------ 输入
func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or event.echo:
		return
	var k: int = event.physical_keycode
	var down: bool = event.pressed
	if G.state == "title" or G.state == "ended":
		if down:
			G.start(start_at)
		return
	match k:
		KEY_LEFT, KEY_A:
			G.input_move(-1, down)
		KEY_RIGHT, KEY_D:
			G.input_move(1, down)
		KEY_SPACE, KEY_UP, KEY_W:
			if down:
				G.input_jump()
			else:
				G.input_jump_release()
		KEY_SHIFT:
			if down:
				G.input_switch()
		KEY_R:
			if down:
				G.input_retry()
		KEY_ESCAPE:
			if down:
				if G.state == "paused":
					G.resume()
				else:
					G.pause()

func sfx(name: String) -> void:
	var sp := sfx_pool[sfx_i]
	sfx_i = (sfx_i + 1) % sfx_pool.size()
	sp.stream = load("res://shared/audio/sfx_%s.ogg" % name)
	sp.play()

func _music_update() -> void:
	if G.state == "title":
		return
	var rid: String = LV.regions[LV.rooms[G.room].region]["id"]
	if rid != music_rid:
		music_rid = rid
		for w in ["day", "night"]:
			var st: AudioStreamOggVorbis = load("res://shared/audio/music_%s_%s.ogg" % [rid, w])
			st.loop = true
			music[w].stream = st
			music[w].play()
	# 换天：目标音量一下子换过去，留 0.15 秒的过渡，不断拍
	for w in ["day", "night"]:
		var target := 0.0 if w == G.world else -80.0
		var mp: AudioStreamPlayer = music[w]
		mp.volume_db = lerpf(mp.volume_db, target, 0.25) if absf(mp.volume_db - target) > 0.5 else target
	if G.state == "paused":
		for w in ["day", "night"]:
			music[w].stream_paused = true
	else:
		for w in ["day", "night"]:
			music[w].stream_paused = false

func _on_ev(name: String, arg: Variant) -> void:
	match name:
		"room":
			card_t = 0.0
			card_room = int(arg)
		"switched":
			sfx("switch_night" if G.world == "night" else "switch_day")
		"jump":
			sfx("jump")
		"land":
			sfx("land")
		"bell":
			sfx("bell")
		"lantern":
			sfx("lantern")
		"roomClear":
			sfx("gate")
		"blocked":
			sfx("blocked")
		"fail", "csplash":
			sfx("splash")
		"region":
			sfx("region")
		"arrive":
			sfx("arrive")
		"plate":
			sfx("gate" if arg.down else "blocked")

# ------------------------------------------------------------ 固定步长
func _physics_process(delta: float) -> void:
	if autoplay and G.state == "running":
		_autoplay_feed()
	G.update(1.0 / 60.0)
	card_t += 1.0 / 60.0
	_music_update()
	if G.state == "running" and G.on_ground and absf(G.vx) > 20.0:
		var n := int(G.walk_dist / 34.0)
		if n != step_n:
			step_n = n
			sfx("step%d" % (n & 1))
	_update_reflections()
	base_node.queue_redraw()
	top_node.queue_redraw()
	glow_node.queue_redraw()
	ui_node.queue_redraw()

func _autoplay_feed() -> void:
	if plan_room != G.room:
		plan_room = G.room
		plan_step = 0
		G.load_room(G.room, true)        # 和求解器一样，从这一景的起点开始走
	var acts: Array = []
	for rp in plan["rooms"]:
		if int(rp["room"]) == G.room:
			acts = rp["plan"]
	var K: int = int(plan["K"])
	if plan_step % K == 0:
		var idx := plan_step / K
		if idx < acts.size():
			var a: Array = acts[idx]
			G.in_l = float(a[0]) < 0.0
			G.in_r = float(a[0]) > 0.0
			if int(a[1]) != 0:
				G.jump_buf = G.C["JUMP_BUFFER"]
			if int(a[2]) != 0:
				G.pending_switch = true
	plan_step += 1

func px(v: float) -> int:
	return int(round(v / P))

func cam_pix() -> int:
	return px(G.cam_x)

# 这一景的画在屏幕上的横向偏移（换景时镜头滑过去，前后两景同时可见）
func room_dx(i: int) -> int:
	return px(LV.rooms[i].x0) - cam_pix()

func visible_rooms() -> Array[int]:
	var out: Array[int] = []
	for i in [G.room - 1, G.room, G.room + 1]:
		if i >= 0 and i < LV.rooms.size() and absi(room_dx(i)) < PW:
			out.append(i)
	return out

# 物件图集里的一块：s = {r: [x,y,w,h], o: [ox,oy]}，画在锚点 (ax, ay) 上
func spr(n: CanvasItem, t: Texture2D, s, ax: int, ay: int, mod := Color.WHITE) -> void:
	if s == null:
		return
	var r: Array = s["r"]
	var o: Array = s["o"]
	n.draw_texture_rect_region(t, Rect2(ax + int(o[0]), ay + int(o[1]), r[2], r[3]), Rect2(r[0], r[1], r[2], r[3]), mod)

# ------------------------------------------------------------ 底层：背景、地面、陈设、另一面的预告
func _draw_base() -> void:
	var n := base_node
	glows.clear()
	n.draw_rect(Rect2(0, 0, PW, PH), Color8(12, 18, 38) if G.world == "night" else Color8(159, 179, 196))
	if G.state == "title":
		_draw_layer(n, 0, G.world, "base")
		return
	for i in visible_rooms():
		_draw_layer(n, i, G.world, "base")
		if G.state == "running" or G.state == "intro":
			_draw_layer(n, i, G.world, "ghost")
	# 换天：旧的一面盖上来，由着色器从人身上往外洇开
	if G.wipe_t >= 0.0:
		var k := clampf(G.wipe_t / float(LV.C["SWITCH_WIPE"]), 0.0, 1.0)
		var e := 1.0 - pow(1.0 - k, 3.0)
		wipe_node.texture = T(art["rooms"][G.room]["layers"][G.wipe_from]["base"])
		wipe_node.position = Vector2(room_dx(G.room), 0)
		var cx := px(G.px) - cam_pix()
		var cy := px(G.foot - 30.0)
		wipe_node.material.set_shader_parameter("center", Vector2(cx - room_dx(G.room), cy))
		wipe_node.material.set_shader_parameter("radius", e * 380.0 + 12.0)
		wipe_node.visible = true
		var wc := Color8(200, 215, 255) if G.world == "night" else Color8(255, 230, 170)
		glow(px(G.px) - cam_pix(), cy, 30, wc, (1.0 - k) * 0.4)
	else:
		wipe_node.visible = false

# ------------------------------------------------------------ 倒影
func _water_mask(i: int, w: String, wy: int) -> Texture2D:
	var key := "%d,%s" % [i, w]
	if refl_mask.has(key):
		return refl_mask[key]
	var im := Image.create(PW, PH, false, Image.FORMAT_L8)
	im.fill(Color.BLACK)
	im.fill_rect(Rect2i(0, wy + 1, PW, PH - wy - 1), Color.WHITE)
	var r: LevelT.Room = LV.rooms[i]
	var ox := px(r.x0)
	for s in LV.solids:
		if s.thin or not GameT.active(s.w, w) or s.x1 <= r.x0 or s.x0 >= r.x1:
			continue
		var x0 := maxi(0, px(s.x0) - ox)
		var x1 := mini(PW, px(s.x1) - ox)
		var y0 := maxi(0, px(s.y))
		if x1 > x0 and y0 < PH:
			im.fill_rect(Rect2i(x0, y0, x1 - x0, PH - y0), Color.BLACK)
	for h in LV.hazards:
		if h.gate != "" or not GameT.active(h.w, w) or h.x1 <= r.x0 or h.x0 >= r.x1:
			continue
		var hx0 := maxi(0, px(h.x0) - ox)
		var hx1 := mini(PW, px(h.x1) - ox)
		var hy0 := maxi(0, px(h.y0))
		var hy1 := mini(PH, px(h.y1))
		if hx1 > hx0 and hy1 > hy0:
			im.fill_rect(Rect2i(hx0, hy0, hx1 - hx0, hy1 - hy0), Color.BLACK)
	var tx := ImageTexture.create_from_image(im)
	refl_mask[key] = tx
	return tx

func _update_reflections() -> void:
	for rs in refl_nodes:
		rs.visible = false
	if not ["running", "intro", "failing", "paused"].has(G.state):
		return
	var k := 0
	var w := G.world
	var ow := GameT.other(w)
	for i in visible_rooms():
		var rid: String = LV.regions[LV.rooms[i].region]["id"]
		var wl: Dictionary = LV.C["WATER"].get(rid, {})
		if wl.is_empty():
			continue
		var wy := px(float(wl[w]))
		var rs := refl_nodes[k]
		k += 1
		rs.texture = T(art["rooms"][i]["layers"][ow]["base"])
		rs.position = Vector2(room_dx(i), 0)
		rs.material.set_shader_parameter("mask", _water_mask(i, w, wy))
		rs.material.set_shader_parameter("wy", wy)
		rs.material.set_shader_parameter("t", G.anim_t)
		rs.material.set_shader_parameter("night", w == "night")
		rs.visible = true

func _draw_layer(n: CanvasItem, i: int, w: String, which: String) -> void:
	var L: Dictionary = art["rooms"][i]["layers"][w]
	n.draw_texture(T(L[which]), Vector2(room_dx(i), 0))

# ------------------------------------------------------------ 上层：物件、人、近景、界面
func _draw_top() -> void:
	var n := top_node
	if G.state == "title":
		return
	_weather_back(n, _wx(), G.world, G.anim_t, cam_pix())
	for i in visible_rooms():
		_draw_objects(n, i)
		_object_glows(i)
	if G.state != "ended":
		_draw_player(n)
	_weather_front(n, _wx(), G.world, G.anim_t, cam_pix())
	for i in visible_rooms():
		_draw_layer(n, i, G.world, "front")

func _draw_overlay() -> void:
	var n := ui_node
	n.draw_texture(vignette[G.world], Vector2.ZERO)
	if G.fade > 0.0:
		n.draw_rect(Rect2(0, 0, PW, PH), Color(8 / 255.0, 8 / 255.0, 20 / 255.0, G.fade * 0.6))
	_draw_ui(n)

# ------------------------------------------------------------ 天气（全部是 1x 的像素点和像素块，位置取整；和网页版同一套算法）
func _wx() -> String:
	return G.weather[LV.region_at(G.cam_x + float(LV.C["W"]) / 2.0)]

static func _hash(i: float, s: float) -> float:
	var x := sin(i * 127.1 + s * 311.7) * 43758.5453
	return x - floor(x)

static func _noise(x: float, s: float) -> float:
	var i := floorf(x)
	var f := x - i
	var t := f * f * (3.0 - 2.0 * f)
	return _hash(i, s) * (1.0 - t) + _hash(i + 1.0, s) * t

static func _mod(a: float, n: int) -> int:
	return posmod(int(floor(a)), n)

func _weather_back(n: CanvasItem, w: String, world: String, t: float, cam: int) -> void:
	if w == "rain":
		n.draw_rect(Rect2(0, 0, PW, PH), Color8(20, 30, 50, 56))
	elif w == "fog":
		n.draw_rect(Rect2(0, 0, PW, PH), Color8(200, 206, 214, 46))
	elif w == "snow":
		n.draw_rect(Rect2(0, 0, PW, PH), Color8(220, 230, 245, 20))
	if w != "fog":
		return
	for b in 4:
		var y0 := 70 + b * 22
		for x in range(-8, PW + 8, 4):
			var nz := _noise((x + cam * (0.3 + b * 0.1) + t * 4.0) / 40.0, b + 3)
			if nz < 0.35:
				continue
			n.draw_rect(Rect2(x, y0 + int(round(sin(x / 30.0 + b) * 2.0)), 4, 6 + b * 2), Color(226 / 255.0, 230 / 255.0, 236 / 255.0, (0.10 + nz * 0.18) * (0.6 if world == "night" else 1.0)))

const LEAF := [Color8(0xd0, 0x68, 0x2a), Color8(0xe0, 0xa0, 0x30), Color8(0xb8, 0x40, 0x2a), Color8(0xc8, 0x8a, 0x2a)]

func _weather_front(n: CanvasItem, w: String, world: String, t: float, cam: int) -> void:
	if w == "rain":
		var c := Color(210 / 255.0, 225 / 255.0, 245 / 255.0, 0.55) if world == "day" else Color(160 / 255.0, 180 / 255.0, 230 / 255.0, 0.5)
		for i in 140:
			var x := _mod(floor(_hash(i, 1) * 360.0 - t * 40.0 - cam), 360) - 20
			var y := _mod(floor(_hash(i, 2) * 200.0 + t * 230.0), 200) - 10
			n.draw_rect(Rect2(x, y, 1, 4), c)
		var sp := Color(220 / 255.0, 235 / 255.0, 1.0, 0.5)
		for i in 14:          # 地上的水花
			var ph := fmod(t * 3.0 + _hash(i, 5), 1.0)
			if ph > 0.3:
				continue
			var x2 := int(floor(_hash(i + floor(t * 3.0 + _hash(i, 5)), 6) * PW))
			n.draw_rect(Rect2(x2 - 1, 139, 1, 1), sp)
			n.draw_rect(Rect2(x2 + 1, 139, 1, 1), sp)
			n.draw_rect(Rect2(x2, 138, 1, 1), sp)
	elif w == "snow":
		var c2 := Color(1, 1, 1, 0.9)
		for i in 110:
			var big := i % 5 == 0
			var x := _mod(floor(_hash(i, 3) * 340.0 + sin(t * 0.8 + i) * 5.0 - cam * (1.1 if big else 0.7) - t * 6.0), 340) - 10
			var y := _mod(floor(_hash(i, 4) * 190.0 + t * (22.0 if big else 13.0)), 190) - 5
			n.draw_rect(Rect2(x, y, 2 if big else 1, 2 if big else 1), c2)
	elif w == "wind":
		for i in 34:
			var x := _mod(floor(_hash(i, 7) * 360.0 - t * (90.0 + _hash(i, 8) * 60.0) - cam * 0.4), 360) - 20
			var y := int(floor(30.0 + _hash(i, 9) * 130.0 + sin(t * 3.0 + i) * 6.0))
			n.draw_rect(Rect2(x, y, 2, 1), LEAF[i % 4])
			if i % 3 == 0:
				n.draw_rect(Rect2(x + 1, y + 1, 1, 1), LEAF[i % 4])
		var c3 := Color(1, 1, 1, 0.25)
		for i in 8:
			var x := _mod(floor(_hash(i, 11) * 400.0 - t * 220.0), 400) - 40
			n.draw_rect(Rect2(x, int(floor(40.0 + _hash(i, 12) * 100.0)), 16 + (i % 3) * 8, 1), c3)

# ------------------------------------------------------------ 光：一格一格加上去，亮度分八档、用 2×2 抖动过渡，不做平滑模糊
const BAYER := [0.125, 0.625, 0.875, 0.375]

func glow(x: int, y: int, r: int, col: Color, a: float) -> void:
	if a > 0.003 and r > 0:
		glows.append([x, y, r, col, a])

func _draw_glows() -> void:
	var n := glow_node
	var st := (1.0 if G.world == "night" else 0.55) * 1.6      # 网页版另叠一层模糊的光（×0.7），这里并成一层
	for g in glows:
		var gx: int = g[0]
		var gy: int = g[1]
		var r: int = g[2]
		var col: Color = g[3]
		var a: float = g[4]
		for yy in range(-r, r + 1):
			for xx in range(-r, r + 1):
				var d := sqrt(float(xx * xx + yy * yy)) / r
				if d >= 1.0:
					continue
				var p := 1.0 - 0.6 * d / 0.4 if d < 0.4 else 0.4 * (1.0 - (d - 0.4) / 0.6)
				var v := a * p * st * 8.0
				var qx := gx + xx
				var qy := gy + yy
				var lv := floorf(v) + (1.0 if v - floorf(v) > BAYER[((qy & 1) << 1) | (qx & 1)] else 0.0)
				if lv <= 0.0:
					continue
				var k := lv / 8.0
				n.draw_rect(Rect2(qx, qy, 1, 1), Color(floor(col.r8 * k) / 255.0, floor(col.g8 * k) / 255.0, floor(col.b8 * k) / 255.0, 1.0))

func _object_glows(i: int) -> void:
	var cam := cam_pix()
	var w := G.world
	var r: LevelT.Room = LV.rooms[i]
	for l in LV.lanterns:
		if l.room != i or not GameT.active(l.w, w):
			continue
		var x := px(l.x) - cam
		var y := px(l.y)
		if G.got.has(l.i):
			var fl: float = G.flashes.get("l%d" % l.i, 0.0)
			glow(x, y, int(round(11.0 + fl * 7.0)), Color8(255, 190, 110), 0.6 + fl * 0.2)
		else:
			glow(x, y, 6, Color8(255, 220, 150), 0.12 + 0.12 * (0.5 + 0.5 * sin(G.anim_t * 3.0)))
	for b in LV.bells:
		if b.x < r.x0 or b.x >= r.x1 or not GameT.active(b.w, w):
			continue
		var rung: bool = G.gates.has(b.id)
		var fl2: float = G.flashes.get(b.id, 0.0)
		glow(px(b.x) - cam, px(b.y + 34.0) - 9, int(round(8.0 + fl2 * 14.0 if rung else 7.0)), Color8(255, 210, 120), 0.25 + fl2 * 0.5 if rung else 0.5)
	for h in LV.hazards:
		if h.gate == "" or h.x0 < r.x0 - 40.0 or h.x0 >= r.x1:
			continue
		var open: bool = G.gates.has(h.gate) and not (G.flashes.get(h.gate, 0.0) > 0.5)
		if not open:
			glow(int((px(h.x0) + px(h.x1)) / 2) - cam, int(round(px(h.y0) + (px(h.y1) - px(h.y0)) * 0.45)), 6, Color8(255, 200, 90), 0.5)
	for s in LV.solids:
		if s.kind != "firefly" or s.x0 < r.x0 or s.x0 >= r.x1 or not GameT.active(s.w, w):
			continue
		var x0 := px(s.x0) - cam
		var x1 := px(s.x1) - cam
		var y2 := px(s.y)
		var k := 0
		for fx in range(x0 + 1, x1, 3):
			var on := 0.55 + 0.45 * sin(G.anim_t * 3.0 + k * 1.7)
			if k % 2 == 0:
				glow(fx, y2 + (k % 2) - (1 if on > 0.8 else 0), 6, Color8(190, 255, 120), 0.6 * on)
			k += 1

func _draw_objects(n: CanvasItem, i: int) -> void:
	var A: Dictionary = art["rooms"][i]
	var ot := T(A["objects"])
	var w := G.world
	var dx := room_dx(i)
	var rid: String = A["rid"]
	# 会动的机关（画在最底下：轮子、秋千架在踏板后面）
	for g in A["movers"]:
		var members: Array = g["members"]
		if g["kind"] == "drift":
			var m: LevelT.Mover = LV.movers[int(members[0])]
			spr(n, ot, g["spr"][w], px(m.x0) - cam_pix(), px(m.y))
			continue
		var m0: LevelT.Mover = LV.movers[int(members[0])]
		var F: int = art["frames"]
		var f := int(floor(fposmod(G.dclock, m0.period) / m0.period * F + 0.5)) % F
		spr(n, ot, g["frames"][w][f], dx, 0)
		for mi in members:
			var q: LevelT.Mover = LV.movers[int(mi)]
			spr(n, ot, g["board"][w], px(q.x0) - cam_pix(), px(q.y))
	for e_i in A["eaves"].size():
		var ev: LevelT.Obj = _room_list(LV.eaves, i)[e_i]
		spr(n, ot, A["eaves"][e_i]["spr"][w], px(ev.x0) - cam_pix(), px(ev.y))
	for g in A["gates"]:
		var open: bool = G.gates.has(g["id"]) and not (G.flashes.get(g["id"], 0.0) > 0.5)
		spr(n, ot, g["spr"][w]["open" if open else "closed"], int(g["at"][0]) + dx, int(g["at"][1]))
	for p in A["plates"]:
		var pl := _plate(p["id"])
		spr(n, ot, p["spr"][w]["down" if pl != null and pl.down else "up"], int(p["at"][0]) + dx, int(p["at"][1]))
	var crates := _room_crates(i)
	var water: Dictionary = LV.C["WATER"].get(rid, {})
	for k in crates.size():
		var c: LevelT.Obj = crates[k]
		var cx0 := px(c.x0) - cam_pix()
		spr(n, ot, A["crates"][k]["spr"][w], cx0, px(c.y0))
		if not water.is_empty():
			var wy := px(float(water[w]))
			var y1 := px(c.y1)
			if y1 > wy:
				n.draw_rect(Rect2(cx0 - 1, wy + 1, px(c.x1) - px(c.x0) + 2, y1 - wy), Color8(28, 42, 74, 115) if w == "night" else Color8(60, 100, 112, 115))
	for b in A["bells"]:
		if not GameT.active(b["w"], w):
			continue
		spr(n, ot, b["spr"][w]["rung" if G.gates.has(b["id"]) else "idle"], int(b["at"][0]) + dx, int(b["at"][1]))
	for l in A["lamps"]:
		if not GameT.active(l["w"], w):
			continue
		spr(n, ot, l["spr"][w]["lit" if G.got.has(int(l["i"])) else "unlit"], int(l["at"][0]) + dx, int(l["at"][1]))

func _room_list(arr: Array, i: int) -> Array:
	var r: LevelT.Room = LV.rooms[i]
	var out := []
	for o in arr:
		if o.x0 >= r.x0 and o.x0 < r.x1:
			out.append(o)
	return out

func _room_crates(i: int) -> Array:
	var out := []
	for c in LV.crates:
		if c.room == i:
			out.append(c)
	return out

func _plate(id: String) -> LevelT.Plate:
	for p in LV.plates:
		if p.id == id:
			return p
	return null

# ------------------------------------------------------------ 旅人
func _look(wx: String, ri: int) -> Array:
	match wx:
		"rain": return ["rain", "umbrella"]
		"snow": return ["snow", "cloak"]
		"fog": return ["fog", "back"]
		"wind": return ["wind", "book"] if ri % 2 == 1 else ["wind", "back"]
	return ["clear", "back"] if ri % 2 == 1 else ["clear", "book"]

func _draw_player(n: CanvasItem) -> void:
	var ri := LV.region_at(G.px)
	var lk := _look(G.weather[ri], ri)
	var st := "idle"
	if G.state == "running" or G.state == "failing":
		st = "air" if not G.on_ground else ("run" if absf(G.vx) > 20.0 else "idle")
	var fr: String
	if st == "air":
		fr = "up" if G.vy < 120.0 else "fall"
	elif st == "run":
		fr = "land" if G.land_t < 0.09 else str(int(floor(G.walk_dist / 20.0)) % 8)
	else:
		fr = "idle1" if int(floor(G.anim_t / 0.7)) % 4 == 3 else "idle0"
	var a = art["atlas"].get("t_%s_%s_%s" % [lk[0], lk[1], fr])
	if a == null:
		return
	var rid: String = LV.regions[ri]["id"]
	var t := T(art["spritesDim"]) if G.world == "night" else T(art["sprites"][rid])
	var shake := int(round(sin(G.blocked_t * 60.0) * 3.0)) if G.blocked_t > 0.0 else 0
	var x := px(G.px) - cam_pix() + shake
	var y := px(G.foot)
	var src := Rect2(a[0], a[1], a[2], a[3])
	if G.face < 0:
		n.draw_set_transform(Vector2(x, 0), 0.0, Vector2(-1, 1))      # 左右镜像（不是缩放）
		n.draw_texture_rect_region(t, Rect2(-int(a[4]), y - int(a[5]), a[2], a[3]), src)
		n.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	else:
		n.draw_texture_rect_region(t, Rect2(x - int(a[4]), y - int(a[5]), a[2], a[3]), src)
	# 脚下记号：另一面此刻能不能站
	if G.state == "running":
		var fy := y + 4
		if G.other_safe():
			var col := Color8(110, 140, 255) if G.world == "day" else Color8(255, 216, 138)
			n.draw_rect(Rect2(x - 2, fy, 5, 1), col)
			n.draw_rect(Rect2(x - 4, fy, 2, 1), Color(col, 0.45))
			n.draw_rect(Rect2(x + 3, fy, 2, 1), Color(col, 0.45))
			n.draw_rect(Rect2(x, fy, 1, 1), Color.WHITE)
		else:
			n.draw_rect(Rect2(x - 3, fy, 2, 1), Color8(200, 70, 70, 190))
			n.draw_rect(Rect2(x + 2, fy, 2, 1), Color8(200, 70, 70, 190))

# ------------------------------------------------------------ 界面：只用 12 像素字，原生大小；不画框
func text(n: CanvasItem, s: String, x: int, y: int, col: Color, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1) -> void:
	n.draw_string(font, Vector2(x, y), s, align, width, 12, col)

func ink_band(n: CanvasItem, y: int, h: int, a: float) -> void:
	# 淡墨托底：中间浓、两头淡，按 8 像素一段的台阶变化，不做平滑渐变
	for k in 20:
		var d := absf(k - 9.5) / 10.0
		n.draw_rect(Rect2(k * 16, y, 16, h), Color(INK, a * (1.0 - d * d)))

func _draw_ui(n: CanvasItem) -> void:
	if G.state == "title":
		ink_band(n, 62, 52, 0.7)
		text(n, "倒影之间", 0, 82, PAPER, HORIZONTAL_ALIGNMENT_CENTER, PW)
		text(n, "白天种下的因，夜里结成的果", 0, 98, Color(PAPER, 0.8), HORIZONTAL_ALIGNMENT_CENTER, PW)
		if int(G.anim_t * 2.0) % 2 == 0:
			text(n, "按任意键出发", 0, 132, Color(PAPER, 0.85), HORIZONTAL_ALIGNMENT_CENTER, PW)
		return
	if G.state == "ended":
		ink_band(n, 70, 36, 0.7)
		text(n, "灯都亮了。", 0, 92, PAPER, HORIZONTAL_ALIGNMENT_CENTER, PW)
		return
	var r: LevelT.Room = LV.rooms[G.room]
	# 左上：朱印景名 + 一排小灯
	n.draw_rect(Rect2(6, 6, 14, 14), CINNABAR)
	n.draw_rect(Rect2(7, 7, 12, 12), Color(PAPER, 0.15))
	var num: String = NUM[r.i] if r.i < NUM.size() else str(r.i + 1)
	text(n, num.substr(0, 1), 7, 18, PAPER)
	text(n, r.name, 24, 17, PAPER)
	for k in LV.rooms.size():
		var lit := k < G.room or (k == G.room and G.gates.has(r.exit))
		n.draw_rect(Rect2(24 + k * 4, 21, 2, 2), Color8(242, 200, 80) if lit else Color(PAPER, 0.25))
	# 进站：站名
	if G.state == "intro":
		var g: Dictionary = LV.regions[r.region]
		ink_band(n, 66, 44, 0.65)
		text(n, "%s · %s" % [g["no"], g["name"]], 0, 86, PAPER, HORIZONTAL_ALIGNMENT_CENTER, PW)
		text(n, g["line"], 0, 102, Color(PAPER, 0.8), HORIZONTAL_ALIGNMENT_CENTER, PW)
		return
	# 进景：题名卡，停一会儿淡去
	if card_t < 3.2 and card_room == G.room:
		var a := clampf(minf(card_t / 0.3, (3.2 - card_t) / 0.6), 0.0, 1.0)
		a = floor(a * 4.0) / 4.0           # 透明度按四档跳，不做连续淡入
		ink_band(n, 26, 42, 0.55 * a)
		text(n, "第%s景" % num, 0, 40, Color(PAPER, 0.75 * a), HORIZONTAL_ALIGNMENT_CENTER, PW)
		text(n, r.name, 0, 54, Color(PAPER, a), HORIZONTAL_ALIGNMENT_CENTER, PW)
		text(n, r.line, 0, 66, Color(PAPER, 0.8 * a), HORIZONTAL_ALIGNMENT_CENTER, PW)
	if r.i == 0 and G.state == "running":
		text(n, "← → 走   空格 跳   Shift 换天   R 重来", 0, PH - 6, Color(PAPER, 0.7), HORIZONTAL_ALIGNMENT_CENTER, PW)
	if G.state == "paused":
		ink_band(n, 76, 24, 0.7)
		text(n, "暂停 · Esc 继续", 0, 92, PAPER, HORIZONTAL_ALIGNMENT_CENTER, PW)
