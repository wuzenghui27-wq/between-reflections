# 明代书生：四方平定巾、交领右衽直裰（白护领）、大袖、丝绦、云头履。
# 一帧 40×48（含描边），脚底在第 45 行，面朝右，人约 20×36 像素。
# 画法：头和巾子是手点的位图（脸的五官需要逐像素摆）；袍身、大袖、下摆、鞋按姿态参数生成，
# 每种材质 4 级色阶、光从右上方来、同色系描边。袖子、下摆、丝绦比身体慢两帧（次级动作）。
import math
from pixelkit import Canvas, ramp, hexc, sel_outline

FW, FH = 40, 48
FOOT = 45

SKIN = ramp('#ffe6cc', '#f5c9a2', '#d99c78', '#a86a52')
HAT = ramp('#6a6888', '#3a3850', '#24223a', '#16141f')
HAIR = ramp('#3a3448', '#221d2e', '#15111c', '#0d0a12')
SHOE = ramp('#6a5a66', '#3a2e38', '#241c24', '#140e14')
SOLE = hexc('#f2ead8')
EYE = hexc('#24141e')
BROW = hexc('#3a2a30')
LIP = hexc('#d8806c')
PAPER = ramp('#fffaea', '#f2e4c0', '#cdb88a', '#9a845a')
SCROLL = ramp('#c85a3a', '#9a3a28', '#6a2418', '#3a120c')
FUR = ramp('#ffffff', '#ece6dc', '#c4bab0', '#8e847c')

# 亮→暗 4 级袍色 + 护领 + 丝绦色
OUTFITS = {
    'clear': (ramp('#f8fcff', '#d6e4ee', '#a6bccc', '#72889e'), hexc('#ffffff'), ramp('#4a6a9a', '#2e4670', '#1c2c4a')),   # 月白直裰
    'rain': (ramp('#9cd4c6', '#5aa49a', '#387a76', '#22504e'), hexc('#f4f8f0'), ramp('#e8c25a', '#b08a2e', '#6a5018')),     # 石青
    'fog': (ramp('#e6d2ae', '#bea27c', '#8e7458', '#5e4c3c'), hexc('#fff6e0'), ramp('#6a3a2a', '#4a2418', '#2a120c')),      # 茶褐
    'wind': (ramp('#c8a8d8', '#9a78b4', '#6c5088', '#46305c'), hexc('#fffaf4'), ramp('#e8c25a', '#b08a2e', '#6a5018')),     # 藕荷紫
    'snow': (ramp('#ff7a5c', '#d23c30', '#962428', '#5a1620'), hexc('#ffffff'), ramp('#e8c25a', '#b08a2e', '#6a5018')),     # 大红披风
}

# 头：四方平定巾（黑纱，顶略宽，右上受光）+ 网巾压发 + 侧脸
HEAD = [
    "...KKKKKKK...",
    "...KhhhhgK...",
    "...KkhkkkK...",
    "...KkkkkkK...",
    "...KkkkkkK...",
    "..NNNNNNNNN..",
    ".HHHHHtsssss.",
    ".HHHHTtsbbss.",
    ".HHHrTtssEsss",
    "..HHrTtsssssT",
    "..HHTttssssl.",
    "...HTTtssss..",
    "....TTttT....",
    ".....TTT.....",
]
# K 巾轮廓 / h 巾高光 / g 巾高光弱 / k 巾 / N 网巾带 / H 头发 / s t T 脸三级 / E 眼 / b 眉（第 8 行）/ l 唇


def pose_of(frame, run):
    """返回 (近脚 dx, 近脚抬, 远脚 dx, 远脚抬, 身体上下, 近袖摆, 次级动作相位)。"""
    if run:
        nd = [5, 3, 0, -3, -5, -3, 1, 4]
        nl = [0, 0, 0, 1, 3, 4, 3, 1]
        bob = [0, 1, 0, -1, 0, 1, 0, -1]
        k, j = frame % 8, (frame + 4) % 8
        return nd[k], nl[k], nd[j], nl[j], bob[k], -nd[k] * 0.6, (frame + 6) % 8
    return {
        'idle0': (2, 0, -2, 0, 0, 0, 0), 'idle1': (2, 0, -2, 0, 1, 0, 2),
        'up': (4, 4, -3, 1, -1, -2, 3), 'fall': (3, 2, -2, 0, 0, 2, 6),
        'land': (4, 0, -4, 0, 2, 2, 0),
    }[frame]


