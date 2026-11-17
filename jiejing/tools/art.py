# 借景 · 美术烘焙：全部用代码一个像素一个像素画出来，只用 12 色调色板（索引色 PNG，0 号是透明）。
# 用法：python3 jiejing/tools/art.py        输出到 jiejing/art/
#
# 分层笔法（GDD“美术”一节）：
#   远层：只用 1 像素线，不抖色，墨色淡（淡墨/浅墨）。
#   中层：平涂 + 1 像素亮边或暗边，墨色中等。
#   近层：2 像素轮廓 + 4×4 抖色，墨色最浓。
#   能走的墨线：1 像素纸白的顶 + 2 像素墨，两端圆头。远层的线也一样粗（玩法要看得清），只是墨淡。
# 每屏至少一半是空白的纸。
import json, math, os
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


# ------------------------------------------------------------ 能走的墨线
INK_OF = {0: 'ink2', 1: 'ink4', 2: 'ink5'}


def walk_stroke(cv, pts, ox, layer):
    ink = INK_OF[layer]
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        y = rnd(y_at(pts, x))
        cv.put(x + ox, y, 'paper')
        cv.put(x + ox, y + 1, ink)
        cv.put(x + ox, y + 2, ink)
    # 两端圆头：多出一点墨，削掉外角
    for x, sgn in ((x1, -1), (x2, 1)):
        y = rnd(y_at(pts, x))
        cv.put(x + ox + sgn, y + 1, ink)
        cv.put(x + ox + sgn, y + 2, ink)
        cv.put(x + ox + sgn, y, None)
        cv.put(x + ox, y, ink if layer == 2 else 'paper')


