# 借景 · 五张图集（全部代码逐像素画，只用 12 色调色板，索引色 PNG，0 号透明）。
#   char_traveler.png       16×16 × 18 帧：待机 4、步行 8、跳落 4、推景 1、点灯鞠躬 1
#   tiles_walkable.png      16×16 网格：近层石板/台阶/封死墨块，中层回廊地/三段石拱，远层栈道，第三卷流云
#   props_architecture.png  月洞门 48×64、漏窗 32×32（中间纯透明镂空）、乌篷船 32×16、石灯笼 16×24（熄/亮两帧+闪）、六角亭、马头墙、点叶垂柳
#   env_landscape.png       320×60 可循环远山、三块披麻皴山石、24×120 瀑布 4 帧
#   ui_ink_seals.png        24×24 题名朱印、12×12 过关小印、16×16 无字图标（Shift 键帽、左右滑、滚轮）
#   ui_titles.png           每一景的景名（Fusion Pixel 12 像素字，无抗锯齿）+ 一行英文小字
# 每个部件在图集里的位置写进 data/atlas.json，关卡烘焙（art.py）和游戏运行时都按名字取。
# 分层笔法：远层只用淡墨 1 像素线、不抖色；中层 #55555C 平涂 + 1 像素亮/暗边；近层 2 像素焦墨描边 + 4×4 抖色。
import json, math, os
from PIL import Image, ImageDraw, ImageFont

from pix import Cv, rnd, hash01, OUT, ROOT

ATLAS = {}


def reg(sheet, name, x, y, w, h, **kw):
    ATLAS.setdefault(sheet, {})[name] = dict(x=x, y=y, w=w, h=h, **kw)


