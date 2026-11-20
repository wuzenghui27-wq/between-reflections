# 借景 · 规则核心（逐行对照 core/core.js 移植；两边用 data/plans.json 的回放核对，结果必须一字不差）。
# 只管规则，不碰画面和声音。坐标是 320×180 画面里的像素；固定 60 帧一秒；没有随机数。
# 取整一律用 rnd(v) = floor(v + 0.5)。
# 虚实（第三卷）：淡墨虚线只有被亮灯的光圈照到的那一段才是实路；灯随所在层推动。站在虚线上时挂灯的层推不动。
# 掉水后回到落脚点；落脚点那一层后来被推过（或路不在了）就回到起点。
class_name JJCore
extends RefCounted

const W := 320
const H := 180
const WALK := 50.0 / 60.0
const PUSH := [20.0 / 60.0, 32.0 / 60.0, 48.0 / 60.0]
const SNAP := 3.0
const SNAP_SLOW := 0.35
const GLOW := 5.0
const GAP := 2.0
const DY := 1.01
const GRAV := 0.25
const FALL_MAX := 4.0
const FALL_Y := 200.0
const BLOOM := 36
const LAMP := 4.0
const PAR := [0.4, 0.7, 1.0]
const DRAG_SLOW := 0.5
const COYOTE := 6
var HOP := sqrt(2.0 * 0.25 * 10.0)

static func rnd(v: float) -> float:
	return floor(v + 0.5)

static func y_at(line: Dictionary, x: float) -> float:
	var p: Array = line.pts
	if x <= p[0][0]:
		return p[0][1]
	for i in range(1, p.size()):
		if x <= p[i][0]:
			var a: Array = p[i - 1]
			var b: Array = p[i]
			return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
	return p[p.size() - 1][1]

# ------------------------------------------------------------ 关卡
var id := ""
var layers: Array = []      # [{o0, min, max, lines: [{pts, x1, x2, boat}]}]
var start: Dictionary
var lamp: Dictionary
var frames: Array = []          # [{layer, x1, x2, y1, y2, target}]
var is_target := [false, false, false]
var has_frames := [false, false, false]
var lamps: Array = []           # [{layer, line, x, r, lit}]
var has_lamps := [false, false, false]

# ------------------------------------------------------------ 状态
var o: Array = [0.0, 0.0, 0.0]
var pushable: Array = []
var sel := -1
var p := {}
var foot := {}
var bloom := 0
var won := false
var won_t := 0
var frame := 0
var pushing := false
var push_dir := 0
var undo: Array = []
var events: Array = []
var snap_cache := {}
var lit: Array = []
var pc_key := ""
var pc_m := {}

func _init(L: Dictionary) -> void:
	id = str(L.id)
	for i in 3:
		var d: Dictionary = {"o": 0.0, "lines": []}
		if L.has("layers") and i < L.layers.size():
			d = L.layers[i]
		var o0: float = float(d.get("o", 0.0))
		var lines := []
		for l in d.get("lines", []):
			var pts := []
			for q in l.pts:
				pts.append([float(q[0]), float(q[1])])
			lines.append({"pts": pts, "x1": pts[0][0], "x2": pts[pts.size() - 1][0], "boat": bool(l.get("boat", false)), "faint": bool(l.get("faint", false))})
		layers.append({"o0": o0, "min": float(d.get("min", o0)), "max": float(d.get("max", o0)), "lines": lines})
	start = {"layer": int(L.start.layer), "line": int(L.start.line), "x": float(L.start.x)}
	lamp = {"layer": int(L.lamp.layer), "line": int(L.lamp.line), "x": float(L.lamp.x)}
	for f in L.get("frames", []):
		var fr := {"layer": int(f.layer), "x1": float(f.x1), "x2": float(f.x2), "y1": float(f.y1), "y2": float(f.y2), "target": int(f.target)}
		frames.append(fr)
		is_target[fr.target] = true
		has_frames[fr.layer] = true
	for m in L.get("lamps", []):
		var lm := {"layer": int(m.layer), "line": int(m.line), "x": float(m.x), "r": float(m.get("r", 40)), "lit": bool(m.get("lit", false))}
		lamps.append(lm)
		has_lamps[lm.layer] = true
	reset()

