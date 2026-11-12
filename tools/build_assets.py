#!/usr/bin/env python3
"""生成游戏素材。

用法：python3 tools/build_assets.py <新背景像素文件夹>

1. 把背景图（320×180 的整数倍放大，如 2560×1440 每 8 像素一格）还原成原生的 320×180：
   白天 IMG_xxxx_pixel.png → assets/bg/xxxx.png，夜里 夜间真实N_pixel.png → assets/bg/night/nN.png。
   哪张图用在哪一站写在 js/gfx/regions.js 开头。
2. 用下面的像素定义画出唐朝旅人的帧动画与障碍、道具，拼成 assets/sprites.png，
   并写出 js/atlas.js（每个图块的位置与锚点）。

想改人物或道具的样子：改本文件里的像素定义，再运行一次；也可以直接用像素画软件改 sprites.png。
"""
import os, sys, glob, json
from PIL import Image, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_BG = os.path.join(ROOT, 'assets', 'bg')

# ---------------------------------------------------------------- 背景
# 行内通行做法：背景是画师画好的贴图，按原生分辨率（320×180，一格一像素）存一份，
# 游戏里再整数倍、最近邻放大；代码只负责摆放、切换、调色，不改画面本身。
NATIVE = (320, 180)

def to_native(im):
    """把放大过的像素画（每 N×N 一格）还原成 320×180，每格取中心像素（避开格边）。"""
    w, h = im.size
    n = w // NATIVE[0]
    if n < 1 or (w, h) != (NATIVE[0] * n, NATIVE[1] * n):
        raise SystemExit('背景尺寸 %dx%d 不是 320×180 的整数倍' % (w, h))
    small = Image.new('RGB', NATIVE)
    px, sp = im.load(), small.load()
    for y in range(NATIVE[1]):
        for x in range(NATIVE[0]):
            sp[x, y] = px[x * n + n // 2, y * n + n // 2]
    return small

def indexed(im):
    """≤256 色就存成调色板 PNG：颜色一点不变，文件更小。"""
    cols = im.getcolors(256)
    if not cols:
        return im
    pal = [c for _, c in cols]
    idx = {c: i for i, c in enumerate(pal)}
    out = Image.new('P', im.size)
    out.putpalette([v for c in pal for v in c])
    out.putdata([idx[c] for c in im.getdata()])
    return out

def bg_name(f):
    """IMG_8536_pixel.png → 8536（白天）；夜间真实7_pixel.png → night/n7（夜里）"""
    base = os.path.basename(f).rsplit('.', 1)[0].replace('_pixel', '')
    if base.startswith('IMG_'):
        return base[4:]
    if base.startswith('夜间真实'):
        return 'night/n' + base[len('夜间真实'):]
    return None

def build_backgrounds(src):
    """python3 tools/build_assets.py <新背景像素文件夹>：白天 IMG_xxxx、夜里 夜间真实N 都在这一个文件夹里。"""
    os.makedirs(os.path.join(OUT_BG, 'night'), exist_ok=True)
    for f in sorted(glob.glob(os.path.join(src, '*.png'))):
        name = bg_name(f)
        if not name:
            print('skip', os.path.basename(f)); continue
        small = to_native(Image.open(f).convert('RGB'))
        # 原样还原：不锐化、不调色、不压色
        small = indexed(small)
        small.save(os.path.join(OUT_BG, name + '.png'), optimize=True)
        print('bg', name, small.size)

# ---------------------------------------------------------------- 调色板
def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)

BASE = {
    'k': '#1b1720', 'K': '#3a3340', 'w': '#f4f1ea', 'W': '#c9c6c0', 'g': '#8c8a86', 'G': '#5c5a58',
    'r': '#b8322a', 'R': '#7c1f1c', 'o': '#e08a3a', 'y': '#e8c25a', 'Y': '#a8862e',
    'b': '#7a5232', 'B': '#4e331f', 'n': '#c79a62', 'f': '#ffe07a', 'F': '#ff8a3a',
    'i': '#d6f0fb', 'I': '#7fb6d8', 'J': '#4a86b0', 'u': '#3a6ab0', 'v': '#4f8a3a', 'V': '#2f5a2a',
    's': '#f0c49c', 'S': '#c99470', 'e': '#2a1a1a', 'p': '#f2e8cc', 'P': '#8a3a2a',
    'q': '#d8573c', 'Q': '#8e2f22', 'h': '#5a3a24', 'c': '#b8302a', 'C': '#78201c', 'x': '#6b6f78',
}

def grid(rows, extra=None):
    pal = dict(BASE); pal.update(extra or {})
    h = len(rows); w = max(len(r) for r in rows)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    p = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in '. ': continue
            p[x, y] = hexc(pal[ch])
    return im

