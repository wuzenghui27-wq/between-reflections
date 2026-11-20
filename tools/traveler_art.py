# 唐朝旅人 v3：幞头（带两条软脚）、圆领袍（开衩、蹀躞带、玉佩）、乌皮靴。
# 一帧 32×40（含描边），脚底在第 37 行，面朝右。人物约 18×28 像素。
# 每种材质 4 级色阶，光从右上方来；外轮廓用同色系的暗色描边。
# 奔跑是标准的 8 帧循环：着地 → 下压 → 交叉 → 腾空，左右腿各一遍；身体随步子上下、前倾，
# 袍角、软脚、玉佩比身体慢半拍（次级动作）。
import math
from pixelkit import Canvas, ramp, hexc, sel_outline

FW, FH = 32, 40
FOOT = 37

SKIN = ramp('#ffe4c8', '#f6c8a0', '#dc9a74', '#a8664e')
HAT = ramp('#5a5878', '#33304a', '#211e30', '#16131f')
HAIR = ramp('#3a3448', '#241f30', '#17131f', '#100c16')
PANT = ramp('#6a6078', '#4a4258', '#332c40', '#221c2c')
BOOT = ramp('#6a5c64', '#3e3238', '#261e24', '#170f15')
BELT = ramp('#7a5238', '#5a3a28', '#3a2418', '#24160e')
GOLD = ramp('#fff4b0', '#f0c858', '#b8862e', '#7a5418')
JADE = ramp('#c8ffe0', '#6cc4a0', '#3a8a6e', '#245a48')
EYE = hexc('#2a1828')
BLUSH = hexc('#f0a08c')
PAPER = ramp('#fffaea', '#f2e4c0', '#cdb88a', '#9a845a')
SCROLL = ramp('#c85a3a', '#9a3a28', '#6a2418', '#3a120c')

OUTFITS = {
    # 亮 → 暗 4 级，第 5 个是领口 / 镶边
    'clear': ramp('#ffffff', '#dde9f0', '#aec2d2', '#7a90a8', '#f6efdc'),     # 月白圆领袍
    'rain': ramp('#9ad8c4', '#58a898', '#367a74', '#22504e', '#d8f0e2'),      # 青袍
    'fog': ramp('#ecd8b0', '#c4a67c', '#94765a', '#62503e', '#fff2d6'),       # 赭褐袍
    'wind': ramp('#ff9c78', '#dc5c44', '#a6382c', '#6a2020', '#ffe0b8'),      # 绯袍
    'snow': ramp('#ff7a5c', '#d23c30', '#962428', '#5a1620', '#ffffff'),      # 红斗篷
}
FUR = ramp('#ffffff', '#ece6dc', '#c4bab0', '#8e847c')

HEAD = [
    "....aaaa....",
    "...abbaaa...",
    "..abaaaaaa..",
    "..aaaaaaaaa.",
    ".ccccccccccc",
    ".hhhTttssss.",
    ".hhtTtssses.",
    "..hhTttsssst",
    "..hhTttsssb.",
    "...hTTtsss..",
    "....TTTt....",
]
# a 帽 中 / b 帽 高光 / c 帽沿（暗）/ h 鬓发 / s 脸 亮 / t 脸 中 / T 脸 暗 / e 眼 / b 腮红（第 8 行）


def run_pose(f):
    """8 帧奔跑：返回 (近腿 dx, 近腿抬, 远腿 dx, 远腿抬, 身体上下, 近臂摆)。"""
    # 近腿着地在前（0）→ 往后蹬（2）→ 收腿抬起往前送（4–6）
    nd = [4, 2, 0, -3, -4, -2, 1, 3]
    nl = [0, 0, 0, 1, 3, 4, 3, 1]
    bob = [0, 1, 0, -1, 0, 1, 0, -1]
    k = f % 8
    j = (f + 4) % 8
    return nd[k], nl[k], nd[j], nl[j], bob[k], -nd[k]


