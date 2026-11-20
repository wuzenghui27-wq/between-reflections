// 倒影之间 · Unity 版的画面与节奏：跑逻辑（固定 60 步/秒）、按 320×180 像素格合成画面。与 godot/main.gd 一一对应。
// 这一层不碰 Unity：图从 load(path) 拿，声音从 sfx(name) 发出去，所以在编辑器外也能跑（回放测试、出截图）。
using System;
using System.Collections.Generic;
using static BR.Json;

namespace BR
{
    public class Painter
    {
        public const int PW = 320, PH = 180;
        static readonly string[] NUM = { "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十" };
        static readonly Col INK = new Col(23, 19, 28), PAPER = new Col(246, 238, 220), CINNABAR = new Col(196, 50, 38);
        const double STEP = 1.0 / 60.0;

        public readonly Level LV;
        public readonly Game G;
        public readonly Img frame = new Img(PW, PH);
        public Action<string> sfx = _ => { };
        readonly Func<string, Img> load;
        readonly Dictionary<string, object> art, textMap;
        readonly Dictionary<string, Img> tex = new Dictionary<string, Img>();
        readonly Img textImg;
        readonly int textBase;
        readonly Dictionary<string, Img> vignette = new Dictionary<string, Img>();
        readonly double P;
        double cardT = 99;
        int cardRoom;
        public int startAt;
        // 自己走：按 solve_plan.json 的走法（核对画面用）
        Dictionary<string, object> plan;
        int planStep, planRoom = -1;
        int stepN;

        public Painter(Func<string, string> readText, Func<string, Img> load)
        {
            this.load = load;
            LV = new Level(readText("data/rules.json"), readText("data/rooms.json"));
            P = LV.C["PIX"];
            art = O(Parse(readText("data/art.json")));
            var tj = O(Parse(readText("data/text.json")));
            textMap = O(tj["map"]);
            textBase = I(tj["baseline"]);
            textImg = load("art/text.png");
            G = new Game(LV);
            G.Ev += OnEv;
            vignette["day"] = MakeVignette(new Col(30, 20, 10), 0.2);
            vignette["night"] = MakeVignette(new Col(4, 6, 24), 0.5);
        }

        public void Autoplay(string planJson, int at)
        {
            plan = O(Parse(planJson));
            startAt = at;
            G.Start(at);
            G.BeginRunning();
        }

        Img T(string path)
        {
            if (!tex.TryGetValue(path, out var t)) tex[path] = t = load("art/" + path);
            return t;
        }

        // 暗角：在 320×180 的格子上逐像素算好，做成一张图
        static Img MakeVignette(Col c, double a)
        {
            var im = new Img(PW, PH);
            for (int y = 0; y < PH; y++)
                for (int x = 0; x < PW; x++)
                {
                    double dx = x + 0.5 - PW / 2.0, dy = y + 0.5 - PH / 2.0, d = Math.Sqrt(dx * dx + dy * dy);
                    double k = Math.Max(0, Math.Min(1, (d - PH * 0.45) / (PH * 0.98 - PH * 0.45)));
                    int i = (y * PW + x) * 4;
                    im.p[i] = c.r; im.p[i + 1] = c.g; im.p[i + 2] = c.b; im.p[i + 3] = (byte)Math.Round(a * k * 255);
                }
            return im;
        }

        void OnEv(string name, object arg)
        {
            switch (name)
            {
                case "room": cardT = 0; cardRoom = (int)arg; break;
                case "switched": sfx(G.world == "night" ? "switch_night" : "switch_day"); break;
                case "jump": sfx("jump"); break;
                case "land": sfx("land"); break;
                case "bell": sfx("bell"); break;
                case "lantern": sfx("lantern"); break;
                case "roomClear": sfx("gate"); break;
                case "blocked": sfx("blocked"); break;
                case "fail": case "csplash": sfx("splash"); break;
                case "region": sfx("region"); break;
                case "arrive": sfx("arrive"); break;
                case "plate": sfx(((Plate)arg).down ? "gate" : "blocked"); break;
            }
        }

