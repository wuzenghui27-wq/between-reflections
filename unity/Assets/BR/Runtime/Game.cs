// 游戏逻辑：一行一行照着网页版 js/game.js（以及 Godot 版 godot/game.gd）搬过来，同样的步骤、同样的数，不碰画面和声音。
// 自己左右走、跳，Shift 切换昼夜；白天会动的东西在动，夜里全部停住。点亮本景的宫灯，院门打开，走到下一景。
using System;
using System.Collections.Generic;
using System.Linq;

namespace BR
{
    public class Game
    {
        const double INF = double.PositiveInfinity;
        public readonly Level LV;
        public readonly Dictionary<string, double> C;
        readonly double HW;

        public event Action<string, object> Ev;

        // 状态：title | intro | running | failing | paused | arrived | ended
        public string state = "title", prevState = "";
        public double px, foot, vx, vy;
        public int face = 1;
        public bool onGround = true;
        public double coyote, jumpBuf;
        public bool jumpRise, inL, inR;
        public double walkDist;
        public string world = "day";
        public int room;
        public double camX, dclock, mclock;
        public HashSet<string> gates = new HashSet<string>();
        public HashSet<int> got = new HashSet<int>();
        public double animT, timer;
        public bool pendingSwitch;
        public double pushT, swT = 9, roomT;
        public string wipeFrom = "";
        public double wipeT = -1, fade;
        public Dictionary<string, double> flashes = new Dictionary<string, double>();
        public double blockedT, landT = 9;
        public bool riding;
        public HashSet<string> shown = new HashSet<string>();
        public List<string> weather = new List<string>();

        public Game(Level level)
        {
            LV = level;
            C = level.C;
            HW = C["HALF_W"];
            RollWeather(() => 0.01);
            Reset();
        }

        public static string Other(string w) => w == "day" ? "night" : "day";
        static bool Active(string wObj, string w) => wObj == "both" || wObj == w;
        void Emit(string name, object arg = null) => Ev?.Invoke(name, arg);
        static double Sign(double v) => v > 0 ? 1 : v < 0 ? -1 : 0;

        // ------------------------------------------------------------ 几何查询
        static bool BoxOn(Obj h, string w, HashSet<string> g) => Active(h.w, w) && !(h.gate != "" && g.Contains(h.gate));

        double SupportY(string w, double x, double ft, double tol, HashSet<string> g)
        {
            double best = INF;
            foreach (var s in LV.solids)
            {
                if (s.x1 < x - HW || s.x0 > x + HW || !Active(s.w, w)) continue;
                if (s.y >= ft - tol && s.y <= ft + 1.0 && s.y < best) best = s.y;
            }
            foreach (var h in LV.hazards)
            {
                if (h.x1 < x - HW || h.x0 > x + HW || !BoxOn(h, w, g)) continue;
                if (h.y0 >= ft - tol && h.y0 <= ft + 1.0 && h.y0 < best) best = h.y0;
            }
            foreach (var m in LV.movers)
            {
                if (m.x1 < x - HW || m.x0 > x + HW) continue;
                if (m.y >= ft - tol && m.y <= ft + 1.0 && m.y < best) best = m.y;
            }
            foreach (var c in LV.crates)
            {
                if (c.x1 < x - HW || c.x0 > x + HW) continue;
                if (c.y0 >= ft - tol && c.y0 <= ft + 1.0 && c.y0 < best) best = c.y0;
            }
            return best;
        }

        public Obj BodyHit(string w, double x, double ft, HashSet<string> g)
        {
            double l = x - HW + 1.0, r = x + HW - 1.0, top = ft - C["BODY_H"];
            foreach (var s in LV.solids)
            {
                if (s.thin || s.x1 <= l || s.x0 >= r || !Active(s.w, w)) continue;
                if (s.y < ft - 0.5) return s;
            }
            foreach (var h in LV.hazards)
            {
                if (h.x1 <= l || h.x0 >= r || !BoxOn(h, w, g)) continue;
                if (top < h.y1 && ft - 0.5 > h.y0) return h;
            }
            foreach (var c in LV.crates)
            {
                if (c.x1 <= l || c.x0 >= r) continue;
                if (top < c.y1 && ft - 0.5 > c.y0) return c;
            }
            return null;
        }