# ---------------------------------------------------------------- 唐朝旅人 v2
# 一帧 32×40，脚底在第 37 行（再下一行是描边），面朝右。幞头、圆领袍、蹀躞带、乌皮靴。
# 先画色块，再统一加 1 像素深色描边，背景再花也看得清。
import math
FW, FH = 32, 40
FOOT = 37
OUTLINE = (23, 19, 28, 255)
OUTFITS = {
    # 名称: (亮部, 中间, 暗部, 领口/镶边)
    'clear': ('#e6f0f4', '#bcd2de', '#8aa4b8', '#f8f4e8'),     # 月白圆领袍
    'rain': ('#5aa094', '#3f7f7a', '#285450', '#b4dccc'),      # 青袍
    'fog': ('#b8a688', '#97856c', '#6a5c4a', '#ece0c6'),       # 赭褐袍
    'wind': ('#d0644c', '#b04a3a', '#7a2c24', '#f4d0a8'),      # 绯袍
    'snow': ('#d84a3a', '#b8302a', '#7a1e1c', '#f8f6f0'),      # 红斗篷 + 白毛领
}

def outline(im, col=OUTLINE):
    """外扩 1 像素并描边（四邻接）。"""
    w, h = im.size
    out = Image.new('RGBA', (w + 2, h + 2), (0, 0, 0, 0))
    out.paste(im, (1, 1))
    src = out.copy().load(); p = out.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < w + 2 and 0 <= yy < h + 2 and src[xx, yy][3] > 0:
                    p[x, y] = col; break
    return out

