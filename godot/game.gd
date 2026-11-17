# 游戏逻辑：一行一行照着网页版 js/game.js 搬过来（同样的步骤、同样的数），不碰画面和声音。
# 自己左右走、跳，Shift 切换昼夜；白天会动的东西在动，夜里全部停住。点亮本景的宫灯，院门打开，走到下一景。
extends RefCounted

const LevelT := preload("res://godot/level.gd")

var LV: LevelT
var C: Dictionary
var HW: float

signal ev(name: String, arg: Variant)

# 状态：title | intro | running | failing | paused | arrived | ended
var state := "title"
var prev_state := ""
var px := 0.0
var foot := 0.0
var vx := 0.0
var vy := 0.0
var face := 1
var on_ground := true
var coyote := 0.0
var jump_buf := 0.0
var jump_rise := false
var in_l := false
var in_r := false
var walk_dist := 0.0
var world := "day"
var room := 0
var cam_x := 0.0
var dclock := 0.0
var mclock := 0.0
var gates := {}
var got := {}
var anim_t := 0.0
var timer := 0.0
var pending_switch := false
var push_t := 0.0
var sw_t := 9.0
var room_t := 0.0
var wipe_from := ""
var wipe_t := -1.0
var fade := 0.0
var flashes := {}
var blocked_t := 0.0
var land_t := 9.0
var riding := false
var shown := {}
var weather: Array = []

func _init(level: LevelT) -> void:
	LV = level
	C = level.C
	HW = C["HALF_W"]
	roll_weather(func(): return 0.01)
	reset()

static func other(w: String) -> String:
	return "night" if w == "day" else "day"

static func active(w_obj: String, w: String) -> bool:
	return w_obj == "both" or w_obj == w

func emit(name: String, arg: Variant = null) -> void:
	ev.emit(name, arg)

# ------------------------------------------------------------ 几何查询
func box_on(h: LevelT.Obj, w: String, g: Dictionary) -> bool:
	return active(h.w, w) and not (h.gate != "" and g.has(h.gate))

func support_y(w: String, x: float, ft: float, tol: float, g: Dictionary) -> float:
	var best := INF
	for s in LV.solids:
		if s.x1 < x - HW or s.x0 > x + HW or not active(s.w, w):
			continue
		if s.y >= ft - tol and s.y <= ft + 1.0 and s.y < best:
			best = s.y
	for h in LV.hazards:
		if h.x1 < x - HW or h.x0 > x + HW or not box_on(h, w, g):
			continue
		if h.y0 >= ft - tol and h.y0 <= ft + 1.0 and h.y0 < best:
			best = h.y0
	for m in LV.movers:
		if m.x1 < x - HW or m.x0 > x + HW:
			continue
		if m.y >= ft - tol and m.y <= ft + 1.0 and m.y < best:
			best = m.y
	for c in LV.crates:
		if c.x1 < x - HW or c.x0 > x + HW:
			continue
		if c.y0 >= ft - tol and c.y0 <= ft + 1.0 and c.y0 < best:
			best = c.y0
	return best

func body_hit(w: String, x: float, ft: float, g: Dictionary) -> LevelT.Obj:
	var l := x - HW + 1.0
	var r := x + HW - 1.0
	var top := ft - float(C["BODY_H"])
	for s in LV.solids:
		if s.thin or s.x1 <= l or s.x0 >= r or not active(s.w, w):
			continue
		if s.y < ft - 0.5:
			return s
	for h in LV.hazards:
		if h.x1 <= l or h.x0 >= r or not box_on(h, w, g):
			continue
		if top < h.y1 and ft - 0.5 > h.y0:
			return h
	for c in LV.crates:
		if c.x1 <= l or c.x0 >= r:
			continue
		if top < c.y1 and ft - 0.5 > c.y0:
			return c
	return null