        // 昼动夜静：踏板的位置只由“白天走过的拍数”决定
        public static void PlaceMover(Mover m, double clock)
        {
            double ph = clock / m.period * Math.PI * 2.0 + m.phase, x, y;
            if (m.kind == "wheel") { x = m.cx + m.r * Math.Cos(ph); y = m.cy + m.r * Math.Sin(ph); }
            else if (m.kind == "swing")
            {
                double th = m.amp * Math.Sin(ph);
                x = m.cx + m.r * Math.Sin(th); y = m.cy + m.r * Math.Cos(th);
                m.th = th;
            }
            else { x = m.cx + m.amp * Math.Sin(ph); y = m.cy; }
            m.dir = Math.Cos(ph) >= 0 ? 1 : -1;
            m.x0 = x - m.hw; m.x1 = x + m.hw; m.y = y; m.ang = ph;
        }

        public Room RoomOf() => LV.rooms[room];

        void SetWorld(string w) { world = w; Emit("world", w); }

        // 进一景（或重来这一景）：人回到开头，这一景的灯、铃、踏板都还原
        public void LoadRoom(int i, bool keepCam = false)
        {
            var r = LV.rooms[i];
            room = i; px = r.sx; foot = r.sy; vx = 0; vy = 0; face = 1;
            onGround = true; coyote = 0; jumpBuf = 0;
            SetWorld(r.world);
            foreach (var l in LV.lanterns) { if (l.room >= i) got.Remove(l.i); else got.Add(l.i); }
            gates.Clear();
            foreach (var q in LV.rooms) if (q.i < i) gates.Add(q.exit);
            foreach (var b in LV.bells) if (b.x < r.x0) gates.Add(b.id);
            foreach (var e in LV.eaves) e.y = r.world == "day" ? e.yd : e.yn;
            dclock = 0;
            foreach (var m in LV.movers) PlaceMover(m, 0);
            foreach (var c in LV.crates)
            {
                if (c.room < i) continue;
                c.x0 = c.ix - c.cw / 2.0; c.x1 = c.ix + c.cw / 2.0; c.y1 = c.iy; c.y0 = c.iy - c.ch;
                c.vy = 0; c.wet = false; c.floating = false;
            }
            foreach (var p in LV.plates) { p.down = false; if (p.x < r.x0) gates.Add(p.id); }
            if (!keepCam) camX = r.x0;
            wipeT = -1; pendingSwitch = false; flashes.Clear(); fade = 0;
        }

        public void Reset() { shown.Clear(); got.Clear(); gates.Clear(); LoadRoom(0); }

        public void RollWeather(Func<double> rnd)
        {
            weather.Clear();
            foreach (var r in LV.regions)
            {
                var ws = r.weathers;
                double sum = 0;
                foreach (var kv in ws) sum += Json.D(kv.Value);
                double t = rnd() * sum;
                string pick = ws.Keys.First();
                foreach (var kv in ws) { t -= Json.D(kv.Value); if (t <= 0) { pick = kv.Key; break; } }
                weather.Add(pick);
            }
        }

        void EnterRoom(int i)
        {
            var r = LV.rooms[i];
            if (shown.Add("r" + r.region)) Emit("region", r.region);
            roomT = 0;
            Emit("room", i);
        }

        public void Start(int at = 0)
        {
            Reset();
            if (at > 0) LoadRoom(at);
            state = "intro"; timer = 0;
            Emit("intro");
        }

        public void BeginRunning() { state = "running"; Emit("run"); EnterRoom(room); }

        public void Retry() { LoadRoom(room); state = "running"; fade = 0.5; Emit("retry"); }

        public bool Pause()
        {
            if (state != "running" && state != "intro" && state != "failing") return false;
            prevState = state; state = "paused"; inL = false; inR = false;
            Emit("paused");
            return true;
        }

        public void Resume() { if (state != "paused") return; state = prevState; Emit("resumed"); }