        // ------------------------------------------------------------ 固定步长
        public void Tick()
        {
            if (plan != null && G.state == "running") AutoplayFeed();
            G.Update(STEP);
            cardT += STEP;
            if (G.state == "running" && G.onGround && Math.Abs(G.vx) > 20.0)
            {
                int n = (int)(G.walkDist / 34.0);
                if (n != stepN) { stepN = n; sfx("step" + (n & 1)); }
            }
        }

        void AutoplayFeed()
        {
            if (planRoom != G.room)
            {
                planRoom = G.room; planStep = 0;
                G.LoadRoom(G.room, true);        // 和求解器一样，从这一景的起点开始走
            }
            List<object> acts = null;
            foreach (var rp in A(plan["rooms"])) if (I(O(rp)["room"]) == G.room) acts = A(O(rp)["plan"]);
            int K = I(plan["K"]);
            if (acts != null && planStep % K == 0)
            {
                int idx = planStep / K;
                if (idx < acts.Count)
                {
                    var a = A(acts[idx]);
                    G.inL = D(a[0]) < 0; G.inR = D(a[0]) > 0;
                    if (I(a[1]) != 0) G.jumpBuf = G.C["JUMP_BUFFER"];
                    if (I(a[2]) != 0) G.pendingSwitch = true;
                }
            }
            planStep++;
        }

        // 和 Godot 的 round 一样：半数离零取整
        int Px(double v) => (int)Math.Round(v / P, MidpointRounding.AwayFromZero);
        int CamPix() => Px(G.camX);
        int RoomDx(int i) => Px(LV.rooms[i].x0) - CamPix();

        List<int> VisibleRooms()
        {
            var o = new List<int>();
            for (int i = G.room - 1; i <= G.room + 1; i++)
                if (i >= 0 && i < LV.rooms.Count && Math.Abs(RoomDx(i)) < PW) o.Add(i);
            return o;
        }

        Dictionary<string, object> Art(int i) => O(A(art["rooms"])[i]);

        // 物件图集里的一块：s = {r: [x,y,w,h], o: [ox,oy]}，画在锚点 (ax, ay) 上
        void Spr(Img t, object so, int ax, int ay)
        {
            if (so == null) return;
            var s = O(so);
            var r = A(s["r"]); var o = A(s["o"]);
            frame.Blit(t, I(r[0]), I(r[1]), I(r[2]), I(r[3]), ax + I(o[0]), ay + I(o[1]));
        }

        // ------------------------------------------------------------ 一帧
        public Img Render()
        {
            DrawBase();
            DrawTop();
            return frame;
        }

        void DrawLayer(int i, string w, string which, Func<int, int, bool> mask = null)
        {
            var L = O(O(Art(i)["layers"])[w]);
            frame.Draw(T(S(L[which])), RoomDx(i), 0, mask);
        }

        void DrawBase()
        {
            frame.Fill(G.world == "night" ? new Col(12, 18, 38) : new Col(159, 179, 196));
            if (G.state == "title") { DrawLayer(0, G.world, "base"); return; }
            foreach (int i in VisibleRooms())
            {
                DrawLayer(i, G.world, "base");
                if (G.state == "running" || G.state == "intro") DrawLayer(i, G.world, "ghost");
            }
            foreach (int i in VisibleRooms()) Reflection(i);
            // 换天：旧的一面盖上来，从人身上往外洇开（圈边三道 4 像素宽的抖动带，和 godot/wipe.gdshader 同一算法）
            if (G.wipeT >= 0)
            {
                double k = Math.Max(0, Math.Min(1, G.wipeT / LV.C["SWITCH_WIPE"]));
                double e = 1 - Math.Pow(1 - k, 3);
                int dx = RoomDx(G.room);
                double cx = Px(G.px) - CamPix() - dx, cy = Px(G.foot - 30.0);
                double radius = e * 380.0 + 12.0;
                DrawLayer(G.room, G.wipeFrom, "base", (x, y) =>
                {
                    int lx = x - dx;
                    double ddx = lx + 0.5 - cx, ddy = y + 0.5 - cy, d = Math.Sqrt(ddx * ddx + ddy * ddy);
                    int n = d < radius - 12 ? 4 : d < radius - 8 ? 3 : d < radius - 4 ? 2 : d < radius ? 1 : 0;
                    int ix = ((lx % 2) + 2) % 2, iy = y % 2;
                    int idx = (ix == 0 && iy == 0) ? 0 : (ix == 1 && iy == 1) ? 1 : (ix == 1 && iy == 0) ? 2 : 3;
                    return idx >= n;
                });
                var col = G.world == "night" ? new[] { 200, 215, 255 } : new[] { 255, 230, 170 };
                Glow(Px(G.px) - CamPix(), (int)cy, 30, col, (1 - k) * 0.4);
            }
            WeatherBack(Wx(), G.world, G.animT, CamPix());
        }

