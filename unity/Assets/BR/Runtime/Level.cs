// 关卡：读 shared/data/rooms.json 与 rules.json，搭成逻辑坐标（一像素 = SUB 个逻辑单位）。
// 与网页版 js/level.js、Godot 版 godot/level.gd 一一对应；数都用 double，结果和网页版逐位相同。
using System;
using System.Collections.Generic;
using static BR.Json;

namespace BR
{
    public class Obj
    {
        public string type = "";     // solid / hazard / crate
        public double x0, x1, y, y0, y1;
        public string w = "both";
        public string kind = "";
        public bool thin, eave;
        public double yd, yn;
        public string gate = "";
        public bool exit;
        public string style = "";
        public int order;
        // 木箱
        public double ix, iy, cw, ch, vy;
        public int room;
        public bool wet, floating, hasTx;
        public double tx;
    }

    public class Bell { public string id = ""; public double x, y; public string w = "both"; public string kind = "bell"; }
    public class Lantern { public int i; public double x, y; public string w = "both"; public int room; }
    public class Plate { public string id = ""; public double x, y, hw = 30; public bool down; }

    public class Mover
    {
        public string kind = "", style = "";
        public double cx, cy, r, amp, period = 1, phase, hw = 24;
        public int group;
        public string w = "both";
        public double x0, x1, y;
        public int dir = 1;
        public double ang, th;
    }

    public class Room
    {
        public int i;
        public string name = "", line = "";
        public double x0, x1;
        public string world = "day";
        public List<int> lamps = new List<int>();
        public int region;
        public double sx, sy, exitY;
        public string exit = "";
        public Dictionary<string, object> hint;
    }

    public class Region
    {
        public string id, no, name, line;
        public Dictionary<string, object> weathers;
        public double x0, x1;
    }

    public class Water { public double day, night; public string frozen = ""; public double Get(string w) => w == "day" ? day : night; }

    public class Level
    {
        static readonly HashSet<string> THIN = new HashSet<string> { "boat", "firefly", "ice", "plank", "eave", "moored" };
        static readonly Dictionary<string, double[]> HZ = new Dictionary<string, double[]>
        {
            { "stall", new double[] { 56, 100 } }, { "door", new double[] { 40, 132 } }, { "gate", new double[] { 36, 140 } },
            { "drum", new double[] { 60, 92 } }, { "beacon", new double[] { 40, 112 } }, { "pile", new double[] { 20, 90 } },
            { "block", new double[] { 32, 28 } }, { "rock", new double[] { 40, 32 } }, { "shard", new double[] { 40, 28 } },
            { "mani", new double[] { 44, 36 } }, { "yak", new double[] { 70, 80 } },
        };

        public readonly Dictionary<string, double> C = new Dictionary<string, double>();   // 规则（逻辑单位）
        public readonly Dictionary<string, Water> WATER = new Dictionary<string, Water>();
        public readonly List<Region> regions = new List<Region>();
        public readonly List<Room> rooms = new List<Room>();
        public readonly List<Obj> solids = new List<Obj>(), hazards = new List<Obj>(), crates = new List<Obj>(), eaves = new List<Obj>();
        public readonly List<Bell> bells = new List<Bell>();
        public readonly List<Lantern> lanterns = new List<Lantern>();
        public readonly List<Plate> plates = new List<Plate>();
        public readonly List<Mover> movers = new List<Mover>();
        public double totalX;

        double ox; int gateN; Room cur; int order;

        public Level(string rulesJson, string roomsJson)
        {
            var R = O(Parse(rulesJson));
            double sub = D(R["SUB"]);
            foreach (var kv in R) if (kv.Value is double v) C[kv.Key] = v;
            foreach (var k in new[] { "GROUND", "HALF_W", "BODY_H", "STEP_UP", "PUSH", "DRIFT", "CRATE", "FLOAT", "WALK", "WALK_ACC", "AIR_ACC", "FALL_MAX", "GRAVITY", "JUMP_V", "EAVE_V", "FALL_LIMIT", "W", "H" })
                C[k] = D(R[k]) * sub;
            C["PIX"] = sub;
            C["BEAT_SEC"] = 60.0 / D(R["BPM"]);
            foreach (var kv in O(R["WATER"]))
            {
                var wl = O(kv.Value);
                WATER[kv.Key] = new Water { day = D(wl["day"]) * sub, night = D(wl["night"]) * sub, frozen = S(G(wl, "frozen")) };
            }
            Build(O(Parse(roomsJson)));
        }

        double Px(object v) => D(v) * C["PIX"];

        void Build(Dictionary<string, object> Dd)
        {
            var drooms = A(Dd["rooms"]);
            var dregions = A(Dd["regions"]);
            for (int ri = 0; ri < drooms.Count; ri++)
            {
                var rm = O(drooms[ri]);
                if (ri == 0 || I(O(drooms[ri - 1])["region"]) != I(rm["region"]))
                {
                    var g = O(dregions[I(rm["region"])]);
                    if (regions.Count > 0) regions[regions.Count - 1].x1 = ox;
                    regions.Add(new Region { id = S(g["id"]), no = S(g["no"]), name = S(g["name"]), line = S(g["line"]), weathers = O(g["weathers"]), x0 = ox, x1 = double.PositiveInfinity });
                }
                BeginRoom(rm);
                if (rm.ContainsKey("hint")) cur.hint = O(rm["hint"]);
                foreach (var it in A(rm["items"])) Item(O(it));
                EndRoom();
            }
            regions[regions.Count - 1].x1 = ox;
            totalX = ox;
            Comparison<Obj> cmp = (a, b) => a.x0 != b.x0 ? a.x0.CompareTo(b.x0) : a.order.CompareTo(b.order);
            solids.Sort(cmp);
            hazards.Sort(cmp);
        }