        // ------------------------------------------------------------ 输入
        public void InputSwitch() { if (state == "intro") BeginRunning(); else if (state == "running") pendingSwitch = true; }
        public void InputJump() { if (state == "intro") BeginRunning(); else if (state == "running") jumpBuf = C["JUMP_BUFFER"]; }
        public void InputJumpRelease()
        {
            if (state != "running") return;
            jumpBuf = 0;
            if (jumpRise && vy < -C["JUMP_V"] * C["JUMP_CUT"]) vy = -C["JUMP_V"] * C["JUMP_CUT"];
            jumpRise = false;
        }
        public void InputMove(int dir, bool down)
        {
            if (state == "intro" && down) BeginRunning();
            if (dir < 0) inL = down; else inR = down;
        }
        public void InputRetry() { if (state == "running") Retry(); }

        // 另一面此刻能不能切过去（脚下记号用）
        public bool OtherSafe()
        {
            var hit = BodyHit(Other(world), px, foot, gates);
            return hit == null || (hit.gate == "" && hit.type == "solid" && foot - hit.y <= C["STEP_UP"]);
        }

        // 木箱往旁边挪 dx 以后会不会撞上东西
        bool CrateFree(Obj c, double dx)
        {
            double x0 = c.x0 + dx, x1 = c.x1 + dx;
            var rm = LV.rooms[c.room];
            if (x0 < rm.x0 || x1 > rm.x1) return false;
            foreach (var s in LV.solids)
            {
                if (s.thin || !Active(s.w, world) || s.x1 <= x0 || s.x0 >= x1 || s.y >= c.y1 - 1.0) continue;
                if (s.x1 > c.x0 && s.x0 < c.x1 && Math.Min(s.x1, x1) - Math.Max(s.x0, x0) <= Math.Min(s.x1, c.x1) - Math.Max(s.x0, c.x0)) continue;
                return false;
            }
            foreach (var h in LV.hazards)
            {
                if (!BoxOn(h, world, gates) || h.x1 <= x0 || h.x0 >= x1) continue;
                if (h.y0 < c.y1 - 1.0 && h.y1 > c.y0 + 1.0) return false;
            }
            foreach (var q in LV.crates)
            {
                if (q == c || q.x1 <= x0 || q.x0 >= x1) continue;
                if (q.y0 < c.y1 - 1.0 && q.y1 > c.y0 + 1.0) return false;
            }
            return true;
        }