def traveler_frame(outfit, pose, frame):
    O = OUTFITS[outfit]
    L, M, D, DD, TRIM = O
    W, H = FW - 2, FH - 2
    cv = Canvas(W, H)
    put = cv.put
    cx, fy = 14, FOOT - 1
    cloak = pose == 'cloak'
    run = isinstance(frame, int)
    wind = outfit == 'wind'

    if run:
        nx, nl, fx_, fl, bob, swing = run_pose(frame)
        lag = (frame + 2) % 8           # 次级动作慢两帧
        flap = 1 + (1 if lag in (2, 3, 4, 5) else 0)
        lean = 1
    elif frame in ('idle0', 'idle1'):
        nx, nl, fx_, fl, bob, swing, flap, lean = 2, 0, -2, 0, (1 if frame == 'idle1' else 0), 0, 0, 0
    elif frame == 'up':
        nx, nl, fx_, fl, bob, swing, flap, lean = 3, 4, -3, 1, -1, -3, 2, 1
    elif frame == 'fall':
        nx, nl, fx_, fl, bob, swing, flap, lean = 2, 2, -2, 0, 0, 2, -1, 0
    else:  # land：屈膝下蹲
        nx, nl, fx_, fl, bob, swing, flap, lean = 3, 0, -3, 0, 2, 2, 0, 1
    if wind:
        flap += 1
    top = fy - 27 + bob
    sh = top + 11
    belt = sh + 6 + (1 if frame == 'land' else 0)
    hem = fy - 6 + (1 if frame == 'land' else 0)
    if frame == 'up':
        hem -= 1
    bx = cx + (1 if lean and run else 0)     # 上身前倾一点

    # ---------------- 腿（先画远腿）
    def leg(dx, lift, near):
        rp = PANT if near else [PANT[2], PANT[2], PANT[3], PANT[3]]
        bp = BOOT if near else [BOOT[2], BOOT[2], BOOT[3], BOOT[3]]
        hip_x = cx + (0 if near else -1)
        foot_x = cx + dx - (0 if near else 1)
        foot_y = fy - lift
        knee_x = (hip_x + foot_x) / 2 + (1 if lift > 1 else 0)
        knee_y = (hem + foot_y) / 2 - (1 if lift > 1 else 0)
        # 大腿 → 小腿，各 2 像素宽
        for (ax, ay, bx2, by2) in ((hip_x, hem - 2, knee_x, knee_y), (knee_x, knee_y, foot_x, foot_y - 2)):
            n = int(max(abs(bx2 - ax), abs(by2 - ay))) or 1
            for i in range(n + 1):
                x = ax + (bx2 - ax) * i / n
                y = ay + (by2 - ay) * i / n
                put(x, y, rp[1])
                put(x + 1, y, rp[2])
        # 乌皮靴：靴筒 + 靴尖朝前上翘
        put(foot_x, foot_y - 2, bp[1]); put(foot_x + 1, foot_y - 2, bp[2])
        put(foot_x, foot_y - 1, bp[1]); put(foot_x + 1, foot_y - 1, bp[1]); put(foot_x + 2, foot_y - 1, bp[2])
        put(foot_x, foot_y, bp[2]); put(foot_x + 1, foot_y, bp[2]); put(foot_x + 2, foot_y, bp[2]); put(foot_x + 3, foot_y - 1, bp[2])
        if near:
            put(foot_x + 1, foot_y - 2, bp[0])
    leg(fx_, fl, False)

    # ---------------- 远侧手臂（藏在身后，颜色更暗）
    def sleeve_arm(ax, ay, ex, ey, rp, hand=True, wide=2):
        n = int(max(abs(ex - ax), abs(ey - ay))) or 1
        for i in range(n + 1):
            x = ax + (ex - ax) * i / n
            y = ay + (ey - ay) * i / n
            for k in range(wide):
                put(x + k, y, rp[1] if k else rp[2])
            put(x + wide - 1, y, rp[0] if i < n * 0.5 else rp[1])
        if hand:
            put(ex + 1, ey + 1, SKIN[1]); put(ex, ey + 1, SKIN[2])
    if not cloak and pose != 'umbrella':
        sw = -swing if pose == 'back' else swing
        sleeve_arm(bx - 2, sh + 1, bx - 2 + sw * 0.7 - 1, sh + 6, [D, D, DD, DD])

    # ---------------- 斗篷在身后飘起
    if cloak:
        for y in range(sh + 1, hem + 1):
            k = (y - sh) / max(1, hem - sh)
            back = bx - 6 - round(k * (2 + max(0, flap)))
            for x in range(back, bx - 3):
                put(x, y, DD if x == back else D)
        # 斗篷下摆的波浪
        for i in range(3):
            put(bx - 7 - flap - i, hem - (i + (frame if run else 0)) % 2, DD)

    # ---------------- 袍身
    for y in range(sh, hem + 1):
        if y <= belt:
            x0, x1 = bx - 4, bx + 3
            if y == sh:
                x0, x1 = bx - 3, bx + 2
        else:
            k = (y - belt) / max(1, hem - belt)
            x0 = bx - 4 - round(k * 1.0) - (round(k * flap) if y > belt + 1 else 0)
            x1 = bx + 3 + round(k * 1.0) + (1 if (run and nx > 1 and y > belt + 2) else 0)
        if cloak:
            x0 -= 1; x1 += 1
        for x in range(x0, x1 + 1):
            c = M
            if x >= x1 - 1:
                c = L                 # 迎光的前襟
            if x <= x0 + 1:
                c = D                 # 背光的后背
            if x == x0:
                c = DD
            if y == sh and x0 < x < x1:
                c = L                 # 肩头受光
            put(x, y, c)
        if y == hem:
            for x in range(x0, x1 + 1):
                put(x, y, DD if x < x1 - 1 else D)
        if y == hem - 1 and not cloak:
            for x in range(x0 + 1, x1):
                put(x, y, D if x < x1 - 2 else M)
    if not cloak:
        # 开衩：前腿迈出时露出一角裤腿
        if run and nx > 1:
            put(bx + 3, hem - 1, PANT[1]); put(bx + 3, hem, PANT[2])
        # 衣褶：两条随步子轻摆
        sway = (0 if not run else (1 if (frame % 4) < 2 else 0))
        for y in range(belt + 2, hem - 1):
            put(bx - 1 + sway, y, D)
        for y in range(belt + 3, hem - 1):
            put(bx + 2 - sway, y, M if y % 2 else D)
        # 圆领 + 衬领
        for x in range(bx - 1, bx + 3):
            put(x, sh, TRIM)
        put(bx + 3, sh + 1, TRIM); put(bx + 3, sh + 2, TRIM); put(bx + 2, sh + 3, L)
        put(bx + 2, sh + 1, SKIN[2])
        # 蹀躞带 + 带銙 + 垂下的佩
        for x in range(bx - 4, bx + 4):
            put(x, belt, BELT[1] if x < bx + 2 else BELT[0])
        put(bx + 2, belt, GOLD[1]); put(bx - 1, belt, GOLD[2]); put(bx - 3, belt, GOLD[2])
        pd = 0 if not run else (1 if (frame + 2) % 4 < 2 else 0)
        put(bx - 3 - pd, belt + 1, BELT[2]); put(bx - 3 - pd, belt + 2, JADE[1]); put(bx - 3 - pd, belt + 3, JADE[2])
        put(bx - 4 - pd, belt + 4, hexc('#c83a30'))       # 红穗
    else:
        # 白毛领 + 斗篷前襟 + 金扣
        for x in range(bx - 4, bx + 4):
            put(x, sh, FUR[1] if x > bx - 3 else FUR[2])
            put(x, sh + 1, FUR[0] if x > bx else FUR[1])
        put(bx - 5, sh + 1, FUR[2]); put(bx + 4, sh + 1, FUR[1])
        put(bx - 3, sh + 2, FUR[2]); put(bx + 3, sh + 2, FUR[2])
        for y in range(sh + 3, hem):
            put(bx + 2, y, D)
            put(bx + 3, y, L)
        put(bx + 2, sh + 3, GOLD[1])

    # ---------------- 近腿
    leg(nx, nl, True)

    # ---------------- 头
    pal = {'a': HAT[1], 'b': HAT[0], 'c': HAT[2], 'h': HAIR[1], 's': SKIN[0], 't': SKIN[1], 'T': SKIN[2], 'e': EYE}
    hx, hy = bx - 5, top
    for j, row in enumerate(HEAD):
        for i, ch in enumerate(row):
            if ch == '.':
                continue
            c = pal[ch]
            if ch == 'b' and j == 8:
                c = BLUSH
            put(hx + i, hy + j, c)
    put(hx + 9, hy + 8, BLUSH)
    if frame == 'idle1':
        put(hx + 9, hy + 6, SKIN[1])           # 眨眼
    # 幞头后面的结 + 两条软脚，随动作飘
    put(hx, hy + 3, HAT[2]); put(hx, hy + 4, HAT[2])
    tail = 4 + (1 if run or frame in ('up', 'fall') else 0) + (2 if wind else 0)
    lift = {'up': 1, 'fall': -1}.get(frame, 0)
    for k in (0, 1):
        for i in range(tail):
            wv = 0 if not run else (1 if ((frame + i + k * 2) % 4) < 2 else 0)
            y = hy + 4 + k * 2 + (i // 2) - lift * (i // 3) - (wv if i > 1 else 0)
            put(hx - 1 - i, y, HAT[2] if k else HAT[1])

    # ---------------- 近侧手臂与道具
    ay = sh + 1
    if pose == 'book':
        # 前臂端着书卷：袖口 + 手 + 卷轴（纸面、两端红轴头）
        sleeve_arm(bx + 1, ay, bx + 3, ay + 3, [L, M, D, DD], hand=False, wide=3)
        put(bx + 5, ay + 2, SKIN[1]); put(bx + 5, ay + 3, SKIN[2])
        for x in range(bx + 4, bx + 9):
            put(x, ay, PAPER[0] if x < bx + 7 else PAPER[1])
            put(x, ay + 1, PAPER[1] if x < bx + 7 else PAPER[2])
        put(bx + 4, ay - 1, SCROLL[1]); put(bx + 4, ay + 2, SCROLL[2])
        put(bx + 9, ay, SCROLL[1]); put(bx + 9, ay + 1, SCROLL[2])
        put(bx + 5, ay, PAPER[2]); put(bx + 6, ay + 1, PAPER[3])     # 字迹
    elif pose == 'back':
        # 一手背在腰后，另一手随步子摆在身前
        sleeve_arm(bx - 3, ay + 1, bx - 6, ay + 4, [M, D, DD, DD], hand=False)
        put(bx - 6, ay + 5, SKIN[2])
        if run:
            sleeve_arm(bx + 1, ay, bx + 1 + swing * 0.5, ay + 5, [L, M, D, DD])
        else:
            sleeve_arm(bx + 1, ay, bx + 2, ay + 5, [L, M, D, DD])
    elif pose == 'umbrella':
        # 举伞：手在胸前，竹柄斜上，油纸伞面有伞骨和明暗
        sleeve_arm(bx + 1, ay, bx + 3, ay - 1, [L, M, D, DD], hand=False, wide=2)
        put(bx + 4, ay - 2, SKIN[1]); put(bx + 5, ay - 2, SKIN[2])
        pole = hexc('#7a5a34')
        ut = top - 8 + (0 if bob < 0 else 1)
        for y in range(ut + 6, ay):
            put(bx + 4, y, pole)
        U = ramp('#ffb08c', '#e8604a', '#b83c30', '#7a2228')
        RIB = hexc('#f4d8a0')
        canopy = [
            "........ddd........",
            "......dcbbbcd......",
            "....dcbaabbbccd....",
            "..dcbaabbbbbbccdd..",
            ".dcbabbbbbbbbbccdd.",
            "dddrdddddrddddrdddd",
            "r.......r.......r..",
        ]
        cc = {'a': U[0], 'b': U[1], 'c': U[2], 'd': U[3], 'r': RIB}
        for j, row in enumerate(canopy):
            for i, ch in enumerate(row):
                if ch != '.':
                    put(bx + 4 - 9 + i, ut + j, cc[ch])
        put(bx + 4, ut - 1, pole)
    elif cloak:
        # 斗篷里伸出一只手拢着前襟
        put(bx + 3, ay + 3, SKIN[1]); put(bx + 3, ay + 4, SKIN[2])

    return sel_outline(cv.im)


TRAVELER_ROWS = [('clear', 'book'), ('clear', 'back'), ('rain', 'umbrella'), ('fog', 'back'), ('wind', 'back'), ('snow', 'cloak'), ('wind', 'book')]
TRAVELER_COLS = [0, 1, 2, 3, 4, 5, 6, 7, 'up', 'fall', 'land', 'idle0', 'idle1']


if __name__ == '__main__':
    import sys
    from PIL import Image
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/trav.png'
    sheet = Image.new('RGBA', (FW * len(TRAVELER_COLS), FH * len(TRAVELER_ROWS)), (120, 140, 150, 255))
    for r, (o, p) in enumerate(TRAVELER_ROWS):
        for c, f in enumerate(TRAVELER_COLS):
            im = traveler_frame(o, p, f)
            sheet.paste(im, (c * FW, r * FH), im)
    sheet.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(out)