        void BeginRoom(Dictionary<string, object> rm)
        {
            cur = new Room
            {
                i = rooms.Count, name = S(rm["name"]), line = S(G(rm, "line")),
                x0 = ox, x1 = ox + C["W"], world = S(rm["world"]), region = regions.Count - 1,
                sx = ox + Px(rm["sx"]), sy = Px(rm["sy"]), exitY = Px(rm["exitY"]),
            };
        }

        void EndRoom()
        {
            var eg = Box(1225.0, "both", "gate", cur.exitY);
            eg.gate = "exit" + cur.i;
            eg.exit = true;
            eg.style = "bell";
            cur.exit = eg.gate;
            rooms.Add(cur);
            ox += C["W"];
        }

        static double Opt(Dictionary<string, object> it, string k, double def) { var v = G(it, k); return v == null ? def : D(v); }

        void Item(Dictionary<string, object> it)
        {
            switch (S(it["t"]))
            {
                case "ground": Ground(Px(it["x0"]), Px(it["x1"]), Px(it["y"]), S(it["w"]), S(it["kind"])); break;
                case "box": Box(Px(it["x"]), S(it["w"]), S(it["kind"]), Px(it["y"])); break;
                case "lamp":
                {
                    var l = new Lantern { i = lanterns.Count, x = ox + Px(it["x"]), y = Px(it["y"]) - 34.0, w = S(it["w"]), room = rooms.Count };
                    lanterns.Add(l);
                    cur.lamps.Add(l.i);
                    break;
                }
                case "bellGate":
                {
                    gateN++;
                    var b = new Bell { id = "g" + gateN, x = ox + Px(it["bx"]), y = Px(it["by"]), w = S(it["bw"]), kind = G(it, "kind") == null ? "bell" : S(it["kind"]) };
                    bells.Add(b);
                    var g = Box(Px(it["gx"]), "both", "gate", Px(it["gy"]));
                    g.gate = b.id;
                    g.style = b.kind;
                    break;
                }
                case "crate":
                {
                    double s = C["CRATE"];
                    var c = new Obj { type = "crate", ix = ox + Px(it["x"]), iy = Px(it["y"]), cw = s, ch = s, room = rooms.Count };
                    c.x0 = c.ix - s / 2.0; c.x1 = c.ix + s / 2.0; c.y0 = c.iy - s; c.y1 = c.iy;
                    if (G(it, "tx") != null) { c.hasTx = true; c.tx = ox + Px(it["tx"]); }
                    crates.Add(c);
                    break;
                }
                case "plateGate":
                {
                    gateN++;
                    var p = new Plate { id = "p" + gateN, x = ox + Px(it["px"]), y = Px(it["py"]) };
                    plates.Add(p);
                    var g = Box(Px(it["gx"]), "both", "gate", Px(it["gy"]));
                    g.gate = p.id;
                    g.style = "plate";
                    break;
                }
                case "eave":
                {
                    var e = Ground(Px(it["x0"]), Px(it["x1"]), Px(it["yd"]), "both", "eave");
                    e.eave = true; e.yd = Px(it["yd"]); e.yn = Px(it["yn"]);
                    eaves.Add(e);
                    break;
                }
                case "wheel":
                {
                    int gi = movers.Count, n = I(it["n"]);
                    for (int k = 0; k < n; k++)
                        movers.Add(new Mover
                        {
                            kind = "wheel", style = S(G(it, "style")), cx = ox + Px(it["cx"]), cy = Px(it["cy"]), r = Px(it["r"]),
                            period = D(it["period"]), phase = (double)k / n * Math.PI * 2.0, hw = Px(it["hw"]), group = gi,
                        });
                    break;
                }
                case "swing":
                    movers.Add(new Mover
                    {
                        kind = "swing", cx = ox + Px(it["cx"]), cy = Px(it["cy"]), r = Px(it["r"]), amp = D(it["amp"]),
                        period = D(it["period"]), phase = Opt(it, "phase", 0), hw = Px(it["hw"]),
                    });
                    break;
                case "drift":
                    movers.Add(new Mover
                    {
                        kind = "drift", style = S(G(it, "style")), cx = ox + Px(it["cx"]), cy = Px(it["cy"]), amp = Px(it["amp"]),
                        period = D(it["period"]), phase = Opt(it, "phase", 0), hw = Px(it["hw"]),
                    });
                    break;
                case "deco": break;      // 陈设已经烘焙进底层图
                default: throw new Exception("rooms.json: 不认识的东西 " + S(it["t"]));
            }
        }

        Obj Ground(double x0, double x1, double y, string w, string kind)
        {
            var s = new Obj { type = "solid", x0 = ox + x0, x1 = ox + x1, y = y, w = w, kind = kind, thin = THIN.Contains(kind), order = order++ };
            solids.Add(s);
            return s;
        }

        Obj Box(double x, string w, string kind, double bse)
        {
            var sz = HZ[kind];
            var h = new Obj { type = "hazard", x0 = ox + x - sz[0] / 2.0, x1 = ox + x + sz[0] / 2.0, y0 = bse - sz[1], y1 = bse, w = w, kind = kind, order = order++ };
            hazards.Add(h);
            return h;
        }

        public int RegionAt(double px)
        {
            for (int i = regions.Count - 1; i >= 0; i--) if (px >= regions[i].x0) return i;
            return 0;
        }
    }
}