        // ------------------------------------------------------------ 物理一步
        public void Physics(double dt)
        {
            var r = RoomOf();
            double STEP_UP = C["STEP_UP"];
            // 1) 切换：另一面这里是实心的就切不过去
            if (pendingSwitch)
            {
                pendingSwitch = false;
                string to = Other(world);
                var hit = BodyHit(to, px, foot, gates);
                double up = INF;
                if (hit != null && hit.type == "solid" && foot - hit.y <= STEP_UP && BodyHit(to, px, hit.y, gates) == null) { up = hit.y; hit = null; }
                if (hit != null) { blockedT = 0.35; Emit("blocked"); }
                else
                {
                    string from = world;
                    SetWorld(to);
                    if (up != INF) { foot = up; vy = 0; onGround = true; }
                    wipeFrom = from; wipeT = 0; swT = 0;
                    Emit("switched", world);
                }
            }
            // 2) 跳
            if (jumpBuf > 0)
            {
                jumpBuf -= dt;
                if (onGround || coyote > 0)
                {
                    vy = -C["JUMP_V"]; onGround = false; coyote = 0; jumpBuf = 0; jumpRise = true;
                    Emit("jump");
                }
            }
            // 3) 飞檐升降，站在上面的人跟着走
            foreach (var e in LV.eaves)
            {
                double tgt = world == "day" ? e.yd : e.yn;
                if (e.y == tgt) continue;
                bool on = onGround && px >= e.x0 - HW && px <= e.x1 + HW && Math.Abs(foot - e.y) < 0.6;
                double st = C["EAVE_V"] * dt;
                e.y = Math.Abs(tgt - e.y) <= st ? tgt : e.y + Sign(tgt - e.y) * st;
                if (on) foot = e.y;
            }
            // 4) 昼动夜静
            Mover ride = null;
            if (onGround)
                foreach (var m in LV.movers)
                    if (px >= m.x0 - HW && px <= m.x1 + HW && Math.Abs(foot - m.y) < 0.6) { ride = m; break; }
            double rx = ride != null ? (ride.x0 + ride.x1) / 2.0 : 0;
            if (world == "day")
            {
                dclock += dt / C["BEAT_SEC"];
                foreach (var m in LV.movers) PlaceMover(m, dclock);
            }
            riding = ride != null;
            if (ride != null)
            {
                double nx = px + (ride.x0 + ride.x1) / 2.0 - rx;
                if (BodyHit(world, nx, ride.y, gates) == null) { px = nx; foot = ride.y; }
                else { onGround = false; coyote = C["COYOTE"]; vy = 0; }
            }
            // 4.5) 木箱：水涨船高
            string rid = LV.regions[r.region].id;
            LV.WATER.TryGetValue(rid, out var wl);
            foreach (var c in LV.crates)
            {
                if (c.room != room || c.y1 > C["FALL_LIMIT"] + 200.0) continue;
                bool on = onGround && px >= c.x0 - HW && px <= c.x1 + HW && Math.Abs(foot - c.y0) < 0.6;
                double sup = INF;
                foreach (var s in LV.solids)
                {
                    if (!Active(s.w, world) || Math.Min(s.x1, c.x1) - Math.Max(s.x0, c.x0) < 8.0) continue;
                    if (s.y >= c.y1 - 2.0 && s.y < sup) sup = s.y;
                }
                foreach (var h in LV.hazards)
                {
                    if (!BoxOn(h, world, gates) || Math.Min(h.x1, c.x1) - Math.Max(h.x0, c.x0) < 8.0) continue;
                    if (h.y0 >= c.y1 - 2.0 && h.y0 < sup) sup = h.y0;
                }
                foreach (var q in LV.crates)
                {
                    if (q == c || Math.Min(q.x1, c.x1) - Math.Max(q.x0, c.x0) < 8.0) continue;
                    if (q.y0 >= c.y1 - 2.0 && q.y0 < sup) sup = q.y0;
                }
                bool frozen = wl != null && wl.frozen == world;
                if (frozen && c.wet)
                {
                    c.floating = false; c.vy = 0;
                    c.y1 = Math.Max(wl.Get(world), c.y1 - 220.0 * dt);
                    c.y0 = c.y1 - c.ch;
                    if (on) foot = c.y0;
                    continue;
                }
                double fl = wl != null ? wl.Get(world) + C["FLOAT"] : INF;
                double tgt = Math.Min(sup, fl);
                if (c.y1 < tgt - 0.01)
                {
                    c.vy = Math.Min(C["FALL_MAX"], c.vy + C["GRAVITY"] * dt);
                    c.y1 = Math.Min(tgt, c.y1 + c.vy * dt);
                    if (wl != null && !c.wet && c.y1 > wl.Get(world) + 6.0) { c.wet = true; Emit("csplash", c); }
                }
                else if (c.y1 > tgt + 0.01) { c.vy = 0; c.y1 = Math.Max(tgt, c.y1 - 220.0 * dt); }
                else
                {
                    c.y1 = tgt;
                    if (c.vy > 200.0) Emit("cland", c);
                    c.vy = 0;
                }
                c.y0 = c.y1 - c.ch;
                c.floating = tgt == fl && Math.Abs(c.y1 - fl) < 1.0;
                if (!c.floating && c.y1 == sup && !(wl != null && c.y1 > wl.day)) c.wet = false;
                double dx = 0;
                if (c.floating && world == "day")
                {
                    dx = C["DRIFT"] * dt;
                    if (!CrateFree(c, dx)) dx = 0;
                    c.x0 += dx; c.x1 += dx;
                }
                if (on)
                {
                    if (dx != 0 && BodyHit(world, px + dx, c.y0, gates) == null) px += dx;
                    foot = c.y0;
                }
            }
            // 5) 左右走
            int want = (inR ? 1 : 0) - (inL ? 1 : 0);
            double tv = want * C["WALK"];
            double acc = (onGround ? C["WALK_ACC"] : C["AIR_ACC"]) * dt;
            vx = Math.Abs(tv - vx) <= acc ? tv : vx + Sign(tv - vx) * acc;
            if (want != 0) face = want;
            if (vx != 0)
            {
                double nx2 = Math.Max(r.x0 + HW, px + vx * dt);
                var hit2 = BodyHit(world, nx2, foot, gates);
                if (hit2 == null) px = nx2;
                else if (hit2.type == "crate" && foot - hit2.y0 <= STEP_UP && vy >= 0 && BodyHit(world, nx2, hit2.y0, gates) == null)
                { px = nx2; foot = hit2.y0; onGround = true; vy = 0; }
                else if (hit2.type == "crate" && world == "day" && onGround && !hit2.floating && Math.Abs(hit2.y1 - foot) < 14.0 && Sign(vx) == Sign((hit2.x0 + hit2.x1) / 2.0 - px))
                {
                    double pdx = Sign(vx) * C["PUSH"] * dt;
                    if (CrateFree(hit2, pdx))
                    {
                        hit2.x0 += pdx; hit2.x1 += pdx; px += pdx;
                        vx = Sign(vx) * C["PUSH"]; pushT = 0.12;
                    }
                    else vx = 0;
                }
                else if (hit2.type == "solid" && foot - hit2.y <= STEP_UP && vy >= 0 && BodyHit(world, nx2, hit2.y, gates) == null)
                { px = nx2; foot = hit2.y; onGround = true; vy = 0; }
                else vx = 0;
                walkDist += Math.Abs(vx * dt);
            }
            // 6) 竖直
            if (onGround)
            {
                double sy = SupportY(world, px, foot, STEP_UP, gates);
                if (sy == INF)
                {
                    double low = SupportY(world, px, foot + STEP_UP, STEP_UP, gates);
                    if (low != INF) foot = low;
                    else { onGround = false; coyote = C["COYOTE"]; vy = 0; }
                }
                else foot = sy;
            }
            else
            {
                coyote = Math.Max(0, coyote - dt);
                vy = Math.Min(C["FALL_MAX"], vy + C["GRAVITY"] * dt);
                double nf = foot + vy * dt;
                if (vy > 0)
                {
                    double land = INF;
                    foreach (var t in LV.solids)
                    {
                        if (t.x1 < px - HW || t.x0 > px + HW || !Active(t.w, world)) continue;
                        if (t.y >= foot - 0.01 && t.y <= nf && t.y < land) land = t.y;
                    }
                    foreach (var h in LV.hazards)
                    {
                        if (h.x1 < px - HW || h.x0 > px + HW || !BoxOn(h, world, gates)) continue;
                        if (h.y0 >= foot - 0.01 && h.y0 <= nf && h.y0 < land) land = h.y0;
                    }
                    foreach (var m in LV.movers)
                    {
                        if (m.x1 < px - HW || m.x0 > px + HW) continue;
                        if (m.y >= foot - 0.01 - 6.0 && m.y <= nf && m.y < land) land = m.y;
                    }
                    foreach (var c in LV.crates)
                    {
                        if (c.x1 < px - HW || c.x0 > px + HW) continue;
                        if (c.y0 >= foot - 0.01 - 4.0 && c.y0 <= nf && c.y0 < land) land = c.y0;
                    }
                    if (land != INF)
                    {
                        foot = land; vy = 0; onGround = true; landT = 0; jumpRise = false;
                        Emit("land");
                    }
                    else foot = nf;
                }
                else
                {
                    bool bump = false;
                    double top0 = foot - C["BODY_H"], top1 = nf - C["BODY_H"];
                    foreach (var h in LV.hazards)
                    {
                        if (h.x1 <= px - HW + 1.0 || h.x0 >= px + HW - 1.0 || !BoxOn(h, world, gates)) continue;
                        if (top0 >= h.y1 && top1 < h.y1) { bump = true; foot = h.y1 + C["BODY_H"]; }
                    }
                    if (bump) vy = 0; else foot = nf;
                }
            }
            if (foot > C["FALL_LIMIT"])
            {
                state = "failing"; timer = 0;
                Emit("fail");
                return;
            }
            // 6.5) 踏石：人或木箱压着，对应的门就开着；松开就关（人正站在门洞里时先不关）
            foreach (var p in LV.plates)
            {
                if (p.x < r.x0 || p.x > r.x1) continue;
                bool me = onGround && Math.Abs(px - p.x) < p.hw + HW - 4.0 && Math.Abs(foot - p.y) < 1.5;
                bool ec = false;
                foreach (var c in LV.crates)
                    if (Math.Abs((c.x0 + c.x1) / 2.0 - p.x) < p.hw + 8.0 && Math.Abs(c.y1 - p.y) < 1.5) { ec = true; break; }
                bool down = me || ec;
                if (down != p.down) { p.down = down; Emit("plate", p); }
                if (down)
                {
                    if (gates.Add(p.id)) flashes[p.id] = 0.5;
                }
                else if (gates.Remove(p.id))
                {
                    if (BodyHit(world, px, foot, gates) != null) gates.Add(p.id);
                }
            }
            // 7) 铃
            foreach (var b in LV.bells)
            {
                if (gates.Contains(b.id) || !Active(b.w, world)) continue;
                if (Math.Abs(b.x - px) < HW + 18.0 && foot - C["BODY_H"] - 14.0 < b.y && foot + 4.0 > b.y - 20.0)
                {
                    gates.Add(b.id); flashes[b.id] = 1.2;
                    Emit("bell", b);
                }
            }
            // 8) 宫灯
            foreach (var l in LV.lanterns)
            {
                if (got.Contains(l.i) || l.room != room || !Active(l.w, world)) continue;
                if (Math.Abs(l.x - px) < HW + 16.0 && l.y > foot - C["BODY_H"] - 30.0 && l.y < foot + 10.0)
                {
                    got.Add(l.i); flashes["l" + l.i] = 1.0;
                    Emit("lantern", l);
                    if (r.lamps.All(k => got.Contains(k)))
                    {
                        gates.Add(r.exit); flashes[r.exit] = 1.2;
                        Emit("roomClear", r);
                    }
                }
            }
            // 9) 走出这一景
            if (px > r.x1 + HW)
            {
                if (room + 1 >= LV.rooms.Count)
                {
                    state = "arrived"; timer = 0;
                    Emit("arrive");
                    return;
                }
                room++;
                var n = RoomOf();
                dclock = 0;
                foreach (var m in LV.movers) PlaceMover(m, 0);
                if (world != n.world)
                {
                    string from2 = world;
                    SetWorld(n.world);
                    wipeFrom = from2; wipeT = 0;
                }
                Emit("checkpoint", room);
                EnterRoom(room);
            }
        }