        // ------------------------------------------------------------ 倒影：静水里映出的是另一面的世界
        // 水线以下、没被地面和障碍挡住的格子，按水线上下翻过来取另一面底层图的像素；只翻转、不缩放，涟漪是整像素的错行。
        readonly Dictionary<string, bool[]> waterMask = new Dictionary<string, bool[]>();

        public static int ReflWy(double water, double pix) => (int)Math.Round(water / pix, MidpointRounding.AwayFromZero);
        // 第 depth 行（水线下第几行）的错位与不透明度：两个引擎同一公式
        public static int ReflShift(int depth, double t) => depth <= 2 ? 0 : (int)Math.Round(Math.Sin(depth * 0.8 + t * 2.5) * 1.2, MidpointRounding.AwayFromZero);
        public static double ReflAlpha(int depth, bool night)
        {
            double a = Math.Max(0, (night ? 0.6 : 0.45) - depth * 0.012);
            return Math.Floor(a * 8) / 8;
        }

        bool[] WaterMask(int i, string w, int wy)
        {
            string key = i + w;
            if (waterMask.TryGetValue(key, out var m)) return m;
            m = new bool[PW * PH];
            var r = LV.rooms[i];
            int ox = Px(r.x0);
            for (int y = wy + 1; y < PH; y++)
                for (int x = 0; x < PW; x++) m[y * PW + x] = true;
            foreach (var s in LV.solids)
            {
                if (s.thin || (s.w != "both" && s.w != w) || s.x1 <= r.x0 || s.x0 >= r.x1) continue;
                int x0 = Math.Max(0, Px(s.x0) - ox), x1 = Math.Min(PW, Px(s.x1) - ox), y0 = Math.Max(0, Px(s.y));
                for (int y = y0; y < PH; y++) for (int x = x0; x < x1; x++) m[y * PW + x] = false;
            }
            foreach (var h in LV.hazards)
            {
                if (h.gate != "" || (h.w != "both" && h.w != w) || h.x1 <= r.x0 || h.x0 >= r.x1) continue;
                int x0 = Math.Max(0, Px(h.x0) - ox), x1 = Math.Min(PW, Px(h.x1) - ox), y0 = Math.Max(0, Px(h.y0)), y1 = Math.Min(PH, Px(h.y1));
                for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) m[y * PW + x] = false;
            }
            waterMask[key] = m;
            return m;
        }

        void Reflection(int i)
        {
            if (!(G.state == "running" || G.state == "intro" || G.state == "failing" || G.state == "paused")) return;
            if (!LV.WATER.TryGetValue(LV.regions[LV.rooms[i].region].id, out var wl)) return;
            string w = G.world, ow = Game.Other(w);
            int wy = ReflWy(wl.Get(w), P), dx = RoomDx(i);
            var src = T(S(O(O(Art(i)["layers"])[ow])["base"]));
            var mask = WaterMask(i, w, wy);
            bool night = w == "night";
            for (int y = wy + 1; y < PH; y++)
            {
                int depth = y - wy, sy = wy - depth;
                if (sy < 0) break;
                double a = ReflAlpha(depth, night);
                if (a <= 0) break;
                int sh = ReflShift(depth, G.animT);
                for (int x = 0; x < PW; x++)
                {
                    if (!mask[y * PW + x]) continue;
                    int fx = x + dx, sx = x + sh;
                    if (fx < 0 || fx >= PW || sx < 0 || sx >= PW) continue;
                    int si = (sy * PW + sx) * 4;
                    frame.Blend(fx, y, src.p[si], src.p[si + 1], src.p[si + 2], (int)(a * src.p[si + 3]));
                }
            }
        }