# 昼动夜静：踏板的位置只由“白天走过的拍数”决定
static func place_mover(m: LevelT.Mover, clock: float) -> void:
	var ph := clock / m.period * PI * 2.0 + m.phase
	var x: float
	var y: float
	if m.kind == "wheel":
		x = m.cx + m.r * cos(ph)
		y = m.cy + m.r * sin(ph)
	elif m.kind == "swing":
		var th := m.amp * sin(ph)
		x = m.cx + m.r * sin(th)
		y = m.cy + m.r * cos(th)
		m.th = th
	else:
		x = m.cx + m.amp * sin(ph)
		y = m.cy
	m.dir = 1 if cos(ph) >= 0.0 else -1
	m.x0 = x - m.hw
	m.x1 = x + m.hw
	m.y = y
	m.ang = ph

func room_of() -> LevelT.Room:
	return LV.rooms[room]

func set_world(w: String, silent := false) -> void:
	world = w
	emit("world", w)

# 进一景（或重来这一景）：人回到开头，这一景的灯、铃、踏板都还原
func load_room(i: int, keep_cam := false) -> void:
	var r: LevelT.Room = LV.rooms[i]
	room = i
	px = r.sx
	foot = r.sy
	vx = 0.0
	vy = 0.0
	face = 1
	on_ground = true
	coyote = 0.0
	jump_buf = 0.0
	set_world(r.world, true)
	for l in LV.lanterns:
		if l.room >= i:
			got.erase(l.i)
		else:
			got[l.i] = true
	gates.clear()
	for q in LV.rooms:
		if q.i < i:
			gates[q.exit] = true
	for b in LV.bells:
		if b.x < r.x0:
			gates[b.id] = true
	for e in LV.eaves:
		e.y = e.yd if r.world == "day" else e.yn
	dclock = 0.0
	for m in LV.movers:
		place_mover(m, 0.0)
	for c in LV.crates:
		if c.room >= i:
			c.x0 = c.ix - c.cw / 2.0
			c.x1 = c.ix + c.cw / 2.0
			c.y1 = c.iy
			c.y0 = c.iy - c.ch
			c.vy = 0.0
			c.wet = false
			c.floating = false
	for p in LV.plates:
		p.down = false
		if p.x < r.x0:
			gates[p.id] = true
	if not keep_cam:
		cam_x = r.x0
	wipe_t = -1.0
	pending_switch = false
	flashes.clear()
	fade = 0.0

func reset() -> void:
	shown = {}
	got = {}
	gates = {}
	load_room(0)

func roll_weather(rnd: Callable) -> void:
	weather = []
	for r in LV.regions:
		var ws: Dictionary = r["weathers"]
		var sum := 0.0
		for k in ws.keys():
			sum += float(ws[k])
		var t: float = float(rnd.call()) * sum
		var pick: String = ws.keys()[0]
		for k in ws.keys():
			t -= float(ws[k])
			if t <= 0.0:
				pick = k
				break
		weather.append(pick)

func enter_room(i: int) -> void:
	var r: LevelT.Room = LV.rooms[i]
	if not shown.has("r%d" % r.region):
		shown["r%d" % r.region] = true
		emit("region", r.region)
	room_t = 0.0
	emit("room", i)

func start(at := 0) -> void:
	reset()
	if at > 0:
		load_room(at)
	state = "intro"
	timer = 0.0
	emit("intro")

func begin_running() -> void:
	state = "running"
	emit("run")
	enter_room(room)

func retry() -> void:
	load_room(room)
	state = "running"
	fade = 0.5
	emit("retry")

func pause() -> bool:
	if not ["running", "intro", "failing"].has(state):
		return false
	prev_state = state
	state = "paused"
	in_l = false
	in_r = false
	emit("paused")
	return true

func resume() -> void:
	if state != "paused":
		return
	state = prev_state
	emit("resumed")

# ------------------------------------------------------------ 输入
func input_switch() -> void:
	if state == "intro":
		begin_running()
	elif state == "running":
		pending_switch = true