def traveler_frame(outfit, pose, frame):
    R, COLLAR, SASH = OUTFITS[outfit]
    L, M, D, DD = R
    W, H = FW - 2, FH - 2
    cv = Canvas(W, H)
    put = cv.put
    run = isinstance(frame, int)
    cloak = pose == 'cloak'
    wind = outfit == 'wind'
    cx, fy = 18, FOOT - 1
    nx, nl, fx_, fl, bob, swing, lag = pose_of(frame, run)
    flow = [0, 1, 2, 2, 1, 0, 1, 2][lag] if run else (1 if frame in ('up', 'fall') else 0)
    if wind:
        flow += 1
    top = fy - 34 + bob
    sh = top + 14                 # 肩
    belt = sh + 8 + (1 if frame == 'land' else 0)
    hem = fy - 2
    bx = cx + (1 if run else 0)   # 跑起来上身略前倾

    # ---------------- 鞋（云头履：黑面、白底、鞋头上翘）
    def shoe(dx, lift, near):
        sp = SHOE if near else [SHOE[2], SHOE[2], SHOE[3], SHOE[3]]
        x, y = cx + dx - (0 if near else 1), fy - lift
        for i in range(4):
            put(x + i, y - 1, sp[1] if i < 3 else sp[0])
        put(x + 4, y - 2, sp[0]); put(x + 4, y - 1, sp[1])        # 上翘的云头
        for i in range(4):
            put(x + i, y, SOLE if near else hexc('#b8b0a0'))
        if lift > 1:   # 抬脚时露出一截白袜
            put(x + 1, y - 2, hexc('#f4f0e6') if near else hexc('#c8c2b6'))
            put(x + 1, y - 3, hexc('#f4f0e6') if near else hexc('#c8c2b6'))
    shoe(fx_, fl, False)

    # ---------------- 远侧大袖（在身后，暗一档）
    def big_sleeve(ax, ay, sw, rp, length=9, droop=5):
        """大袖：上臂一段斜下，袖口往下垂成一个袋。sw>0 往前摆。"""
        ex, ey = ax + sw, ay + length - 3
        n = int(max(abs(ex - ax), abs(ey - ay))) or 1
        for i in range(n + 1):
            x = ax + (ex - ax) * i / n
            y = ay + (ey - ay) * i / n
            put(x, y, rp[1]); put(x + 1, y, rp[0] if i < n / 2 else rp[1]); put(x - 1, y, rp[2])
        # 垂下的袖袋：比手臂宽，下沿圆
        for j in range(droop):
            w = 3 if j < droop - 1 else 2
            for i in range(-w, 2):
                c = rp[1]
                if i <= -w + 1:
                    c = rp[2]
                if i == 1:
                    c = rp[0]
                if j == droop - 1:
                    c = rp[3] if i < 0 else rp[2]
                put(ex - 1 + i - (j // 2) * (1 if sw >= 0 else -1) * 0 - flow // 2, ey + j, c)
        return ex, ey
    # 远侧手臂藏在身后（侧面像素人物的常规处理），只在跑动摆到前面时露出袖口
    if not cloak and pose == 'book' and run and swing > 1:
        for j in range(3):
            put(bx + 4, sh + 6 + j, D); put(bx + 5, sh + 7 + j, DD)

    # ---------------- 披风在身后飘
    if cloak:
        for y in range(sh, hem):
            k = (y - sh) / max(1, hem - sh)
            back = bx - 7 - round(k * (2 + flow))
            for x in range(back, bx - 4):
                put(x, y, DD if x == back else (D if x < back + 2 else M))
        for i in range(4):
            put(bx - 8 - flow - i, hem - 1 - (i + lag) % 2, DD)

    # ---------------- 袍身：上身 + 长下摆（直裰两侧开衩，下摆随步子开合）
    front_push = max(nx, fx_, 0) * 0.8
    back_push = max(-min(nx, fx_), 0) * 0.7
    for y in range(sh, hem + 1):
        if y <= belt:
            x0, x1 = bx - 4, bx + 3
            if y == sh:
                x0, x1 = bx - 3, bx + 2
            if y == sh + 1:
                x0, x1 = bx - 4, bx + 3
        else:
            k = (y - belt) / max(1, hem - belt)
            x0 = bx - 4 - round(k * (0.8 + back_push + flow * 0.8))
            x1 = bx + 3 + round(k * (0.6 + front_push))
        if cloak:
            x0 -= 1; x1 += 1
        for x in range(x0, x1 + 1):
            c = M
            if x >= x1 - 1:
                c = L
            if x <= x0 + 1:
                c = D
            if x == x0:
                c = DD
            if y == sh and x0 < x < x1:
                c = L
            put(x, y, c)
        # 下摆贴边一道深色
        if y >= hem - 1:
            for x in range(x0, x1 + 1):
                put(x, y, DD if (y == hem or x < x1 - 1) else D)
        # 侧面开衩：一条暗线，跑动时张开露出内摆
        if y > belt + 2 and not cloak:
            sx = bx - 1 + (1 if (run and lag in (1, 2, 5, 6)) else 0)
            put(sx, y, D)
            if run and y > hem - 4 and nx > 2:
                put(sx + 1, y, DD)
    # 衣褶：前襟一条长褶，后摆一条随风的褶
    if not cloak:
        for y in range(belt + 2, hem - 1):
            put(bx + 1 + (1 if y > hem - 4 and front_push > 1.5 else 0), y, M if y % 3 else D)
        for y in range(belt + 3, hem - 1):
            put(bx - 3 - (1 if y > belt + 5 and flow > 1 else 0), y, DD if y % 2 else D)

    # ---------------- 近脚
    shoe(nx, nl, True)

    # ---------------- 交领 + 白护领、丝绦
    if not cloak:
        # 护领：从后颈绕到前胸，斜着交到右腋下
        for i in range(6):
            put(bx + 1 + i // 2, sh + i, COLLAR)
            put(bx + i // 2, sh + i, L if i < 5 else COLLAR)
        put(bx - 1, sh, COLLAR); put(bx - 2, sh, COLLAR)
        put(bx + 3, sh + 6, D)
        # 丝绦：细腰带 + 前面打结 + 两条垂穗（慢半拍摆）
        for x in range(bx - 4, bx + 4):
            put(x, belt, SASH[1] if x < bx + 2 else SASH[0])
        put(bx + 2, belt + 1, SASH[0]); put(bx + 3, belt + 1, SASH[1])
        sw2 = [0, 1, 1, 0, -1, -1, 0, 0][lag] if run else 0
        for j in range(5):
            put(bx + 2 - (sw2 if j > 1 else 0) - j // 3, belt + 2 + j, SASH[1] if j < 4 else SASH[2])
        put(bx + 3 - sw2, belt + 6, SASH[0])
    else:
        # 披风的毛领与系带
        for x in range(bx - 5, bx + 4):
            put(x, sh, FUR[1] if x > bx - 3 else FUR[2])
            put(x, sh + 1, FUR[0] if x > bx - 1 else FUR[1])
        put(bx - 6, sh + 1, FUR[2]); put(bx + 4, sh + 1, FUR[1])
        put(bx + 2, sh + 2, SASH[0]); put(bx + 3, sh + 3, SASH[1]); put(bx + 2, sh + 4, SASH[1])
        for y in range(sh + 3, hem - 1):
            put(bx + 3, y, L); put(bx + 2, y, D if y > sh + 4 else M)

    # ---------------- 头
    pal = {'K': HAT[3], 'h': HAT[0], 'g': HAT[1], 'k': HAT[2], 'N': HAIR[2], 'H': HAIR[1],
           's': SKIN[0], 't': SKIN[1], 'T': SKIN[2], 'E': EYE, 'b': BROW, 'l': LIP, 'r': SKIN[3]}
    hx, hy = bx - 6, top
    for j, row in enumerate(HEAD):
        for i, ch in enumerate(row):
            if ch == '.':
                continue
            put(hx + i, hy + j, pal[ch])
    if frame == 'idle1':
        put(hx + 9, hy + 8, SKIN[1])          # 眨眼
    put(hx + 8, hy + 10, hexc('#f0a890'))      # 腮红
    # 巾子后垂的两条软带（明巾常见的垂带），随动作飘
    tail = 4 + (2 if run or frame in ('up', 'fall') else 0) + (2 if wind else 0)
    for k in (0, 1):
        for i in range(tail):
            wv = 0 if not run else (1 if ((lag + i + k * 3) % 4) < 2 else 0)
            put(hx + 1 - i, hy + 6 + k * 2 + i // 2 - (wv if i > 1 else 0) + (1 if frame == 'fall' and i > 2 else 0), HAT[2] if k else HAT[1])

    # ---------------- 近侧手臂、大袖与道具
    ay = sh + 1
    if pose == 'book':
        # 前手托一卷书：大袖垂在前臂下
        for i in range(4):
            put(bx + 1 + i, ay + 2 + i // 2, M); put(bx + 1 + i, ay + 3 + i // 2, D if i < 2 else M)
        for j in range(4):
            for i in range(3):
                put(bx + 2 + i - j // 2, ay + 4 + j, [L, M, D][min(2, i)] if j < 3 else DD)
        put(bx + 5, ay + 3, SKIN[1]); put(bx + 6, ay + 3, SKIN[2])
        for x in range(bx + 5, bx + 11):
            put(x, ay + 1, PAPER[0] if x < bx + 9 else PAPER[1])
            put(x, ay + 2, PAPER[1] if x < bx + 9 else PAPER[2])
        put(bx + 5, ay, SCROLL[1]); put(bx + 5, ay + 3, SCROLL[2])
        put(bx + 11, ay + 1, SCROLL[1]); put(bx + 11, ay + 2, SCROLL[2])
        put(bx + 7, ay + 1, PAPER[3]); put(bx + 8, ay + 2, PAPER[3])
    elif pose == 'back':
        # 背手：近手藏在身后，大袖垂在腰后；跑起来另一只袖子在身前摆
        for j in range(6):
            for i in range(3):
                put(bx - 5 - i + j // 3, ay + 2 + j, [M, D, DD][i] if j < 5 else DD)
        big_sleeve(bx, ay, swing + 1 if run else 1, [L, M, D, DD], 8, 4)
    elif pose == 'umbrella':
        for i in range(3):
            put(bx + 1 + i, ay + 1 - i // 2, M); put(bx + 1 + i, ay + 2 - i // 2, D)
        for j in range(4):
            put(bx + 2, ay + 3 + j, M if j < 3 else DD); put(bx + 1, ay + 3 + j, D)
        put(bx + 4, ay - 1, SKIN[1]); put(bx + 5, ay - 1, SKIN[2])
        pole = hexc('#7a5a34')
        ut = top - 9 + (0 if bob < 0 else 1)
        for y in range(ut + 6, ay):
            put(bx + 5, y, pole)
        U = ramp('#ffb08c', '#e8604a', '#b83c30', '#7a2228')
        RIB = hexc('#f4d8a0')
        canopy = [
            ".........ddd.........",
            ".......dcbbbcd.......",
            ".....dcbaabbbccd.....",
            "...dcbaabbbbbbccdd...",
            "..dcbabbbbbbbbbccdd..",
            ".dcbabbbbbbbbbbbccdd.",
            "dddrddddrdddddrdddrdd",
            "r.......r.....r.....r",
        ]
        cc = {'a': U[0], 'b': U[1], 'c': U[2], 'd': U[3], 'r': RIB}
        for j, row in enumerate(canopy):
            for i, ch in enumerate(row):
                if ch != '.':
                    put(bx + 5 - 10 + i, ut + j, cc[ch])
        put(bx + 5, ut - 1, pole)
    elif cloak:
        put(bx + 4, ay + 4, SKIN[1]); put(bx + 4, ay + 5, SKIN[2])

    return sel_outline(cv.im)


TRAVELER_ROWS = [('clear', 'book'), ('clear', 'back'), ('rain', 'umbrella'), ('fog', 'back'), ('wind', 'back'), ('snow', 'cloak'), ('wind', 'book')]
TRAVELER_COLS = [0, 1, 2, 3, 4, 5, 6, 7, 'up', 'fall', 'land', 'idle0', 'idle1']

if __name__ == '__main__':
    import sys
    from PIL import Image
    row = [('clear', 'book', 0), ('clear', 'book', 2), ('clear', 'book', 4), ('clear', 'book', 6), ('clear', 'back', 'idle0'),
           ('rain', 'umbrella', 3), ('snow', 'cloak', 1), ('wind', 'back', 'up'), ('fog', 'back', 'land')]
    s = Image.new('RGBA', (FW * len(row), FH), (150, 170, 175, 255))
    for i, (o, p, f) in enumerate(row):
        im = traveler_frame(o, p, f); s.paste(im, (i * FW, 0), im)
    s.resize((s.width * 8, s.height * 8), Image.NEAREST).save(sys.argv[1] if len(sys.argv) > 1 else '/tmp/m.png')