        string Wx() => G.weather[LV.RegionAt(G.camX + LV.C["W"] / 2)];

        void DrawTop()
        {
            if (G.state != "title")
            {
                var vis = VisibleRooms();
                foreach (int i in vis) { DrawObjects(i); ObjectGlows(i); }
                if (G.state != "ended") DrawPlayer();
                WeatherFront(Wx(), G.world, G.animT, CamPix());
                foreach (int i in vis) DrawLayer(i, G.world, "front");
            }
            FlushGlows();
            frame.Draw(vignette[G.world], 0, 0);
            if (G.fade > 0) frame.Rect(0, 0, PW, PH, new Col(8, 8, 20).A(G.fade * 0.6));
            DrawUI();
        }

        // ------------------------------------------------------------ 天气（全部是 1x 的像素点和像素块，位置取整）
        static double Hash(double i, double s) { double x = Math.Sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.Floor(x); }
        static double Noise(double x, double s)
        {
            double i = Math.Floor(x), f = x - i, t = f * f * (3 - 2 * f);
            return Hash(i, s) * (1 - t) + Hash(i + 1, s) * t;
        }
        static int Mod(double a, int n) { int v = (int)Math.Floor(a); return ((v % n) + n) % n; }

        void WeatherBack(string w, string world, double t, int cam)
        {
            if (w == "rain") frame.Rect(0, 0, PW, PH, new Col(20, 30, 50).A(0.22));
            else if (w == "fog") frame.Rect(0, 0, PW, PH, new Col(200, 206, 214).A(0.18));
            else if (w == "snow") frame.Rect(0, 0, PW, PH, new Col(220, 230, 245).A(0.08));
            if (w != "fog") return;
            for (int b = 0; b < 4; b++)
            {
                int y0 = 70 + b * 22;
                for (int x = -8; x < PW + 8; x += 4)
                {
                    double n = Noise((x + cam * (0.3 + b * 0.1) + t * 4) / 40, b + 3);
                    if (n < 0.35) continue;
                    frame.Rect(x, y0 + (int)Math.Round(Math.Sin(x / 30.0 + b) * 2), 4, 6 + b * 2, new Col(226, 230, 236).A((0.10 + n * 0.18) * (world == "night" ? 0.6 : 1)));
                }
            }
        }

        static readonly Col[] LEAF = { new Col(0xd0, 0x68, 0x2a), new Col(0xe0, 0xa0, 0x30), new Col(0xb8, 0x40, 0x2a), new Col(0xc8, 0x8a, 0x2a) };

