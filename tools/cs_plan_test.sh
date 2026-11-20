#!/bin/sh
# 不开 Unity，直接用 Mono 编译 Unity 版的逻辑代码，跑十六景回放（结果必须与网页版一致）。
# 用法：sh tools/cs_plan_test.sh    （需要 mono-mcs）
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
cat > "$T/cli.cs" <<'CS'
class P { static int Main(string[] a){ var sb=new System.Text.StringBuilder(); var d="shared/data/"; bool ok=BR.PlanTest.Run(System.IO.File.ReadAllText(d+"rules.json"),System.IO.File.ReadAllText(d+"rooms.json"),System.IO.File.ReadAllText(d+"solve_plan.json"),sb); System.Console.Write(sb); return ok?0:1; } }
CS
R=unity/Assets/BR/Runtime
mcs -nologo -out:"$T/t.exe" $R/Json.cs $R/Level.cs $R/Game.cs $R/PlanTest.cs "$T/cli.cs"
mono "$T/t.exe"
