# 地面拼接图块（autotile）：每站一行 8 块 16×16 —— 左端顶、顶 A、顶 B、右端顶、左边身、身 A、身 B、右边身。
# 顶块的第 3 行是地面线（0–2 行画草尖、雪堆这些露在地面上的东西），身块往下重复铺到画面底。
# 用法：python3 tools/terrain_art.py  → assets/tiles.png（游戏里按站取色、夜里压暗）
import os, random, zlib
from PIL import Image
from pixelkit import Canvas, ramp, hexc

T = 16
SURF = 3
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = (22, 18, 28, 255)


def rng(*k):
    return random.Random(zlib.crc32(repr(k).encode()))


def bevel_block(cv, x0, y0, w, h, rp, r, mossy=None, crack=0.0):
    """一块石 / 砖：上沿和左沿受光、下沿和右沿背光，表面撒几颗杂色。"""
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            c = rp[1]
            if (x * 7 + y * 13 + r.randint(0, 3)) % 9 == 0:
                c = rp[2] if r.random() < 0.6 else rp[0]
            if y == y0:
                c = rp[0]
            elif x == x0:
                c = rp[0] if y < y0 + h - 1 else rp[1]
            if y == y0 + h - 1 or x == x0 + w - 1:
                c = rp[2]
            cv.put(x, y, c)
    if crack and h >= 3 and r.random() < crack:
        cx, cy = x0 + r.randint(1, max(1, w - 3)), y0 + 1
        for i in range(r.randint(2, h - 1)):
            cv.put(cx + (i // 2) * (1 if r.random() < 0.5 else 0), cy + i, rp[3])
    if mossy and r.random() < 0.5:
        mx = x0 + r.randint(0, w - 2)
        for i in range(r.randint(1, 3)):
            cv.put(mx + i, y0 + h - 1 - (i % 2), mossy[r.randint(0, len(mossy) - 1)])


def courses(cv, y0, y1, rp, mortar, bw, bh, seed, off=0, mossy=None, crack=0.0):
    r = rng(seed)
    for y in range(y0, y1):
        for x in range(T):
            cv.put(x, y, mortar)
    row = 0
    y = y0
    while y < y1:
        sh = (bw // 2 if (row + off) % 2 else 0)
        x = -sh
        while x < T:
            bevel_block(cv, x, y, bw - 1, min(bh - 1, y1 - y), rp, r, mossy, crack)
            x += bw
        y += bh
        row += 1


# ---------------------------------------------------------------- 每站的画法
def jiangnan(kind, v):
    """青石驳岸：压顶条石 + 错缝条石墙，青苔从缝里长出来。"""
    S = ramp('#d6d8d0', '#a8aca6', '#7a7f80', '#4e5258')
    MOSS = [hexc('#7a9a4a'), hexc('#5a7a3a'), hexc('#8aaa5a')]
    cv = Canvas(T, T)
    if kind == 'top':
        r = rng('jn', v)
        for x in range(T):                                  # 压顶石：亮面 + 外挑一线阴影
            cv.put(x, SURF, S[0]); cv.put(x, SURF + 1, S[1]); cv.put(x, SURF + 2, S[1] if x % 8 else S[2])
            cv.put(x, SURF + 3, S[3])
        for i in range(3):
            if r.random() < 0.7:
                x = r.randint(0, T - 2)
                cv.put(x, SURF - 1, MOSS[0]); cv.put(x + 1, SURF - 1, MOSS[1])
                if r.random() < 0.5:
                    cv.put(x, SURF - 2, MOSS[2])
        courses(cv, SURF + 4, T, S, S[3], 8, 6, ('jn', v), 0, MOSS, 0.2)
    else:
        courses(cv, 0, T, S, S[3], 8, 6, ('jnb', v), 1, MOSS if v == 0 else None, 0.25)
        r = rng('jns', v)
        for i in range(2):                                  # 水渍竖条
            x = r.randint(0, T - 1)
            for y in range(r.randint(0, 6), T, 2):
                cv.put(x, y, S[2])
    return cv


def garden(kind, v):
    """汉白玉台基：压面石 + 束腰的珠串线 + 浅浮雕的如意云纹面板。"""
    S = ramp('#fbf8f0', '#e6e0d2', '#c4bcaa', '#968e7e')
    cv = Canvas(T, T)
    if kind == 'top':
        for x in range(T):
            cv.put(x, SURF, S[0]); cv.put(x, SURF + 1, S[0] if x % 16 else S[1]); cv.put(x, SURF + 2, S[2])
            cv.put(x, SURF + 3, S[1]); cv.put(x, SURF + 4, S[1] if x % 3 else S[2])   # 珠串
            cv.put(x, SURF + 5, S[2]); cv.put(x, SURF + 6, S[3])
        y0 = SURF + 7
    else:
        y0 = 0
    for y in range(y0, T):
        for x in range(T):
            cv.put(x, y, S[1])
    # 面板：内框 + 云纹
    py0 = y0 + 1
    for y in range(py0, T):
        cv.put(0, y, S[3]); cv.put(1, y, S[0])
    for x in range(2, T):
        cv.put(x, py0, S[2])
    cloud = ["..ab..ba..", ".a..bb..a.", ".a.b..b.a.", "..a....a.."]
    if v == 0 or kind == 'body':
        for j, row in enumerate(cloud):
            for i, ch in enumerate(row):
                if ch == 'a':
                    cv.put(3 + i, py0 + 2 + j, S[2])
                elif ch == 'b':
                    cv.put(3 + i, py0 + 2 + j, S[0])
    if kind == 'body':
        for x in range(T):
            cv.put(x, T - 1, S[2])
    return cv


def autumn(kind, v):
    """秋山：草皮压着落叶，下面是夹着卵石和树根的土层。"""
    E = ramp('#9a7048', '#7a5434', '#5a3a24', '#3a2416')
    G = ramp('#c8c84a', '#9aa83a', '#6a7a2a', '#465a20')
    LEAF = [hexc('#e05a2a'), hexc('#f0a030'), hexc('#c8402a'), hexc('#f0c050')]
    ST = ramp('#c8c0b0', '#9a9284', '#6e675c', '#4a443c')
    cv = Canvas(T, T)
    r = rng('au', kind, v)
    for y in range(SURF + 3 if kind == 'top' else 0, T):
        for x in range(T):
            c = E[1]
            n = r.random()
            if n < 0.12:
                c = E[2]
            elif n < 0.18:
                c = E[0]
            cv.put(x, y, c)
    if kind == 'top':
        for x in range(T):                                    # 草皮：两层，前沿垂下来
            cv.put(x, SURF, G[0] if x % 3 else G[1]); cv.put(x, SURF + 1, G[1]); cv.put(x, SURF + 2, G[2])
            if r.random() < 0.45:
                cv.put(x, SURF + 3, G[3])
            if r.random() < 0.5:
                cv.put(x, SURF - 1, G[1])
                if r.random() < 0.4:
                    cv.put(x, SURF - 2, G[0])
        for i in range(3):                                    # 落叶
            x = r.randint(0, T - 2)
            cv.put(x, SURF - 1 + r.randint(0, 1), LEAF[r.randint(0, 3)])
    # 卵石
    for i in range(1 if kind == 'top' else 0):
        sx, sy = r.randint(1, T - 5), r.randint(SURF + 6 if kind == 'top' else 1, T - 4)
        for (dx, dy, k) in ((1, 0, 1), (2, 0, 0), (0, 1, 1), (1, 1, 1), (2, 1, 0), (3, 1, 1), (0, 2, 2), (1, 2, 2), (2, 2, 1), (3, 2, 2)):
            cv.put(sx + dx, sy + dy, ST[k])
        for dx in range(4):
            cv.put(sx + dx, sy + 3, E[3])
    # 树根
    if r.random() < 0.6:
        x, y = r.randint(0, T - 1), SURF + 4 if kind == 'top' else 0
        for i in range(r.randint(4, 9)):
            cv.put(x, y + i, E[3]); x += r.choice((-1, 0, 0, 1))
    return cv


def wall(kind, v):
    """长城：方砖铺的马道，下面是大块城砖（每块有受光的上沿和背光的下沿）。"""
    B = ramp('#c8ae8c', '#9e8466', '#76604a', '#4e3e30')
    P = ramp('#b8b0a0', '#948c7e', '#6e685e', '#4a4640')
    cv = Canvas(T, T)
    if kind == 'top':
        for x in range(T):
            cv.put(x, SURF, P[0]); cv.put(x, SURF + 1, P[1] if x % 8 else P[2]); cv.put(x, SURF + 2, P[2]); cv.put(x, SURF + 3, B[3])
        courses(cv, SURF + 4, T, B, B[3], 8, 4, ('wa', v), 0, None, 0.15)
    else:
        courses(cv, 0, T, B, B[3], 8, 4, ('wab', v), 1, None, 0.2)
    return cv


def glacier(kind, v):
    """冰川：顶上一层起伏的积雪，下面是一层层的蓝冰，冰里有裂纹和埋着的岩块。"""
    I = ramp('#e8f8ff', '#a8dcf4', '#6aaad4', '#3a74a8')
    SN = ramp('#ffffff', '#e4eef8', '#b8cce0')
    RK = ramp('#7a7e8a', '#565a68', '#3a3e4a')
    cv = Canvas(T, T)
    r = rng('gl', kind, v)
    y0 = SURF + 4 if kind == 'top' else 0
    for y in range(y0, T):
        band = ((y + v * 3) // 4) % 3
        for x in range(T):
            cv.put(x, y, I[1] if band == 0 else I[2] if band == 1 else I[1])
    for i in range(1):                                        # 斜向裂纹 + 高光
        x, y = r.randint(0, T - 1), r.randint(y0, T - 4)
        for k in range(r.randint(3, 6)):
            cv.put(x + k, y + k // 2, I[0] if k % 2 else I[3])
    if r.random() < 0.25:
        sx, sy = r.randint(1, T - 5), r.randint(y0 + 2, T - 4)
        for dx in range(4):
            for dy in range(3):
                cv.put(sx + dx, sy + dy, RK[0] if dy == 0 else RK[1] if dx < 3 else RK[2])
    if kind == 'top':
        for x in range(T):
            h = 1 + (1 if (x + v * 5) % 7 in (2, 3, 4) else 0)
            for y in range(SURF - h, SURF + 3):
                cv.put(x, y, SN[0] if y < SURF + 1 else SN[1])
            cv.put(x, SURF + 3, SN[2])
            if x % 5 == 2:
                cv.put(x, SURF + 4, SN[2])                    # 雪檐垂下一点
    return cv


def tibet(kind, v):
    """雪域：干砌的圆石墙，石块各自有明暗；顶上厚雪。"""
    S = ramp('#c8bca8', '#9a8e7a', '#6e6454', '#463e34')
    SN = ramp('#ffffff', '#e8eef6', '#c0ccdc')
    cv = Canvas(T, T)
    r = rng('ti', kind, v)
    y0 = SURF + 4 if kind == 'top' else 0
    for y in range(y0, T):
        for x in range(T):
            cv.put(x, y, S[3])
    y = y0
    row = 0
    while y < T:
        x = -(3 if row % 2 else 0)
        h = r.randint(4, 5)
        while x < T:
            w = r.randint(5, 7)
            for yy in range(y, min(T, y + h - 1)):
                for xx in range(x, x + w - 1):
                    dx, dy = (xx - x) / (w - 2) * 2 - 1, (yy - y) / (h - 2) * 2 - 1
                    if dx * dx + dy * dy > 1.3:
                        continue
                    c = S[1]
                    if dy < -0.3 and dx > -0.5:
                        c = S[0]
                    elif dy > 0.4 or dx < -0.6:
                        c = S[2]
                    cv.put(xx, yy, c)
            x += w
        y += h
        row += 1
    if kind == 'top':
        for x in range(T):
            h = 2 + (1 if (x + v * 4) % 6 in (1, 2) else 0)
            for yy in range(SURF - h + 1, SURF + 3):
                cv.put(x, yy, SN[0] if yy < SURF + 1 else SN[1])
            cv.put(x, SURF + 3, SN[2])
    return cv


REGIONS = [('jiangnan', jiangnan), ('garden', garden), ('autumn', autumn), ('wall', wall), ('glacier', glacier), ('tibet', tibet)]


def caps(cv_top, side):
    """端头：最外一列描边、往里一列压暗，顶角削掉一格，像一块有厚度的石台。"""
    im = cv_top.im.copy()
    p = im.load()
    xs = range(0, 2) if side == 'L' else range(T - 2, T)
    edge = 0 if side == 'L' else T - 1
    inner = 1 if side == 'L' else T - 2
    for y in range(T):
        if p[edge, y][3] == 0:
            continue
        if y < SURF:
            p[edge, y] = (0, 0, 0, 0)
            continue
        p[edge, y] = OUT
        c = p[inner, y]
        if c[3]:
            k = 0.78 if side == 'R' else 0.9
            p[inner, y] = (int(c[0] * k), int(c[1] * k), int(c[2] * k), 255)
    p[edge, SURF] = (0, 0, 0, 0)
    c = p[inner, SURF]
    if c[3]:
        p[inner, SURF] = OUT
    return im


def build():
    sheet = Image.new('RGBA', (T * 8, T * len(REGIONS)), (0, 0, 0, 0))
    for ri, (rid, fn) in enumerate(REGIONS):
        tops = [fn('top', 0), fn('top', 1)]
        bodies = [fn('body', 0), fn('body', 1)]
        tiles = [caps(tops[0], 'L'), tops[0].im, tops[1].im, caps(tops[1], 'R'),
                 caps(bodies[0], 'L'), bodies[0].im, bodies[1].im, caps(bodies[1], 'R')]
        for i, im in enumerate(tiles):
            sheet.paste(im, (i * T, ri * T))
    sheet.save(os.path.join(ROOT, 'assets', 'tiles.png'))
    sheet.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(os.path.join(ROOT, 'assets', 'tiles@6x-preview.png'))
    print('tiles', sheet.size, [r for r, _ in REGIONS])


if __name__ == '__main__':
    build()
