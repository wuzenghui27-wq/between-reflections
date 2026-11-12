# 明代人物 v2（参考用户给的图二）：乌纱帽（两侧展角、帽正一点金）、大红圆领袍、胸前补子（仙鹤）、
# 革带、下摆祥云纹、侧摆露白、皂靴；手里一卷书。头身比约 1:1.3，头大一些、眼睛大一些，更讨喜。
# 一帧 40×48（含描边），脚底在第 45 行，面朝右。
# 画法：头和帽子手点位图；袍身、大袖、下摆、鞋按姿态参数生成。4 级色阶、光从右上方来、同色系描边。
import math
from pixelkit import Canvas, ramp, hexc, sel_outline

FW, FH = 40, 48
FOOT = 45

SKIN = ramp('#ffe6cc', '#f5c9a2', '#d99c78', '#a86a52')
HAT = ramp('#6a6070', '#40384a', '#2a2432', '#18141e')
GOLD = ramp('#fff0a0', '#f0c050', '#b8862e', '#6e4a16')
CLOUD = ramp('#f2c860', '#c8902e', '#5a6aa0', '#34406a')   # 祥云：金边蓝心
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
OUTFITS = {   # 袍色 4 级 + 内领/侧摆白 + 革带（暗、亮、金銙）
    'clear': (ramp('#f8705a', '#d43a30', '#9c2228', '#5c1220'), hexc('#fbf3e4'), ramp('#2a2228', '#3e343a', '#f0c050')),   # 大红圆领
    'rain': (ramp('#8ccfc2', '#4a9a90', '#2e6e6c', '#1c4446'), hexc('#f4f8f0'), ramp('#2a2228', '#3e343a', '#f0c050')),     # 石青
    'fog': (ramp('#e6cca4', '#b89670', '#86684e', '#584434'), hexc('#fff6e0'), ramp('#2a2228', '#3e343a', '#f0c050')),      # 茶褐
    'wind': (ramp('#c8a8d8', '#9676b2', '#684c86', '#42305a'), hexc('#fffaf4'), ramp('#2a2228', '#3e343a', '#f0c050')),     # 藕荷紫
    'snow': (ramp('#f8705a', '#d43a30', '#9c2228', '#5c1220'), hexc('#ffffff'), ramp('#2a2228', '#3e343a', '#f0c050')),     # 大红 + 石青斗篷
}
CAPE = ramp('#6ab0b0', '#3a7e86', '#265862', '#163640')