        void WeatherFront(string w, string world, double t, int cam)
        {
            if (w == "rain")
            {
                var c = world == "day" ? new Col(210, 225, 245).A(0.55) : new Col(160, 180, 230).A(0.5);
                for (int i = 0; i < 140; i++)
                {
                    int x = Mod(Math.Floor(Hash(i, 1) * 360 - t * 40 - cam), 360) - 20;
                    int y = Mod(Math.Floor(Hash(i, 2) * 200 + t * 230), 200) - 10;
                    frame.Rect(x, y, 1, 4, c);
                }
                var sp = new Col(220, 235, 255).A(0.5);
                for (int i = 0; i < 14; i++)                      // 地上的水花
                {
                    double ph = (t * 3 + Hash(i, 5)) % 1;
                    if (ph > 0.3) continue;
                    int x = (int)Math.Floor(Hash(i + Math.Floor(t * 3 + Hash(i, 5)), 6) * PW);
                    frame.Rect(x - 1, 139, 1, 1, sp); frame.Rect(x + 1, 139, 1, 1, sp); frame.Rect(x, 138, 1, 1, sp);
                }
            }
            else if (w == "snow")
            {
                var c = new Col(255, 255, 255).A(0.9);
                for (int i = 0; i < 110; i++)
                {
                    bool big = i % 5 == 0;
                    int x = Mod(Math.Floor(Hash(i, 3) * 340 + Math.Sin(t * 0.8 + i) * 5 - cam * (big ? 1.1 : 0.7) - t * 6), 340) - 10;
                    int y = Mod(Math.Floor(Hash(i, 4) * 190 + t * (big ? 22 : 13)), 190) - 5;
                    frame.Rect(x, y, big ? 2 : 1, big ? 2 : 1, c);
                }
            }
            else if (w == "wind")
            {
                for (int i = 0; i < 34; i++)
                {
                    int x = Mod(Math.Floor(Hash(i, 7) * 360 - t * (90 + Hash(i, 8) * 60) - cam * 0.4), 360) - 20;
                    int y = (int)Math.Floor(30 + Hash(i, 9) * 130 + Math.Sin(t * 3 + i) * 6);
                    frame.Rect(x, y, 2, 1, LEAF[i % 4]);
                    if (i % 3 == 0) frame.Rect(x + 1, y + 1, 1, 1, LEAF[i % 4]);
                }
                var c = new Col(255, 255, 255).A(0.25);
                for (int i = 0; i < 8; i++)
                {
                    int x = Mod(Math.Floor(Hash(i, 11) * 400 - t * 220), 400) - 40;
                    frame.Rect(x, (int)Math.Floor(40 + Hash(i, 12) * 100), 16 + (i % 3) * 8, 1, c);
                }
            }
        }

        // ------------------------------------------------------------ 光：一格一格加上去，亮度分八档、用 2×2 抖动过渡，不做平滑模糊
        struct GlowQ { public int x, y, r; public int[] col; public double a; }
        readonly List<GlowQ> glows = new List<GlowQ>();
        static readonly double[] BAYER = { 0.125, 0.625, 0.875, 0.375 };

        void Glow(int x, int y, int r, int[] col, double a) { if (a > 0.003 && r > 0) glows.Add(new GlowQ { x = x, y = y, r = r, col = col, a = a }); }

        void FlushGlows()
        {
            double str = (G.world == "night" ? 1.0 : 0.55) * 1.6;      // 网页版另叠一层模糊的光（×0.7），这里并成一层
            foreach (var g in glows)
                for (int yy = -g.r; yy <= g.r; yy++)
                    for (int xx = -g.r; xx <= g.r; xx++)
                    {
                        double d = Math.Sqrt(xx * xx + yy * yy) / g.r;
                        if (d >= 1) continue;
                        double p = d < 0.4 ? 1 - 0.6 * d / 0.4 : 0.4 * (1 - (d - 0.4) / 0.6);
                        double v = g.a * p * str * 8;
                        int px = g.x + xx, py = g.y + yy;
                        double lv = Math.Floor(v) + ((v - Math.Floor(v)) > BAYER[((py & 1) << 1) | (px & 1)] ? 1 : 0);
                        if (lv <= 0) continue;
                        double k = lv / 8;
                        frame.Add(px, py, (int)(g.col[0] * k), (int)(g.col[1] * k), (int)(g.col[2] * k));
                    }
            glows.Clear();
        }