func reset() -> void:
	o = [layers[0].o0, layers[1].o0, layers[2].o0]
	pushable = []
	for i in 3:
		if layers[i].max > layers[i].min:
			pushable.append(i)
	sel = pushable[0] if pushable.size() > 0 else -1
	var st := start
	p = {"L": st.layer, "line": st.line, "x": st.x, "y": y_at(layers[st.layer].lines[st.line], st.x), "vx": 0.0, "vy": 0.0, "ground": true, "face": 1, "coyote": 0}
	foot = {"L": st.layer, "line": st.line, "x": st.x, "o": rnd(o[st.layer])}
	lit = []
	for m in lamps:
		lit.append(m.lit)
	pc_key = ""; pc_m = {}
	bloom = 0; won = false; won_t = 0; frame = 0
	pushing = false; push_dir = 0
	undo = []
	events = []
	snap_cache = {}

func emit(n: String, a = null) -> void:
	events.append([n, a])

func oi(k: int) -> float:
	return rnd(o[k])

func line() -> Dictionary:
	return layers[p.L].lines[p.line]

func sx() -> float:
	return p.x + o[p.L]

func snapshot() -> Dictionary:
	return {"o": o.duplicate(), "p": p.duplicate(), "foot": foot.duplicate(), "sel": sel, "lit": lit.duplicate()}

func restore(s: Dictionary) -> void:
	o = s.o.duplicate(); p = s.p.duplicate(); foot = s.foot.duplicate(); sel = s.sel; lit = s.lit.duplicate()
	bloom = 0; pushing = false; push_dir = 0

func lit_key() -> String:
	var k := ""
	for v in lit:
		k += "1" if v else "0"
	return k

func lamp_pos(i: int) -> Array:
	var m: Dictionary = lamps[i]
	return [m.x + oi(m.layer), y_at(layers[m.layer].lines[m.line], m.x)]

# 框景、虚实：第 j 层第 bi 条线现在露出来（且有路）的几段（层内 x 区间）
func pieces(j: int, bi: int) -> Array:
	var b: Dictionary = layers[j].lines[bi]
	if not is_target[j] and not b.faint:
		return [[b.x1, b.x2]]
	var key := "%d,%d,%d,%s" % [int(oi(0)), int(oi(1)), int(oi(2)), lit_key()]
	if pc_key != key:
		pc_key = key; pc_m = {}
	var ck := j * 1000 + bi
	if pc_m.has(ck):
		return pc_m[ck]
	var out := []
	var oj := oi(j)
	if is_target[j]:
		for f in frames:
			if f.target != j:
				continue
			var of_ := oi(f.layer)
			var a1: float = maxf(b.x1, f.x1 + of_ - oj)
			var a2: float = minf(b.x2, f.x2 + of_ - oj)
			if a2 - a1 >= 1:
				out.append([a1, a2])
		out.sort_custom(func(u, v): return u[0] < v[0])
	else:
		out = [[b.x1, b.x2]]
	if b.faint:
		var ls := []
		for i in lamps.size():
			if lit[i]:
				var lp := lamp_pos(i)
				ls.append([lp[0], lp[1], lamps[i].r])
		var res := []
		for q in out:
			var run := -1
			var x := int(ceil(q[0]))
			var xe := int(floor(q[1]))
			while x <= xe + 1:
				var on := false
				if x <= xe:
					var s_x: float = x + oj
					var s_y := y_at(b, x)
					for m in ls:
						var dx: float = s_x - m[0]
						var dy: float = s_y - m[1]
						if dx * dx + dy * dy <= m[2] * m[2]:
							on = true
							break
				if on and run < 0:
					run = x
				if not on and run >= 0:
					if x - 1 - run >= 1:
						res.append([float(run), float(x - 1)])
					run = -1
				x += 1
		out = res
	pc_m[ck] = out
	return out

# 她脚下有没有路
func supported() -> bool:
	for q in pieces(p.L, p.line):
		if p.x >= q[0] - 1e-6 and p.x <= q[1] + 1e-6:
			return true
	return false

# 她脚下这一段的左右端（层内 x）
func span() -> Array:
	var ps := pieces(p.L, p.line)
	var x: float = p.x
	for q in ps:
		if x >= q[0] - 1e-6 and x <= q[1] + 1e-6:
			return q
	return ps[0] if ps.size() > 0 else [x, x]

func can_push(k: int) -> bool:
	if not p.ground:
		return true
	if k == p.L and not line().boat:
		return false
	if is_target[p.L]:
		for f in frames:
			if f.target == p.L and f.layer == k:
				return false
	if line().faint and has_lamps[k]:
		return false
	return true

