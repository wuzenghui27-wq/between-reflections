// 回放测试：用网页版求解器找到的走法跑 Unity 版逻辑，每一景的结果必须和网页版一致。
// 在编辑器里：菜单 BR/回放测试；命令行：-executeMethod BR.Editor.Build.Test
using System;
using System.Text;
using static BR.Json;

namespace BR
{
    public static class PlanTest
    {
        public static bool Run(string rules, string rooms, string plan, StringBuilder log)
        {
            var LV = new Level(rules, rooms);
            var G = new Game(LV);
            var Dd = O(Parse(plan));
            int K = I(Dd["K"]);
            bool ok = true;
            foreach (var rpo in A(Dd["rooms"]))
            {
                var rp = O(rpo);
                int i = I(rp["room"]);
                G.LoadRoom(i);
                G.state = "running";
                int steps = 0; bool done = false;
                foreach (var ao in A(rp["plan"]))
                {
                    var a = A(ao);
                    G.inL = D(a[0]) < 0; G.inR = D(a[0]) > 0;
                    if (I(a[1]) != 0) G.jumpBuf = G.C["JUMP_BUFFER"];
                    if (I(a[2]) != 0) G.pendingSwitch = true;
                    for (int k = 0; k < K; k++)
                    {
                        if (G.state == "running") G.Physics(1.0 / 60.0);
                        steps++;
                        if (G.room != i || G.state != "running") { done = true; break; }
                    }
                    if (done) break;
                }
                var ex = O(rp["expect"]);
                bool same = steps == I(ex["steps"]) && G.room == I(ex["room"]) && G.state == S(ex["state"])
                    && Math.Abs(G.px - D(ex["px"])) < 0.01 && Math.Abs(G.foot - D(ex["foot"])) < 0.01;
                log.AppendLine(string.Format("景 {0} {1}  steps {2}/{3}  px {4:F4}/{5:F4}  foot {6:F4}/{7:F4}  {8}",
                    i + 1, LV.rooms[i].name, steps, I(ex["steps"]), G.px, D(ex["px"]), G.foot, D(ex["foot"]), same ? "OK" : "DIFF"));
                if (!same) ok = false;
            }
            log.AppendLine(ok ? "ALL SAME" : "SOME DIFFER");
            return ok;
        }
    }
}
