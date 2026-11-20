# 障碍、机关、收集物 v3：按材质色阶上色，光从右上来，外轮廓用同色系暗色描边。
# 尺寸和旧版一致（碰撞框不变），锚点在底边中点。
import math
from pixelkit import Canvas, ramp, hexc

WOOD = ramp('#c08a58', '#93623c', '#6a4228', '#43281a')
RED = ramp('#ff7a5a', '#d63c2e', '#9c2426', '#5e1420')
LACQ = ramp('#e85a44', '#b8302a', '#7c1e20', '#4a1018')
GOLD = ramp('#fff4b0', '#f0c858', '#b8862e', '#6e4a16')
TILE = ramp('#7a7c94', '#4e5068', '#33344a', '#1e1e2e')
STONE = ramp('#e2ded4', '#b4ada0', '#86807a', '#58534f')
GREY = ramp('#c8c6c2', '#9a9894', '#6e6c6a', '#454446')
ICE = ramp('#ffffff', '#c8ecfa', '#7fc0e4', '#4a86b8')
CLOTH = ramp('#ffffff', '#ece4d4', '#c8bca4', '#948670')
YAK = ramp('#6a5a5a', '#3e3434', '#282024', '#161216')
SKINH = ramp('#fff2c8', '#f0d090', '#c8a060', '#8a6a3a')
FIRE = ramp('#fffbe0', '#ffd860', '#ff8a2a', '#c8401c')
MOSS = ramp('#9ac060', '#6a9440', '#44682c')
LEAF = ramp('#a8d870', '#6aa848', '#3e7a34')
ORANGE = ramp('#ffd080', '#f0902c', '#b85a1c')
PAPER = ramp('#fff6dc', '#f0dcb0', '#c8ac7c')

L = (0.55, -0.7, 0.45)   # 光：右上前方


def lit(nx, ny, nz=None):
    if nz is None:
        nz = math.sqrt(max(0.0, 1 - nx * nx - ny * ny))
    return nx * L[0] + ny * L[1] + nz * L[2]


def band(v, rp, cuts=(0.75, 0.42, 0.1)):
    for i, c in enumerate(cuts):
        if v > c:
            return rp[i]
    return rp[min(len(rp) - 1, len(cuts))]


def sphere(cv, cx, cy, rx, ry, rp, cuts=(0.78, 0.45, 0.1), clip=None):
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            dx, dy = (x - cx) / rx, (y - cy) / ry
            if dx * dx + dy * dy > 1.0:
                continue
            if clip and not clip(x, y):
                continue
            cv.put(x, y, band(lit(dx * 0.9, dy * 0.9), rp, cuts))


def vcyl(cv, x0, x1, y0, y1, rp):
    """竖着的圆柱 / 柱子：按横向位置给明暗。"""
    w = max(1, x1 - x0)
    for x in range(x0, x1 + 1):
        nx = (x - x0) / w * 2 - 1
        c = band(lit(nx, 0), rp, (0.62, 0.3, 0.0))
        for y in range(y0, y1 + 1):
            cv.put(x, y, c)


def roof(cv, x0, x1, y, rows=3, rp=TILE):
    """小瓦檐：最上一行亮，屋檐两角起翘，瓦垄竖纹。"""
    for j in range(rows):
        a, b = x0 + (rows - 1 - j) - (1 if j == rows - 1 else 0), x1 - (rows - 1 - j) + (1 if j == rows - 1 else 0)
        for x in range(a, b + 1):
            c = rp[1]
            if j == 0:
                c = rp[0]
            elif (x - x0) % 2 == 0:
                c = rp[2]
            if j == rows - 1:
                c = rp[2] if x not in (a, b) else rp[1]
            cv.put(x, y + j, c)
    cv.put(x0 - 2, y + rows - 2, rp[1]); cv.put(x1 + 2, y + rows - 2, rp[1])   # 起翘


PROPS = {}