# 接缝点（与 core.js 同一算法，按其他层偏移缓存）
func snap_points(k: int) -> Array:
	var A: Dictionary = layers[k]
	var key := str(k) + ":"
	for j in 3:
		key += ("*" if j == k else str(oi(j))) + ","
	key += ":" + lit_key()
	if snap_cache.has(key):
		return snap_cache[key]
	var save: float = o[k]
	var out := []
	var v: float = A.min
	while v <= A.max:
		o[k] = v
		var ends := []
		for j in 3:
			var oj := oi(j)
			for bi in layers[j].lines.size():
				var b: Dictionary = layers[j].lines[bi]
				var cut: bool = (has_frames[k] and is_target[j]) or (b.faint and (has_lamps[k] or j == k))
				for q in pieces(j, bi):
					var m1: bool = (j == k) if q[0] == b.x1 else cut
					var m2: bool = (j == k) if q[1] == b.x2 else cut
					ends.append([q[0] + oj, y_at(b, q[0]), j, -1, m1])
					ends.append([q[1] + oj, y_at(b, q[1]), j, 1, m2])
		var lefts := {}
		for f in ends:
			if f[3] == -1:
				if lefts.has(f[0]):
					lefts[f[0]].append(f)
				else:
					lefts[f[0]] = [f]
		var hit := false
		for e in ends:
			if e[3] != 1 or not lefts.has(e[0]):
				continue
			for f in lefts[e[0]]:
				if f[2] == e[2]:
					continue
				if not e[4] and not f[4]:
					continue
				if absf(e[1] - f[1]) <= DY:
					hit = true
					break
			if hit:
				break
		if not hit:
			for f in frames:
				if f.target != k and f.layer != k:
					continue
				var t: int = f.target
				var ot := oi(t)
				var of_ := oi(f.layer)
				for b in layers[t].lines:
					for i in range(1, b.pts.size() - 1):
						var vx: float = b.pts[i][0] + ot
						if vx == f.x1 + of_ or vx == f.x2 + of_:
							hit = true
							break
					if hit:
						break
				if hit:
					break
		if hit:
			out.append(v)
		v += 1.0
	o[k] = save
	snap_cache[key] = out
	return out

# 返回 [s, d]；没有接缝点时 s = null
func nearest_snap(k: int, v: float) -> Array:
	var best = null
	var bd := 1e9
	for s in snap_points(k):
		var d := absf(s - v)
		if d < bd or (d == bd and s < best):
			bd = d; best = s
	return [best, bd]

func settle(k: int, v: float) -> float:
	var n := nearest_snap(k, v)
	if n[0] != null and n[1] <= SNAP:
		return n[0]
	return minf(layers[k].max, maxf(layers[k].min, rnd(v)))

func find_transfer(dir: int):
	var L: int = p.L
	var a := line()
	var sp := span()
	var end_: float = sp[1] if dir > 0 else sp[0]
	var ex: float = end_ + oi(L)
	var ey := y_at(a, end_)
	var best = null
	for j in [2, 1, 0]:
		if j == L:
			continue
		var B: Dictionary = layers[j]
		var oj := oi(j)
		for bi in B.lines.size():
			var b: Dictionary = B.lines[bi]
			for q in pieces(j, bi):
				var bx1: float = q[0] + oj
				var bx2: float = q[1] + oj
				var s_x: float
				if dir > 0:
					if not (bx1 <= ex + GAP and bx2 >= ex + GAP):
						continue
					s_x = maxf(ex, bx1)
				else:
					if not (bx2 >= ex - GAP and bx1 <= ex - GAP):
						continue
					s_x = minf(ex, bx2)
				var dy := absf(y_at(b, s_x - oj) - ey)
				if dy > DY:
					continue
				if best == null or dy < best.dy:
					best = {"L": j, "line": bi, "x": s_x - oj, "dy": dy, "lo": q[0], "hi": q[1]}
	return best

