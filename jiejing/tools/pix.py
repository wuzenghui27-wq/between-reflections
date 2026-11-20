# 借景 · 像素画小工具：12 色调色板、索引色画布、4×4 抖色、确定的伪随机。
import math, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'art')

PAL = [
    ('paper', 0xEFE8D8), ('paper2', 0xE2D9C6),
    ('ink1', 0xB4AFA2), ('ink2', 0x82827F), ('ink3', 0x55555C), ('ink4', 0x34333A), ('ink5', 0x1B1A1F),
    ('night1', 0x2E3A4A), ('night2', 0x4A5A6E),
    ('red', 0xB8352A), ('gold', 0xE0A64A), ('jade', 0x6E8C8A),
]
IDX = {n: i + 1 for i, (n, _) in enumerate(PAL)}   # 0 = 透明
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


class Cv:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = bytearray(w * h)

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = 0 if c is None else IDX[c]

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return 0

    def rect(self, x, y, w, h, c):
        for j in range(int(y), int(y + h)):
            for i in range(int(x), int(x + w)):
                self.put(i, j, c)

    def dither(self, x, y, c, level):      # level 0..16：4×4 抖色
        if BAYER[int(y) % 4][int(x) % 4] < level:
            self.put(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.put(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def blit(self, o, ox, oy, flip=False):
        for y in range(o.h):
            for x in range(o.w):
                v = o.px[y * o.w + (o.w - 1 - x if flip else x)]
                if v:
                    xx, yy = ox + x, oy + y
                    if 0 <= xx < self.w and 0 <= yy < self.h:
                        self.px[yy * self.w + xx] = v

    def save(self, path):
        im = Image.new('P', (self.w, self.h))
        pal = [0, 0, 0]
        for _, v in PAL:
            pal += [(v >> 16) & 255, (v >> 8) & 255, v & 255]
        pal += [0, 0, 0] * (256 - len(PAL) - 1)
        im.putpalette(pal)
        im.putdata(list(self.px))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.save(path, transparency=0, optimize=False)


def y_at(pts, x):
    if x <= pts[0][0]:
        return pts[0][1]
    for i in range(1, len(pts)):
        if x <= pts[i][0]:
            a, b = pts[i - 1], pts[i]
            return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
    return pts[-1][1]


def rnd(v):
    return math.floor(v + 0.5)


def hash01(*a):          # 确定的伪随机（不用 random，保证每次烘焙一样）
    h = 2166136261
    for v in a:
        h ^= (int(v) * 2654435761) & 0xffffffff
        h = (h * 16777619) & 0xffffffff
    return (h & 0xffff) / 65536.0