# ============================================================ 旅人
# 焦墨剪影，纸白斗笠（墨边），背一把收起的朱红油纸伞（4×6）作视觉重心。朝右。
def traveler_frame(bob=0, lean=0, legs=(6, 9), hem=0, arm=None, bow=0, air=0, umb=0):
    cv = Cv(16, 16)
    oy = bob
    hx = lean + (2 if bow else 0)
    hy = oy + bow
    # 斗笠：圆锥形，纸白，墨边
    hat = ["......55......",
           "....55ww55....",
           "..55wwwwww55..",
           ".555555555555."]
    for r, row in enumerate(hat):
        for c, ch in enumerate(row):
            if ch == '5':
                cv.put(1 + c + hx, 3 + r + hy, 'ink5')
            elif ch == 'w':
                cv.put(1 + c + hx, 3 + r + hy, 'paper')
    # 脸（帽檐下一点纸白）与颈
    cv.put(8 + hx, 7 + hy, 'ink5'); cv.put(9 + hx, 7 + hy, 'paper'); cv.put(10 + hx, 7 + hy, 'paper2')
    cv.put(8 + hx, 8 + hy, 'ink5'); cv.put(9 + hx, 8 + hy, 'ink5')
    # 身子（袍），往下渐宽；鞠躬时上身前倾
    body = [(7, 10), (6, 10), (6, 11), (6, 11), (5, 11), (5, 12)]
    for i, (a, b) in enumerate(body):
        y = 8 + i + oy
        sh = (2 - i // 2) if bow and i < 4 else 0
        for x in range(a + sh + (lean if i < 2 else 0), b + sh + 1):
            cv.put(x, y, 'ink5')
        cv.put(a + sh, y, 'ink4')                  # 背光一侧稍淡
    # 下摆与脚
    hy2 = 14 + oy
    if air:
        cv.rect(5, hy2 - 1, 7, 1, 'ink5')
        cv.put(legs[0], hy2, 'ink5'); cv.put(legs[1], hy2, 'ink5')
    else:
        for x in range(5 - hem, 12 + hem):
            cv.put(x, hy2, 'ink5' if 5 <= x <= 11 else 'ink4')
        for fx in legs:
            cv.put(fx, 15 + oy if oy <= 0 else 15, 'ink5'); cv.put(fx + 1, 15 + oy if oy <= 0 else 15, 'ink5')
    # 手：推景时伸出去
    if arm:
        for (x, y) in arm:
            cv.put(x, y + oy, 'ink5')
        ax, ay = arm[-1]
        cv.put(ax + 1, ay + oy, 'paper2')
    # 背上的朱红伞（收起，斜背），4×6
    ux, uy = 3 + (lean if lean < 0 else 0), 7 + oy + bow
    for k in range(6):
        x = ux + (k >= 2) + (k >= 4) + (umb if k < 2 else 0)
        cv.put(x, uy + k, 'red'); cv.put(x + 1, uy + k, 'red' if k not in (0, 5) else None)
    cv.put(ux, uy - 1 + (0 if umb == 0 else 0), 'ink4')          # 伞尖
    cv.put(ux + 3, uy + 6, 'ink4')                                  # 伞柄
    return cv


def build_traveler():
    F = []
    # 待机 4：呼吸（上下 1 像素）+ 伞尖轻晃
    F += [traveler_frame(0), traveler_frame(0, umb=0), traveler_frame(1), traveler_frame(1, umb=0)]
    # 步行 8
    steps = [(4, 10), (5, 9), (6, 8), (7, 7), (10, 4), (9, 5), (8, 6), (7, 7)]
    for i, lg in enumerate(steps):
        F.append(traveler_frame(1 if i % 4 in (1, 2) else 0, legs=lg, hem=1 if i % 4 == 0 else 0))
    # 跳落 4：起、顶、落、着地
    F += [traveler_frame(-1, legs=(6, 9), air=1), traveler_frame(-2, legs=(5, 10), air=1),
          traveler_frame(-1, legs=(6, 10), air=1), traveler_frame(1, legs=(4, 11), hem=1)]
    # 推景：身子前倾，手前伸
    F.append(traveler_frame(1, lean=1, legs=(4, 10), hem=1, arm=[(11, 9), (12, 9), (13, 9)]))
    # 点灯鞠躬
    F.append(traveler_frame(1, legs=(6, 9), bow=2))
    sheet = Cv(128, 64)
    for i, f in enumerate(F):
        sheet.blit(f, (i % 8) * 16, (i // 8) * 16)
    sheet.save(os.path.join(OUT, 'char_traveler.png'))
    reg('char_traveler', 'frames', 0, 0, 16, 16, n=len(F), cols=8,
        idle=[0, 4], walk=[4, 8], hop=[12, 4], push=16, bow=17)


# ============================================================ 可走的墨块
def build_tiles():
    sh = Cv(160, 96)
    T = 16

    def tile(name, col, row, fn):
        c = Cv(T, T); fn(c); sh.blit(c, col * T, row * T); reg('tiles_walkable', name, col * T, row * T, T, T)

    # 近层石板：顶部 1 像素纸白 + 2 像素焦墨（可走面），下面石面抖色，2 像素描边在拼接时另画
    def slab(c):
        c.rect(0, 0, 16, 1, 'paper'); c.rect(0, 1, 16, 2, 'ink5')
        for y in range(3, 16):
            for x in range(16):
                c.put(x, y, 'paper2'); c.dither(x, y, 'ink1', 3 + y // 4)
        for x in range(16):
            c.put(x, 9, 'ink2' if hash01(x, 9) > 0.2 else None)
        c.put(7, 4, 'ink2'); c.put(7, 5, 'ink2'); c.put(7, 6, 'ink2'); c.put(7, 7, 'ink2'); c.put(7, 8, 'ink2')
        c.put(13, 10, 'ink2'); c.put(13, 11, 'ink2'); c.put(13, 12, 'ink2'); c.put(13, 13, 'ink2'); c.put(13, 14, 'ink2')
    tile('near_slab', 0, 0, slab)

    # 近层 4 像素台阶（4 级，每级高 4）
    def stair(c):
        for k in range(4):
            y0 = 12 - k * 4
            x0 = k * 4
            for x in range(x0, 16):
                c.put(x, y0, 'paper'); c.put(x, y0 + 1, 'ink5')
            for y in range(y0 + 2, 16):
                for x in range(x0, x0 + 4):
                    c.put(x, y, 'paper2'); c.dither(x, y, 'ink1', 6)
            for y in range(y0, 16):
                c.put(x0, y, 'ink5')
    tile('near_stair', 1, 0, stair)

    # 封死墨块（不可走的实心）：焦墨抖色
    def block(c):
        for y in range(16):
            for x in range(16):
                c.put(x, y, 'ink4'); c.dither(x, y, 'ink5', 10)
    tile('near_block', 2, 0, block)

    # 中层回廊地面：#55555C 平涂 + 1 像素亮边
    def corridor(c):
        c.rect(0, 0, 16, 1, 'paper'); c.rect(0, 1, 16, 2, 'ink3')
        c.rect(0, 3, 16, 1, 'ink2')
        for x in (0, 8):
            for y in range(4, 16):
                c.put(x + 3, y, 'ink3'); c.put(x + 4, y, 'ink2')
        c.rect(0, 8, 16, 1, 'ink3')
    tile('mid_corridor', 0, 1, corridor)

    # 中层三段式石拱桥：左、中、右
    def arch(part):
        def f(c):
            c.rect(0, 0, 16, 1, 'paper'); c.rect(0, 1, 16, 2, 'ink3')
            for x in range(16):
                gx = x + part * 16
                h = math.sqrt(max(0, 18 ** 2 - (gx - 24) ** 2))
                top = 4 + rnd(14 - h * 0.75)
                for y in range(3, 16):
                    if y < top:
                        c.put(x, y, 'ink3')
                    elif y == top:
                        c.put(x, y, 'ink2')         # 拱洞上沿的亮边
                c.put(x, 3, 'ink2')
        return f
    for i, nm in enumerate(['mid_arch_l', 'mid_arch_m', 'mid_arch_r']):
        tile(nm, 1 + i, 1, arch(i))

    # 远层单像素栈道：只有线
    def plank(c):
        for x in range(16):
            c.put(x, 0, 'paper'); c.put(x, 1, 'ink2'); c.put(x, 2, 'ink2')
            if x % 2 == 0:
                c.put(x, 5, 'ink1')
        for y in range(3, 16):
            c.put(4, y, 'ink1'); c.put(12, y, 'ink1')
        c.line(4, 5, 8, 9, 'ink1'); c.line(12, 5, 8, 9, 'ink1')
    tile('far_plank', 0, 2, plank)

    # 第三卷流云（远层）：只用淡墨线
    def cloud(c):
        pts = [(0, 6), (3, 3), (7, 2), (10, 4), (13, 2), (15, 5)]
        for i in range(1, len(pts)):
            c.line(pts[i - 1][0], pts[i - 1][1] + 4, pts[i][0], pts[i][1] + 4, 'ink1')
        for x in range(1, 15, 3):
            c.put(x, 11, 'ink1')
        c.line(2, 9, 6, 9, 'ink1'); c.line(9, 10, 13, 10, 'ink1')
    tile('far_cloud', 1, 2, cloud)
    sh.save(os.path.join(OUT, 'tiles_walkable.png'))


# ============================================================ 建筑与道具
def flood_inside(cv, sx, sy):
    """从 (sx,sy) 起在透明像素里填充，返回镂空区域（用来在墙上开洞）。"""
    seen = set(); st = [(sx, sy)]
    while st:
        x, y = st.pop()
        if (x, y) in seen or not (0 <= x < cv.w and 0 <= y < cv.h) or cv.get(x, y):
            continue
        seen.add((x, y))
        st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return seen


def moon_gate():
    """月洞门 48×64：近层，2 像素焦墨圈 + 1 像素青砖亮边，底部是门槛石；圈里纯透明。"""
    c = Cv(48, 64)
    cx, cy, r = 23.5, 37.5, 24.0          # 圆心压低，圆的下缘被门槛截平（人从圈里走过去）
    for y in range(64):
        for x in range(48):
            d = math.hypot(x - cx, y - cy)
            if y >= 58:
                continue
            if r - 2 <= d <= r:
                c.put(x, y, 'ink5')
            elif r - 3 <= d < r - 2:
                c.put(x, y, 'ink2')
    # 门槛石
    for x in range(0, 48):
        c.put(x, 58, 'ink5'); c.put(x, 59, 'ink4')
    for x in range(48):
        if (x // 4) % 2 == 0:
            c.put(x, 60, 'ink3')
    return c


def lattice_window():
    """漏窗 32×32：近层，2 像素焦墨方框 + 四角回纹；中间纯透明。"""
    c = Cv(32, 32)
    for i in range(32):
        for t in (0, 1):
            c.put(i, t, 'ink5'); c.put(i, 31 - t, 'ink5'); c.put(t, i, 'ink5'); c.put(31 - t, i, 'ink5')
        c.put(i, 2, 'ink2') if 2 <= i <= 29 else None
    # 四角回纹（向里伸 4 像素的小折线，不挡中间）
    for (ox, oy, sx, sy) in ((2, 2, 1, 1), (29, 2, -1, 1), (2, 29, 1, -1), (29, 29, -1, -1)):
        for k in range(5):
            c.put(ox + sx * k, oy + sy * 3, 'ink5')
            c.put(ox + sx * 3, oy + sy * k, 'ink5')
        c.put(ox + sx * 1, oy + sy * 1, 'ink4')
    return c


def wupeng_boat():
    """乌篷船 32×16：中层，#55555C 船身平涂 + 1 像素亮边，乌篷，船下一道 1 像素石青水波。"""
    c = Cv(32, 16)
    deck = 8
    for x in range(32):
        t = x / 31
        bottom = deck + 2 + rnd(3 * math.sin(math.pi * t))
        top = deck if 3 <= x <= 28 else deck - 1 - (1 if x in (0, 31) else 0)
        for y in range(top, bottom + 1):
            c.put(x, y, 'ink3')
        c.put(x, top, 'ink2')
    cx, r = 9, 6
    for x in range(cx - r, cx + r + 1):
        h = rnd(math.sqrt(max(0, r * r - (x - cx) ** 2)))
        for y in range(deck - h, deck):
            c.put(x, y, 'ink4')
        c.put(x, deck - h, 'ink2')
    for x in range(1, 31):
        if hash01(x, 7) < 0.6:
            c.put(x, 14, 'jade')
    return c


def stone_lantern(lit, flick=0):
    """石灯笼 16×24：近层焦墨 2 像素描边；熄灭时火窗是墨，点亮时火窗淡金，外沿两点金。"""
    c = Cv(16, 24)
    # 宝珠
    c.put(7, 0, 'ink5'); c.put(8, 0, 'ink5'); c.rect(7, 1, 2, 1, 'ink4')
    # 笠（屋顶，两角上翘）
    for x in range(2, 14):
        c.put(x, 3, 'ink5'); c.put(x, 4, 'ink5')
    for x in range(4, 12):
        c.put(x, 2, 'ink4')
    c.put(1, 2, 'ink5'); c.put(14, 2, 'ink5')
    # 火袋
    for y in range(5, 12):
        for x in range(4, 12):
            c.put(x, y, 'paper2')
        c.put(4, y, 'ink5'); c.put(5, y, 'ink5'); c.put(10, y, 'ink5'); c.put(11, y, 'ink5')
    for y in range(6, 11):
        for x in range(6, 10):
            if lit:
                c.put(x, y, 'gold' if (x + y + flick) % 5 else 'paper')
            else:
                c.put(x, y, 'ink4')
    if lit:
        c.put(7, 8, 'red'); c.put(8, 9 - flick, 'red')
    c.rect(3, 12, 10, 2, 'ink5')
    # 竿
    for y in range(14, 21):
        c.put(6, y, 'ink5'); c.put(7, y, 'ink4'); c.put(8, y, 'ink4'); c.put(9, y, 'ink5')
        c.dither(7, y, 'ink2', 6)
    # 基座
    c.rect(3, 21, 10, 3, 'ink4')
    for x in range(3, 13):
        c.put(x, 21, 'ink5'); c.dither(x, 23, 'ink5', 10)
    c.put(3, 22, 'ink5'); c.put(12, 22, 'ink5')
    return c


def hex_pavilion():
    """六角亭 48×44：近层，2 像素焦墨，攒尖顶，两柱，坐凳栏杆抖色。"""
    c = Cv(48, 44)
    # 宝顶
    c.rect(23, 0, 2, 3, 'ink5')
    # 攒尖顶（两条凹曲线 + 翘角）
    for x in range(2, 46):
        t = abs(x - 23.5) / 21.5
        y = rnd(3 + 13 * (t ** 1.4))
        c.put(x, y, 'ink5'); c.put(x, y + 1, 'ink5')
        for yy in range(y + 2, 17):
            c.put(x, yy, 'ink4'); c.dither(x, yy, 'ink5', 6)
    c.put(1, 14, 'ink5'); c.put(0, 13, 'ink5'); c.put(46, 14, 'ink5'); c.put(47, 13, 'ink5')
    c.rect(4, 17, 40, 2, 'ink5')
    # 挂落
    for x in range(8, 40, 3):
        c.put(x, 19, 'ink4')
    # 柱
    for px in (8, 38):
        c.rect(px, 19, 2, 25, 'ink5')
    # 坐凳栏杆
    c.rect(8, 34, 32, 2, 'ink5')
    for x in range(10, 38):
        for y in range(36, 44):
            c.dither(x, y, 'ink3', 4)
    return c


def horse_head_wall():
    """马头墙 64×36：近层，白墙（纸色）+ 黑瓦阶梯墙头，2 像素描边，墙脚抖色。"""
    c = Cv(64, 36)
    for x in range(0, 64):
        for y in range(14, 36):
            c.put(x, y, 'paper')
            if y > 30:
                c.dither(x, y, 'ink1', (y - 30) * 2)
    for y in range(14, 36):
        c.put(0, y, 'ink5'); c.put(1, y, 'ink4'); c.put(63, y, 'ink5'); c.put(62, y, 'ink4')
    steps = [(0, 12, 12), (12, 40, 6), (40, 64, 12)]   # 三段墙头，中间高
    steps = [(0, 14, 10), (14, 50, 3), (50, 64, 10)]
    for (a, b, top) in steps:
        for x in range(a, b):
            c.put(x, top, 'ink5'); c.put(x, top + 1, 'ink5')
            if x % 2 == 0:
                c.put(x, top - 1, 'ink4')
            for y in range(top + 2, 14):
                c.put(x, y, 'paper')
        c.put(a, top - 1, 'ink5'); c.put(b - 1, top - 2, 'ink5')
        for y in range(top, 15):
            c.put(a, y, 'ink5'); c.put(b - 1, y, 'ink5')
    return c


def dotted_willow():
    """点叶垂柳 40×56：近层，2 像素焦墨干，柳丝用点叶抖色。"""
    c = Cv(40, 56)
    x0 = 20
    for y in range(12, 56):
        sw = rnd(math.sin(y / 8.0) * 1.2)
        c.put(x0 + sw, y, 'ink5'); c.put(x0 + sw + 1, y, 'ink4')
    for i, (bx, by, L) in enumerate([(-14, 10, 30), (-8, 5, 36), (-2, 2, 40), (5, 4, 36), (11, 8, 28), (16, 13, 22), (-18, 16, 20)]):
        c.line(x0, 14, x0 + bx, by, 'ink4')
        for k in range(L):
            xx = x0 + bx + rnd(math.sin(k / 6.0 + i) * 1.3)
            yy = by + k
            if yy > 52:
                break
            if k % 2 == 0:
                c.put(xx, yy, 'ink3' if k < L * 0.6 else 'ink2')
            if k % 5 == 2:
                c.put(xx + 1, yy, 'ink4')
    return c


def build_props():
    sh = Cv(256, 192)
    items = [
        ('moon_gate', moon_gate(), 0, 0),
        ('lattice_window', lattice_window(), 48, 0),
        ('boat', wupeng_boat(), 48, 32),
        ('lantern_off', stone_lantern(False), 80, 0),
        ('lantern_on', stone_lantern(True, 0), 96, 0),
        ('lantern_on2', stone_lantern(True, 1), 112, 0),
        ('pavilion', hex_pavilion(), 128, 0),
        ('horse_wall', horse_head_wall(), 0, 64),
        ('willow', dotted_willow(), 64, 64),
    ]
    holes = {}
    for name, c, x, y in items:
        sh.blit(c, x, y)
        reg('props_architecture', name, x, y, c.w, c.h)
    # 光晕（点亮的灯笼后面），24×24
    halo = Cv(24, 24)
    for yy in range(24):
        for xx in range(24):
            d = math.hypot(xx - 11.5, yy - 11.5)
            if d < 11.5:
                halo.dither(xx, yy, 'gold', int(max(0, 10 - d)))
    sh.blit(halo, 176, 0); reg('props_architecture', 'halo', 176, 0, 24, 24)
    sh.save(os.path.join(OUT, 'props_architecture.png'))
    return {n: c for n, c, _, _ in items}


# ============================================================ 山水
def build_env():
    sh = Cv(320, 180)
    # 320×60 可循环远山：两端高度相同，横向无缝；淡墨 1 像素山脊 + 阴面短皴，山脚留白
    def ridge(x, seed, amp, base):
        t = x / 320 * 2 * math.pi
        return base - amp * (0.5 + 0.30 * math.sin(t * 2 + seed) + 0.15 * math.sin(t * 5 + seed * 2) + 0.05 * math.sin(t * 11 + seed))
    for band, (seed, amp, base) in enumerate([(1.3, 36, 52), (4.1, 22, 58)]):
        prev = None
        for x in range(321):
            y = rnd(ridge(x % 320, seed, amp, base))
            if prev is not None and x <= 320:
                sh.line(x - 1, prev, min(319, x), y, 'ink1' if band == 0 else 'ink2')
            prev = y
            if band == 1 and hash01(x, 3) < 0.12:
                sh.line(x % 320, y + 2, x % 320 - 1, y + 4, 'ink1')
    reg('env_landscape', 'mountains', 0, 0, 320, 60)

    # 三块披麻皴山石（远层用：只用淡墨线），各 40×32
    for i in range(3):
        c = Cv(40, 32)
        pts = []
        for k in range(13):
            an = math.pi + k / 12 * math.pi
            r = 16 + 5 * hash01(i, k) - (3 if k in (4, 8) else 0)
            pts.append((20 + math.cos(an) * r * 1.1, 30 + math.sin(an) * r * (1.6 + i * 0.2)))
        for k in range(1, len(pts)):
            c.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], 'ink2')
        # 披麻皴：顺着山势的长弧线
        for s in range(6 + i * 2):
            sx = 6 + s * 4 + rnd(hash01(i, s) * 3)
            sy = 30 - rnd(hash01(s, i) * 10)
            for k in range(8):
                c.put(sx + rnd(math.sin(k / 3 + s) * 1.5), sy - k * 1.6, 'ink1')
        sh.blit(c, i * 40, 60)
        reg('env_landscape', 'rock%d' % i, i * 40, 60, 40, 32)

    # 瀑布 24×120 × 4 帧（第三卷），远层：两条岸线 + 往下错行的水纹
    for f in range(4):
        c = Cv(24, 120)
        for y in range(120):
            c.put(2 + rnd(math.sin(y / 9) * 1), y, 'ink2'); c.put(21 + rnd(math.sin(y / 11 + 1) * 1), y, 'ink2')
            for x in range(4, 20):
                if (y + f * 3 + x * 7) % 11 == 0 and hash01(x, y // 3) < 0.7:
                    c.put(x, y, 'ink1')
        for x in range(0, 24):
            if hash01(x, f) < 0.5:
                c.put(x, 118 - rnd(hash01(f, x) * 3), 'ink1')
        sh.blit(c, 120 + f * 24, 60)
        reg('env_landscape', 'fall%d' % f, 120 + f * 24, 60, 24, 120)
    sh.save(os.path.join(OUT, 'env_landscape.png'))


# ============================================================ 印章与图标
def build_ui(levels):
    sh = Cv(128, 96)
    # 24×24 题名朱印：朱砂底，留白的边不齐（像真印），中间刻一个回纹“景”字意象（不写字）
    c = Cv(24, 24)
    for y in range(24):
        for x in range(24):
            edge = x in (0, 23) or y in (0, 23)
            if edge and hash01(x, y, 1) < 0.3:
                continue
            c.put(x, y, 'red')
    for x in range(3, 21):
        c.put(x, 3, 'paper'); c.put(x, 20, 'paper')
    for y in range(3, 21):
        c.put(3, y, 'paper'); c.put(20, y, 'paper')
    for x in range(7, 17):
        c.put(x, 7, 'paper'); c.put(x, 11, 'paper')
    for y in range(7, 12):
        c.put(7, y, 'paper'); c.put(16, y, 'paper')
    for x in range(6, 18):
        c.put(x, 14, 'paper')
    c.line(11, 14, 7, 18, 'paper'); c.line(12, 14, 16, 18, 'paper')
    for (x, y) in ((5, 21), (18, 2), (21, 9)):
        c.put(x, y, None)
    sh.blit(c, 0, 0); reg('ui_ink_seals', 'title_seal', 0, 0, 24, 24)
    # 12×12 过关小印
    c = Cv(12, 12)
    for y in range(12):
        for x in range(12):
            if (x in (0, 11) or y in (0, 11)) and hash01(x, y, 2) < 0.3:
                continue
            c.put(x, y, 'red')
    for k in range(2, 10):
        c.put(k, 2, 'paper'); c.put(2, k, 'paper'); c.put(k, 9, 'paper'); c.put(9, k, 'paper')
    c.put(5, 5, 'paper'); c.put(6, 5, 'paper'); c.put(5, 6, 'paper'); c.put(6, 6, 'paper')
    sh.blit(c, 24, 0); reg('ui_ink_seals', 'clear_seal', 24, 0, 12, 12)
    # 16×16 Shift 键帽（淡墨圆角框 + 向上箭头）
    c = Cv(16, 16)
    for x in range(2, 14):
        c.put(x, 2, 'ink2'); c.put(x, 13, 'ink3')
    for y in range(3, 13):
        c.put(1, y, 'ink2'); c.put(14, y, 'ink3')
    for k in range(4):
        c.put(7 - k, 5 + k, 'ink3'); c.put(8 + k, 5 + k, 'ink3')
    c.rect(6, 9, 4, 1, 'ink3'); c.rect(6, 9, 1, 3, 'ink3'); c.rect(9, 9, 1, 3, 'ink3'); c.rect(6, 11, 4, 1, 'ink3')
    sh.blit(c, 40, 0); reg('ui_ink_seals', 'icon_shift', 40, 0, 16, 16)
    # 16×16 左右滑（两头箭头）
    c = Cv(16, 16)
    c.rect(2, 8, 12, 1, 'ink3')
    for k in range(3):
        c.put(2 + k, 8 - k, 'ink3'); c.put(2 + k, 8 + k, 'ink3'); c.put(13 - k, 8 - k, 'ink3'); c.put(13 - k, 8 + k, 'ink3')
    c.put(7, 5, 'gold'); c.put(8, 5, 'gold'); c.put(7, 11, 'gold'); c.put(8, 11, 'gold')
    sh.blit(c, 56, 0); reg('ui_ink_seals', 'icon_swipe', 56, 0, 16, 16)
    # 16×16 滚轮（鼠标轮廓）
    c = Cv(16, 16)
    for y in range(2, 15):
        w = 4 if 4 <= y <= 12 else 3
        c.put(8 - w, y, 'ink3'); c.put(7 + w, y, 'ink3')
    c.rect(5, 1, 6, 1, 'ink3'); c.rect(5, 15, 6, 1, 'ink3'); c.rect(7, 4, 2, 3, 'ink4')
    sh.blit(c, 72, 0); reg('ui_ink_seals', 'icon_wheel', 72, 0, 16, 16)
    sh.save(os.path.join(OUT, 'ui_ink_seals.png'))

    # 景名：Fusion Pixel 12（OFL），二值化渲染（无抗锯齿），焦墨；英文用同一字体，淡墨
    fpath = os.path.join(ROOT, '..', 'shared', 'fonts', 'fusion-pixel-12.ttf')
    font = ImageFont.truetype(fpath, 12)
    rows = []
    for L in levels:
        rows.append((L['id'], L['name'], L.get('en', '')))
    W, RH = 160, 32
    tsheet = Cv(W, RH * len(rows))
    for i, (lid, zh, en) in enumerate(rows):
        for text, col, dy in ((zh, 'ink5', 0), (en, 'ink2', 16)):
            im = Image.new('1', (W, 16), 0)
            d = ImageDraw.Draw(im)
            d.fontmode = '1'
            d.text((0, 0), text, font=font, fill=1)
            px = im.load()
            for y in range(16):
                for x in range(W):
                    if px[x, y]:
                        tsheet.put(x, i * RH + dy + y, col)
        wz = rnd(font.getlength(zh)); we = rnd(font.getlength(en))
        reg('ui_titles', lid, 0, i * RH, W, RH, wz=wz, we=we)
    tsheet.save(os.path.join(OUT, 'ui_titles.png'))


def build_all(levels):
    build_traveler()
    build_tiles()
    props = build_props()
    build_env()
    build_ui(levels)
    return props
