#!/usr/bin/env python3
"""生成游戏素材。

用法：python3 tools/build_assets.py <背景像素文件夹>

1. 把背景图（1280×720，每 4 像素一格）还原成原生的 320×180，存到 assets/bg/。
2. 用下面的像素定义画出唐朝旅人的帧动画与障碍、道具，拼成 assets/sprites.png，
   并写出 js/atlas.js（每个图块的位置与锚点）。

想改人物或道具的样子：改本文件里的像素定义，再运行一次；也可以直接用像素画软件改 sprites.png。
"""
import os, sys, glob, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_BG = os.path.join(ROOT, 'assets', 'bg')

# ---------------------------------------------------------------- 背景
def build_backgrounds(src):
    os.makedirs(OUT_BG, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(src, '*.png'))):
        im = Image.open(f).convert('RGB')
        w, h = im.size
        small = Image.new('RGB', (w // 4, h // 4))
        px, sp = im.load(), small.load()
        for y in range(h // 4):
            for x in range(w // 4):
                sp[x, y] = px[x * 4 + 2, y * 4 + 2]     # 取每格中心，避开格边
        name = os.path.basename(f).split('_')[1] + '.png'   # IMG_8536_pixel.png → 8536.png
        small.save(os.path.join(OUT_BG, name), optimize=True)
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

# ---------------------------------------------------------------- 唐朝旅人
# 一帧 24×30，脚底在最下一行，面朝右。幞头、圆领袍、革带、乌皮靴。
FW, FH = 24, 30
OUTFITS = {
    # 名称: (袍色, 袍暗部, 袍领/镶边)
    'clear': ('#cfe0ea', '#94acbd', '#f6f2e6'),     # 月白圆领袍
    'rain': ('#3f7f7a', '#28534f', '#a9cfc4'),      # 青袍
    'fog': ('#9a8a74', '#6c5f4f', '#e2d6bf'),       # 赭褐袍
    'wind': ('#b04a3a', '#7a2c24', '#f0c9a8'),      # 绯袍
    'snow': ('#b8302a', '#78201c', '#f4f1ea'),      # 红斗篷 + 白毛领
}

def put(p, x, y, col):
    if 0 <= x < FW and 0 <= y < FH: p[x, y] = col

def traveler_frame(outfit, pose, frame):
    """pose: book 拿书 / back 背手 / umbrella 打伞 / cloak 斗篷；frame: 0-5 走路, 'jump', 'idle'"""
    robe, shade, trim = (hexc(c) for c in OUTFITS[outfit])
    K = hexc(BASE['k']); SK = hexc(BASE['s']); SS = hexc(BASE['S']); EY = hexc(BASE['e'])
    BOOT = hexc('#231c22'); BOOT2 = hexc('#3d3238'); BELT = hexc('#3a2a20'); GOLD = hexc('#d8b050')
    im = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); p = im.load()
    # 走路：近腿 / 远腿的前后位置、身体起伏
    NEAR = [4, 2, 0, -2, -1, 2]; FAR = [-2, -1, 1, 4, 2, 0]
    if frame == 'jump': near, far, bob = None, None, -1
    elif frame == 'idle': near, far, bob = 1, -1, 0
    else:
        near, far = NEAR[frame], FAR[frame]
        bob = -1 if frame in (2, 5) else 0
    cx = 11
    top = 9 + bob                          # 帽顶
    cloak = pose == 'cloak'

    # 腿与靴（袍子下面露出一点）
    def leg(dx, col, colb):
        x = cx + dx
        put(p, x, 27 + 0, col); put(p, x + 1, 27, col)
        put(p, x, 28, colb); put(p, x + 1, 28, colb); put(p, x + 2, 28, colb)
    if near is None:      # 跳：收腿
        for (x, y) in [(cx - 1, 26), (cx, 26), (cx - 1, 27), (cx, 27), (cx + 1, 27)]: put(p, x, y, BOOT2)
        for (x, y) in [(cx + 2, 25), (cx + 3, 25), (cx + 2, 26), (cx + 3, 26), (cx + 4, 26)]: put(p, x, y, BOOT)
    else:
        leg(far, BOOT2, BOOT2)
        leg(near, BOOT, BOOT)
    if frame == 'jump' or True:
        pass

    # 袍身
    hem = 26 if near is not None else 25
    for y in range(top + 7, hem + 1):
        t = (y - (top + 7)) / max(1, hem - (top + 7))
        half = 3 + round(t * 1.6) + (1 if cloak else 0)
        x0, x1 = cx - half, cx + half + 1
        if frame == 'jump' and y >= hem - 1: x0 -= 1; x1 += 1
        for x in range(x0, x1 + 1):
            col = robe
            if x >= x1 - 1: col = shade          # 背光一侧
            if x == x0: col = shade
            put(p, x, y, col)
        # 走路时下摆随步子摆动
        if near is not None and y == hem and frame not in ('idle',):
            put(p, x1 + (1 if near > 1 else 0), y, shade)
    # 领口 / 毛领
    if cloak:
        for x in range(cx - 3, cx + 4): put(p, x, top + 7, trim); put(p, x, top + 8, trim)
        put(p, cx - 4, top + 8, trim); put(p, cx + 4, top + 8, trim)
    else:
        for x in range(cx - 1, cx + 3): put(p, x, top + 7, trim)
        # 革带
        by = top + 13
        for x in range(cx - 4, cx + 5): put(p, x, by, BELT)
        put(p, cx + 2, by, GOLD)
    # 头：幞头 + 脸
    head = [
        "..kkkk.",
        ".kkkkkk",
        "kkkkkkk",
        "kkssss.",
        "kssses.",
        ".ssss..",
        "..sS...",
    ]
    hc = {'k': K, 's': SK, 'S': SS, 'e': EY}
    for j, row in enumerate(head):
        for i, ch in enumerate(row):
            if ch != '.': put(p, cx - 3 + i, top + j, hc[ch])
    # 幞头后面垂下的两条软脚，随步子 / 风摆动
    sway = 0 if frame in ('idle',) else (1 if (frame == 'jump' or (isinstance(frame, int) and frame % 3 == 0)) else 0)
    if outfit == 'wind':
        for i in range(4): put(p, cx - 4 - i, top + 2 + (i // 2), K)
    else:
        put(p, cx - 4, top + 2, K); put(p, cx - 4 - sway, top + 3, K); put(p, cx - 5 - sway, top + 4, K)

    # 手臂与道具
    ay = top + 9
    if pose == 'book':
        # 前手托一卷书在胸前
        for (x, y) in [(cx + 3, ay), (cx + 4, ay), (cx + 4, ay + 1)]: put(p, x, y, robe)
        put(p, cx + 5, ay, SK)
        for (x, y, c) in [(cx + 5, ay - 2, 'p'), (cx + 6, ay - 2, 'p'), (cx + 6, ay - 1, 'P'), (cx + 5, ay - 1, 'p'), (cx + 7, ay - 2, 'P'), (cx + 7, ay - 1, 'p')]:
            put(p, x, y, hexc(BASE[c]))
    elif pose in ('back', 'cloak'):
        # 一只手背在身后：腰后鼓起的袖子
        put(p, cx - 4 - (1 if cloak else 0), ay + 2, shade); put(p, cx - 5 - (1 if cloak else 0), ay + 2, shade)
        put(p, cx - 5 - (1 if cloak else 0), ay + 3, SS if not cloak else shade)
    elif pose == 'umbrella':
        # 前手举伞
        put(p, cx + 3, ay, robe); put(p, cx + 4, ay - 1, robe); put(p, cx + 4, ay - 2, SK)
        for y in range(max(1, top - 6), ay - 2): put(p, cx + 4, y, hexc(BASE['h']))
        U = hexc('#c9483a'); U2 = hexc('#8e2a22'); RIB = hexc('#e9d29a')
        canopy = [
            "......UUU......",
            "....UuuuuuU....",
            "..UuuuuuuuuuU..",
            ".UuuRuuuuuRuuU.",
            "UUUUUUUUUUUUUUU",
            "R.....R.....R..",
        ]
        cc = {'U': U2, 'u': U, 'R': RIB}
        ox = cx + 4 - 7
        oy = max(0, top - 9) + (1 if bob == 0 else 0)
        for j, row in enumerate(canopy):
            for i, ch in enumerate(row):
                if ch != '.': put(p, ox + i, oy + j, cc[ch])
    return im

TRAVELER_ROWS = [('clear', 'book'), ('clear', 'back'), ('rain', 'umbrella'), ('fog', 'back'), ('wind', 'back'), ('snow', 'cloak'), ('wind', 'book')]
TRAVELER_COLS = [0, 1, 2, 3, 4, 5, 'jump', 'idle']

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

# ---------------------------------------------------------------- 打包
def pack():
    items = []
    for ri, (outfit, pose) in enumerate(TRAVELER_ROWS):
        for ci, fr in enumerate(TRAVELER_COLS):
            items.append((f't_{outfit}_{pose}_{fr}', traveler_frame(outfit, pose, fr), (FW // 2, FH - 1)))
    for k, im in PROPS.items():
        items.append((k, im, (im.size[0] // 2, im.size[1] - 1)))
    W = 256
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

if __name__ == '__main__':
    if len(sys.argv) > 1: build_backgrounds(sys.argv[1])
    pack()
