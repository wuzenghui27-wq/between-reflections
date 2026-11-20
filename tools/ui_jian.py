# 提示签的纸：照明代笺纸做。
#  - 底：米黄的竹纸 / 皮纸，纤维是一丝丝深浅不一的短线；抄纸时竹帘留下的“帘纹”（细密横纹）和“纲纹”（隔一段一道竖纹）
#  - 洒金：零星的金箔碎点（洒金笺）
#  - 边：朱丝栏 —— 外粗内细两道朱红栏线，四角折成回纹；纸边是毛边，不是一刀齐
#  - 角上一枝淡淡的饾版印花（折枝梅），十竹斋笺谱那种浅设色
# 都是像素图，CSS 里按 --px 放大，image-rendering: pixelated。
import random
from PIL import Image

PAPER = [(236, 222, 190), (230, 214, 180), (242, 230, 202), (224, 206, 170)]
FIBER = [(214, 194, 156), (248, 238, 214), (206, 186, 150)]
GOLD = [(226, 178, 74), (246, 210, 120), (190, 140, 52)]
ZHU = (184, 58, 40)        # 朱
ZHU2 = (206, 104, 80)      # 淡朱（细栏）


def tex(w=64, h=32, seed=7):
    """可平铺的纸面：底色微杂 + 纤维 + 帘纹 + 纲纹 + 洒金。"""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (w, h)); p = im.load()
    for y in range(h):
        for x in range(w):
            c = PAPER[0] if rnd.random() < 0.7 else PAPER[rnd.randrange(1, 4)]
            if y % 2 == 0:                                   # 帘纹：每两行一道很淡的横纹
                c = tuple(max(0, v - 4) for v in c)
            if x % 32 == 0:                                  # 纲纹
                c = tuple(max(0, v - 9) for v in c)
            p[x, y] = c + (255,)
    for _ in range(26):                                      # 纤维：短斜线
        x, y = rnd.randrange(w), rnd.randrange(h)
        col = FIBER[rnd.randrange(3)]
        dx = rnd.choice((1, 1, 2)); L = rnd.randrange(2, 6)
        for k in range(L):
            p[(x + k) % w, (y + (k * rnd.choice((0, 0, 1)) // dx)) % h] = col + (255,)
    for _ in range(7):                                       # 洒金：一两个像素的金箔碎片
        x, y = rnd.randrange(w), rnd.randrange(h)
        p[x, y] = GOLD[rnd.randrange(3)] + (255,)
        if rnd.random() < 0.5:
            p[(x + 1) % w, y] = GOLD[1] + (255,)
        if rnd.random() < 0.3:
            p[x, (y + 1) % h] = GOLD[2] + (255,)
    return im


def frame(N=24, S=8, seed=3):
    """九宫格边框（每边 S 像素）：毛边 + 外粗内细两道朱丝栏 + 回纹角。中心透明（底纹由 tex 铺）。"""
    rnd = random.Random(seed)
    base = tex(N, N, seed + 11)
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); p = im.load(); b = base.load()
    for y in range(N):
        for x in range(N):
            edge = min(x, y, N - 1 - x, N - 1 - y)
            if edge >= S:
                continue                                     # 中心留空
            if edge == 0:                                    # 毛边：最外一圈时有时无，颜色偏深
                if rnd.random() < 0.55:
                    p[x, y] = (214, 196, 160, 255)
                continue
            c = b[x, y]
            if edge == 1 and rnd.random() < 0.25:
                c = (220, 202, 166, 255)
            p[x, y] = c
    # 朱丝栏：外粗（2 像素，在第 3、4 圈），内细（1 像素，第 6 圈）
    for y in range(N):
        for x in range(N):
            edge = min(x, y, N - 1 - x, N - 1 - y)
            if edge in (3, 4):
                p[x, y] = (ZHU if edge == 3 else (196, 80, 58)) + (255,)
            elif edge == 6:
                p[x, y] = ZHU2 + (255,)
    # 回纹角：外框四角各一个小方折
    for cx, cy, sx, sy in ((5, 5, 1, 1), (N - 6, 5, -1, 1), (5, N - 6, 1, -1), (N - 6, N - 6, -1, -1)):
        for k in range(2):
            p[cx + sx * k, cy] = ZHU + (255,)
            p[cx, cy + sy * k] = ZHU + (255,)
        p[cx + sx, cy + sy] = ZHU2 + (255,)
    return im


def plum(seed=5):
    """角上的折枝梅：浅赭的枝、淡胭脂的花、一点金蕊。按饾版的浅设色，只用几种淡色。"""
    W, H = 30, 16
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); p = im.load()
    BR = (150, 118, 92, 150); BR2 = (176, 146, 116, 130)
    PET = (222, 128, 128, 165); PET2 = (236, 168, 160, 150); CORE = (214, 168, 72, 200)
    branch = [(29, 15), (27, 14), (25, 13), (23, 12), (21, 12), (19, 11), (17, 10), (15, 10), (13, 9), (11, 8), (9, 8), (7, 7), (5, 6)]
    for i, (x, y) in enumerate(branch):
        p[x, y] = BR if i % 3 else BR2
        if i < 6 and y + 1 < H:
            p[x, y + 1] = BR2
    for x, y in ((18, 10), (17, 8), (16, 7), (12, 8), (12, 6)):  # 小枝
        p[x, y] = BR2
    for (cx, cy) in ((16, 6), (11, 5), (6, 5), (21, 10), (3, 6)):
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1), (-1, 1), (1, 1)):
            p[cx + dx, cy + dy] = PET if (dx + dy) % 2 else PET2
        p[cx, cy] = CORE
    for (x, y) in ((8, 6), (14, 9), (24, 12)):              # 花苞
        p[x, y] = PET
    return im


SEAL_GLYPH = {
    'swap': ["..o......", "o.o.o....", ".ooo.....", "ooooo....", ".ooo.....", "o.o.o.oo.", "..o..oo..", "......oo.", ".......o."],
    'leap': ["....o....", "...ooo...", "..o.o.o..", "....o....", "....o....", ".........", "..ooooo..", ".o.....o.", "........."],
    'look': [".........", "..ooooo..", ".o.....o.", "o..ooo..o", "o..o.o..o", "o..ooo..o", ".o.....o.", "..ooooo..", "........."],
}


def seal(kind, seed=9):
    """白文方印：朱底、字留白；印边有几处崩口，印泥不匀（有浅有深）。"""
    rnd = random.Random(seed + len(kind))
    N = 13
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); p = im.load()
    for y in range(N):
        for x in range(N):
            edge = min(x, y, N - 1 - x, N - 1 - y)
            if edge == 0 and rnd.random() < 0.18:
                continue                                     # 崩口
            c = (186, 46, 34) if rnd.random() < 0.8 else (206, 70, 52)
            if rnd.random() < 0.06:
                c = (226, 120, 96)                           # 印泥没吃匀
            p[x, y] = c + (255,)
    for j, row in enumerate(SEAL_GLYPH[kind]):
        for i, ch in enumerate(row):
            if ch == 'o' and rnd.random() > 0.05:
                p[2 + i, 2 + j] = (250, 236, 214, 255)
    return im


def build(d):
    tex().save(f'{d}/jian_tex.png')
    frame().save(f'{d}/jian_frame.png')
    plum().save(f'{d}/jian_plum.png')
    for k in SEAL_GLYPH:
        seal(k).save(f'{d}/seal_{k}.png')