# ------------------------------------------------------------ 每帧
# inp: {dir: -1|0|1, jump: bool, push: bool, sel: -1|层号, undo: bool}
func step(inp: Dictionary) -> void:
	events.clear()
	frame += 1
	if won:
		won_t += 1
		return
	if inp.undo and undo.size() > 0:
		restore(undo.pop_back()); emit("undo")
		return
	if inp.sel >= 0 and pushable.has(inp.sel) and inp.sel != sel:
		sel = inp.sel; emit("sel", sel)

	if bloom > 0:
		bloom -= 1
		if bloom == 0:
			var l: Dictionary = layers[foot.L].lines[foot.line]
			p.L = foot.L; p.line = foot.line; p.x = foot.x; p.y = y_at(l, foot.x)
			p.vx = 0.0; p.vy = 0.0; p.ground = true
			if not supported() or oi(foot.L) != foot.o:
				var st := start
				l = layers[st.layer].lines[st.line]
				p.L = st.layer; p.line = st.line; p.x = st.x; p.y = y_at(l, st.x)
				foot.L = st.layer; foot.line = st.line; foot.x = st.x; foot.o = oi(st.layer)
			emit("respawn")
		return

	var want_push: bool = inp.push and p.ground and sel >= 0
	var drag = inp.get("drag", null)
	var dragging: bool = drag != null
	if want_push and (inp.dir != 0 or dragging):
		var k := sel
		var A: Dictionary = layers[k]
		var d: int = int(signf(drag)) if dragging else int(inp.dir)
		if not can_push(k):
			if not pushing and d != 0:
				emit("locked", k)
			p.vx = 0.0
			return
		if not pushing or (d != 0 and push_dir != d):
			if not pushing:
				undo.append(snapshot())
			pushing = true
			if d != 0:
				push_dir = d; emit("push", k)
		var v: float = (drag * PAR[k]) if dragging else (PUSH[k] * inp.dir)
		var n := nearest_snap(k, o[k])
		if n[0] != null and n[1] <= SNAP:
			v *= DRAG_SLOW if dragging else SNAP_SLOW
		o[k] = minf(A.max, maxf(A.min, o[k] + v))
		p.vx = 0.0
		return
	if pushing:
		var k := sel
		var s := settle(k, o[k])
		var snapped: bool = s != rnd(o[k]) or absf(s - o[k]) > 1e-9
		o[k] = s; pushing = false; push_dir = 0
		emit("settle", [k, snapped])
		if undo.size() > 0 and undo[undo.size() - 1].o[k] == o[k]:
			undo.pop_back()
	if inp.push:
		p.vx = 0.0
		return

	var lay: Dictionary = layers[p.L]
	if inp.dir != 0:
		p.face = inp.dir
	if p.ground:
		if inp.jump:
			p.ground = false; p.vy = -HOP; p.vx = inp.dir * WALK; p.coyote = 0; emit("hop")
		else:
			p.vx = inp.dir * WALK
			var nx: float = p.x + p.vx
			var a := line()
			var sp := span()
			if nx > sp[1] or nx < sp[0]:
				var dir := 1 if nx > sp[1] else -1
				var t = find_transfer(dir)
				if t != null:
					undo.append(snapshot())
					var over: float = (nx - sp[1]) if dir > 0 else (nx - sp[0])
					p.L = t.L; p.line = t.line; p.x = t.x + over
					var b := line()
					p.x = minf(t.hi, maxf(t.lo, p.x))
					p.y = y_at(b, p.x)
					emit("borrow", t.L)
				else:
					p.x = nx; p.ground = false; p.vy = 0.0; p.coyote = COYOTE; emit("edge")
			else:
				p.x = nx; p.y = y_at(a, nx)
	if not p.ground:
		if inp.jump and p.coyote > 0 and p.vy >= 0:
			p.vy = -HOP; p.coyote = 0; emit("hop")
		if p.coyote > 0:
			p.coyote -= 1
		p.vx = inp.dir * WALK
		var py: float = p.y
		p.vy = minf(FALL_MAX, p.vy + GRAV)
		p.x += p.vx; p.y += p.vy
		if p.vy > 0:
			for i in lay.lines.size():
				var l: Dictionary = lay.lines[i]
				if p.x < l.x1 or p.x > l.x2:
					continue
				if is_target[p.L] or l.faint:
					var inside := false
					for q in pieces(p.L, i):
						if p.x >= q[0] and p.x <= q[1]:
							inside = true
					if not inside:
						continue
				var ly := y_at(l, p.x)
				if py <= ly + 0.001 and p.y >= ly:
					p.y = ly; p.ground = true; p.vy = 0.0; p.line = i; emit("land")
					break
		if not p.ground and p.y > FALL_Y:
			bloom = BLOOM; emit("fall")

	if p.ground:
		var sp2 := span()
		if p.x >= sp2[0] + 3 and p.x <= sp2[1] - 3:
			foot.L = p.L; foot.line = p.line; foot.x = p.x; foot.o = oi(p.L)
		for i in lamps.size():
			var m: Dictionary = lamps[i]
			if not lit[i] and p.L == m.layer and p.line == m.line and absf(p.x - m.x) <= LAMP:
				lit[i] = true; emit("light", i)
		if p.L == lamp.layer and p.line == lamp.line and absf(p.x - lamp.x) <= LAMP:
			won = true; emit("win")

func screen_offset(k: int) -> float:
	return oi(k)

# 回放核对用的一行状态（与 solve.js 的 stateLine 同格式）
func state_line() -> String:
	return "%.3f,%.3f,%.3f %d %d %.3f %.3f %d" % [o[0], o[1], o[2], p.L, p.line, p.x, p.y, 1 if won else 0]