        // ------------------------------------------------------------ 更新（固定步长 1/60）
        public void Update(double dt)
        {
            if (state == "paused") return;
            animT += dt; landT += dt;
            if (wipeT >= 0) { wipeT += dt; if (wipeT >= C["SWITCH_WIPE"]) wipeT = -1; }
            if (blockedT > 0) blockedT -= dt;
            swT += dt; roomT += dt;
            if (pushT > 0) pushT -= dt;
            foreach (var k in flashes.Keys.ToList()) { flashes[k] -= dt; if (flashes[k] <= 0) flashes.Remove(k); }
            if (state == "title" || state == "ended") return;
            mclock += dt / C["BEAT_SEC"];
            double tx = RoomOf().x0;
            camX += (tx - camX) * (1.0 - Math.Exp(-dt * 7.0));
            if (Math.Abs(tx - camX) < 0.5) camX = tx;
            switch (state)
            {
                case "intro":
                    timer += dt;
                    if (timer >= 3.0) BeginRunning();
                    break;
                case "running":
                    fade = Math.Max(0, fade - dt / 0.35);
                    Physics(dt);
                    break;
                case "failing":
                    timer += dt;
                    fade = Math.Min(1, Math.Max(0, timer / 0.3));
                    vy += C["GRAVITY"] * dt * 0.5;
                    foot += vy * dt * 0.5;
                    if (timer >= 0.3) { LoadRoom(room, true); fade = 0.8; state = "running"; Emit("retry"); }
                    break;
                case "arrived":
                    timer += dt;
                    if (timer > 2.6) { state = "ended"; Emit("ended"); }
                    break;
            }
        }
    }
}