func input_jump() -> void:
	if state == "intro":
		begin_running()
	elif state == "running":
		jump_buf = C["JUMP_BUFFER"]

func input_jump_release() -> void:
	if state != "running":
		return
	jump_buf = 0.0
	if jump_rise and vy < -float(C["JUMP_V"]) * float(C["JUMP_CUT"]):
		vy = -float(C["JUMP_V"]) * float(C["JUMP_CUT"])
	jump_rise = false

func input_move(dir: int, down: bool) -> void:
	if state == "intro" and down:
		begin_running()
	if dir < 0:
		in_l = down
	else:
		in_r = down

func input_retry() -> void:
	if state == "running":
		retry()

# 另一面此刻能不能切过去（脚下记号用）
func other_safe() -> bool:
	var hit := body_hit(other(world), px, foot, gates)
	return hit == null or (hit.gate == "" and hit.type == "solid" and foot - hit.y <= float(C["STEP_UP"]))

# 木箱往旁边挪 dx 以后会不会撞上东西
func crate_free(c: LevelT.Obj, dx: float) -> bool:
	var x0 := c.x0 + dx
	var x1 := c.x1 + dx
	var rm: LevelT.Room = LV.rooms[c.room]
	if x0 < rm.x0 or x1 > rm.x1:
		return false
	for s in LV.solids:
		if s.thin or not active(s.w, world) or s.x1 <= x0 or s.x0 >= x1 or s.y >= c.y1 - 1.0:
			continue
		if s.x1 > c.x0 and s.x0 < c.x1 and minf(s.x1, x1) - maxf(s.x0, x0) <= minf(s.x1, c.x1) - maxf(s.x0, c.x0):
			continue
		return false
	for h in LV.hazards:
		if not box_on(h, world, gates) or h.x1 <= x0 or h.x0 >= x1:
			continue
		if h.y0 < c.y1 - 1.0 and h.y1 > c.y0 + 1.0:
			return false
	for q in LV.crates:
		if q == c or q.x1 <= x0 or q.x0 >= x1:
			continue
		if q.y0 < c.y1 - 1.0 and q.y1 > c.y0 + 1.0:
			return false
	return true

func _sign(v: float) -> float:
	return 1.0 if v > 0.0 else (-1.0 if v < 0.0 else 0.0)