        void DrawObjects(int i)
        {
            var Ar = Art(i);
            var ot = T(S(Ar["objects"]));
            string w = G.world;
            int dx = RoomDx(i), cam = CamPix();
            string rid = S(Ar["rid"]);
            // 会动的机关（画在最底下：轮子、秋千架在踏板后面）
            foreach (var go in A(Ar["movers"]))
            {
                var g = O(go);
                var members = A(g["members"]);
                if (S(g["kind"]) == "drift")
                {
                    var m = LV.movers[I(members[0])];
                    Spr(ot, O(g["spr"])[w], Px(m.x0) - cam, Px(m.y));
                    continue;
                }
                var m0 = LV.movers[I(members[0])];
                int F = I(art["frames"]);
                double md = G.dclock % m0.period; if (md < 0) md += m0.period;
                int f = (int)Math.Floor(md / m0.period * F + 0.5) % F;
                Spr(ot, A(O(g["frames"])[w])[f], dx, 0);
                foreach (var mi in members)
                {
                    var q = LV.movers[I(mi)];
                    Spr(ot, O(g["board"])[w], Px(q.x0) - cam, Px(q.y));
                }
            }
            var eaves = RoomList(LV.eaves, i);
            var aeaves = A(Ar["eaves"]);
            for (int k = 0; k < aeaves.Count; k++)
            {
                var ev = eaves[k];
                Spr(ot, O(O(aeaves[k])["spr"])[w], Px(ev.x0) - cam, Px(ev.y));
            }
            foreach (var go in A(Ar["gates"]))
            {
                var g = O(go);
                string id = S(g["id"]);
                bool open = G.gates.Contains(id) && !(G.flashes.TryGetValue(id, out var fl) && fl > 0.5);
                var at = A(g["at"]);
                Spr(ot, O(O(g["spr"])[w])[open ? "open" : "closed"], I(at[0]) + dx, I(at[1]));
            }
            foreach (var po in A(Ar["plates"]))
            {
                var p = O(po);
                var pl = LV.plates.Find(q => q.id == S(p["id"]));
                var at = A(p["at"]);
                Spr(ot, O(O(p["spr"])[w])[pl != null && pl.down ? "down" : "up"], I(at[0]) + dx, I(at[1]));
            }
            var crates = LV.crates.FindAll(c => c.room == i);
            LV.WATER.TryGetValue(rid, out var water);
            var acr = A(Ar["crates"]);
            for (int k = 0; k < crates.Count; k++)
            {
                var c = crates[k];
                int cx0 = Px(c.x0) - cam;
                Spr(ot, O(O(acr[k])["spr"])[w], cx0, Px(c.y0));
                if (water != null)
                {
                    int wy = Px(water.Get(w)), y1 = Px(c.y1);
                    if (y1 > wy) frame.Rect(cx0 - 1, wy + 1, Px(c.x1) - Px(c.x0) + 2, y1 - wy, w == "night" ? new Col(28, 42, 74, 115) : new Col(60, 100, 112, 115));
                }
            }
            foreach (var bo in A(Ar["bells"]))
            {
                var b = O(bo);
                string bw = S(b["w"]);
                if (bw != "both" && bw != w) continue;
                var at = A(b["at"]);
                Spr(ot, O(O(b["spr"])[w])[G.gates.Contains(S(b["id"])) ? "rung" : "idle"], I(at[0]) + dx, I(at[1]));
            }
            foreach (var lo in A(Ar["lamps"]))
            {
                var l = O(lo);
                string lw = S(l["w"]);
                if (lw != "both" && lw != w) continue;
                var at = A(l["at"]);
                Spr(ot, O(O(l["spr"])[w])[G.got.Contains(I(l["i"])) ? "lit" : "unlit"], I(at[0]) + dx, I(at[1]));
            }
        }

