# 障碍、收集物、检查点 v4：明代样式重画。
# 做法和人物一致：每种材质 4 级色阶（暗部偏冷、亮部偏暖），光从右上来，外轮廓走同色系选择性描边。
# 画面比碰撞框略大：门楼的屋顶、货摊的布篷可以伸出去，但“挡路的那一块”（门扇、台面、石头）和碰撞框对齐。
import math
from pixelkit import Canvas, ramp, hexc
from props_art import (WOOD, GOLD, TILE, STONE, GREY, ICE, CLOTH, FIRE, MOSS, LEAF, ORANGE, PAPER,
                       lit, band, sphere)

VERM = ramp('#f4704e', '#d23a2a', '#9a2422', '#5c1420')      # 朱漆
INK = ramp('#5a5464', '#3a3644', '#26222e', '#16131c')       # 黑漆
GLZ = ramp('#9ad0b0', '#4f9a84', '#2f6a62', '#1c3c40')       # 青绿彩画
WALL = ramp('#fbf6ea', '#e6dccb', '#c3b6a2', '#8e8270')      # 粉墙
BRICK = ramp('#b6b2aa', '#8a8680', '#64605e', '#3e3c3e')     # 青砖
TAIHU = ramp('#d8dad2', '#a8aca4', '#767c78', '#4a4e50')     # 太湖石
BLUE = ramp('#9ec4e8', '#4a7cc0', '#2c4e8a', '#1a2c58')      # 青花
WARM = (255, 236, 170, 255)

ART = {}


def tiled_roof(cv, x0, x1, y, rows, rp=TILE, ridge=True, curl=2):
    """歇山式小屋顶：正脊 + 两端鸱吻，瓦垄竖纹，最下一排瓦当，檐角上翘。"""
    if ridge:
        cv.hline(x0 + rows, x1 - rows, y, rp[2])
        cv.hline(x0 + rows, x1 - rows, y + 1, rp[1])
        for ex, d in ((x0 + rows, -1), (x1 - rows, 1)):        # 鸱吻：向内卷的一小勾
            cv.put(ex, y - 1, rp[2]); cv.put(ex + d, y - 1, rp[1])
        y += 2
    for j in range(rows):
        a, b = x0 + rows - 1 - j, x1 - (rows - 1 - j)
        for x in range(a, b + 1):
            c = rp[1] if (x - a) % 2 else rp[2]
            if x > (a + b) * 0.62:
                c = rp[0] if (x - a) % 2 else rp[1]           # 右上受光
            if j == 0:
                c = rp[0] if x > (a + b) // 2 else rp[1]
            cv.put(x, y + j, c)
    yb = y + rows
    for x in range(x0, x1 + 1):                                 # 瓦当
        cv.put(x, yb, rp[3] if x % 2 else rp[2])
    for k in range(curl):                                       # 起翘
        cv.put(x0 - 1 - k, yb - 1 - k, rp[1]); cv.put(x1 + 1 + k, yb - 1 - k, rp[0])
    return yb