# ------------------------------------------------------------ 各种线下面的东西
def draw_bank(cv, pts, ox, water):
    """近层石岸：2 像素轮廓、抖色石面、一层层石缝，底下化进水里。"""
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        top = rnd(y_at(pts, x)) + 3
        for y in range(top, water + 4):
            depth = y - top
            lvl = 3 + min(6, depth // 3)
            if y > water - 2:
                lvl = max(0, lvl - (y - water + 2) * 2)
            cv.put(x + ox, y, 'paper2')
            cv.dither(x + ox, y, 'ink1', lvl)
            # 石缝：每 6 行一道，错缝
            row = (y - top) // 6
            if (y - top) % 6 == 5 and y < water - 1 and hash01(x // 3, row) > 0.25:
                cv.put(x + ox, y, 'ink2')
            if (y - top) % 6 != 5 and (x + row * 7) % 17 == 0 and y < water - 1:
                cv.put(x + ox, y, 'ink2')
    # 2 像素外轮廓（左右两侧），底部不描（化在水里）
    for x, sgn in ((x1, 1), (x2, -1)):
        top = rnd(y_at(pts, x))
        for y in range(top + 1, water - 1):
            fade = (y - top) > (water - top) * 0.7 and hash01(x, y) < 0.5
            if not fade:
                cv.put(x + ox, y, 'ink5')
                cv.put(x + ox + sgn, y, 'ink4')
    # 岸边水草点
    for x in range(x1 + 2, x2 - 1, 5):
        if hash01(x, 9) < 0.4:
            cv.put(x + ox, water - 1, 'ink3')
            cv.put(x + ox, water - 2, 'ink4')


def draw_terrace(cv, pts, ox, water):
    """近层高台：台基（砖砌，2 像素轮廓）+ 栏杆。"""
    x1, x2 = pts[0][0], pts[-1][0]
    y0 = rnd(y_at(pts, x1))
    for x in range(x1, x2 + 1):
        for y in range(y0 + 3, water + 2):
            cv.put(x + ox, y, 'paper2')
            lvl = 2 + min(5, (y - y0) // 8)
            if y > water - 3:
                lvl = max(0, lvl - (y - water + 3) * 2)
            cv.dither(x + ox, y, 'ink1', lvl)
            r = (y - y0 - 3) // 5
            if (y - y0 - 3) % 5 == 4 and y < water - 2:
                cv.put(x + ox, y, 'ink2')
            elif (x + (r % 2) * 6) % 12 == 0 and y < water - 2:
                cv.put(x + ox, y, 'ink2')
    for x in (x1, x2):
        sgn = 1 if x == x1 else -1
        for y in range(y0 + 1, water - 1):
            cv.put(x + ox, y, 'ink5'); cv.put(x + ox + sgn, y, 'ink4')
    # 台口一道压阑石（深一点）
    for x in range(x1, x2 + 1):
        cv.put(x + ox, y0 + 3, 'ink3')


def draw_plank(cv, pts, ox, water):
    """中层木桥：桥面一道梁，下面隔一段一根桩，平涂 + 1 像素亮边。"""
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        y = rnd(y_at(pts, x))
        cv.put(x + ox, y + 3, 'ink3')
        if (x - x1) % 4 == 0:
            cv.put(x + ox, y + 3, 'ink2')
    n = max(2, (x2 - x1) // 22 + 1)
    for i in range(n):
        x = x1 + 3 + (x2 - x1 - 6) * i // (n - 1)
        y = rnd(y_at(pts, x))
        for yy in range(y + 3, water + 1):
            cv.put(x + ox, yy, 'ink4')
            cv.put(x + ox + 1, yy, 'ink3')
            cv.put(x + ox - 1, yy, 'ink2' if yy % 3 == 0 else None)
        # 桩入水的一圈小波
        cv.put(x + ox - 2, water + 1, 'ink2'); cv.put(x + ox + 3, water + 1, 'ink2')
    # 斜撑
    for i in range(n - 1):
        xa = x1 + 3 + (x2 - x1 - 6) * i // (n - 1)
        xb = x1 + 3 + (x2 - x1 - 6) * (i + 1) // (n - 1)
        ya = rnd(y_at(pts, xa)) + 4
        cv.line(xa + ox + 1, ya, (xa + xb) // 2 + ox, ya + 6, 'ink3')
        cv.line(xb + ox - 1, ya, (xa + xb) // 2 + ox, ya + 6, 'ink3')


def draw_boat(cv, pts, ox, water):
    """中层乌篷船：船身平涂 + 亮边，船尾一个乌篷，船头一根篙。"""
    x1, x2 = pts[0][0], pts[-1][0]
    y = rnd(y_at(pts, x1))
    L = x2 - x1
    for x in range(x1 - 3, x2 + 4):
        t = (x - (x1 - 3)) / (L + 6)
        bottom = y + 3 + rnd(4 * math.sin(math.pi * t))
        top = y + 3 if x1 <= x <= x2 else y + 3 - (1 if (x < x1 - 1 or x > x2 + 1) else 0)
        for yy in range(top, bottom + 1):
            cv.put(x + ox, yy, 'ink4')
        cv.put(x + ox, top, 'ink2')
    # 船沿上翘
    cv.put(x1 - 3 + ox, y + 1, 'ink4'); cv.put(x1 - 3 + ox, y + 2, 'ink4'); cv.put(x1 - 2 + ox, y + 2, 'ink4')
    cv.put(x2 + 3 + ox, y + 1, 'ink4'); cv.put(x2 + 3 + ox, y + 2, 'ink4'); cv.put(x2 + 2 + ox, y + 2, 'ink4')
    # 乌篷（船尾，左边），半圆
    cx, r = x1 + 5, 5
    for x in range(cx - r, cx + r + 1):
        h = rnd(math.sqrt(max(0, r * r - (x - cx) ** 2)) * 1.1)
        for yy in range(y - h, y + 1):
            cv.put(x + ox, yy, 'ink5' if yy > y - h else 'ink3')
        if (x - cx) % 3 == 0:
            cv.put(x + ox, y - h + 2, 'ink4')
    # 水线
    for x in range(x1 - 5, x2 + 6):
        if hash01(x, 3) < 0.5:
            cv.put(x + ox, y + 8, 'ink2')


def draw_stair(cv, pts, ox, water):
    """远层石阶：只用 1 像素淡墨线。台阶的折线、两边细栏杆，底下几笔山石。"""
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        if a[1] == b[1]:
            continue
        # 斜坡上画台阶的折线（在墨线下方）
        x = a[0]
        while x < b[0]:
            y = rnd(y_at(pts, x))
            cv.put(x + ox, y + 3, 'ink1')
            for k in range(4):
                cv.put(x + ox + k, rnd(y_at(pts, x + 3)) + 3 if False else y + 3, 'ink1')
            cv.line(x + ox + 3, y + 3, x + ox + 3, rnd(y_at(pts, x + 4)) + 3, 'ink1')
            x += 4
        # 侧面山石轮廓
        cv.line(a[0] + ox, a[1] + 4, a[0] + ox, water, 'ink1')
        cv.line(b[0] + ox, b[1] + 4, b[0] + ox + 6, water, 'ink1')
        for k in range(0, b[0] - a[0], 7):
            yy = rnd(y_at(pts, a[0] + k)) + 8
            cv.line(a[0] + k + ox, yy, a[0] + k + ox + 3, yy + 3, 'ink1')
    # 平的一段：下面一道细线（栈道）
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        if a[1] != b[1]:
            continue
        for x in range(a[0], b[0] + 1):
            cv.put(x + ox, a[1] + 4, 'ink1' if x % 2 else None)
        for x in range(a[0] + 2, b[0], 12):
            cv.line(x + ox, a[1] + 4, x + ox, water, 'ink1')


def draw_arch(cv, lines, ox, water):
    """远层拱桥（一组线）：桥面下一个半圆拱，1 像素淡墨；拱洞倒影成一个整圆。"""
    xs = [p[0] for l in lines for p in l]
    x1, x2 = min(xs), max(xs)
    allp = sorted([p for l in lines for p in l])
    cx = (x1 + x2) / 2
    r = (x2 - x1) * 0.32
    base = water
    for x in range(int(cx - r), int(cx + r) + 1):
        h = math.sqrt(max(0, r * r - (x - cx) ** 2))
        cv.put(x + ox, rnd(base - h * 0.9), 'ink2')
        cv.put(x + ox, rnd(base + h * 0.5), 'ink1' if x % 2 else None)   # 倒影（虚）
    # 桥身外轮廓：从桥面两端斜下到水
    cv.line(x1 + ox, allp[0][1] + 3, x1 + ox - 4, base, 'ink2')
    cv.line(x2 + ox, allp[-1][1] + 3, x2 + ox + 4, base, 'ink2')
    # 桥面下一道细线
    for x in range(x1, x2 + 1):
        if x % 2 == 0:
            cv.put(x + ox, rnd(y_at(allp, x)) + 4, 'ink1')
    # 断口：桥面中间缺的那一块，画两笔碎石
    for l in lines[:-1]:
        e = l[-1]
        cv.put(e[0] + ox + 2, e[1] + 5, 'ink1'); cv.put(e[0] + ox + 3, e[1] + 7, 'ink1')


# ------------------------------------------------------------ 景物
def deco_willow(cv, x, y):
    """近层垂柳：2 像素树干（浓墨），垂下来的柳丝用抖色。"""
    top = y - 54
    for yy in range(top + 10, y + 1):
        sway = rnd(math.sin((yy - top) / 9.0) * 1.5)
        cv.put(x + sway, yy, 'ink5'); cv.put(x + sway + 1, yy, 'ink4')
    for i, (bx, by, L) in enumerate([(-14, 12, 28), (-8, 6, 36), (-2, 2, 40), (5, 4, 34), (11, 9, 26), (17, 15, 20), (-19, 18, 18)]):
        # 枝条
        cv.line(x, top + 14, x + bx, top + by, 'ink4')
        for k in range(L):
            xx = x + bx + rnd(math.sin(k / 6.0 + i) * 1.2)
            yy = top + by + k
            if yy > y - 4:
                break
            c = 'ink3' if k < L * 0.6 else 'ink2'
            if k % 3 != 2 or k < 4:
                cv.put(xx, yy, c)
            if k % 4 == 1:
                cv.put(xx + 1, yy, 'ink2')


def deco_reeds(cv, x, y):
    for i in range(9):
        xx = x + i * 3 + rnd(hash01(i, x) * 2)
        h = 10 + rnd(hash01(x, i) * 12)
        lean = 1 if i % 2 else -1
        for k in range(h):
            cv.put(xx + (lean if k > h * 0.6 else 0), y - k, 'ink4' if k < h * 0.5 else 'ink3')
        cv.put(xx + lean, y - h, 'ink2'); cv.put(xx + lean, y - h - 1, 'ink2')
        cv.dither(xx + lean + 1, y - h + 1, 'ink2', 8)


def deco_house(cv, x, y, w=46):
    """近层民居：白墙（纸色）+ 黑瓦马头墙，2 像素轮廓。"""
    x0, x1 = x - w // 2, x + w // 2
    wall_top = y - 22
    for xx in range(x0, x1 + 1):
        for yy in range(wall_top, y + 1):
            cv.put(xx, yy, 'paper')
        cv.dither(xx, y - 1, 'ink1', 8)
        cv.dither(xx, y, 'ink1', 12)
    for yy in range(wall_top, y + 1):
        cv.put(x0, yy, 'ink4'); cv.put(x1, yy, 'ink4')
    # 屋檐与瓦
    for xx in range(x0 - 3, x1 + 4):
        cv.put(xx, wall_top - 1, 'ink5'); cv.put(xx, wall_top - 2, 'ink4')
        if xx % 2 == 0:
            cv.put(xx, wall_top - 3, 'ink4')
    # 马头墙（两端阶梯形高起）
    for side in (x0, x1 - 9):
        for k in range(3):
            sx, sy = side + (k * 3 if side == x0 else 6 - k * 3), wall_top - 5 - k * 4
            cv.rect(sx - 1, sy, 5, 2, 'ink5')
            cv.rect(sx, sy + 2, 3, 4, 'paper')
            cv.put(sx - 1, sy + 2, 'ink4'); cv.put(sx + 3, sy + 2, 'ink4')
    # 门与花窗
    cv.rect(x - 3, y - 11, 6, 11, 'ink4'); cv.put(x, y - 11, 'ink3')
    cv.rect(x - 3, y - 12, 6, 1, 'ink5')
    for wx in (x0 + 7, x1 - 11):
        cv.rect(wx, y - 17, 5, 5, 'ink3')
        cv.put(wx + 2, y - 15, 'paper'); cv.put(wx + 1, y - 16, 'ink5'); cv.put(wx + 3, y - 14, 'ink5')


def deco_hall(cv, x, y, w=62):
    """高台上的小亭阁：两根柱、歇山顶，近层。"""
    x0, x1 = x, x + w
    for px in (x0 + 8, x1 - 8):
        for yy in range(y - 24, y):
            cv.put(px, yy, 'ink5'); cv.put(px + 1, yy, 'ink4')
    # 栏杆
    for xx in range(x0 + 2, x1 - 1):
        cv.put(xx, y - 7, 'ink4')
        if xx % 5 == 0:
            for yy in range(y - 7, y):
                cv.put(xx, yy, 'ink3')
    # 屋顶：翘角
    ry = y - 26
    for xx in range(x0 - 2, x1 + 3):
        t = (xx - x0 + 2) / (w + 4)
        lift = rnd(3 * (abs(t - 0.5) * 2) ** 4)
        cv.put(xx, ry - lift, 'ink5'); cv.put(xx, ry - lift - 1, 'ink4')
    for k in range(1, 10):
        a, b = x0 + 4 + k * 2, x1 - 4 - k * 2
        for xx in range(a, b + 1):
            c = 'ink4' if (xx + k) % 3 else 'ink5'
            cv.put(xx, ry - 1 - k, c)
    cv.rect(x0 + 22, ry - 11, w - 44, 1, 'ink5')
    # 一盏小红灯笼挂在檐下
    lx = x0 + w // 2
    cv.put(lx, ry + 1, 'ink4')
    cv.rect(lx - 1, ry + 2, 3, 3, 'red')


def deco_pagoda(cv, x, y):
    """远层塔：只用 1 像素淡墨线，七层。"""
    w = 14
    yy = y - 6
    for k in range(7):
        h = 7 - k // 3
        ww = w - k * 1.4
        a, b = rnd(x - ww / 2), rnd(x + ww / 2)
        cv.line(a - 2, yy, b + 2, yy, 'ink1')
        cv.put(a - 3, yy - 1, 'ink1'); cv.put(b + 3, yy - 1, 'ink1')
        cv.line(a, yy, a, yy - h + 1, 'ink1'); cv.line(b, yy, b, yy - h + 1, 'ink1')
        yy -= h
    cv.line(x, yy, x, yy - 6, 'ink1')
    cv.line(x - 2, y - 6, x + 2, y - 6, 'ink1')


def hills(cv, seed, water):
    """背景远山：几座山峰前后叠着，山脊 1 像素淡墨，阴面几笔皴，山脚化进雾里（不收底线）；水面几道横波。"""
    peaks = []
    n = 4 + seed % 3
    for i in range(n):
        cx = 30 + (i * 290 // max(1, n - 1)) + rnd((hash01(seed, i, 1) - 0.5) * 50)
        h = 34 + rnd(hash01(seed, i, 2) * 36)
        w = 46 + rnd(hash01(seed, i, 3) * 40)
        peaks.append((cx, h, w, i))
    base = water - 22
    # 远的（矮的）先画，近的后画并用纸色盖住后面
    for band, (cx, h, w, i) in enumerate(sorted(peaks, key=lambda p: p[1])):
        ridge = {}
        for x in range(cx - w, cx + w + 1):
            t = abs(x - cx) / w
            wob = math.sin(x * 0.31 + seed + i) * 1.6 + math.sin(x * 0.13 + i * 2) * 2.5
            y = rnd(base - h * (1 - t) ** 1.5 + wob * (1 - t))
            ridge[x] = y
        for x, y in ridge.items():
            fog = base + 6
            for yy in range(y + 1, fog):
                if yy > base - 4 and hash01(x, yy, i) < (yy - base + 4) / 10:
                    continue
                cv.put(x, yy, 'paper')
        prev = None
        for x in range(cx - w, cx + w + 1):
            y = ridge[x]
            t = abs(x - cx) / w
            if t > 0.92 and hash01(x, i, 4) < 0.6:
                prev = None
                continue
            if prev is not None:
                cv.line(x - 1, prev, x, y, 'ink1')
            prev = y
            # 山顶一点青绿（矿物色），稀疏抖色
            if t < 0.25:
                for k in range(1, 5):
                    cv.dither(x, y + k, 'jade', 3 - k // 2)
            # 阴面（右坡）皴笔：短斜线，越往下越稀
            if x > cx and hash01(x, i, seed) < 0.16 * (1 - t):
                L = 2 + rnd(hash01(x, i) * 4)
                cv.line(x, y + 2, x - L // 2, y + 2 + L, 'ink1')
        # 主峰上方一点：远树（几个 1 像素点）
        for k in range(3):
            tx = cx - 6 + k * 5
            if tx in ridge:
                cv.put(tx, ridge[tx] - 1, 'ink2')
    # 水面：横波，越近越密
    for k, yy in enumerate(range(water + 3, 180, 4)):
        for x in range(0, 320):
            n = hash01(x // 7, yy, seed)
            if n < 0.14 + k * 0.05:
                cv.put(x, yy, 'ink1')


# ------------------------------------------------------------ 人物：16×16，朝右
BODY = [
    "................",
    "................",
    "................",
    ".......55.......",
    ".....455554.....",
    "...4555555554...",
    "......5wp.......",
    "......44w.......",
    ".....3445.......",
    ".....34455......",
    ".....3445w......",
    ".....34445......",
    ".....334445.....",
    "....3334445.....",
]
CH = {'.': None, 'w': 'paper', 'p': 'paper2', '1': 'ink1', '2': 'ink2', '3': 'ink3', '4': 'ink4', '5': 'ink5', 'r': 'red', 'g': 'gold'}


def sprite_frame(body_dy=0, feet=((5, '4'), (9, '5')), hem=None, ribbon=0, arm=None, hop=False):
    cv = Cv(16, 16)
    rows = list(BODY)
    if hem:
        rows[12], rows[13] = hem
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if CH[ch]:
                cv.put(x, y + body_dy, CH[ch])
    # 斗笠后飘的红绳
    rib = [[(4, 7), (3, 8)], [(4, 7), (3, 7), (2, 8)], [(4, 7), (3, 8), (2, 8)]][ribbon]
    for (x, y) in rib:
        cv.put(x, y + body_dy, 'red')
    if arm:     # 推的手：伸出去
        for (x, y) in arm:
            cv.put(x, y + body_dy, 'ink4')
        cv.put(arm[-1][0] + 1, arm[-1][1] + body_dy, 'paper')
    for (fx, c) in feet:
        cv.put(fx, 14 + body_dy if not hop else 13 + body_dy, CH[c])
        cv.put(fx + 1, 14 + body_dy if not hop else 13 + body_dy, CH[c])
    return cv


def traveler_atlas():
    frames = []
    # 0-1 站立（红绳轻摆）
    frames.append(sprite_frame(1, ribbon=0, feet=((6, '4'), (8, '5'))))
    frames.append(sprite_frame(1, ribbon=1, feet=((6, '4'), (8, '5'))))
    # 2-7 走（六帧：迈开、交错、并步，前后脚换色）
    steps = [((4, '4'), (10, '5')), ((5, '4'), (9, '5')), ((7, '5'), (7, '4')),
             ((4, '5'), (10, '4')), ((5, '5'), (9, '4')), ((7, '4'), (7, '5'))]
    hems = [("....33344455....", "...333.44.455..."), ("....3334445.....", "....333.4445...."), (".....334445.....", ".....3344445...."),
            ("....33344455....", "...334.43.445..."), ("....3334445.....", "....334.3445...."), (".....334445.....", ".....3344445....")]
    for i in range(6):
        bob = 0 if i in (2, 5) else 1
        frames.append(sprite_frame(bob, feet=steps[i], hem=hems[i], ribbon=1 + (i % 2)))
    # 8-9 跳（起、落）
    frames.append(sprite_frame(0, feet=((5, '4'), (9, '5')), hem=("....3334445.....", "...333..4445...."), ribbon=2, hop=True))
    frames.append(sprite_frame(0, feet=((4, '4'), (10, '5')), hem=("....33344455....", "...33....4455..."), ribbon=1, hop=True))
    # 10-11 推（手伸向前，身子前倾一点）
    for i in range(2):
        frames.append(sprite_frame(1, feet=((4, '4'), (9, '5')), hem=("....3334445.....", "...333.4445....."),
                                   ribbon=1 + i, arm=[(8, 9), (9, 9), (10, 9 - i)]))
    atlas = Cv(128, 64)
    for i, f in enumerate(frames):
        atlas.blit(f, (i % 8) * 16, (i // 8) * 16)
    atlas.save(os.path.join(OUT, 'char_traveler.png'))
    return len(frames)


# ------------------------------------------------------------ 道具：宫灯（8×20），三帧：未亮、亮 a、亮 b
def lamp_atlas():
    """宫灯：浓墨灯杆、横挑，挂一盏六角宫灯（10×10）。未亮：纸色灯身、墨框、朱砂顶底；亮：朱砂灯身、金色灯芯，下垂金穗。"""
    atlas = Cv(64, 32)
    for f in range(3):
        cv = Cv(12, 28)
        for y in range(3, 28):
            cv.put(3, y, 'ink5'); cv.put(4, y, 'ink4')
        for x in (1, 2, 5, 6):
            cv.put(x, 27, 'ink5')
        cv.put(2, 26, 'ink4'); cv.put(5, 26, 'ink4')
        for x in range(2, 11):
            cv.put(x, 3, 'ink5')
        cv.put(10, 4, 'ink5')
        lit = f > 0
        # 灯身 x 6..11? 宽 7（6..12 超出），用 5..11
        top, bot = 6, 15
        for y in range(top, bot + 1):
            for x in range(6, 12):
                if (y in (top, bot)) and x in (6, 11):
                    continue
                edge = x in (6, 11) or y in (top, bot)
                if lit:
                    cv.put(x, y, 'ink5' if edge and y in (top, bot) else 'red')
                else:
                    cv.put(x, y, 'ink4' if edge else 'paper2')
        for x in range(7, 11):
            cv.put(x, top - 1, 'red' if not lit else 'ink5')
            cv.put(x, bot + 1, 'red' if not lit else 'ink5')
        cv.put(10, 5, 'ink5')
        if lit:
            cv.put(8, 9, 'gold'); cv.put(9, 9, 'gold'); cv.put(8, 10, 'gold'); cv.put(9, 11, 'gold' if f == 1 else 'red')
            cv.put(8, 12, 'gold' if f == 2 else 'red')
            for y in range(bot + 2, bot + 5):
                cv.put(8 + (f == 2 and y == bot + 4), y, 'gold'); cv.put(9, y, 'gold' if y < bot + 4 else None)
        else:
            for y in range(top + 2, bot - 1, 2):
                cv.put(8, y, 'ink1'); cv.put(9, y + 1, 'ink1')
            for y in range(bot + 2, bot + 4):
                cv.put(8, y, 'red'); cv.put(9, y, 'red')
        atlas.blit(cv, f * 12, 0)
    halo = Cv(24, 24)
    for y in range(24):
        for x in range(24):
            d = math.hypot(x - 11.5, y - 11.5)
            if d < 11.5:
                halo.dither(x, y, 'gold', int(max(0, 10 - d) * 1.0))
    atlas.blit(halo, 36, 0)
    atlas.save(os.path.join(OUT, 'props_lamp.png'))


# ------------------------------------------------------------ 纸纹（乘到整幅画面上）
def paper_noise():
    im = Image.new('L', (320, 180))
    px = []
    for y in range(180):
        for x in range(320):
            n = hash01(x, y, 5)
            fiber = hash01(x // 9, y // 2, 11) < 0.06
            v = 255 - int(n * 14) - (8 if fiber else 0)       # 5–8% 左右的乘法纸纹
            px.append(max(0, min(255, v)))
    im.putdata(px)
    im.save(os.path.join(OUT, 'paper_noise.png'))


# ------------------------------------------------------------ 每一景：背景 + 三层
DRAW = {'bank': draw_bank, 'terrace': draw_terrace, 'plank': draw_plank, 'boat': draw_boat, 'stair': draw_stair}
DECO = {'willow': deco_willow, 'reeds': deco_reeds, 'house': deco_house, 'hall': deco_hall, 'pagoda': deco_pagoda}


def bake_level(L, meta):
    water = L.get('water', 150)
    bg = Cv(320, 180)
    bg.rect(0, 0, 320, 180, 'paper')
    hills(bg, L.get('bg', {}).get('hills', 3), water)
    bg.save(os.path.join(OUT, 'levels', L['id'] + '_bg.png'))
    info = {'layers': []}
    for k in range(3):
        d = L['layers'][k]
        o0 = d.get('o', 0)
        mn, mx = d.get('min', o0), d.get('max', o0)
        # 层图覆盖层内 x ∈ [-max, 320 - min]，画在屏幕 x = o - max
        w = 320 + mx - mn
        ox = mx
        cv = Cv(w, 180)
        for dd in d.get('deco', []):
            fn = DECO[dd['k']]
            args = [cv, dd['x'] + ox, dd['y']]
            if 'w' in dd:
                args.append(dd['w'])
            fn(*args)
        lines = d.get('lines', [])
        arches = [l['pts'] for l in lines if l.get('kind') == 'arch']
        if arches:
            draw_arch(cv, arches, ox, water)
        for l in lines:
            f = DRAW.get(l.get('kind'))
            if f:
                f(cv, l['pts'], ox, water)
        for l in lines:
            walk_stroke(cv, l['pts'], ox, k)
        name = '%s_L%d.png' % (L['id'], k)
        cv.save(os.path.join(OUT, 'levels', name))
        info['layers'].append({'img': 'levels/' + name, 'dx': -mx})
    meta[L['id']] = info


def main():
    lv = json.load(open(os.path.join(ROOT, 'data/levels.json'), encoding='utf8'))['levels']
    meta = {}
    n = traveler_atlas()
    lamp_atlas()
    paper_noise()
    for L in lv:
        bake_level(L, meta)
    json.dump({'traveler_frames': n, 'levels': meta}, open(os.path.join(ROOT, 'data/art.json'), 'w'), ensure_ascii=False, indent=1)
    print('烘焙完成：', n, '帧人物，', len(lv), '景')


if __name__ == '__main__':
    main()