        void ObjectGlows(int i)
        {
            int cam = CamPix();
            string w = G.world;
            foreach (var l in LV.lanterns)
            {
                if (l.room != i || (l.w != "both" && l.w != w)) continue;
                int x = Px(l.x) - cam, y = Px(l.y);
                if (G.got.Contains(l.i))
                {
                    double fl = G.flashes.TryGetValue("l" + l.i, out var f) ? f : 0;
                    Glow(x, y, (int)Math.Round(11 + fl * 7), new[] { 255, 190, 110 }, 0.6 + fl * 0.2);
                }
                else Glow(x, y, 6, new[] { 255, 220, 150 }, 0.12 + 0.12 * (0.5 + 0.5 * Math.Sin(G.animT * 3)));
            }
            var r = LV.rooms[i];
            foreach (var b in LV.bells)
            {
                if (b.x < r.x0 || b.x >= r.x1 || (b.w != "both" && b.w != w)) continue;
                bool rung = G.gates.Contains(b.id);
                double fl = G.flashes.TryGetValue(b.id, out var f) ? f : 0;
                Glow(Px(b.x) - cam, Px(b.y + 34) - 9, (int)Math.Round(rung ? 8 + fl * 14 : 7), new[] { 255, 210, 120 }, rung ? 0.25 + fl * 0.5 : 0.5);
            }
            foreach (var h in LV.hazards)
            {
                if (h.gate == "" || h.x0 < r.x0 - 40 || h.x0 >= r.x1) continue;
                bool open = G.gates.Contains(h.gate) && !(G.flashes.TryGetValue(h.gate, out var f) && f > 0.5);
                if (!open) Glow((Px(h.x0) + Px(h.x1)) / 2 - cam, (int)Math.Round(Px(h.y0) + (Px(h.y1) - Px(h.y0)) * 0.45), 6, new[] { 255, 200, 90 }, 0.5);
            }
            foreach (var s in LV.solids)
            {
                if (s.kind != "firefly" || s.x0 < r.x0 || s.x0 >= r.x1 || (s.w != "both" && s.w != w)) continue;
                int x0 = Px(s.x0) - cam, x1 = Px(s.x1) - cam, y = Px(s.y);
                for (int fx = x0 + 1, k = 0; fx < x1; fx += 3, k++)
                {
                    double on = 0.55 + 0.45 * Math.Sin(G.animT * 3 + k * 1.7);
                    if (k % 2 == 0) Glow(fx, y + (k % 2) - (on > 0.8 ? 1 : 0), 6, new[] { 190, 255, 120 }, 0.6 * on);
                }
            }
        }

        List<Obj> RoomList(List<Obj> arr, int i)
        {
            var r = LV.rooms[i];
            return arr.FindAll(o => o.x0 >= r.x0 && o.x0 < r.x1);
        }

        // ------------------------------------------------------------ 旅人
        static string[] Look(string wx, int ri)
        {
            switch (wx)
            {
                case "rain": return new[] { "rain", "umbrella" };
                case "snow": return new[] { "snow", "cloak" };
                case "fog": return new[] { "fog", "back" };
                case "wind": return ri % 2 == 1 ? new[] { "wind", "book" } : new[] { "wind", "back" };
            }
            return ri % 2 == 1 ? new[] { "clear", "back" } : new[] { "clear", "book" };
        }

        void DrawPlayer()
        {
            int ri = LV.RegionAt(G.px);
            var lk = Look(G.weather[ri], ri);
            string st = "idle";
            if (G.state == "running" || G.state == "failing")
                st = !G.onGround ? "air" : (Math.Abs(G.vx) > 20.0 ? "run" : "idle");
            string fr;
            if (st == "air") fr = G.vy < 120.0 ? "up" : "fall";
            else if (st == "run") fr = G.landT < 0.09 ? "land" : (((int)Math.Floor(G.walkDist / 20.0)) % 8).ToString();
            else fr = ((int)Math.Floor(G.animT / 0.7)) % 4 == 3 ? "idle1" : "idle0";
            var ao = Json.G(O(art["atlas"]), "t_" + lk[0] + "_" + lk[1] + "_" + fr);
            if (ao == null) return;
            var a = A(ao);
            string rid = LV.regions[ri].id;
            var t = G.world == "night" ? T(S(art["spritesDim"])) : T(S(O(art["sprites"])[rid]));
            int shake = G.blockedT > 0 ? (int)Math.Round(Math.Sin(G.blockedT * 60.0) * 3.0, MidpointRounding.AwayFromZero) : 0;
            int x = Px(G.px) - CamPix() + shake, y = Px(G.foot);
            int sw = I(a[2]), sh = I(a[3]), ox = I(a[4]), oy = I(a[5]);
            if (G.face < 0) frame.Blit(t, I(a[0]), I(a[1]), sw, sh, x + ox - sw, y - oy, true);      // 左右镜像（不是缩放）
            else frame.Blit(t, I(a[0]), I(a[1]), sw, sh, x - ox, y - oy);
            // 脚下记号：另一面此刻能不能站
            if (G.state == "running")
            {
                int fy = y + 4;
                if (G.OtherSafe())
                {
                    var col = G.world == "day" ? new Col(110, 140, 255) : new Col(255, 216, 138);
                    frame.Rect(x - 2, fy, 5, 1, col);
                    frame.Rect(x - 4, fy, 2, 1, col.A(0.45));
                    frame.Rect(x + 3, fy, 2, 1, col.A(0.45));
                    frame.Rect(x, fy, 1, 1, Col.White);
                }
                else
                {
                    frame.Rect(x - 3, fy, 2, 1, new Col(200, 70, 70, 190));
                    frame.Rect(x + 2, fy, 2, 1, new Col(200, 70, 70, 190));
                }
            }
        }

