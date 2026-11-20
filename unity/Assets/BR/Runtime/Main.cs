// 倒影之间 · Unity 版入口：读共用数据，按键、声音，把 Painter 合成好的 320×180 画面以整数倍放大显示，余下的屏幕留黑边。
// 像素完美：画面在 320×180 的格子上合成；显示用的纹理是 Point 过滤、不压缩、没有 mipmap；放大倍数只取整数；不开抗锯齿。
using System;
using System.Collections.Generic;
using UnityEngine;

namespace BR
{
    public class Main : MonoBehaviour
    {
        const int PW = Painter.PW, PH = Painter.PH;
        const double STEP = 1.0 / 60.0;

        Painter P;
        Texture2D screen;
        byte[] upload;
        double acc;
        readonly Dictionary<string, AudioSource> music = new Dictionary<string, AudioSource>();
        string musicRid = "";
        readonly List<AudioSource> sfxPool = new List<AudioSource>();
        int sfxI;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();

        // 场景里什么都没有也能跑：开场自动把相机和本体搭起来
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (FindAnyObjectByType<Main>() != null) return;
            new GameObject("倒影之间").AddComponent<Main>();
        }

        static string ReadText(string p)
        {
            var t = Resources.Load<TextAsset>("Shared/" + p.Substring(0, p.LastIndexOf('.')));
            if (t == null) throw new Exception("读不到 Resources/Shared/" + p + "（先在菜单 BR/同步共用数据）");
            return t.text;
        }

        // 美术是原样拷进来的 PNG（扩展名 .png.bytes），运行时自己解码：像素一个不改，不经过任何纹理导入设置
        public static Img LoadImg(string p)
        {
            var t = Resources.Load<TextAsset>("Shared/" + p);
            if (t == null) throw new Exception("读不到 Resources/Shared/" + p);
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            tex.LoadImage(t.bytes);
            int w = tex.width, h = tex.height;
            var src = tex.GetPixels32();           // 从下往上逐行
            var im = new Img(w, h);
            for (int y = 0; y < h; y++)
            {
                int so = (h - 1 - y) * w, d = y * w * 4;
                for (int x = 0; x < w; x++)
                {
                    var c = src[so + x];
                    im.p[d++] = c.r; im.p[d++] = c.g; im.p[d++] = c.b; im.p[d++] = c.a;
                }
            }
            if (Application.isPlaying) Destroy(tex); else DestroyImmediate(tex);
            return im;
        }

        public static Painter MakePainter() => new Painter(ReadText, LoadImg);

        void Awake()
        {
            QualitySettings.antiAliasing = 0;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.Disable;
            Application.targetFrameRate = 60;
            var cam = Camera.main;
            if (cam == null)
            {
                cam = new GameObject("Camera").AddComponent<Camera>();
                cam.tag = "MainCamera";
            }
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;     // 整数倍放大后余下的屏幕：黑边
            cam.cullingMask = 0;
            cam.allowMSAA = false;
            cam.allowHDR = false;

            P = MakePainter();
            P.sfx = Sfx;
            screen = new Texture2D(PW, PH, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, anisoLevel = 0 };
            upload = new byte[PW * PH * 4];

            int at = 0; bool auto = false;
            foreach (var a in Environment.GetCommandLineArgs())
            {
                if (a.StartsWith("-at=") || a.StartsWith("--at=")) at = int.Parse(a.Substring(a.IndexOf('=') + 1));
                if (a == "-autoplay" || a == "--autoplay") auto = true;
            }
            P.startAt = at;
            if (auto) P.Autoplay(ReadText("data/solve_plan.json"), at);

            foreach (var w in new[] { "day", "night" })
            {
                var s = gameObject.AddComponent<AudioSource>();
                s.loop = true; s.playOnAwake = false; s.volume = 0;
                music[w] = s;
            }
            for (int k = 0; k < 8; k++)
            {
                var s = gameObject.AddComponent<AudioSource>();
                s.playOnAwake = false;
                sfxPool.Add(s);
            }
        }