# ------------------------------------------------------------ 物理一步
func physics(dt: float) -> void:
	var r := room_of()
	var STEP_UP: float = C["STEP_UP"]
	# 1) 切换：另一面这里是实心的就切不过去
	if pending_switch:
		pending_switch = false
		var to := other(world)
		var hit := body_hit(to, px, foot, gates)
		var up := INF
		if hit != null and hit.type == "solid" and foot - hit.y <= STEP_UP and body_hit(to, px, hit.y, gates) == null:
			up = hit.y
			hit = null
		if hit != null:
			blocked_t = 0.35
			emit("blocked")
		else:
			var from := world
			set_world(to)
			if up != INF:
				foot = up
				vy = 0.0
				on_ground = true
			wipe_from = from
			wipe_t = 0.0
			sw_t = 0.0
			emit("switched", world)
	# 2) 跳
	if jump_buf > 0.0:
		jump_buf -= dt
		if on_ground or coyote > 0.0:
			vy = -float(C["JUMP_V"])
			on_ground = false
			coyote = 0.0
			jump_buf = 0.0
			jump_rise = true
			emit("jump")
	# 3) 飞檐升降，站在上面的人跟着走
	for e in LV.eaves:
		var tgt: float = e.yd if world == "day" else e.yn
		if e.y == tgt:
			continue
		var on := on_ground and px >= e.x0 - HW and px <= e.x1 + HW and absf(foot - e.y) < 0.6
		var st: float = float(C["EAVE_V"]) * dt
		e.y = tgt if absf(tgt - e.y) <= st else e.y + _sign(tgt - e.y) * st
		if on:
			foot = e.y
	# 4) 昼动夜静
	var ride: LevelT.Mover = null
	if on_ground:
		for m in LV.movers:
			if px >= m.x0 - HW and px <= m.x1 + HW and absf(foot - m.y) < 0.6:
				ride = m
				break
	var rx := (ride.x0 + ride.x1) / 2.0 if ride != null else 0.0
	if world == "day":
		dclock += dt / float(C["BEAT_SEC"])
		for m in LV.movers:
			place_mover(m, dclock)
	riding = ride != null
	if ride != null:
		var nx := px + (ride.x0 + ride.x1) / 2.0 - rx
		if body_hit(world, nx, ride.y, gates) == null:
			px = nx
			foot = ride.y
		else:
			on_ground = false
			coyote = C["COYOTE"]
			vy = 0.0
	# 4.5) 木箱：水涨船高
	var rid: String = LV.regions[r.region]["id"]
	var wl: Dictionary = C["WATER"].get(rid, {})
	for c in LV.crates:
		if c.room != room or c.y1 > float(C["FALL_LIMIT"]) + 200.0:
			continue
		var on := on_ground and px >= c.x0 - HW and px <= c.x1 + HW and absf(foot - c.y0) < 0.6
		var sup := INF
		for s in LV.solids:
			if not active(s.w, world) or minf(s.x1, c.x1) - maxf(s.x0, c.x0) < 8.0:
				continue
			if s.y >= c.y1 - 2.0 and s.y < sup:
				sup = s.y
		for h in LV.hazards:
			if not box_on(h, world, gates) or minf(h.x1, c.x1) - maxf(h.x0, c.x0) < 8.0:
				continue
			if h.y0 >= c.y1 - 2.0 and h.y0 < sup:
				sup = h.y0
		for q in LV.crates:
			if q == c or minf(q.x1, c.x1) - maxf(q.x0, c.x0) < 8.0:
				continue
			if q.y0 >= c.y1 - 2.0 and q.y0 < sup:
				sup = q.y0
		var frozen: bool = not wl.is_empty() and wl.get("frozen", "") == world
		if frozen and c.wet:
			c.floating = false
			c.vy = 0.0
			c.y1 = maxf(float(wl[world]), c.y1 - 220.0 * dt)
			c.y0 = c.y1 - c.ch
			if on:
				foot = c.y0
			continue
		var fl := float(wl[world]) + float(C["FLOAT"]) if not wl.is_empty() else INF
		var tgt := minf(sup, fl)
		if c.y1 < tgt - 0.01:
			c.vy = minf(float(C["FALL_MAX"]), c.vy + float(C["GRAVITY"]) * dt)
			c.y1 = minf(tgt, c.y1 + c.vy * dt)
			if not wl.is_empty() and not c.wet and c.y1 > float(wl[world]) + 6.0:
				c.wet = true
				emit("csplash", c)
		elif c.y1 > tgt + 0.01:
			c.vy = 0.0
			c.y1 = maxf(tgt, c.y1 - 220.0 * dt)
		else:
			c.y1 = tgt
			if c.vy > 200.0:
				emit("cland", c)
			c.vy = 0.0
		c.y0 = c.y1 - c.ch
		c.floating = tgt == fl and absf(c.y1 - fl) < 1.0
		if not c.floating and c.y1 == sup and not (not wl.is_empty() and c.y1 > float(wl["day"])):
			c.wet = false
		var dx := 0.0
		if c.floating and world == "day":
			dx = float(C["DRIFT"]) * dt
			if not crate_free(c, dx):
				dx = 0.0
			c.x0 += dx
			c.x1 += dx
		if on:
			if dx != 0.0 and body_hit(world, px + dx, c.y0, gates) == null:
				px += dx
			foot = c.y0
	# 5) 左右走
	var want := (1 if in_r else 0) - (1 if in_l else 0)
	var tv := float(want) * float(C["WALK"])
	var acc := (float(C["WALK_ACC"]) if on_ground else float(C["AIR_ACC"])) * dt
	vx = tv if absf(tv - vx) <= acc else vx + _sign(tv - vx) * acc
	if want != 0:
		face = want
	if vx != 0.0:
		var nx2 := px + vx * dt
		nx2 = maxf(r.x0 + HW, nx2)
		var hit2 := body_hit(world, nx2, foot, gates)
		if hit2 == null:
			px = nx2
		elif hit2.type == "crate" and foot - hit2.y0 <= STEP_UP and vy >= 0.0 and body_hit(world, nx2, hit2.y0, gates) == null:
			px = nx2
			foot = hit2.y0
			on_ground = true
			vy = 0.0
		elif hit2.type == "crate" and world == "day" and on_ground and not hit2.floating and absf(hit2.y1 - foot) < 14.0 and _sign(vx) == _sign((hit2.x0 + hit2.x1) / 2.0 - px):
			var pdx := _sign(vx) * float(C["PUSH"]) * dt
			if crate_free(hit2, pdx):
				hit2.x0 += pdx
				hit2.x1 += pdx
				px += pdx
				vx = _sign(vx) * float(C["PUSH"])
				push_t = 0.12
			else:
				vx = 0.0
		elif hit2.type == "solid" and foot - hit2.y <= STEP_UP and vy >= 0.0 and body_hit(world, nx2, hit2.y, gates) == null:
			px = nx2
			foot = hit2.y
			on_ground = true
			vy = 0.0
		else:
			vx = 0.0
		walk_dist += absf(vx * dt)
	# 6) 竖直
	if on_ground:
		var sy := support_y(world, px, foot, STEP_UP, gates)
		if sy == INF:
			var low := support_y(world, px, foot + STEP_UP, STEP_UP, gates)
			if low != INF:
				foot = low
			else:
				on_ground = false
				coyote = C["COYOTE"]
				vy = 0.0
		else:
			foot = sy
	else:
		coyote = maxf(0.0, coyote - dt)
		vy = minf(float(C["FALL_MAX"]), vy + float(C["GRAVITY"]) * dt)
		var nf := foot + vy * dt
		if vy > 0.0:
			var land := INF
			for t in LV.solids:
				if t.x1 < px - HW or t.x0 > px + HW or not active(t.w, world):
					continue
				if t.y >= foot - 0.01 and t.y <= nf and t.y < land:
					land = t.y
			for h in LV.hazards:
				if h.x1 < px - HW or h.x0 > px + HW or not box_on(h, world, gates):
					continue
				if h.y0 >= foot - 0.01 and h.y0 <= nf and h.y0 < land:
					land = h.y0
			for m in LV.movers:
				if m.x1 < px - HW or m.x0 > px + HW:
					continue
				if m.y >= foot - 0.01 - 6.0 and m.y <= nf and m.y < land:
					land = m.y
			for c in LV.crates:
				if c.x1 < px - HW or c.x0 > px + HW:
					continue
				if c.y0 >= foot - 0.01 - 4.0 and c.y0 <= nf and c.y0 < land:
					land = c.y0
			if land != INF:
				foot = land
				vy = 0.0
				on_ground = true
				land_t = 0.0
				jump_rise = false
				emit("land")
			else:
				foot = nf
		else:
			var bump := false
			var top0 := foot - float(C["BODY_H"])
			var top1 := nf - float(C["BODY_H"])
			for h in LV.hazards:
				if h.x1 <= px - HW + 1.0 or h.x0 >= px + HW - 1.0 or not box_on(h, world, gates):
					continue
				if top0 >= h.y1 and top1 < h.y1:
					bump = true
					foot = h.y1 + float(C["BODY_H"])
			if bump:
				vy = 0.0
			else:
				foot = nf
	if foot > float(C["FALL_LIMIT"]):
		state = "failing"
		timer = 0.0
		emit("fail")
		return
	# 6.5) 踏石：人或木箱压着，对应的门就开着；松开就关（人正站在门洞里时先不关）
	for p in LV.plates:
		if p.x < r.x0 or p.x > r.x1:
			continue
		var me := on_ground and absf(px - p.x) < p.hw + HW - 4.0 and absf(foot - p.y) < 1.5
		var ec := false
		for c in LV.crates:
			if absf((c.x0 + c.x1) / 2.0 - p.x) < p.hw + 8.0 and absf(c.y1 - p.y) < 1.5:
				ec = true
				break
		var down := me or ec
		if down != p.down:
			p.down = down
			emit("plate", p)
		if down:
			if not gates.has(p.id):
				gates[p.id] = true
				flashes[p.id] = 0.5
		elif gates.has(p.id):
			gates.erase(p.id)
			if body_hit(world, px, foot, gates) != null:
				gates[p.id] = true
	# 7) 铃
	for b in LV.bells:
		if gates.has(b.id) or not active(b.w, world):
			continue
		if absf(b.x - px) < HW + 18.0 and foot - float(C["BODY_H"]) - 14.0 < b.y and foot + 4.0 > b.y - 20.0:
			gates[b.id] = true
			flashes[b.id] = 1.2
			emit("bell", b)
	# 8) 宫灯
	for l in LV.lanterns:
		if got.has(l.i) or l.room != room or not active(l.w, world):
			continue
		if absf(l.x - px) < HW + 16.0 and l.y > foot - float(C["BODY_H"]) - 30.0 and l.y < foot + 10.0:
			got[l.i] = true
			flashes["l%d" % l.i] = 1.0
			emit("lantern", l)
			var all_lit := true
			for k in r.lamps:
				if not got.has(k):
					all_lit = false
			if all_lit:
				gates[r.exit] = true
				flashes[r.exit] = 1.2
				emit("roomClear", r)
	# 9) 走出这一景
	if px > r.x1 + HW:
		if room + 1 >= LV.rooms.size():
			state = "arrived"
			timer = 0.0
			emit("arrive")
			return
		room += 1
		var n := room_of()
		dclock = 0.0
		for m in LV.movers:
			place_mover(m, 0.0)
		if world != n.world:
			var from2 := world
			set_world(n.world)
			wipe_from = from2
			wipe_t = 0.0
		emit("checkpoint", room)
		enter_room(room)

