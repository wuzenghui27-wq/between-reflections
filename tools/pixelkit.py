# 像素画小工具：调色板色阶、画布、选择性描边。
# 行内做法：每种材质一条 3–5 级的色阶（暗部偏冷偏饱和、亮部偏暖），光从右上方来；
# 外轮廓用“比相邻颜色更暗的同色系”描边（selective outline），而不是一刀切的纯黑。
from PIL import Image


def hexc(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def ramp(*cols):
    return [hexc(c) for c in cols]


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.p = self.im.load()

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if c is not None and 0 <= x < self.w and 0 <= y < self.h:
            self.p[x, y] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.p[x, y]
        return (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.put(x, y, c)

    def hline(self, x0, x1, y, c):
        for x in range(int(min(x0, x1)), int(max(x0, x1)) + 1):
            self.put(x, y, c)

    def line(self, x0, y0, x1, y1, c, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) or 1
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            for k in range(w):
                self.put(round(x) + k, round(y), c)

    def bitmap(self, rows, ox, oy, pal, flip=False):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in '. ':
                    continue
                x = ox + (len(row) - 1 - i if flip else i)
                self.put(x, oy + j, pal[ch])

    def disc(self, cx, cy, r, c):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3:
                    self.put(x, y, c)


INK = (20, 16, 26, 255)


def sel_outline(im, ink=INK, k=0.42):
    """外扩 1 像素，描一圈“相邻颜色压暗后再往墨色靠”的轮廓。底边和背光面更接近墨色。"""
    w, h = im.size
    out = Image.new('RGBA', (w + 2, h + 2), (0, 0, 0, 0))
    out.paste(im, (1, 1))
    src = out.copy().load()
    p = out.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]:
                continue
            best = None
            for dx, dy in ((0, 1), (0, -1), (-1, 0), (1, 0)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < w + 2 and 0 <= yy < h + 2 and src[xx, yy][3] > 0:
                    c = src[xx, yy]
                    lum = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
                    if best is None or lum < best[0]:
                        best = (lum, c, dx, dy)
            if best is None:
                continue
            _, c, dx, dy = best
            kk = k
            if dy == -1 or dx == 1:      # 物体的下沿、左侧（背光）→ 更接近墨色
                kk = k * 0.6
            p[x, y] = tuple(int(ink[i] * (1 - kk) + c[i] * kk * 0.5) for i in range(3)) + (255,)
    return out


def shade_box(cv, x0, y0, x1, y1, rp, light='tr'):
    """方块按光向上色：rp 为亮→暗的色阶（至少 3 级）。"""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            c = rp[1]
            if x >= x1 - 0 or y == y0:
                c = rp[0]
            if x <= x0 or y == y1:
                c = rp[2]
            cv.put(x, y, c)