        AudioClip Clip(string name)
        {
            if (!clips.TryGetValue(name, out var c)) clips[name] = c = Resources.Load<AudioClip>("Shared/audio/" + name);
            return c;
        }

        void Sfx(string name)
        {
            var s = sfxPool[sfxI];
            sfxI = (sfxI + 1) % sfxPool.Count;
            s.clip = Clip("sfx_" + name);
            if (s.clip != null) s.Play();
        }

        void MusicUpdate()
        {
            var G = P.G;
            if (G.state == "title") return;
            string rid = P.LV.regions[P.LV.rooms[G.room].region].id;
            if (rid != musicRid)
            {
                musicRid = rid;
                double t0 = AudioSettings.dspTime + 0.05;      // 白天、夜里两段同一刻起放，节拍对齐
                foreach (var w in new[] { "day", "night" })
                {
                    music[w].Stop();
                    music[w].clip = Clip("music_" + rid + "_" + w);
                    if (music[w].clip != null) music[w].PlayScheduled(t0);
                }
            }
            // 换天：只换音量，留一点过渡，不断拍
            foreach (var w in new[] { "day", "night" })
            {
                float target = w == G.world ? 1f : 0f;
                var s = music[w];
                s.volume = Mathf.Abs(s.volume - target) > 0.01f ? Mathf.Lerp(s.volume, target, 0.25f) : target;
                if (G.state == "paused") s.Pause(); else s.UnPause();
            }
        }

        // ------------------------------------------------------------ 按键（旧版 Input）
        void HandleInput()
        {
            var G = P.G;
            if (G.state == "title" || G.state == "ended")
            {
                if (Input.anyKeyDown) G.Start(P.startAt);
                return;
            }
            if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A)) G.InputMove(-1, true);
            if (Input.GetKeyUp(KeyCode.LeftArrow) || Input.GetKeyUp(KeyCode.A)) G.InputMove(-1, Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A));
            if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D)) G.InputMove(1, true);
            if (Input.GetKeyUp(KeyCode.RightArrow) || Input.GetKeyUp(KeyCode.D)) G.InputMove(1, Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D));
            if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W)) G.InputJump();
            if (Input.GetKeyUp(KeyCode.Space) || Input.GetKeyUp(KeyCode.UpArrow) || Input.GetKeyUp(KeyCode.W)) G.InputJumpRelease();
            if (Input.GetKeyDown(KeyCode.LeftShift) || Input.GetKeyDown(KeyCode.RightShift)) G.InputSwitch();
            if (Input.GetKeyDown(KeyCode.R)) G.InputRetry();
            if (Input.GetKeyDown(KeyCode.Escape)) { if (G.state == "paused") G.Resume(); else G.Pause(); }
        }

        void Update()
        {
            HandleInput();
            acc += Math.Min(Time.unscaledDeltaTime, 0.25);
            bool ticked = false;
            while (acc >= STEP) { acc -= STEP; P.Tick(); ticked = true; }
            if (!ticked) return;
            MusicUpdate();
            var im = P.Render();
            // Unity 的纹理从下往上逐行，倒一下再传
            int row = PW * 4;
            for (int y = 0; y < PH; y++) Buffer.BlockCopy(im.p, y * row, upload, (PH - 1 - y) * row, row);
            screen.LoadRawTextureData(upload);
            screen.Apply(false);
        }

        // 只按整数倍放大，居中，余下黑边
        void OnGUI()
        {
            if (Event.current.type != EventType.Repaint) return;
            int s = Math.Max(1, Math.Min(Screen.width / PW, Screen.height / PH));
            int w = PW * s, h = PH * s;
            GUI.DrawTexture(new Rect((Screen.width - w) / 2, (Screen.height - h) / 2, w, h), screen, ScaleMode.StretchToFill, false);
        }
    }
}