def traveler_frame(outfit, pose, frame):
    """pose: book 持卷 / back 背手 / umbrella 打伞 / cloak 斗篷
    frame: 0-7 奔跑, 'up' 起跳, 'fall' 下落, 'land' 落地, 'idle0' 'idle1' 站立呼吸"""
    L, M, D, T = (hexc(c) for c in OUTFITS[outfit])
    SK, SS, EY, BL = hexc('#f4cca4'), hexc('#d09a78'), hexc('#2a1a1a'), hexc('#e89a88')
    HAT, HATH = hexc('#1e1a24'), hexc('#4a4458')
    PANT, BOOT, BOOTH = hexc('#3a3340'), hexc('#1b1720'), hexc('#4a4250')
    BELT, GOLD, JADE = hexc('#3a2a20'), hexc('#e8c25a'), hexc('#7ac0a0')
    W, H = FW - 2, FH - 2                       # 描边前的画布
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); p = im.load()
    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H: p[x, y] = c
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): put(x, y, c)
    cx, fy = 14, FOOT - 1                       # 描边会让一切右下移 1
    cloak = pose == 'cloak'
    run = isinstance(frame, int)

    # ---- 姿态参数
    if run:
        th = frame / 8 * math.pi * 2
        nx, fx_ = round(3 * math.cos(th)), round(3 * math.cos(th + math.pi))
        nl, fl = round(max(0, -math.sin(th)) * 2.4), round(max(0, -math.sin(th + math.pi)) * 2.4)
        bob = -1 if abs(math.sin(th)) > 0.7 else 0
        swing = -nx                              # 手臂与近腿反向
        flap = 1 if frame % 4 < 2 else 0
    elif frame in ('idle0', 'idle1'):
        nx, fx_, nl, fl, bob, swing, flap = 1, -1, 0, 0, (1 if frame == 'idle1' else 0), 0, 0
    elif frame == 'up':
        nx, fx_, nl, fl, bob, swing, flap = 2, -2, 3, 0, -1, -3, 2
    elif frame == 'fall':
        nx, fx_, nl, fl, bob, swing, flap = 1, -1, 1, 0, 0, 2, -1
    else:  # land：蹲一下
        nx, fx_, nl, fl, bob, swing, flap = 2, -2, 0, 0, 2, 1, 0
    if outfit == 'wind': flap += 1

    top = fy - 22 + bob          # 帽顶
    face = top + 4
    sh = top + 9                 # 肩
    belt = fy - 9 + (1 if frame == 'land' else 0)
    hem = fy - 4 + (1 if frame == 'land' else 0)
    if frame == 'up': hem -= 1

    # ---- 远侧手臂（被身体挡住一半）
    def arm(sw, col, edge, hand=True):
        x0, y0 = cx - 1, sh + 1
        x1, y1 = cx - 1 + sw, sh + 5
        n = 5
        for i in range(n + 1):
            x = round(x0 + (x1 - x0) * i / n); y = round(y0 + (y1 - y0) * i / n)
            put(x, y, col); put(x + 1, y, col); put(x - 1 if sw >= 0 else x + 2, y, edge)
        if hand: put(x1, y1 + 1, SK); put(x1 + 1, y1 + 1, SS)
    if not cloak and pose != 'umbrella':
        arm(-swing if pose == 'back' else swing - 1, D, D)

    # ---- 远腿
    def leg(dx, lift, near):
        x = cx + dx - 1
        pc = PANT if near else hexc('#2a2430')
        bc, bh = (BOOT, BOOTH) if near else (BOOT, BOOT)
        by = fy - lift
        for y in range(hem, by - 1): put(x, y, pc); put(x + 1, y, pc)
        rect(x, by - 1, x + 1, by, bc); put(x + 2, by, bc)
        if near: put(x, by - 1, bh)
    leg(fx_, fl, False)

    # ---- 斗篷在身后飘的部分
    if cloak:
        for y in range(sh + 2, hem + 1):
            k = (y - sh) / (hem - sh)
            back = cx - 6 - round(k * (1 + max(0, flap)))
            rect(back, y, cx - 4, y, D)

    # ---- 袍身
    for y in range(sh, hem + 1):
        if y <= belt:
            x0, x1 = cx - 4, cx + 3
            if y == sh: x0, x1 = cx - 3, cx + 2
        else:
            k = (y - belt) / max(1, hem - belt)
            x0 = cx - 4 - round(k * 2) - (round(k * flap) if y > belt + 1 else 0)
            x1 = cx + 3 + round(k * 1.5)
        if cloak: x0 -= 1; x1 += 1
        for x in range(x0, x1 + 1):
            c = M
            if x >= x1 - 1: c = L if y < hem else M
            if x <= x0 + 1: c = D
            put(x, y, c)
        if y == hem and not cloak:
            for x in range(x0, x1 + 1): put(x, y, D)
    # 衣褶：一条中缝，奔跑时随步子偏
    if not cloak:
        sx = cx + (1 if run and nx > 0 else 0)
        for y in range(belt + 1, hem): put(sx, y, D)
        # 圆领
        for x in range(cx - 2, cx + 3): put(x, sh, T)
        put(cx + 3, sh + 1, T); put(cx + 3, sh + 2, T)
        # 蹀躞带 + 带銙 + 垂下的小佩
        for x in range(cx - 4, cx + 4): put(x, belt, BELT)
        put(cx + 1, belt, GOLD); put(cx - 2, belt, GOLD)
        dy = 0 if not run else (frame % 2)
        put(cx - 3, belt + 1, BELT); put(cx - 3, belt + 2 + dy, JADE)
    else:
        # 毛领 + 斗篷前襟
        rect(cx - 4, sh, cx + 3, sh + 1, T); put(cx - 5, sh + 1, T); put(cx + 4, sh + 1, T)
        put(cx - 3, sh + 2, hexc('#d8d4cc')); put(cx + 2, sh + 2, hexc('#d8d4cc'))
        for y in range(sh + 3, hem): put(cx + 2, y, D)
        put(cx + 2, sh + 4, GOLD)

    # ---- 近腿
    leg(nx, nl, True)

    # ---- 头：幞头 + 脸
    head = [
        "...kkkk...",
        "..kkhhkk..",
        "..kkkkkkk.",
        ".kkkkkkkk.",
        ".kkSsssss.",
        "..kSssess.",
        "..SSsssbss",
        "...Sssss..",
        "....SSs...",
    ]
    hc = {'k': HAT, 'h': HATH, 's': SK, 'S': SS, 'e': EY, 'b': BL}
    for j, row in enumerate(head):
        for i, ch in enumerate(row):
            if ch != '.': put(cx - 5 + i, top + j, hc[ch])
    if frame == 'idle1': put(cx + 2, top + 5, SK)      # 眨眼
    # 幞头软脚：两条黑带往后飘
    tail = 2 + (1 if run or frame in ('up', 'fall') else 0) + (2 if outfit == 'wind' else 0)
    lift = {'up': 1, 'fall': -1}.get(frame, 0)
    for i in range(tail):
        wv = 0 if not run else ((frame + i) % 4 < 2)
        put(cx - 5 - i, top + 3 + (i + 1) // 2 + lift * (i // 2) - (1 if wv and i > 1 else 0), HAT)

    # ---- 近侧手臂与道具
    ay = sh + 1
    if pose == 'book':
        # 前手把书卷托在胸前
        rect(cx + 1, ay, cx + 3, ay + 1, M); put(cx + 1, ay + 2, D); put(cx + 2, ay + 2, M); put(cx + 3, ay + 2, L)
        put(cx + 4, ay + 1, SK)
        rect(cx + 4, ay - 1, cx + 6, ay, hexc('#f2e8cc')); put(cx + 7, ay - 1, hexc('#8a3a2a')); put(cx + 7, ay, hexc('#8a3a2a'))
        put(cx + 4, ay, hexc('#c8b890'))
    elif pose == 'back':
        # 一只手背在身后：袖子在腰后
        rect(cx - 5, ay + 2, cx - 4, ay + 3, D); put(cx - 6, ay + 3, D); put(cx - 6, ay + 4, SS)
        put(cx - 3, ay + 1, D)
    elif pose == 'umbrella':
        # 前手举伞
        rect(cx + 1, ay, cx + 2, ay + 1, M); put(cx + 3, ay - 1, M); put(cx + 3, ay - 2, SK); put(cx + 4, ay - 2, SS)
        pole = hexc('#6a4a2a')
        ut = top - 9 + (0 if bob < 0 else 1)
        for y in range(ut + 5, ay - 2): put(cx + 4, y, pole)
        U, U2, U3, RIB = hexc('#d8574a'), hexc('#a8382c'), hexc('#ec8a6a'), hexc('#f0d8a0')
        canopy = [
            ".......UUU.......",
            ".....UUuuuUU.....",
            "...UUulluuuuUU...",
            "..UuullluuuuuuU..",
            ".UuuRuuuuuuuRuuU.",
            "UUUUUUUUUUUUUUUUU",
            "R.......R.......R",
        ]
        cc = {'U': U2, 'u': U, 'l': U3, 'R': RIB}
        for j, row in enumerate(canopy):
            for i, ch in enumerate(row):
                if ch != '.': put(cx + 4 - 8 + i, ut + j, cc[ch])
    if not cloak and pose in ('book', 'umbrella'):
        pass
    if pose == 'back' and not cloak:
        pass
    # 背手 / 持卷时，另一只手也露出一点摆动（画在身前）
    if pose == 'back' and run and swing > 1:
        put(cx + 3, ay + 4, SK)
    return outline(im)

TRAVELER_ROWS = [('clear', 'book'), ('clear', 'back'), ('rain', 'umbrella'), ('fog', 'back'), ('wind', 'back'), ('snow', 'cloak'), ('wind', 'book')]
TRAVELER_COLS = [0, 1, 2, 3, 4, 5, 6, 7, 'up', 'fall', 'land', 'idle0', 'idle1']

# ---------------------------------------------------------------- 障碍与道具（锚点：底边中点）
def sprite(rows, extra=None): return grid(rows, extra)

PROPS = {}
# 宫门（夜里关）：木门 + 门钉 + 瓦檐，10×33
PROPS['door'] = sprite([
    "kKKKKKKKKKKk",
    ".kKKKKKKKKk.",
    "..bBBBBBBb..",
    "..BbbbBbbB..",
] + ["..BbybBbybB."[:12].replace('y', 'y') if i % 4 == 1 else "..BbbbBbbbB."[:12] for i in range(26)] + [
    "..BBBBBBBBB.",
    ".GGGGGGGGGGG",
    "GGGGGGGGGGGG",
])
# 上锁的红门（两面都有），开着时只剩门框
def gate(open_):
    rows = ["kKKKKKKKKKKKk", ".kKKKKKKKKKk.", "..RRRRRRRRR.."]
    for i in range(29):
        if open_:
            rows.append("..Rr.....rR..")
        else:
            mid = "yy" if i == 13 else ("Yy" if i == 14 else "rr")
            stud = "y" if i % 5 == 2 else "r"
            rows.append("..Rr" + stud + "rR" + mid[0] + "r" + stud + "rR..")
    rows += ["..RRRRRRRRR..", ".GGGGGGGGGGG.", "GGGGGGGGGGGGG"]
    return sprite(rows)
PROPS['gate'] = gate(False)
PROPS['gate_open'] = gate(True)
# 货摊：布篷 + 木台 + 果蔬，16×25
PROPS['stall'] = sprite([
    ".......qq.......",
    ".....qqqqqq.....",
    "...qqwqqwqqwq...",
    ".qqwqqwqqwqqwqq.",
    "QQQQQQQQQQQQQQQQ",
    ".b............b.",
    ".b............b.",
    ".b............b.",
    ".b............b.",
    ".b............b.",
    ".b............b.",
    ".b..oo.vv.yy..b.",
    ".b.oooovvvyyy.b.",
    "nnnnnnnnnnnnnnnn",
    "BBBBBBBBBBBBBBBB",
    ".b............b.",
    ".b..bb....bb..b.",
    ".b..bb....bb..b.",
    ".b..nnn..nnn..b.",
    ".b..bbb..bbb..b.",
    ".b............b.",
    ".b............b.",
    ".b............b.",
    ".B............B.",
    ".B............B.",
])
# 战鼓（白天）：鼓架上的大鼓，16×24
PROPS['drum'] = sprite([
    ".....RRRRRR.....",
    "...RRrrrrrrRR...",
    "..RrrrrrrrrrrR..",
    ".RrrnnnnnnnnrrR.",
    ".RrnnnnnnnnnnrR.",
    "Rrynnnnnnnnnnyr R".replace(' ', '')[:16],
    "RrynnnnnnnnnnyrR",
    "RrynnnnnnnnnnyrR",
    "RrynnnnnnnnnnyrR",
    "RrynnnnnnnnnnyrR",
    ".RrnnnnnnnnnnrR.",
    ".RrrnnnnnnnnrrR.",
    "..RrrrrrrrrrrR..",
    "...RRrrrrrrRR...",
    ".....RRRRRR.....",
    "..b..........b..",
    "..bb........bb..",
    "...bb......bb...",
    "....bb....bb....",
    ".....bb..bb.....",
    "......bbbb......",
    ".....bb..bb.....",
    "....bb....bb....",
    "...BB......BB...",
])
# 烽火（夜里）：石台上的火盆，两帧
def beacon(fr):
    flame = [
        ["....f.....", "...fFf..f.", "..fFFf.fF.", ".fFrFFfFF.", ".FFrrFFFr.", "..FrrrrF.."],
        [".....f....", ".f..fFf...", ".Ff.fFFf..", ".FFfFFrFf.", ".rFFFrrFF.", "..FrrrrF.."],
    ][fr]
    body = [
        "GGGGGGGGGG",
        ".gGgGgGgG.",
        ".GgGgGgGg.",
        "..gGgGgG..",
        "..GgGgGg..",
        "..gGgGgG..",
        "..GgGgGg..",
        "..gGgGgG..",
        "..GgGgGg..",
        "..gGgGgG..",
        "..GgGgGg..",
        "..gGgGgG..",
        "..GgGgGg..",
        "..gGgGgG..",
        "..GgGgGg..",
        "..gGgGgG..",
        "..GgGgGg..",
        "..gGgGgG..",
        ".GGGGGGGG.",
        "GGGGGGGGGG",
        "GGGGGGGGGG",
    ]
    return sprite(flame + body)
PROPS['beacon0'] = beacon(0); PROPS['beacon1'] = beacon(1)
# 矮石块（两面都有，跳过去），8×7
PROPS['block'] = sprite([".gWWWg..", "gWWWWWg.", "gWWWWWgG", "gWWWWgGG", "gggggGGG", "GGGGGGGG", ".GGGGGG."])
PROPS['rock'] = sprite(["...xWW....", "..xWWWWx..", ".xWWWWWxx.", "xWWWWWWxxG", "xxWWWWxxGG", "xxxxxxxGGG", "GGGGGGGGGG", ".GGGGGGGG."])
# 冰凌（两面都有，跳过去），10×7
PROPS['shard'] = sprite(["..i....i..", "..iI..iI..", ".iiI.iiI.i", ".iII.iIIiI", "iiIIiiIIiI", "iIIJiIIJIJ", "JJJJJJJJJJ"])
# 玛尼堆，11×9（带经幡）
PROPS['mani'] = sprite([
    ".....u.....", ".....uw....", ".....ry....", "....gWWg...", "...gWWWWg..",
    "..gWWWWWWg.", ".gWWWgWWWWg", "gWWWWWWWWgG", "GGGGGGGGGGG",
])
# 牦牛，18×20
PROPS['yak'] = sprite([
    "...............w.w",
    "..............wk.kw",
    "..............kkkk.",
    ".....kkkkkkkkkkkekk",
    "...kkkkkkkkkkkkkkkk",
    "..kkkkkkkkkkkkkkkkk",
    ".kkKkkkkkkkkkkkkkk.",
    "kkKkkkkkkkkkkkkkkk.",
    "kkkkkkkkkkkkkkkkk..",
    "kkkkkkkkkkkkkkkkk..",
    "kKkkkkkkkkkkkkkkk..",
    "kkkkkkkkkkkkkkkkk..",
    ".KkKkKkKkKkKkKkKk..",
    ".kk.kk.....kk.kk...",
    ".kk.kk.....kk.kk...",
    ".kk.kk.....kk.kk...",
    ".kk.kk.....kk.kk...",
    ".kk.kk.....kk.kk...",
    ".KK.KK.....KK.KK...",
    "...................",
])
# 铜铃（挂在木架上），9×16
PROPS['bell'] = sprite([
    "bbbbbbbb.", "b......b.", "b......k.", "b.....yy.", "b....yyyy", "b....yYyy", "b...yyyyyy"[:9],
    "b...yYyyy", "b..yyyyyyy"[:9], "b..YYYYYY", "b.....k..", "b........", "b........", "b........", "b........", "B........",
])
PROPS['gong'] = sprite([
    "bbbbbbbbbb", "b........b", "b..yyyy..b", "b.yYYYYy.b", "byYyyyyYyb", "byYyFyyYyb", "byYyyyyYyb", "b.yYYYYy.b",
    "b..yyyy..b", "b........b", "b........b", "b........b", "b........b", "b........b", "B........B", "B........B",
])
PROPS['wheel'] = sprite([
    "....y....", "...yyy...", "..rrrrr..", "..ryryr..", "..yyyyy..", "..ryryr..", "..rrrrr..", "..ryryr..",
    "..yyyyy..", "..rrrrr..", "...yyy...", "....b....", "....b....", "....b....", "....b....", "...BBB...",
])
# 灯（收集物），7×9
PROPS['lantern'] = sprite(["..kkk..", ".rrrrr.", "rrfffrr", "rffwffr", "rffffffr"[:7], "rrfffrr", ".rrrrr.", "..yyy..", "...y..."])

# ---------------------------------------------------------------- 路边摆件（只是装饰，不挡路）
DX = {'a': '#5a7a3a', 'A': '#3a5a2a', 'm': '#8aa84a', 'l': '#d8c070', 'z': '#9a9488', 'Z': '#6a665e', 'j': '#c8c2b4',
      'd': '#e05a3a', 'D': '#a83a2a', 'O': '#f0a030', 't': '#e8e4dc', 'T': '#b8b4ac', 'c': '#a8d8f0', 'C': '#6aa8d0',
      'n': '#2f5a3a', 'N': '#1f3a2a', 'v': '#e8d84a', 'P': '#e86a8a', 'Q': '#b04a6a', 'u': '#3a6ab0', 'g': '#4aa04a'}
DECO = {}
DECO['reed'] = sprite([".l...l..", ".a..la..", ".a..a..l", "aa..a..a", ".a.aa.a.", ".aa.a.a.", "..a.aaa.", "..aaaa..", "...Aa...", "...AA..."], DX)
DECO['stonelamp'] = sprite(["..zzz..", ".zzzzz.", "zzzzzzz", ".ZfFfZ.".replace('F', 'f'), ".ZfffZ.", "zzzzzzz", "..zjz..", "..zjz..", "..zjz..", ".zzzzz.", "zzzzzzz"], DX)
DECO['post'] = sprite(["bb", "bB", "bB", "bB", "bB", "BB"])
DECO['peony'] = sprite(["..P.PQ..", ".PPQPPP.", "PPQPPaP.", ".aPPa.a.", "..aAa...", "rrrrrrrr", ".rRRRRr.", ".rRRRRr.", "..RRRR.."], DX)
DECO['redpost'] = sprite(["kkkkk", ".rfr.", ".rfr.", ".rrr.", "..b..", "..b..", "..b..", "..b..", "..b..", "..b..", "..b..", "..b..", ".bBb."], DX)
DECO['maple'] = sprite(["...dO.d...", "..dDdOdd..", ".dOdDddOd.", "dDddOdDdd.", ".dddDdOddd", "..dOddDd..", "....bb....", "....bB....", "....bB...."], DX)
DECO['tuft'] = sprite(["m.a..m", ".aa.a.", "a.aaa.", ".aAaa.", "AAAAAA"], DX)
DECO['banner'] = sprite(["b......", "brrrrr.", "brrRrrr", "brrrrr.", "brRrrr.", "brrrr..", "b......", "b......", "b......", "b......", "b......", "b......", "b......", "b......", "b......", "B......", "BB....."], DX)
DECO['stones'] = sprite(["...zz...", "..zjzz..", ".zzzZz.z", "zzZZZZzZ"], DX)
DECO['crystal'] = sprite(["..c....", "..cC.c.", ".ccC.cC", ".cCC.cC", "ccCCcCC", "CCCCCCC"], DX)
DECO['pine'] = sprite(["....t....", "...tnt...", "..tnnNt..", "...nNn...", "..tnnNNt.", ".tnnnNNt.", "..nnNNn..", ".tnnnNNNt", "tnnnnNNNN", "....B....", "....B...."], DX)
DECO['chorten'] = sprite(["...v...", "...v...", "..ttt..", "..tTt..", ".ttttt.", ".tvvvt.", "ttttttt", "tTTTTTT", "ZZZZZZZ"], DX)
DECO['flowers'] = sprite(["v..P.u", "a.Pa.a", ".aa.a.", "aAaaAa"], DX)
# 检查点石碑：没到之前暗着，到了亮起一盏小灯
def stele(lit):
    rows = ["..fF..", "..ff..", "..yy..", ".zzzz.", "zjzzZz", "zjkkZz", "zjzzZz", "zjkkZz", "zjzzZz", "zjkkZz", "zjzzZz", "ZZZZZZ", "ZZZZZZ"]
    if not lit: rows = ["......", "......", "..YY.."] + rows[3:]
    return sprite(rows, DX)
DECO['stele'] = stele(False); DECO['stele_lit'] = stele(True)

# 铜钱（引路的收集物），转动三帧
CX = {'y': '#f0c858', 'Y': '#b07a28', 'h': '#fff2b0', 'o': '#7a4a18'}
DECO['coin0'] = sprite(["..YYY..", ".YyhyY.", "YyhoyyY", "Yyo.oyY", "YyyoyyY", ".YyyyY.", "..YYY.."], CX)
DECO['coin1'] = sprite([".YYY.", "YyhyY", "Yyoyy", "Yo.oY", "YyoyY", "YyyyY", ".YYY."], CX)
DECO['coin2'] = sprite(["Y", "h", "y", "y", "y", "Y", "Y"], CX)

# ---------------------------------------------------------------- 界面用的小图标与按键
ICONS = {}
ICONS['i_sun'] = sprite(["...y...", ".y.y.y.", "..yyy..", "yyyfyyy", "..yyy..", ".y.y.y.", "...y..."])
ICONS['i_moon'] = sprite(["..ii...", ".iI....", "iI.....", "iI.....", "iI.....", ".iIi..i", "..iiii."])
ICONS['i_lantern'] = sprite(["..k..", ".rrr.", "rfffr", "rfwfr", "rfffr", ".rrr.", "..y.."])
ICONS['i_clear'] = ICONS['i_sun']
ICONS['i_rain'] = sprite([".WWW...", "WwwwW..", "WwwwwWW", "WWWWWWW", ".J.J.J.", "J.J.J..", "......."])
ICONS['i_snow'] = sprite(["...w...", ".w.w.w.", "..www..", "wwwwwww", "..www..", ".w.w.w.", "...w..."])
ICONS['i_fog'] = sprite(["WWWW...", ".......", "..WWWWW", ".......", "WWWWW..", ".......", "..WWWW."])
ICONS['i_wind'] = sprite(["....ww.", "wwwww.w", ".......", "wwwwwww", "......w", "wwww.w.", "....w.."])
ICONS['i_coin'] = sprite(["..YYY..", ".YyhyY.", "YyhoyyY", "Yyo.oyY", "YyyoyyY", ".YyyyY.", "..YYY.."], CX)
ICONS['i_beat'] = sprite(["..yy...", "..yYy..", "..y.Yy.", "..y..y.", "yyy....", "yYy....", ".y....."])
def keycap(label_rows, w):
    top = "." + "p" * (w - 2) + "."
    rows = [top] + ["p" + r.ljust(w - 2, 'p')[:w - 2] + "p" for r in label_rows] + ["W" + "W" * (w - 2) + "W", "." + "g" * (w - 2) + "."]
    return sprite(rows, {'p': '#f2e8cc', 'W': '#c8b890', 'g': '#8a7a5a', 'k': '#3a2a20'})
LET = {'S': ['111', '100', '111', '001', '111'], 'H': ['101', '101', '111', '101', '101'], 'I': ['111', '010', '010', '010', '111'],
       'F': ['111', '100', '110', '100', '100'], 'T': ['111', '010', '010', '010', '010']}
def word(w):
    rows = []
    for r in range(5):
        rows.append('p' + 'p'.join(LET[ch][r] for ch in w).replace('1', 'k').replace('0', 'p') + 'p')
    return ['p' * len(rows[0])] + rows + ['p' * len(rows[0])]
_sw = word('SHIFT')
ICONS['k_shift'] = keycap(_sw, len(_sw[0]) + 2)
ICONS['k_space'] = keycap(["pppppppppppppppppppppp", "ppkpppppppppppppppkppp", "ppkkkkkkkkkkkkkkkkkppp", "pppppppppppppppppppppp"], 24)

# ---------------------------------------------------------------- v3 美术：人物与道具重画（tools/traveler_art.py、tools/props_art.py）
# 上面的旧画法留作参考；打包时用 v3 的版本覆盖同名图块。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traveler_ming as traveler_art, props_art
from pixelkit import sel_outline
traveler_frame = traveler_art.traveler_frame
TRAVELER_ROWS, TRAVELER_COLS = traveler_art.TRAVELER_ROWS, traveler_art.TRAVELER_COLS
FW, FH, FOOT = traveler_art.FW, traveler_art.FH, traveler_art.FOOT
V3 = dict(props_art.PROPS); V3.update(props_art.DECO_STELE); V3.update(props_art.COINS)
for k in list(V3):
    PROPS.pop(k, None); DECO.pop(k, None)

# ---------------------------------------------------------------- 打包
def pack():
    items = []
    for ri, (outfit, pose) in enumerate(TRAVELER_ROWS):
        for ci, fr in enumerate(TRAVELER_COLS):
            items.append((f't_{outfit}_{pose}_{fr}', traveler_frame(outfit, pose, fr), (FW // 2 - 1, FOOT)))
    for group in (PROPS, DECO):          # 障碍、道具、摆件都加深色描边
        for k, im in group.items():
            o = outline(im)
            items.append((k, o, (o.size[0] // 2, o.size[1] - 2)))
    for k, im in V3.items():             # v3：同色系的选择性描边
        o = sel_outline(im)
        items.append((k, o, (o.size[0] // 2, o.size[1] - 2)))
    for k, im in ICONS.items():
        o = outline(im)
        items.append((k, o, (o.size[0] // 2, o.size[1] - 2)))
    W = 512
    x = y = rowh = 0
    place = []
    for name, im, anc in items:
        w, h = im.size
        if x + w > W: x = 0; y += rowh + 1; rowh = 0
        place.append((name, im, anc, x, y)); x += w + 1; rowh = max(rowh, h)
    H = y + rowh + 1
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    atlas = {}
    for name, im, anc, x, y in place:
        sheet.paste(im, (x, y))
        atlas[name] = [x, y, im.size[0], im.size[1], anc[0], anc[1]]
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'assets', 'sprites.png'), optimize=True)
    big = sheet.resize((W * 4, H * 4), Image.NEAREST)
    big.save(os.path.join(ROOT, 'assets', 'sprites@4x-preview.png'))
    with open(os.path.join(ROOT, 'js', 'atlas.js'), 'w') as f:
        f.write('// 由 tools/build_assets.py 生成：图块在 assets/sprites.png 中的位置 [x, y, 宽, 高, 锚点x, 锚点y]\n')
        f.write('window.RF = window.RF || {};\nRF.ATLAS = ' + json.dumps(atlas, ensure_ascii=False) + ';\n')
        f.write('RF.TRAVELER = ' + json.dumps({'rows': TRAVELER_ROWS, 'cols': [str(c) for c in TRAVELER_COLS], 'w': FW, 'h': FH}) + ';\n')
    print('sprites', sheet.size, len(atlas))

# ---------------------------------------------------------------- 界面：九宫格边框与图标（CSS 用）
def frame_png(fill, light, dark, ring=None):
    N = 12
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); p = im.load()
    INK = (18, 14, 26, 255)
    for y in range(N):
        for x in range(N):
            edge = min(x, y, N - 1 - x, N - 1 - y)
            corner = (x in (0, N - 1)) and (y in (0, N - 1))
            if corner: continue
            if edge == 0: p[x, y] = INK
            elif ring and edge == 1: p[x, y] = ring
            elif edge == (2 if ring else 1):
                e2 = edge
                p[x, y] = light if ((y == e2 and x < N - 1 - e2) or (x == e2 and y < N - 1 - e2)) else dark
            else: p[x, y] = fill
    # 内侧角补一个点，让角更圆
    for (x, y) in ((1, 1), (N - 2, 1), (1, N - 2), (N - 2, N - 2)): p[x, y] = INK
    return im

def build_ui():
    d = os.path.join(ROOT, 'assets', 'ui'); os.makedirs(d, exist_ok=True)
    frame_png((29, 26, 43, 232), (242, 232, 204, 255), (168, 154, 120, 255), ring=(58, 50, 76, 255)).save(os.path.join(d, 'frame.png'))
    frame_png((200, 64, 46, 255), (244, 150, 110, 255), (122, 32, 20, 255)).save(os.path.join(d, 'btn.png'))
    frame_png((216, 80, 58, 255), (255, 186, 140, 255), (140, 40, 26, 255)).save(os.path.join(d, 'btn_hover.png'))
    frame_png((242, 232, 204, 255), (255, 252, 240, 255), (184, 168, 130, 255)).save(os.path.join(d, 'paper.png'))
    for k, im in ICONS.items():
        if k.startswith('i_'): outline(im).save(os.path.join(d, k[2:] + '.png'))
    print('ui', len(ICONS))

if __name__ == '__main__':
    build_ui()
    if len(sys.argv) > 1: build_backgrounds(sys.argv[1])
    pack()