def painted_beam(cv, x0, x1, y, h=2):
    """额枋：青绿彩画，中间一点金。"""
    for x in range(x0, x1 + 1):
        cv.put(x, y, GLZ[0] if x > (x0 + x1) // 2 else GLZ[1])
        for k in range(1, h):
            cv.put(x, y + k, GLZ[2] if (x - x0) % 4 else GOLD[1])
    cv.put((x0 + x1) // 2, y, GOLD[0])


def drum_stone(cv, cx, y, flip=False):
    """抱鼓石：门两边的小圆鼓 + 座。"""
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5:
                c = band(lit(dx / 2.4, dy / 2.4), STONE, (0.6, 0.3, 0.0))
                cv.put(cx + dx, y + dy, c)
    cv.put(cx, y, STONE[2])
    cv.rect(cx - 2, y + 3, cx + 2, y + 4, STONE[1]); cv.hline(cx - 2, cx + 2, y + 4, STONE[2])


def steps(cv, x0, x1, y):
    cv.hline(x0 + 1, x1 - 1, y, STONE[0]); cv.hline(x0 + 1, x1 - 1, y + 1, STONE[1])
    cv.hline(x0, x1, y + 2, STONE[1]); cv.hline(x0, x1, y + 3, STONE[2])
    cv.put(x1 - 1, y, STONE[0]); cv.put(x0, y + 3, STONE[3])


# ---------------------------------------------------------------- 朱红宫门（夜里关）：门楼 + 门簪 + 九路门钉 + 铺首 + 抱鼓石
def door():
    W, H = 24, 50
    cv = Canvas(W, H)
    yb = tiled_roof(cv, 3, 20, 2, 4)
    painted_beam(cv, 4, 19, yb + 1, 3)
    top = yb + 4
    for y in range(top, H - 4):                                 # 门框立柱
        cv.put(5, y, VERM[2]); cv.put(6, y, VERM[1])
        cv.put(17, y, VERM[1]); cv.put(18, y, VERM[0])
    cv.hline(5, 18, top, VERM[2])
    cv.put(9, top + 1, GOLD[1]); cv.put(14, top + 1, GOLD[0])   # 门簪
    for y in range(top + 1, H - 4):                             # 两扇门
        for x in range(7, 17):
            c = VERM[1]
            if x >= 14:
                c = VERM[0] if (y - top) % 9 else VERM[1]
            if x == 7:
                c = VERM[2]
            if x in (11, 12):
                c = VERM[3] if x == 11 else VERM[2]           # 门缝
            cv.put(x, y, c)
        if (y - top) % 5 == 3 and y < H - 6:                   # 门钉
            for x in (8, 10, 13, 15):
                cv.put(x, y, GOLD[0] if x > 12 else GOLD[1])
    my = top + (H - 4 - top) // 2
    for x, rp in ((10, GOLD[2]), (13, GOLD[1])):               # 铺首衔环
        cv.put(x, my - 1, rp); cv.put(x - 1, my, rp); cv.put(x + 1, my, rp); cv.put(x, my + 1, rp)
        cv.put(x, my, VERM[3])
    cv.hline(7, 16, H - 5, WOOD[2])                            # 门槛
    drum_stone(cv, 3, H - 9); drum_stone(cv, 20, H - 9)
    steps(cv, 1, 22, H - 4)
    return cv.im
ART['door'] = door()


# ---------------------------------------------------------------- 黑漆院门（上锁，碰响铜铃才开）：粉墙小门楼 + 铜锁；开了是半掩的门扇 + 院里的光
def gate(open_):
    W, H = 24, 50
    cv = Canvas(W, H)
    yb = tiled_roof(cv, 2, 21, 4, 3, ridge=True, curl=1)
    for y in range(yb + 1, H - 4):                              # 两边一截粉墙
        for x in list(range(1, 5)) + list(range(19, 23)):
            c = WALL[1] if x < 19 else WALL[0]
            if x in (1, 19):
                c = WALL[2]
            if y == yb + 1:
                c = WALL[2]
            cv.put(x, y, c)
    for x in list(range(1, 5)) + list(range(19, 23)):
        cv.put(x, H - 5, WALL[3])
    painted_beam(cv, 5, 18, yb + 1, 2)
    top = yb + 3
    for y in range(top, H - 4):
        cv.put(5, y, INK[2]); cv.put(6, y, INK[1]); cv.put(17, y, INK[1]); cv.put(18, y, INK[0])
    cv.hline(5, 18, top, INK[3])
    if not open_:
        for y in range(top + 1, H - 4):
            for x in range(7, 17):
                c = INK[1]
                if x >= 14:
                    c = INK[0]
                if x == 7:
                    c = INK[2]
                if x in (11, 12):
                    c = INK[3]
                if (y - top) % 8 == 0:
                    c = INK[2] if x < 14 else INK[1]          # 门板的横带
                cv.put(x, y, c)
        my = top + (H - 4 - top) // 2
        for x in (10, 13):                                     # 门环
            cv.put(x, my - 2, GOLD[1]); cv.put(x - 1, my - 1, GOLD[2]); cv.put(x + 1, my - 1, GOLD[1]); cv.put(x, my, GOLD[2])
        cv.rect(10, my + 2, 13, my + 4, GOLD[1])               # 横挂的铜锁
        cv.hline(10, 13, my + 2, GOLD[0]); cv.hline(10, 13, my + 4, GOLD[2]); cv.put(11, my + 3, GOLD[3])
        cv.put(10, my + 1, GOLD[2]); cv.put(13, my + 1, GOLD[2])
    else:
        for y in range(top + 1, H - 4):                        # 门里：院子的暖光地面
            for x in range(9, 15):
                k = (y - top) / (H - 4 - top)
                c = (int(60 + 140 * k), int(40 + 110 * k), int(40 + 60 * k), 255)
                if y > H - 9:
                    c = (232, 200, 140, 255) if x > 10 else (200, 160, 110, 255)
                cv.put(x, y, c)
        for y in range(top + 1, H - 4):                        # 推开的两扇门，只剩窄窄的侧面
            cv.put(7, y, INK[2]); cv.put(8, y, INK[1]); cv.put(15, y, INK[0]); cv.put(16, y, INK[1])
            if (y - top) % 8 == 0:
                cv.put(8, y, INK[2]); cv.put(15, y, INK[1])
        cv.put(8, top + 12, GOLD[1]); cv.put(15, top + 12, GOLD[0])
    cv.hline(7, 16, H - 5, WOOD[2])
    steps(cv, 2, 21, H - 4)
    return cv.im
ART['gate'] = gate(False)
ART['gate_open'] = gate(True)


# ---------------------------------------------------------------- 货摊：竹架布篷（伸出台面）、酒旗、台上的青花碗与橘子、台下竹筐
def stall():
    W, H = 26, 32
    cv = Canvas(W, H)
    awn = [VERM, CLOTH]
    for j in range(5):                                          # 布篷：前低后高，条纹
        a, b = 1 + max(0, 3 - j), 24 - max(0, 2 - j)
        for x in range(a, b + 1):
            s = awn[((x - 1) // 3) % 2]
            c = s[1]
            if j == 0 or x > 19:
                c = s[0]
            if j == 4:
                c = s[2]
            cv.put(x, 4 + j, c)
    for x in range(1, 25):                                      # 垂下的荷叶边
        s = awn[((x - 1) // 3) % 2]
        if (x - 1) % 3 != 2:
            cv.put(x, 9, s[2])
        if (x - 1) % 3 == 1:
            cv.put(x, 10, s[3] if len(s) > 3 else s[2])
    cv.hline(3, 22, 3, WOOD[1])                                 # 篷顶的竹竿
    for y in range(3, H - 1):                                   # 竹竿立柱
        cv.put(6, y, WOOD[2]); cv.put(19, y, WOOD[1])
        if y % 5 == 0:
            cv.put(6, y, WOOD[3]); cv.put(19, y, WOOD[2])
    for y in range(0, 15):                                      # 酒旗：竖着挂在右边
        cv.put(23, y, WOOD[2])
    for y in range(1, 11):
        for x in range(24, 26):
            cv.put(x, y, PAPER[0] if x == 25 else PAPER[1])
    cv.put(24, 3, VERM[1]); cv.put(25, 4, VERM[1]); cv.put(24, 6, VERM[1]); cv.put(25, 7, VERM[2])
    cv.put(24, 11, PAPER[2])
    # 台面上的货
    for (bx, by) in ((8, 18), (10, 18), (9, 17)):               # 叠着的青花碗
        cv.hline(bx - 1, bx + 1, by, BLUE[2]); cv.put(bx + 1, by, BLUE[0])
        cv.put(bx, by - 1, CLOTH[0])
    for (x, y) in ((14, 18), (16, 18), (15, 17)):               # 一小堆橘子
        sphere(cv, x, y, 1.1, 1.1, ORANGE, (0.55, 0.2))
    cv.put(15, 16, LEAF[1])
    cv.put(12, 18, PAPER[0]); cv.put(12, 17, PAPER[1])          # 一只白瓷瓶
    cv.put(12, 16, BLUE[1])
    for x in range(6, 20):                                      # 台面
        cv.put(x, 19, WOOD[0] if x > 8 else WOOD[1])
        cv.put(x, 20, WOOD[2] if x > 8 else WOOD[3])
    for x in range(7, 19):                                      # 台前的蓝布围
        for y in range(21, 25):
            c = BLUE[2] if x < 16 else BLUE[1]
            if y == 24:
                c = BLUE[3]
            cv.put(x, y, c)
    cv.put(12, 22, BLUE[0]); cv.put(13, 22, BLUE[0])
    for (x0, x1) in ((8, 11), (14, 17)):                        # 台下竹筐
        for y in range(26, H - 1):
            for x in range(x0, x1 + 1):
                c = PAPER[2] if (x + y) % 2 else WOOD[1]
                if x == x1:
                    c = PAPER[1]
                cv.put(x, y, c)
        cv.hline(x0, x1, 26, PAPER[1])
    cv.hline(5, 20, H - 1, STONE[3])
    return cv.im
ART['stall'] = stall()


# ---------------------------------------------------------------- 堂鼓：朱漆鼓身、两圈泡钉、牛皮鼓面，四脚鼓架、鼓槌
def drum():
    W, H = 20, 27
    cv = Canvas(W, H)
    for x in range(3, 15):                                      # 鼓身（侧面看，中间鼓起）
        bulge = 1 if 5 <= x <= 12 else 0
        y0, y1 = 3 - bulge, 15 + bulge
        for y in range(y0, y1 + 1):
            ny = (y - 9) / 7.5
            c = band(lit(0.25, ny), VERM, (0.5, 0.15, -0.25))
            if x in (4, 13) and y % 2 == 0:
                c = GOLD[0] if y < 9 else GOLD[2]
            cv.put(x, y, c)
        cv.put(x, y0, VERM[0] if x > 6 else VERM[1])
    for x in range(5, 13):                                      # 鼓腰上一圈描金
        cv.put(x, 9, GOLD[1] if x > 8 else GOLD[2])
    for y in range(2, 17):                                      # 鼓面
        dy = (y - 9) / 7.2
        if abs(dy) > 1:
            continue
        hw = math.sqrt(1 - dy * dy) * 2.8
        for x in range(15 - int(hw), 15 + int(round(hw)) + 1):
            c = PAPER[1]
            if x >= 16 or y < 6:
                c = PAPER[0]
            if y > 13 or x <= 13:
                c = PAPER[2]
            cv.put(x, y, c)
    cv.put(15, 8, (232, 120, 90, 255)); cv.put(16, 8, (232, 120, 90, 255))   # 鼓心的朱红点
    for i in range(10):                                         # 鼓架
        y = 16 + i
        cv.put(4 + i * 0.5, y, WOOD[2]); cv.put(14 - i * 0.5, y, WOOD[1])
        cv.put(2 + i * 0.1, y, WOOD[2]); cv.put(16 - i * 0.1, y, WOOD[0])
    cv.hline(2, 16, 17, WOOD[1])
    for k in range(6):                                          # 斜靠的鼓槌
        cv.put(17 + k * 0.4, 12 + k, WOOD[1])
    cv.put(17, 11, VERM[1]); cv.put(18, 11, VERM[0])
    return cv.im
ART['drum'] = drum()


# ---------------------------------------------------------------- 烽火台：青砖台身（上收下放）、垛口、火盆、狼烟火焰两帧
def beacon(fr):
    W, H = 18, 36
    cv = Canvas(W, H)
    flames = [
        ["......a...", ".....aba..", "...a.abca.", "..abaabcba", "..bcbbccb.", ".abccdccba", "..cddddc.."],
        ["...a......", "..aba.a...", ".abcaaba..", ".bccbcbca.", "abcdccbcb.", ".bcddcdcb.", "..cddddc.."],
    ][fr]
    pal = {'a': FIRE[0], 'b': FIRE[1], 'c': FIRE[2], 'd': FIRE[3]}
    cv.bitmap(flames, 4, 0, pal)
    cv.hline(4, 13, 7, GREY[0]); cv.hline(4, 13, 8, GREY[2]); cv.put(13, 7, GREY[0])
    for x in range(2, 16):                                      # 垛口
        if (x - 2) % 3 != 2:
            cv.put(x, 9, BRICK[0] if x > 9 else BRICK[1]); cv.put(x, 10, BRICK[1] if x > 9 else BRICK[2])
    cv.hline(2, 15, 11, BRICK[2])
    for y in range(12, H - 2):                                  # 台身，往下略放
        k = (y - 12) // 8
        a, b = 3 - k, 14 + k
        for x in range(a, b + 1):
            row = (y - 12) // 2
            c = BRICK[1]
            if x >= b - 2:
                c = BRICK[0]
            if x <= a + 1:
                c = BRICK[2]
            if (y - 12) % 2 == 1 or (x + (row % 2) * 2) % 4 == 0:
                c = BRICK[2] if x < b - 2 else BRICK[1]       # 砖缝
            cv.put(x, y, c)
    cv.rect(7, H - 9, 10, H - 3, (30, 22, 26, 255))             # 拱形小门
    cv.hline(8, 9, H - 10, (30, 22, 26, 255))
    cv.put(10, H - 9, BRICK[0])
    steps(cv, 0, 17, H - 4)
    return cv.im
ART['beacon0'] = beacon(0)
ART['beacon1'] = beacon(1)


# ---------------------------------------------------------------- 矮障碍：石墩（带莲瓣纹）/ 太湖石 / 冰凌 / 玛尼堆
def block():
    cv = Canvas(10, 8)
    for y in range(1, 8):
        for x in range(0, 10):
            if (x, y) in ((0, 1), (9, 1)):
                continue
            c = GREY[1]
            if y <= 2 or x >= 7:
                c = GREY[0]
            if x <= 1 or y >= 6:
                c = GREY[2]
            if y == 7:
                c = GREY[3]
            cv.put(x, y, c)
    for x in range(1, 9, 2):                                    # 莲瓣纹
        cv.put(x, 4, GREY[2]); cv.put(x + 1, 3, GREY[2] if x < 6 else GREY[1])
    cv.hline(1, 8, 0, GREY[1]); cv.put(8, 0, GREY[0])
    cv.put(2, 1, MOSS[1]); cv.put(1, 2, MOSS[2]); cv.put(3, 1, MOSS[0])
    return cv.im
ART['block'] = block()


def rock():
    """太湖石：瘦、漏、透，几个洞，顶上一点苔。"""
    cv = Canvas(12, 10)
    sphere(cv, 5.5, 6.0, 5.4, 5.6, TAIHU, (0.7, 0.38, 0.05), clip=lambda x, y: y < 10)
    sphere(cv, 7.0, 2.6, 2.4, 2.6, TAIHU, (0.7, 0.38, 0.05))
    for (x, y) in ((4, 5), (7, 7), (3, 8)):                     # 孔洞：暗心 + 下沿亮
        cv.put(x, y, TAIHU[3]); cv.put(x + 1, y, TAIHU[3]); cv.put(x, y + 1, TAIHU[0])
    cv.put(8, 3, TAIHU[3])
    cv.put(6, 0, MOSS[0]); cv.put(7, 0, MOSS[1]); cv.put(5, 1, MOSS[2]); cv.put(2, 2, MOSS[1])
    return cv.im
ART['rock'] = rock()


def shard():
    cv = Canvas(12, 8)
    for (bx, h) in ((2, 6), (5, 8), (8, 5), (10, 3)):
        for y in range(8 - h, 8):
            k = (y - (8 - h)) / h
            hw = int(k * 1.8)
            for x in range(bx - hw, bx + hw + 1):
                c = ICE[1] if x >= bx else ICE[2]
                if x == bx + hw and x > bx:
                    c = ICE[0]
                if y >= 7:
                    c = ICE[3] if x < bx else ICE[2]
                cv.put(x, y, c)
        cv.put(bx, 8 - h, ICE[0])
        cv.put(bx, 8 - h + 1, ICE[0])
    return cv.im
ART['shard'] = shard()


def mani():
    cv = Canvas(13, 11)
    for y in range(0, 7):
        cv.put(7, y, WOOD[1])
    flags = [hexc('#3a6ab0'), hexc('#f4f1ea'), hexc('#c8302a'), hexc('#4f9a4a'), hexc('#e8c25a')]
    for i, c in enumerate(flags):
        cv.put(8 + i, 1 + i // 2, c); cv.put(8 + i, 2 + i // 2, c)
    for (x0, x1, y) in ((1, 11, 9), (2, 10, 8), (2, 9, 7), (3, 9, 6), (4, 8, 5), (5, 7, 4)):
        for x in range(x0, x1 + 1):
            c = STONE[1] if x < x1 - 1 else STONE[0]
            if x == x0:
                c = STONE[2]
            cv.put(x, y, c)
        if y in (8, 6):
            cv.put((x0 + x1) // 2, y, hexc('#4a6aa0')); cv.put((x0 + x1) // 2 + 1, y, hexc('#e8c25a'))
    for x in range(0, 13):
        cv.put(x, 10, STONE[2] if x else STONE[3])
    return cv.im
ART['mani'] = mani()


# ---------------------------------------------------------------- 收集物：红纱宫灯（金顶、竹骨、流苏），比旧版大一圈，远远就能看见
def lantern():
    W, H = 11, 16
    cv = Canvas(W, H)
    cv.put(5, 0, GOLD[2]); cv.hline(4, 6, 1, GOLD[1]); cv.hline(3, 7, 2, GOLD[2]); cv.put(7, 2, GOLD[0])
    for y in range(3, 11):
        hw = 4 if 5 <= y <= 8 else 3
        for x in range(5 - hw, 5 + hw + 1):
            dx = (x - 5) / (hw + 0.4)
            c = band(lit(dx, (y - 6.5) / 5), VERM, (0.6, 0.25, -0.2))
            if abs(x - 5) <= 1 and 4 <= y <= 9:
                c = FIRE[1] if y < 8 else FIRE[2]              # 烛光透出来
            if x in (2, 8) and 4 <= y <= 9:
                c = VERM[2] if x == 2 else VERM[1]            # 竹骨
            cv.put(x, y, c)
    cv.put(5, 6, FIRE[0]); cv.put(5, 5, WARM)
    cv.hline(3, 7, 11, GOLD[2]); cv.put(7, 11, GOLD[1])
    cv.put(5, 12, GOLD[1])
    for y in range(13, 16):                                     # 流苏
        cv.put(4, y, VERM[2]); cv.put(5, y, VERM[1]); cv.put(6, y, VERM[1])
    return cv.im
ART['lantern'] = lantern()


# ---------------------------------------------------------------- 检查点：龟趺石碑，碑首云纹，到了碑顶亮一盏小灯
def stele(lit_):
    W, H = 12, 21
    cv = Canvas(W, H)
    if lit_:
        cv.put(5, 0, FIRE[0]); cv.put(6, 0, FIRE[1]); cv.put(5, 1, FIRE[1]); cv.put(6, 1, FIRE[2])
    else:
        cv.put(5, 1, GOLD[3]); cv.put(6, 1, GOLD[3])
    cv.hline(4, 7, 2, GOLD[1] if lit_ else STONE[3])
    for y in range(3, 7):                                       # 圆首（云纹）
        hw = [2, 3, 4, 4][y - 3]
        for x in range(6 - hw, 6 + hw):
            c = STONE[1] if x < 7 else STONE[0]
            if x == 6 - hw:
                c = STONE[2]
            cv.put(x, y, c)
    cv.put(4, 4, STONE[3]); cv.put(7, 4, STONE[2]); cv.put(5, 5, STONE[2])
    for y in range(7, 15):                                      # 碑身
        for x in range(2, 10):
            c = STONE[1]
            if x >= 8:
                c = STONE[0]
            if x == 2:
                c = STONE[2]
            cv.put(x, y, c)
        if y % 2 == 1 and y < 14:
            cv.put(5, y, STONE[3]); cv.put(6, y, STONE[2])     # 一行刻字
    cv.hline(3, 8, 7, STONE[2])
    for y in range(15, 19):                                     # 龟趺
        for x in range(0, 12):
            dx, dy = (x - 5.5) / 6, (y - 18) / 3.6
            if dx * dx + dy * dy > 1:
                continue
            cv.put(x, y, band(lit(dx, dy), STONE, (0.6, 0.3, 0.0)))
    cv.put(11, 17, STONE[1]); cv.put(11, 16, STONE[0])          # 龟头
    for x in range(0, 12):
        cv.put(x, 19, STONE[2]); cv.put(x, 20, STONE[3])
    return cv.im
ART['stele'] = stele(False)
ART['stele_lit'] = stele(True)


# ---------------------------------------------------------------- 按键提示：宣纸底的小牌子，下沿一道朱红（按下去时会整体下沉一像素，在程序里做）
LET = {'S': ['111', '100', '111', '001', '111'], 'H': ['101', '101', '111', '101', '101'], 'I': ['111', '010', '010', '010', '111'],
       'F': ['111', '100', '110', '100', '100'], 'T': ['111', '010', '010', '010', '010']}


def keycap(glyph_w, draw_glyph):
    W, H = glyph_w + 6, 11
    cv = Canvas(W, H)
    for y in range(H):
        for x in range(W):
            if (x in (0, W - 1)) and y in (0, H - 1):
                continue
            c = PAPER[0]
            if y >= H - 3:
                c = PAPER[2] if y == H - 3 else VERM[2]       # 键帽侧面：朱红
            elif x == W - 1 or y == 0:
                c = (255, 252, 240, 255)
            elif x == 0:
                c = PAPER[1]
            cv.put(x, y, c)
    draw_glyph(cv, 3, 2)
    return cv.im


def _shift(cv, ox, oy):
    x = ox
    for ch in 'SHIFT':
        for r, row in enumerate(LET[ch]):
            for i, b in enumerate(row):
                if b == '1':
                    cv.put(x + i, oy + r, INK[2])
        x += 4


def _space(cv, ox, oy):
    cv.put(ox + 1, oy + 1, INK[2]); cv.put(ox + 1, oy + 2, INK[2]); cv.hline(ox + 1, ox + 18, oy + 3, INK[2])
    cv.put(ox + 18, oy + 1, INK[2]); cv.put(ox + 18, oy + 2, INK[2])


ART['k_shift'] = keycap(19, _shift)
ART['k_space'] = keycap(20, _space)


# ---------------------------------------------------------------- 蹴鞠：风流眼球门（两根朱漆杆、中间一张网、网上一个圆洞），鞠卡在洞口
LEATHER = ramp('#f0c878', '#c8904a', '#8a5a2c', '#4a2e18')


def cuju_ball():
    cv = Canvas(6, 6)
    sphere(cv, 2.5, 2.5, 2.6, 2.6, LEATHER, (0.65, 0.3, 0.0))
    cv.put(2, 1, LEATHER[3]); cv.put(3, 2, LEATHER[3]); cv.put(1, 3, LEATHER[3]); cv.put(3, 4, LEATHER[3])   # 皮块缝线
    return cv.im


def cuju_goal(with_ball):
    W, H = 15, 22
    cv = Canvas(W, H)
    for y in range(0, H - 2):                                   # 两根朱漆杆
        cv.put(1, y, VERM[2]); cv.put(2, y, VERM[1]); cv.put(12, y, VERM[1]); cv.put(13, y, VERM[0])
    cv.put(1, 0, GOLD[1]); cv.put(2, 0, GOLD[0]); cv.put(12, 0, GOLD[0]); cv.put(13, 0, GOLD[0])
    cv.hline(1, 13, 1, VERM[1]); cv.hline(3, 11, 1, VERM[0])     # 横杆
    for y in range(2, 13):                                      # 网
        for x in range(3, 12):
            if (x + y) % 2 == 0:
                cv.put(x, y, (232, 224, 204, 255) if x > 7 else (196, 186, 166, 255))
    for y in range(4, 9):                                       # 风流眼：网中间一个圆洞
        for x in range(5, 10):
            if (x - 7) ** 2 + (y - 6) ** 2 <= 5:
                cv.put(x, y, None) if False else None
                cv.im.putpixel((x, y), (0, 0, 0, 0))
    for (x, y) in ((5, 4), (9, 4), (4, 6), (10, 6), (5, 8), (9, 8), (7, 3), (7, 9)):
        cv.put(x, y, GOLD[2])
    if with_ball:
        cv.im.alpha_composite(cuju_ball(), (5, 4))
    cv.hline(0, 14, H - 2, STONE[1]); cv.hline(0, 14, H - 1, STONE[2])
    for x in (1, 13):                                           # 杆座
        cv.put(x - 1, H - 3, STONE[1]); cv.put(x + 1, H - 3, STONE[0])
    return cv.im


ART['cuju'] = cuju_goal(True)
ART['cuju_empty'] = cuju_goal(False)
ART['cuju_ball'] = cuju_ball()
