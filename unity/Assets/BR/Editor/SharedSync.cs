// 把仓库根目录的 shared/（Godot 版、网页版共用的数据、美术、声音）同步进 Assets/Resources/Shared。
// 数据 .json 原样拷；美术 .png 拷成 .png.bytes（运行时自己解码，像素一个不改）；声音 .ogg 原样拷。
// 打开项目时自动检查一次；也可以点菜单 BR/同步共用数据。
using System.IO;
using UnityEditor;
using UnityEngine;

namespace BR.Tools
{
    [InitializeOnLoad]
    public static class SharedSync
    {
        static SharedSync() { EditorApplication.delayCall += () => { if (Sync(false)) AssetDatabase.Refresh(); }; }

        public static string Src => Path.GetFullPath(Path.Combine(Application.dataPath, "../../shared"));
        public static string Dst => Path.Combine(Application.dataPath, "Resources/Shared");

        [MenuItem("BR/同步共用数据")]
        public static void SyncMenu() { Sync(true); AssetDatabase.Refresh(); }

        // 返回有没有改动
        public static bool Sync(bool log)
        {
            if (!Directory.Exists(Src)) { Debug.LogError("找不到共用数据目录 " + Src); return false; }
            int n = 0;
            n += Copy("data", "*.json", "");
            n += Copy("art", "*.png", ".bytes");
            n += Copy("audio", "*.ogg", "");
            if (log || n > 0) Debug.Log("BR: 共用数据同步完成，更新了 " + n + " 个文件");
            return n > 0;
        }

        static int Copy(string sub, string pattern, string addExt)
        {
            string sd = Path.Combine(Src, sub);
            if (!Directory.Exists(sd)) return 0;
            int n = 0;
            foreach (var f in Directory.GetFiles(sd, pattern, SearchOption.AllDirectories))
            {
                string rel = f.Substring(Src.Length + 1);
                string to = Path.Combine(Dst, rel + addExt);
                if (File.Exists(to) && File.GetLastWriteTimeUtc(to) >= File.GetLastWriteTimeUtc(f) && new FileInfo(to).Length == new FileInfo(f).Length) continue;
                Directory.CreateDirectory(Path.GetDirectoryName(to));
                File.Copy(f, to, true);
                n++;
            }
            return n;
        }
    }
}