# ------------------------------------------------------------ 更新（固定步长 1/60）
func update(dt: float) -> void:
	if state == "paused":
		return
	anim_t += dt
	land_t += dt
	if wipe_t >= 0.0:
		wipe_t += dt
		if wipe_t >= float(C["SWITCH_WIPE"]):
			wipe_t = -1.0
	if blocked_t > 0.0:
		blocked_t -= dt
	sw_t += dt
	room_t += dt
	if push_t > 0.0:
		push_t -= dt
	for k in flashes.keys():
		flashes[k] -= dt
		if flashes[k] <= 0.0:
			flashes.erase(k)
	if state == "title" or state == "ended":
		return
	mclock += dt / float(C["BEAT_SEC"])
	var tx: float = room_of().x0
	cam_x += (tx - cam_x) * (1.0 - exp(-dt * 7.0))
	if absf(tx - cam_x) < 0.5:
		cam_x = tx
	match state:
		"intro":
			timer += dt
			if timer >= 3.0:
				begin_running()
		"running":
			fade = maxf(0.0, fade - dt / 0.35)
			physics(dt)
		"failing":
			timer += dt
			fade = clampf(timer / 0.3, 0.0, 1.0)
			vy += float(C["GRAVITY"]) * dt * 0.5
			foot += vy * dt * 0.5
			if timer >= 0.3:
				load_room(room, true)
				fade = 0.8
				state = "running"
				emit("retry")
		"arrived":
			timer += dt
			if timer > 2.6:
				state = "ended"
				emit("ended")