# ---------------------------------------------------------------- 宫门（夜里关）12×33
def door():
    cv = Canvas(12, 33)
    roof(cv, 2, 9, 0, 3)
    cv.rect(1, 3, 10, 3, WOOD[3])
    for x in range(1, 11):                                     # 门楣
        cv.put(x, 4, WOOD[1] if x > 2 else WOOD[2])
    for y in range(5, 31):
        for x in range(1, 11):
            plank = (x - 1) % 3
            c = WOOD[1] if plank == 1 else (WOOD[2] if plank == 0 else WOOD[1])
            if x >= 9:
                c = WOOD[0] if plank == 1 else WOOD[1]
            if x <= 2:
                c = WOOD[2]
            if x == 6:
                c = WOOD[3]                                   # 两扇门的门缝
            cv.put(x, y, c)
    for row in range(5):                                       # 门钉
        for col in (2, 4, 8, 10):
            y = 7 + row * 5
            if col in (2, 4, 8, 10):
                cv.put(col - 1 if col > 6 else col, y, GOLD[1] if col > 6 else GOLD[2])
    cv.put(5, 17, GOLD[0]); cv.put(7, 17, GOLD[0]); cv.put(5, 18, GOLD[2]); cv.put(7, 18, GOLD[2])   # 铺首衔环
    for x in range(0, 12):
        cv.put(x, 31, STONE[1] if x > 3 else STONE[2]); cv.put(x, 32, STONE[2] if x > 3 else STONE[3])
    return cv.im
PROPS['door'] = door()


# ---------------------------------------------------------------- 上锁的红门 13×35（开着时只剩门框）
def gate(open_):
    cv = Canvas(13, 35)
    roof(cv, 2, 10, 0, 3)
    cv.hline(1, 11, 3, LACQ[3]); cv.hline(1, 11, 4, LACQ[1])
    for y in range(5, 32):                                     # 门框立柱
        cv.put(1, y, LACQ[2]); cv.put(2, y, LACQ[1])
        cv.put(10, y, LACQ[1]); cv.put(11, y, LACQ[0])
    if not open_:
        for y in range(5, 32):
            for x in range(3, 10):
                c = LACQ[1] if x > 4 else LACQ[2]
                if x == 6:
                    c = LACQ[3]
                if x >= 8:
                    c = LACQ[0] if (y % 6) else LACQ[1]
                cv.put(x, y, c)
        for row in range(5):
            for x in (4, 8):
                cv.put(x, 7 + row * 5, GOLD[1] if x == 8 else GOLD[2])
        # 铜锁
        cv.rect(5, 17, 7, 19, GOLD[1]); cv.put(7, 17, GOLD[0]); cv.put(5, 19, GOLD[2]); cv.put(6, 18, GOLD[3])
        cv.put(5, 16, GOLD[2]); cv.put(7, 16, GOLD[2]); cv.put(6, 15, GOLD[2])
    else:
        for y in range(5, 32):                                 # 门洞里是暗的
            for x in range(3, 10):
                cv.put(x, y, (30, 18, 26, 215) if y > 6 else LACQ[3])
    for x in range(0, 13):
        cv.put(x, 32, STONE[1] if x > 3 else STONE[2]); cv.put(x, 33, STONE[2]); cv.put(x, 34, STONE[3])
    return cv.im
PROPS['gate'] = gate(False)
PROPS['gate_open'] = gate(True)