# 头：乌纱帽（后山高、前屋低，帽正一点金，两侧展角伸出）+ 鬓发 + 侧脸（大眼带高光、耳朵、腮红）
HEAD = [
    ".......KKKK......",
    "......KhhhgK.....",
    ".....KghhhggK....",
    ".....KgghgKKKKK..",
    ".....KggKKhhhhgK.",
    "WWWWWKggKghYYhgKW",
    "wwwwwKKgKggYYggKw",
    ".....KKKKKKKKKKK.",
    ".....HHHHHtssss..",
    ".....HHHHttsbbs..",
    ".....HHrRtssEes..",
    ".....HHrrtssEsss.",
    "......HHttsRsssT.",
    "......HtTtsssls..",
    ".......TTtssss...",
    "........TTTT.....",
    ".........TT......",
]
# K 帽轮廓 / h 高光 / g 中间 / Y 帽正 / W w 展角 / H 鬓发 / s t T 脸 / E 眼 / e 眼高光 / b 眉 / l 唇 / r R 耳 / 


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
    if cloak:
        L, M, D, DD = CAPE                  # 雪天：石青斗篷罩在红袍外
    wind = outfit == 'wind'
    cx, fy = 18, FOOT - 1
    nx, nl, fx_, fl, bob, swing, lag = pose_of(frame, run)
    flow = [0, 1, 2, 2, 1, 0, 1, 2][lag] if run else (1 if frame in ('up', 'fall') else 0)
    if wind:
        flow += 1
    top = fy - 36 + bob
    sh = top + 16                 # 肩
    belt = sh + 7 + (1 if frame == 'land' else 0)
    hem = fy - 2
    bx = cx + (1 if run else 0)   # 跑起来上身略前倾

    # ---------------- 鞋（云头履：黑面、白底、鞋头上翘）
    def shoe(dx, lift, near):
        sp = SHOE if near else [SHOE[2], SHOE[2], SHOE[3], SHOE[3]]
        x, y = cx + dx - (0 if near else 1), fy - lift
        for i in range(5):
            put(x + i, y - 1, sp[1] if i < 3 else sp[0])
            put(x + i - 1, y - 2, sp[2] if i < 2 else sp[1])
        put(x + 5, y - 1, sp[0])                                  # 靴头
        for i in range(6):
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
            x0, x1 = bx - 5, bx + 4
            if y == sh:
                x0, x1 = bx - 3, bx + 3
            if y == sh + 1:
                x0, x1 = bx - 4, bx + 4
        else:
            k = (y - belt) / max(1, hem - belt)
            x0 = bx - 5 - round(k * (1.6 + back_push + flow * 0.8))
            x1 = bx + 4 + round(k * (1.0 + front_push))
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
        # 侧摆：圆领袍两侧的“摆”，开衩处露出一线白色衬袍，跑动时张开
        if y > belt + 1 and not cloak:
            sx = bx - 3 + (1 if (run and lag in (1, 2, 5, 6)) else 0)
            put(sx, y, COLLAR if y > belt + 4 and y < hem - 1 else D)
            put(sx - 1, y, D)
        # 下摆祥云纹：金边蓝心的小云头，沿下摆一排
        if not cloak and hem - 4 <= y <= hem - 2:
            r_ = y - (hem - 4)
            for x in range(x0 + 1, x1):
                m = (x - bx + 40) % 5
                if r_ == 0 and m in (1, 2):
                    put(x, y, CLOUD[0])
                elif r_ == 1 and m in (0, 3):
                    put(x, y, CLOUD[1])
                elif r_ == 1 and m in (1, 2):
                    put(x, y, CLOUD[2])
                elif r_ == 2 and m in (1, 2, 3):
                    put(x, y, CLOUD[1] if m != 2 else CLOUD[3])
    # 衣褶：前襟一条长褶，后摆一条随风的褶
    if not cloak:
        for y in range(belt + 2, hem - 1):
            put(bx + 1 + (1 if y > hem - 4 and front_push > 1.5 else 0), y, M if y % 3 else D)
        for y in range(belt + 3, hem - 1):
            put(bx - 3 - (1 if y > belt + 5 and flow > 1 else 0), y, DD if y % 2 else D)

    # ---------------- 近脚
    shoe(nx, nl, True)

    # ---------------- 圆领 + 补子 + 革带
    if not cloak:
        for x in range(bx - 2, bx + 4):                         # 圆领：领口一圈暗边，前颈露一点白内领
            put(x, sh, D if x < bx + 2 else M)
        put(bx + 2, sh, COLLAR); put(bx + 3, sh, COLLAR); put(bx + 3, sh + 1, D); put(bx + 4, sh + 1, D)
        # 补子：胸前方补，金线框，青底上一只白鹤
        px0, py0 = bx - 2, sh + 2
        for j in range(5):
            for i in range(5):
                edge = i in (0, 4) or j in (0, 4)
                if edge and (i, j) in ((0, 0), (4, 0), (0, 4), (4, 4)):
                    continue
                put(px0 + i, py0 + j, GOLD[1] if edge and i > 1 else (GOLD[2] if edge else CLOUD[3]))
        put(px0 + 2, py0 + 1, (250, 246, 236, 255)); put(px0 + 1, py0 + 2, (250, 246, 236, 255))
        put(px0 + 3, py0 + 2, (250, 246, 236, 255)); put(px0 + 2, py0 + 2, (220, 60, 50, 255)); put(px0 + 2, py0 + 3, (40, 30, 40, 255))
        # 革带：圆领袍的玉带松松地挂在腰上，前低后高，嵌金銙
        for x in range(bx - 5, bx + 5):
            yy = belt + (1 if x > bx + 1 else 0)
            put(x, yy, SASH[0]); put(x, yy + 1, SASH[1] if x > bx - 4 else SASH[0])
            if (x - bx) % 3 == 0:
                put(x, yy, SASH[2])
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
    pal = {'K': HAT[3], 'h': HAT[0], 'g': HAT[1], 'k': HAT[2], 'N': HAIR[2], 'H': HAIR[1], 'Y': GOLD[1],
           'W': HAT[2], 'w': HAT[1], 'e': hexc('#ffffff'), 'R': SKIN[2],
           's': SKIN[0], 't': SKIN[1], 'T': SKIN[2], 'E': EYE, 'b': BROW, 'l': LIP, 'r': SKIN[3]}
    hx, hy = bx - 9, top
    for j, row in enumerate(HEAD):
        for i, ch in enumerate(row):
            if ch == '.':
                continue
            put(hx + i, hy + j, pal[ch])
    if frame == 'idle1':
        put(hx + 12, hy + 10, SKIN[0]); put(hx + 13, hy + 10, SKIN[0]); put(hx + 13, hy + 11, EYE)   # 眨眼
    put(hx + 11, hy + 12, hexc('#f4a090'))     # 腮红
    # 巾子后垂的两条软带（明巾常见的垂带），随动作飘
    # 帽后不再垂带子：展角已经够表达“乌纱帽”，再加带子轮廓会乱

    # ---------------- 近侧手臂、大袖与道具
    ay = sh + 1
    if pose == 'book':
        # 前手在胸前竖握一卷书，大袖从手肘垂下
        for i in range(4):
            put(bx + 2 + i, ay + 3 + i // 2, M); put(bx + 2 + i, ay + 4 + i // 2, D if i < 2 else M)
        for j in range(5):
            for i in range(4):
                put(bx + 2 + i - j // 2, ay + 5 + j, [L, M, M, D][i] if j < 4 else DD)
        put(bx + 6, ay + 4, SKIN[0]); put(bx + 6, ay + 5, SKIN[1]); put(bx + 7, ay + 4, SKIN[1])
        for y in range(ay + 1, ay + 7):                        # 竖着的书卷
            put(bx + 7, y, PAPER[0]); put(bx + 8, y, PAPER[1] if y > ay + 1 else PAPER[0])
        put(bx + 7, ay, PAPER[2]); put(bx + 8, ay, PAPER[1]); put(bx + 8, ay + 1, PAPER[3])
        put(bx + 7, ay + 7, SCROLL[1]); put(bx + 8, ay + 7, SCROLL[2])
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