        // ------------------------------------------------------------ 界面：只用烘焙好的 12 像素字，原生大小；不画框
        // y 是基线；center 时在整个画面宽度里居中
        void Text(string s, int x, int y, Col c, bool center = false)
        {
            var ro = Json.G(textMap, s);
            if (ro == null) return;
            var r = A(ro);
            int w = I(r[2]), h = I(r[3]);
            if (center) x = (PW - w) / 2;
            frame.Blit(textImg, I(r[0]), I(r[1]), w, h, x - 1, y - textBase, false, c);
        }

        void InkBand(int y, int h, double a)
        {
            // 淡墨托底：中间浓、两头淡，按 16 像素一段的台阶变化，不做平滑渐变
            for (int k = 0; k < 20; k++)
            {
                double d = Math.Abs(k - 9.5) / 10.0;
                frame.Rect(k * 16, y, 16, h, INK.A(a * (1 - d * d)));
            }
        }

        void DrawUI()
        {
            if (G.state == "title")
            {
                InkBand(62, 52, 0.7);
                Text("倒影之间", 0, 82, PAPER, true);
                Text("白天种下的因，夜里结成的果", 0, 98, PAPER.A(0.8), true);
                if (((int)(G.animT * 2)) % 2 == 0) Text("按任意键出发", 0, 132, PAPER.A(0.85), true);
                return;
            }
            if (G.state == "ended")
            {
                InkBand(70, 36, 0.7);
                Text("灯都亮了。", 0, 92, PAPER, true);
                return;
            }
            var r = LV.rooms[G.room];
            // 左上：朱印景名 + 一排小灯
            frame.Rect(6, 6, 14, 14, CINNABAR);
            frame.Rect(7, 7, 12, 12, PAPER.A(0.15));
            string num = r.i < NUM.Length ? NUM[r.i] : (r.i + 1).ToString();
            Text(num.Substring(0, 1), 7, 18, PAPER);
            Text(r.name, 24, 17, PAPER);
            for (int k = 0; k < LV.rooms.Count; k++)
            {
                bool lit = k < G.room || (k == G.room && G.gates.Contains(r.exit));
                frame.Rect(24 + k * 4, 21, 2, 2, lit ? new Col(242, 200, 80) : PAPER.A(0.25));
            }
            // 进站：站名
            if (G.state == "intro")
            {
                var g = LV.regions[r.region];
                InkBand(66, 44, 0.65);
                Text(g.no + " · " + g.name, 0, 86, PAPER, true);
                Text(g.line, 0, 102, PAPER.A(0.8), true);
                return;
            }
            // 进景：题名卡，停一会儿淡去（透明度按四档跳，不做连续淡入）
            if (cardT < 3.2 && cardRoom == G.room)
            {
                double a = Math.Max(0, Math.Min(1, Math.Min(cardT / 0.3, (3.2 - cardT) / 0.6)));
                a = Math.Floor(a * 4) / 4;
                InkBand(26, 42, 0.55 * a);
                Text("第" + num + "景", 0, 40, PAPER.A(0.75 * a), true);
                Text(r.name, 0, 54, PAPER.A(a), true);
                Text(r.line, 0, 66, PAPER.A(0.8 * a), true);
            }
            if (r.i == 0 && G.state == "running")
                Text("← → 走   空格 跳   Shift 换天   R 重来", 0, PH - 6, PAPER.A(0.7), true);
            if (G.state == "paused")
            {
                InkBand(76, 24, 0.7);
                Text("暂停 · Esc 继续", 0, 92, PAPER, true);
            }
        }
    }
}