# ---------------------------------------------------------------- 货摊 16×25：条纹布篷、木台、果蔬、筐
def stall():
    cv = Canvas(16, 25)
    stripe = [RED, CLOTH]
    for j in range(5):                                         # 布篷，斜着往两边垂
        a, b = max(0, 6 - j * 2), min(15, 9 + j * 2)
        for x in range(a, b + 1):
            s = stripe[((x + 1) // 2) % 2]
            c = s[0] if j == 0 or x > 11 else s[1]
            if x < 4:
                c = s[2]
            cv.put(x, j, c)
    for x in range(16):                                        # 荷叶边
        s = stripe[((x + 1) // 2) % 2]
        cv.put(x, 5, s[2])
        if x % 2 == 0:
            cv.put(x, 6, s[2])
    for y in range(6, 25):                                     # 两根竹竿
        cv.put(1, y, WOOD[2]); cv.put(14, y, WOOD[1])
    # 果蔬：橘子、白菜、馒头
    for (x, y) in ((3, 12), (5, 12), (4, 11)):
        sphere(cv, x, y, 1.2, 1.2, ORANGE, (0.6, 0.2))
    for x in range(7, 10):
        cv.put(x, 11, LEAF[0] if x == 9 else LEAF[1]); cv.put(x, 12, LEAF[1] if x == 9 else LEAF[2])
    cv.put(8, 10, LEAF[0])
    for x in (11, 12):
        cv.put(x, 12, PAPER[0]); cv.put(x, 11, PAPER[0] if x == 12 else PAPER[1])
    cv.put(13, 12, PAPER[1])
    for x in range(0, 16):                                     # 台面
        cv.put(x, 13, WOOD[0] if x > 2 else WOOD[1])
        cv.put(x, 14, WOOD[2] if x > 2 else WOOD[3])
    # 台下两只竹筐
    for (x0, x1) in ((3, 6), (9, 12)):
        for y in range(18, 23):
            for x in range(x0, x1 + 1):
                c = SKINH[1] if (x + y) % 2 else SKINH[2]
                if x == x1:
                    c = SKINH[0] if (x + y) % 2 else SKINH[1]
                cv.put(x, y, c)
        cv.hline(x0, x1, 18, SKINH[0])
    cv.put(1, 24, WOOD[3]); cv.put(14, 24, WOOD[2])
    return cv.im
PROPS['stall'] = stall()


# ---------------------------------------------------------------- 战鼓 16×24：红漆鼓身、金钉、牛皮鼓面、木架
def drum():
    """侧面看的大鼓：红漆鼓身（中间鼓起）、两圈金钉、右边是受光的牛皮鼓面，下面交叉木架。"""
    cv = Canvas(16, 24)
    for x in range(2, 13):
        bulge = 1 if 4 <= x <= 10 else 0
        y0, y1 = 2 - bulge, 13 + bulge
        for y in range(y0, y1 + 1):
            ny = (y - 7.5) / 7
            c = band(lit(0.2, ny), LACQ, (0.5, 0.15, -0.25))
            if x in (3, 11) and y % 2 == 0:
                c = GOLD[1] if y < 9 else GOLD[2]             # 鼓钉
            cv.put(x, y, c)
        cv.put(x, y0, LACQ[0] if x > 4 else LACQ[1])
    for y in range(1, 15):                                     # 鼓面
        dy = (y - 7.5) / 6.8
        if abs(dy) > 1:
            continue
        hw = math.sqrt(1 - dy * dy) * 2.6
        for x in range(13 - int(hw), 13 + int(round(hw)) + 1):
            c = SKINH[1]
            if x >= 14 or y < 5:
                c = SKINH[0]
            if y > 11 or x <= 11:
                c = SKINH[2]
            cv.put(x, y, c)
    cv.put(14, 6, (255, 255, 240, 255))
    for i in range(9):                                         # 交叉木架
        y = 15 + i
        cv.put(2 + i * 0.9, y, WOOD[2]); cv.put(3 + i * 0.9, y, WOOD[1])
        cv.put(13 - i * 0.9, y, WOOD[1]); cv.put(12 - i * 0.9, y, WOOD[0])
    cv.put(1, 15, WOOD[2]); cv.put(14, 15, WOOD[1])
    return cv.im
PROPS['drum'] = drum()


# ---------------------------------------------------------------- 烽火台（夜里）：砖台 + 火盆 + 火焰（两帧）
def beacon(fr):
    cv = Canvas(12, 28)
    flames = [
        ["....a.......", "...aba..a...", "..abcba.ab..", "..bccbaabc..", ".abcdcbbcd..", "..cdddddc..."],
        [".......a....", "..a...aba...", "..ba.abcba..", ".abcabccb...", ".bcdbcdcba..", "..cdddddc..."],
    ][fr]
    pal = {'a': FIRE[0], 'b': FIRE[1], 'c': FIRE[2], 'd': FIRE[3]}
    cv.bitmap(flames, 0, 0, pal)
    for x in range(1, 11):                                     # 火盆
        cv.put(x, 6, GREY[0] if x > 3 else GREY[1]); cv.put(x, 7, GREY[2])
    for y in range(8, 25):                                     # 砖砌的台身，往下略宽
        a, b = 2 - (y - 8) // 9, 9 + (y - 8) // 9
        for x in range(a, b + 1):
            c = STONE[1]
            if x >= b - 1:
                c = STONE[0]
            if x <= a:
                c = STONE[2]
            if y % 3 == 0 or (x + (y // 3) * 2) % 4 == 0:
                c = STONE[2] if x < b - 1 else STONE[1]       # 砖缝
            cv.put(x, y, c)
    for x in range(0, 12):
        cv.put(x, 25, STONE[1] if x > 3 else STONE[2]); cv.put(x, 26, STONE[2]); cv.put(x, 27, STONE[3])
    return cv.im
PROPS['beacon0'] = beacon(0)
PROPS['beacon1'] = beacon(1)


# ---------------------------------------------------------------- 矮石块 / 山石 / 冰凌 / 玛尼堆 / 牦牛
def block():
    cv = Canvas(8, 7)
    for y in range(7):
        for x in range(8):
            if (x, y) in ((0, 0), (7, 0), (0, 6), (7, 6)):
                continue
            c = GREY[1]
            if y <= 1 or x >= 6:
                c = GREY[0]
            if x <= 1 or y >= 5:
                c = GREY[2]
            if y == 6 or x == 0:
                c = GREY[3]
            cv.put(x, y, c)
    cv.put(3, 3, GREY[2]); cv.put(4, 2, GREY[2])               # 一道裂纹
    cv.put(2, 0, MOSS[1]); cv.put(3, 0, MOSS[0]); cv.put(1, 1, MOSS[2])
    return cv.im
PROPS['block'] = block()


def rock():
    cv = Canvas(10, 8)
    sphere(cv, 4.6, 5.0, 4.8, 4.6, STONE, (0.72, 0.4, 0.05), clip=lambda x, y: y < 8)
    cv.put(3, 2, MOSS[1]); cv.put(4, 1, MOSS[0]); cv.put(5, 1, MOSS[1]); cv.put(2, 3, MOSS[2])
    cv.put(6, 5, STONE[3]); cv.put(7, 4, STONE[2])
    return cv.im
PROPS['rock'] = rock()


def shard():
    cv = Canvas(10, 7)
    for (bx, h) in ((2, 6), (6, 5), (8, 3), (4, 4)):
        for y in range(7 - h, 7):
            k = (y - (7 - h)) / h
            hw = int(k * 1.6)
            for x in range(bx - hw, bx + hw + 1):
                c = ICE[1] if x >= bx else ICE[2]
                if x == bx + hw and x > bx:
                    c = ICE[0]
                if y == 6:
                    c = ICE[3] if x < bx else ICE[2]
                cv.put(x, y, c)
        cv.put(bx, 7 - h, ICE[0])
    return cv.im
PROPS['shard'] = shard()


def mani():
    cv = Canvas(13, 11)
    # 一根木杆挂着五色经幡
    for y in range(0, 7):
        cv.put(7, y, WOOD[1])
    flags = [hexc('#3a6ab0'), hexc('#f4f1ea'), hexc('#c8302a'), hexc('#4f9a4a'), hexc('#e8c25a')]
    for i, c in enumerate(flags):
        cv.put(8 + i, 1 + i // 2, c); cv.put(8 + i, 2 + i // 2, c)
    # 叠起来的刻经石
    for (x0, x1, y) in ((1, 11, 9), (2, 10, 8), (2, 9, 7), (3, 9, 6), (4, 8, 5), (5, 7, 4)):
        for x in range(x0, x1 + 1):
            c = STONE[1] if x < x1 - 1 else STONE[0]
            if x == x0:
                c = STONE[2]
            cv.put(x, y, c)
        if y in (8, 6):
            cv.put((x0 + x1) // 2, y, hexc('#4a6aa0'))         # 刻的经文涂了蓝
    for x in range(0, 13):
        cv.put(x, 10, STONE[2] if x else STONE[3])
    return cv.im
PROPS['mani'] = mani()


def yak():
    cv = Canvas(19, 20)
    # 身体：一大团长毛，背上受光
    for y in range(3, 14):
        for x in range(1, 17):
            dx, dy = (x - 8.5) / 8.2, (y - 8.5) / 5.6
            if dx * dx + dy * dy > 1.05:
                continue
            c = band(lit(dx, dy), YAK, (0.62, 0.25, -0.1))
            if y >= 11 and (x + y) % 2 == 0:
                c = YAK[3]                                     # 垂下的长毛
            cv.put(x, y, c)
    for x in range(2, 16, 2):                                  # 毛边参差
        cv.put(x, 14, YAK[2]); cv.put(x + 1, 15, YAK[3])
    # 头 + 角 + 白鼻
    for y in range(4, 10):
        for x in range(14, 19):
            if (x - 16) ** 2 / 6 + (y - 7) ** 2 / 9 <= 1:
                cv.put(x, y, YAK[1] if x > 16 else YAK[2])
    cv.put(17, 9, CLOTH[2]); cv.put(18, 8, CLOTH[1])
    cv.put(17, 6, hexc('#f0e0c0'))                             # 眼睛的高光
    for (x, y, c) in ((14, 3, CLOTH[1]), (13, 2, CLOTH[0]), (13, 1, CLOTH[0]), (18, 3, CLOTH[1]), (18, 2, CLOTH[0])):
        cv.put(x, y, c)
    # 四条腿
    for lx in (3, 5, 11, 13):
        for y in range(14, 19):
            cv.put(lx, y, YAK[2] if lx in (3, 11) else YAK[1])
        cv.put(lx, 19, YAK[3])
    # 背上的红毯
    for x in range(6, 11):
        cv.put(x, 3, RED[1]); cv.put(x, 4, RED[2])
    cv.put(8, 3, GOLD[1])
    return cv.im
PROPS['yak'] = yak()


# ---------------------------------------------------------------- 铃架：铜铃 / 铜锣 / 转经筒
def bell():
    cv = Canvas(10, 16)
    for y in range(16):
        cv.put(0, y, WOOD[2]); cv.put(1, y, WOOD[1])
    for x in range(0, 9):
        cv.put(x, 0, WOOD[0]); cv.put(x, 1, WOOD[2])
    cv.put(7, 2, WOOD[3])
    for y in range(3, 10):                                     # 钟形
        k = (y - 3) / 6
        hw = 1 + int(k * 2.2)
        for x in range(7 - hw, 7 + hw + 1):
            nx = (x - 7) / (hw + 0.5)
            cv.put(x, y, band(lit(nx, -0.2), GOLD, (0.62, 0.3, 0.0)))
    cv.hline(4, 10, 10, GOLD[2])
    cv.put(7, 11, GOLD[3])
    return cv.im
PROPS['bell'] = bell()


def gong():
    cv = Canvas(11, 16)
    for y in range(16):
        cv.put(0, y, WOOD[2]); cv.put(10, y, WOOD[1])
    cv.hline(0, 10, 0, WOOD[0]); cv.hline(0, 10, 1, WOOD[2])
    for y in range(2, 11):
        for x in range(1, 10):
            dx, dy = (x - 5) / 4.3, (y - 6.5) / 4.3
            d = math.sqrt(dx * dx + dy * dy)
            if d > 1:
                continue
            c = band(lit(-dx * 0.6, -dy * 0.6, 0.8), GOLD, (0.72, 0.5, 0.25))
            if 0.55 < d < 0.72:
                c = GOLD[2]
            if d < 0.25:
                c = GOLD[0]
            cv.put(x, y, c)
    return cv.im
PROPS['gong'] = gong()


def wheel():
    cv = Canvas(9, 16)
    cv.put(4, 0, GOLD[0]); cv.hline(3, 5, 1, GOLD[1])
    for y in range(2, 11):
        for x in range(1, 8):
            c = band(lit((x - 4) / 3.5, 0), LACQ, (0.6, 0.25, -0.2))
            if y in (2, 10):
                c = GOLD[1] if x > 3 else GOLD[2]
            elif y % 3 == 0 and x % 2:
                c = GOLD[1] if x > 3 else GOLD[2]           # 金色六字真言
            cv.put(x, y, c)
    for y in range(11, 15):
        cv.put(4, y, WOOD[1])
    cv.hline(3, 5, 15, WOOD[2])
    return cv.im
PROPS['wheel'] = wheel()


# ---------------------------------------------------------------- 灯（收集物）8×11：红纱灯笼、金顶、流苏
def lantern():
    cv = Canvas(8, 11)
    cv.hline(3, 4, 0, GOLD[2]); cv.hline(2, 5, 1, GOLD[1])
    for y in range(2, 8):
        hw = 3 if 3 <= y <= 6 else 2
        for x in range(4 - hw, 4 + hw):
            dx = (x + 0.5 - 4) / hw
            c = band(lit(dx, (y - 4.5) / 4), RED, (0.6, 0.25, -0.2))
            if abs(dx) < 0.5 and 3 <= y <= 6:
                c = FIRE[1] if y < 6 else FIRE[2]           # 里头的烛光透出来
            if x in (2, 5) and 3 <= y <= 6:
                c = RED[2] if x == 2 else RED[1]            # 竹骨
            cv.put(x, y, c)
    cv.put(4, 4, FIRE[0])
    cv.hline(2, 5, 8, GOLD[1])
    cv.put(3, 9, GOLD[2]); cv.put(4, 9, GOLD[1]); cv.put(4, 10, RED[2]); cv.put(3, 10, RED[2])
    return cv.im
PROPS['lantern'] = lantern()


# ---------------------------------------------------------------- 检查点石碑：碑首、碑身刻字、龟趺；到了亮一盏灯
def stele(lit_):
    cv = Canvas(8, 15)
    if lit_:
        cv.put(3, 0, FIRE[0]); cv.put(4, 0, FIRE[1]); cv.put(3, 1, FIRE[1]); cv.put(4, 1, FIRE[2])
    else:
        cv.put(3, 1, GOLD[3]); cv.put(4, 1, GOLD[3])
    cv.hline(2, 5, 2, GOLD[2] if lit_ else STONE[3])
    for x in range(1, 7):                                      # 碑首
        cv.put(x, 3, STONE[0] if x > 2 else STONE[1])
    cv.hline(0, 7, 4, STONE[1]); cv.put(0, 4, STONE[2])
    for y in range(5, 12):
        for x in range(1, 7):
            c = STONE[1]
            if x >= 5:
                c = STONE[0]
            if x == 1:
                c = STONE[2]
            cv.put(x, y, c)
        if y % 2 == 0:
            cv.put(3, y, STONE[3]); cv.put(4, y, STONE[2])     # 刻字
    for x in range(0, 8):
        cv.put(x, 12, STONE[1] if x > 1 else STONE[2]); cv.put(x, 13, STONE[2]); cv.put(x, 14, STONE[3])
    return cv.im
DECO_STELE = {'stele': stele(False), 'stele_lit': stele(True)}


# ---------------------------------------------------------------- 铜钱：外圆内方，转动三帧
CO = ramp('#fff6b8', '#f4cc5c', '#c8902e', '#7a4e18')
def coin(fr):
    if fr == 2:
        cv = Canvas(1, 7)
        for y in range(7):
            cv.put(0, y, CO[1] if 1 <= y <= 5 else CO[2])
        return cv.im
    w = 7 if fr == 0 else 5
    cv = Canvas(w, 7)
    cx, rx = (w - 1) / 2, (w - 1) / 2 + 0.3
    for y in range(7):
        for x in range(w):
            dx, dy = (x - cx) / rx, (y - 3) / 3.3
            if dx * dx + dy * dy > 1:
                continue
            c = band(lit(dx, dy, 0.6), CO, (0.75, 0.45, 0.0))
            if dx * dx + dy * dy > 0.62:
                c = CO[2] if dx < 0.3 else CO[1]
            cv.put(x, y, c)
    hx = int(cx)
    cv.put(hx, 3, (0, 0, 0, 0))                                # 方孔
    if fr == 0:
        cv.put(hx - 1, 2, CO[3]); cv.put(hx, 2, CO[3]); cv.put(hx + 1, 2, CO[2])
        cv.put(hx - 1, 3, CO[3]); cv.put(hx + 1, 3, CO[1])
        cv.put(hx - 1, 4, CO[2]); cv.put(hx, 4, CO[1]); cv.put(hx + 1, 4, CO[1])
    else:
        cv.put(hx, 2, CO[3]); cv.put(hx, 4, CO[1])
    cv.put(int(cx) + 1, 1, CO[0])
    return cv.im
COINS = {'coin0': coin(0), 'coin1': coin(1), 'coin2': coin(2)}


# ---------------------------------------------------------------- 新机关：飞檐（升降平台）与编钟
def eave(w=30):
    """一段飞檐屋顶：两端起翘，琉璃瓦，下面一条红色檐枋，人可以站在瓦脊上。"""
    cv = Canvas(w, 8)
    GT = ramp('#9ae0d0', '#4aa898', '#2c7470', '#1a4848')   # 青琉璃瓦
    for x in range(w):
        cv.put(x, 1, GOLD[1] if x % 6 else GOLD[0])          # 屋脊
        cv.put(x, 0, GOLD[2] if x % 6 == 0 else (0, 0, 0, 0))
    for j in range(2, 5):
        for x in range(w):
            c = GT[1] if (x + j) % 3 else GT[2]
            if j == 2:
                c = GT[0] if x % 3 else GT[1]
            cv.put(x, j, c)
    for x in range(w):
        cv.put(x, 5, RED[1] if x > 2 else RED[2])
        cv.put(x, 6, RED[2] if x % 5 else GOLD[2])
    for x in (2, 6, 10, 14, 18, 22, 26):
        if x < w:
            cv.put(x, 7, WOOD[2])                             # 斗拱
    # 两端起翘
    for (x, y) in ((0, -1), (-1, -2)):
        pass
    return cv.im
PROPS['eave'] = eave(30)


def chime(fr):
    """编钟架：两根立柱、一根横梁，挂一排大小不一的铜钟；fr=1 时最右边那口被敲响，往外荡一点。"""
    cv = Canvas(22, 22)
    BR = ramp('#b8e0a8', '#5ea084', '#36705c', '#1e463c')   # 青铜
    for y in range(2, 22):
        cv.put(0, y, LACQ[2]); cv.put(1, y, LACQ[1]); cv.put(20, y, LACQ[1]); cv.put(21, y, LACQ[0])
    for x in range(0, 22):
        cv.put(x, 1, LACQ[0] if x > 3 else LACQ[1]); cv.put(x, 2, LACQ[2])
    cv.put(0, 0, GOLD[1]); cv.put(21, 0, GOLD[1])
    for i, (x, h) in enumerate(((4, 10), (8, 9), (12, 8), (16, 6))):
        sw = 1 if (fr and i == 3) else 0
        cv.put(x, 3, WOOD[3]); cv.put(x + sw, 4, WOOD[3])
        for y in range(5, 5 + h):
            k = (y - 5) / max(1, h - 1)
            hw = 1 + int(k * 1.6)
            for xx in range(x - hw, x + hw + 1):
                c = band(lit((xx - x) / (hw + 0.5), -0.2), BR, (0.6, 0.3, 0.0))
                if (y - 5) % 3 == 1 and xx != x + hw:
                    c = GOLD[2]                                # 钟上的枚
                cv.put(xx + sw, y, c)
    cv.hline(2, 19, 17, LACQ[2])
    for x in range(1, 21):
        cv.put(x, 21, STONE[2])
    return cv.im
PROPS['chime0'] = chime(0)
PROPS['chime1'] = chime(1)


# ---------------------------------------------------------------- 踩拍判定字：妙 / 好（用文泉驿点阵正黑 12px 渲成像素字，再上色）
def judge_glyph(ch, rp):
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 12, index=1)
    m = Image.new('L', (14, 14), 0)
    d = ImageDraw.Draw(m); d.fontmode = '1'; d.text((0, -1), ch, font=f, fill=255)
    bb = m.getbbox(); m = m.crop(bb)
    cv = Canvas(m.width, m.height)
    mp = m.load()
    for y in range(m.height):
        for x in range(m.width):
            if mp[x, y]:
                k = y / max(1, m.height - 1)
                cv.put(x, y, rp[0] if k < 0.3 else rp[1] if k < 0.7 else rp[2])
    return cv.im


JUDGE = {}
try:
    JUDGE['j_miao'] = judge_glyph('妙', GOLD)
    JUDGE['j_hao'] = judge_glyph('好', ramp('#ffffff', '#d8ecff', '#9ac0e8'))
except OSError:
    pass
