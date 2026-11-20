// 命令行一条龙：建场景与项目设置、回放测试、出截图、打包网页版 / Mac / Windows。
//   Unity -batchmode -quit -projectPath unity -executeMethod BR.Tools.Build.Setup
//   ……-executeMethod BR.Tools.Build.Test        十六景回放，结果必须与网页版一致
//   ……-executeMethod BR.Tools.Build.Frames      按求解器的走法自己走一遍，每 20 步存一张 320×180 截图到 Build/frames
//   ……-executeMethod BR.Tools.Build.WebGL / Mac / Windows
using System;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BR.Tools
{
    public static class Build
    {
        const string Scene = "Assets/Scenes/Main.unity";
        static string Root => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));

        [MenuItem("BR/项目设置与场景")]
        public static void Setup()
        {
            SharedSync.Sync(true);
            AssetDatabase.Refresh();

            PlayerSettings.companyName = "between-reflections";
            PlayerSettings.productName = "倒影之间";
            PlayerSettings.colorSpace = ColorSpace.Gamma;            // 画面是 sRGB 字节，原样上屏
            PlayerSettings.defaultScreenWidth = 1280;                // 320×180 的 4 倍
            PlayerSettings.defaultScreenHeight = 720;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.runInBackground = true;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;      // itch.io 不带压缩头，也能直接打开
            PlayerSettings.WebGL.dataCaching = false;

            // 抗锯齿、各向异性全部关掉
            string[] names = QualitySettings.names;
            int keep = QualitySettings.GetQualityLevel();
            for (int i = 0; i < names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.antiAliasing = 0;
                QualitySettings.anisotropicFiltering = AnisotropicFiltering.Disable;
            }
            QualitySettings.SetQualityLevel(keep, false);

            // 用旧版 Input（没装 Input System 包）
            var ps = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            if (ps != null)
            {
                var so = new SerializedObject(ps);
                var p = so.FindProperty("activeInputHandler");
                if (p != null) { p.intValue = 0; so.ApplyModifiedPropertiesWithoutUndo(); }
            }

            // 场景：一台黑底相机 + 本体
            Directory.CreateDirectory(Path.Combine(Application.dataPath, "Scenes"));
            var sc = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var camGo = new GameObject("Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;
            cam.cullingMask = 0;
            cam.allowMSAA = false;
            cam.allowHDR = false;
            new GameObject("倒影之间").AddComponent<Main>();
            EditorSceneManager.SaveScene(sc, Scene);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Scene, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("BR: 项目设置与场景就绪");
        }

        static string Shared(string p) => File.ReadAllText(Path.Combine(SharedSync.Src, p));

        [MenuItem("BR/回放测试")]
        public static void Test()
        {
            var log = new StringBuilder();
            bool ok = PlanTest.Run(Shared("data/rules.json"), Shared("data/rooms.json"), Shared("data/solve_plan.json"), log);
            Debug.Log(log.ToString());
            Directory.CreateDirectory(Path.Combine(Root, "Build"));
            File.WriteAllText(Path.Combine(Root, "Build/test.txt"), log.ToString());
            if (Application.isBatchMode) EditorApplication.Exit(ok ? 0 : 1);
        }

        [MenuItem("BR/出截图")]
        public static void Frames()
        {
            SharedSync.Sync(false);
            AssetDatabase.Refresh();
            string dir = Path.Combine(Root, "Build/frames");
            Directory.CreateDirectory(dir);
            foreach (var f in Directory.GetFiles(dir, "*.png")) File.Delete(f);
            var P = Main.MakePainter();
            Save(P.Render(), Path.Combine(dir, "title.png"));
            P.Autoplay(File.ReadAllText(Path.Combine(SharedSync.Src, "data/solve_plan.json")), 0);
            int n = 0;
            for (int f = 0; f < 20000 && P.G.state != "ended"; f++)
            {
                P.Tick();
                if (f % 20 == 0) { Save(P.Render(), Path.Combine(dir, "f" + f.ToString("D5") + ".png")); n++; }
            }
            Debug.Log("BR: 存了 " + n + " 张截图，最后 room " + P.G.room + " state " + P.G.state);
            if (Application.isBatchMode) EditorApplication.Exit(P.G.state == "ended" ? 0 : 1);
        }

        static void Save(Img im, string path)
        {
            var t = new Texture2D(im.w, im.h, TextureFormat.RGBA32, false);
            var flip = new byte[im.p.Length];
            int row = im.w * 4;
            for (int y = 0; y < im.h; y++) Buffer.BlockCopy(im.p, y * row, flip, (im.h - 1 - y) * row, row);
            t.LoadRawTextureData(flip);
            t.Apply(false);
            File.WriteAllBytes(path, t.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(t);
        }

        static void Make(BuildTarget target, string path)
        {
            SharedSync.Sync(false);
            AssetDatabase.Refresh();
            if (!File.Exists(Path.Combine(Root, Scene))) Setup();
            var r = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { Scene },
                target = target,
                locationPathName = Path.Combine(Root, path),
                options = BuildOptions.None,
            });
            Debug.Log("BR: 打包 " + target + " → " + path + "：" + r.summary.result + "，" + r.summary.totalSize / 1048576 + " MB");
            if (Application.isBatchMode) EditorApplication.Exit(r.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        [MenuItem("BR/打包/网页版")] public static void WebGL() => Make(BuildTarget.WebGL, "Build/web");
        [MenuItem("BR/打包/Mac")] public static void Mac() => Make(BuildTarget.StandaloneOSX, "Build/mac/倒影之间.app");
        [MenuItem("BR/打包/Windows")] public static void Windows() => Make(BuildTarget.StandaloneWindows64, "Build/win/倒影之间.exe");
    }
}
