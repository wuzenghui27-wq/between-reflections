// 一张 1x 像素图：RGBA，每像素 4 字节，从左上角起逐行（和 PNG 一样，上行在前）。
// 画面在 CPU 上逐像素合成到 320×180 的格子里：没有过滤、没有缩放、没有半像素，天然像素完美。
using System;

namespace BR
{
    public struct Col
    {
        public byte r, g, b, a;
        public Col(int r, int g, int b, int a = 255) { this.r = (byte)r; this.g = (byte)g; this.b = (byte)b; this.a = (byte)a; }
        public Col A(double k) => new Col(r, g, b, (int)Math.Round(Math.Max(0, Math.Min(1, k)) * a));
        public static readonly Col White = new Col(255, 255, 255);
    }

    public class Img
    {
        public readonly int w, h;
        public readonly byte[] p;
        public Img(int w, int h, byte[] p = null) { this.w = w; this.h = h; this.p = p ?? new byte[w * h * 4]; }

        public void Fill(Col c)
        {
            for (int i = 0; i < p.Length; i += 4) { p[i] = c.r; p[i + 1] = c.g; p[i + 2] = c.b; p[i + 3] = 255; }
        }

        // 源图 (sx,sy,sw,sh) 一比一贴到 (dx,dy)；flip = 左右镜像；tint 乘到颜色上；mask(x,y) 返回 false 的像素不画
        public void Blit(Img s, int sx, int sy, int sw, int sh, int dx, int dy, bool flip = false, Col? tint = null, Func<int, int, bool> mask = null)
        {
            int tr = 255, tg = 255, tb = 255, ta = 255;
            if (tint.HasValue) { var t = tint.Value; tr = t.r; tg = t.g; tb = t.b; ta = t.a; }
            if (ta == 0) return;
            for (int j = 0; j < sh; j++)
            {
                int y = dy + j;
                if (y < 0 || y >= h) continue;
                int srow = ((sy + j) * s.w) * 4;
                for (int i = 0; i < sw; i++)
                {
                    int x = flip ? dx + sw - 1 - i : dx + i;
                    if (x < 0 || x >= w) continue;
                    int si = srow + (sx + i) * 4;
                    int a = s.p[si + 3];
                    if (a == 0) continue;
                    if (mask != null && !mask(x, y)) continue;
                    if (ta != 255) a = a * ta / 255;
                    int r = s.p[si], g = s.p[si + 1], b = s.p[si + 2];
                    if (tr != 255) { r = r * tr / 255; g = g * tg / 255; b = b * tb / 255; }
                    Put(x, y, r, g, b, a);
                }
            }
        }

        public void Draw(Img s, int dx, int dy, Func<int, int, bool> mask = null) => Blit(s, 0, 0, s.w, s.h, dx, dy, false, null, mask);

        public void Rect(int x, int y, int rw, int rh, Col c)
        {
            if (c.a == 0) return;
            int x0 = Math.Max(0, x), y0 = Math.Max(0, y), x1 = Math.Min(w, x + rw), y1 = Math.Min(h, y + rh);
            for (int yy = y0; yy < y1; yy++)
                for (int xx = x0; xx < x1; xx++) Put(xx, yy, c.r, c.g, c.b, c.a);
        }

        // 盖在不透明的底上（画面底色总是先铺满），所以只算颜色
        void Put(int x, int y, int r, int g, int b, int a)
        {
            int di = (y * w + x) * 4;
            if (a == 255) { p[di] = (byte)r; p[di + 1] = (byte)g; p[di + 2] = (byte)b; p[di + 3] = 255; return; }
            int ia = 255 - a;
            p[di] = (byte)((r * a + p[di] * ia + 127) / 255);
            p[di + 1] = (byte)((g * a + p[di + 1] * ia + 127) / 255);
            p[di + 2] = (byte)((b * a + p[di + 2] * ia + 127) / 255);
            p[di + 3] = 255;
        }
    }
}
