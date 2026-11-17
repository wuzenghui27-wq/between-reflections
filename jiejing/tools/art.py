# 借景 · 关卡美术烘焙：把五张图集里的部件（tools/atlas.py）按关卡数据拼成每一景的背景和远/中/近三层。
# 用法：python3 jiejing/tools/art.py        输出到 jiejing/art/，部件坐标写进 data/atlas.json，层图偏移写进 data/art.json
#
# 分层笔法（GDD“美术”一节，严格区分，防止叠层时线条打架）：
#   远层：#B4AFA2 / #82827F，只用 1 像素细线或淡墨剪影，不抖色。
#   中层：#55555C 平涂 + 少量 1 像素亮/暗边。
#   近层：#34333A / #1B1A1F，2 像素粗描边 + 4×4 抖色（枯笔焦墨）。
#   可走墨线：顶上 1 像素宣纸白 + 2 像素深墨，两端圆润收笔墨点。
# 计白当黑：每屏至少一半是 #EFE8D8 留白（烘焙完会检查并打印每景留白比例）。
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pix import Cv, y_at, rnd, hash01, IDX, OUT, ROOT
import atlas

# ------------------------------------------------------------ 能走的墨线
STROKE = {0: ('ink2', 'ink1'), 1: ('ink3', 'ink3'), 2: ('ink5', 'ink5')}


def walk_stroke(cv, pts, ox, layer):
    i1, i2 = STROKE[layer]
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        y = rnd(y_at(pts, x))
        cv.put(x + ox, y, 'paper')
        cv.put(x + ox, y + 1, i1)
        cv.put(x + ox, y + 2, i2)
    # 两端圆头收笔：外侧多一点墨，削去外角
    for x, sgn in ((x1, -1), (x2, 1)):
        y = rnd(y_at(pts, x))
        cv.put(x + ox + sgn, y + 1, i1)
        cv.put(x + ox + sgn, y + 2, i2)
        cv.put(x + ox + sgn * 2, y + 2, i2 if layer else None)
        cv.put(x + ox + sgn, y, None)


# ------------------------------------------------------------ 各种线下面的东西
def draw_bank(cv, pts, ox, water):
    """近层石岸：2 像素轮廓、抖色石面、一层层石缝，底下化进水里。"""
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        top = rnd(y_at(pts, x)) + 3
        for y in range(top, water + 4):
            depth = y - top
            lvl = 3 + min(6, depth // 3)
            if y > water - 2:
                lvl = max(0, lvl - (y - water + 2) * 2)
            cv.put(x + ox, y, 'paper2')
            cv.dither(x + ox, y, 'ink1', lvl)
            # 石缝：每 6 行一道，错缝
            row = (y - top) // 6
            if (y - top) % 6 == 5 and y < water - 1 and hash01(x // 3, row) > 0.25:
                cv.put(x + ox, y, 'ink2')
            if (y - top) % 6 != 5 and (x + row * 7) % 17 == 0 and y < water - 1:
                cv.put(x + ox, y, 'ink2')
    # 2 像素外轮廓（左右两侧），底部不描（化在水里）
    for x, sgn in ((x1, 1), (x2, -1)):
        top = rnd(y_at(pts, x))
        for y in range(top + 1, water - 1):
            fade = (y - top) > (water - top) * 0.7 and hash01(x, y) < 0.5
            if not fade:
                cv.put(x + ox, y, 'ink5')
                cv.put(x + ox + sgn, y, 'ink4')
    # 岸边水草点
    for x in range(x1 + 2, x2 - 1, 5):
        if hash01(x, 9) < 0.4:
            cv.put(x + ox, water - 1, 'ink3')
            cv.put(x + ox, water - 2, 'ink4')


def draw_terrace(cv, pts, ox, water):
    """近层高台：台基（砖砌，2 像素轮廓）+ 栏杆。"""
    x1, x2 = pts[0][0], pts[-1][0]
    y0 = rnd(y_at(pts, x1))
    for x in range(x1, x2 + 1):
        for y in range(y0 + 3, water + 2):
            cv.put(x + ox, y, 'paper2')
            lvl = 2 + min(5, (y - y0) // 8)
            if y > water - 3:
                lvl = max(0, lvl - (y - water + 3) * 2)
            cv.dither(x + ox, y, 'ink1', lvl)
            r = (y - y0 - 3) // 5
            if (y - y0 - 3) % 5 == 4 and y < water - 2:
                cv.put(x + ox, y, 'ink2')
            elif (x + (r % 2) * 6) % 12 == 0 and y < water - 2:
                cv.put(x + ox, y, 'ink2')
    for x in (x1, x2):
        sgn = 1 if x == x1 else -1
        for y in range(y0 + 1, water - 1):
            cv.put(x + ox, y, 'ink5'); cv.put(x + ox + sgn, y, 'ink4')
    # 台口一道压阑石（深一点）
    for x in range(x1, x2 + 1):
        cv.put(x + ox, y0 + 3, 'ink3')


def draw_plank(cv, pts, ox, water):
    """中层木桥：桥面一道梁，下面隔一段一根桩，平涂 + 1 像素亮边。"""
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        y = rnd(y_at(pts, x))
        cv.put(x + ox, y + 3, 'ink3')
        if (x - x1) % 4 == 0:
            cv.put(x + ox, y + 3, 'ink2')
    n = max(2, (x2 - x1) // 22 + 1)
    for i in range(n):
        x = x1 + 3 + (x2 - x1 - 6) * i // (n - 1)
        y = rnd(y_at(pts, x))
        for yy in range(y + 3, water + 1):
            cv.put(x + ox, yy, 'ink3')
            cv.put(x + ox + 1, yy, 'ink2')
        # 桩入水的一圈小波
        cv.put(x + ox - 2, water + 1, 'ink2'); cv.put(x + ox + 3, water + 1, 'ink2')
    # 斜撑
    for i in range(n - 1):
        xa = x1 + 3 + (x2 - x1 - 6) * i // (n - 1)
        xb = x1 + 3 + (x2 - x1 - 6) * (i + 1) // (n - 1)
        ya = rnd(y_at(pts, xa)) + 4
        cv.line(xa + ox + 1, ya, (xa + xb) // 2 + ox, ya + 6, 'ink3')
        cv.line(xb + ox - 1, ya, (xa + xb) // 2 + ox, ya + 6, 'ink3')


def draw_boat(cv, pts, ox, water):
    """中层乌篷船：船身平涂 + 亮边，船尾一个乌篷，船头一根篙。"""
    x1, x2 = pts[0][0], pts[-1][0]
    y = rnd(y_at(pts, x1))
    L = x2 - x1
    for x in range(x1 - 3, x2 + 4):
        t = (x - (x1 - 3)) / (L + 6)
        bottom = y + 3 + rnd(4 * math.sin(math.pi * t))
        top = y + 3 if x1 <= x <= x2 else y + 3 - (1 if (x < x1 - 1 or x > x2 + 1) else 0)
        for yy in range(top, bottom + 1):
            cv.put(x + ox, yy, 'ink4')
        cv.put(x + ox, top, 'ink2')
    # 船沿上翘
    cv.put(x1 - 3 + ox, y + 1, 'ink4'); cv.put(x1 - 3 + ox, y + 2, 'ink4'); cv.put(x1 - 2 + ox, y + 2, 'ink4')
    cv.put(x2 + 3 + ox, y + 1, 'ink4'); cv.put(x2 + 3 + ox, y + 2, 'ink4'); cv.put(x2 + 2 + ox, y + 2, 'ink4')
    # 乌篷（船尾，左边），半圆
    cx, r = x1 + 5, 5
    for x in range(cx - r, cx + r + 1):
        h = rnd(math.sqrt(max(0, r * r - (x - cx) ** 2)) * 1.1)
        for yy in range(y - h, y + 1):
            cv.put(x + ox, yy, 'ink5' if yy > y - h else 'ink3')
        if (x - cx) % 3 == 0:
            cv.put(x + ox, y - h + 2, 'ink4')
    # 水线
    for x in range(x1 - 5, x2 + 6):
        if hash01(x, 3) < 0.5:
            cv.put(x + ox, y + 8, 'ink2')


def draw_stair(cv, pts, ox, water):
    """远层石阶：只用 1 像素淡墨线。台阶的折线、两边细栏杆，底下几笔山石。"""
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        if a[1] == b[1]:
            continue
        # 斜坡上画台阶的折线（在墨线下方）
        x = a[0]
        while x < b[0]:
            y = rnd(y_at(pts, x))
            cv.put(x + ox, y + 3, 'ink1')
            for k in range(4):
                cv.put(x + ox + k, rnd(y_at(pts, x + 3)) + 3 if False else y + 3, 'ink1')
            cv.line(x + ox + 3, y + 3, x + ox + 3, rnd(y_at(pts, x + 4)) + 3, 'ink1')
            x += 4
        # 侧面山石轮廓
        cv.line(a[0] + ox, a[1] + 4, a[0] + ox, water, 'ink1')
        cv.line(b[0] + ox, b[1] + 4, b[0] + ox + 6, water, 'ink1')
        for k in range(0, b[0] - a[0], 7):
            yy = rnd(y_at(pts, a[0] + k)) + 8
            cv.line(a[0] + k + ox, yy, a[0] + k + ox + 3, yy + 3, 'ink1')
    # 平的一段：下面一道细线（栈道）
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        if a[1] != b[1]:
            continue
        for x in range(a[0], b[0] + 1):
            cv.put(x + ox, a[1] + 4, 'ink1' if x % 2 else None)
        for x in range(a[0] + 2, b[0], 12):
            cv.line(x + ox, a[1] + 4, x + ox, water, 'ink1')


def draw_arch(cv, lines, ox, water):
    """远层拱桥（一组线）：桥面下一个半圆拱，1 像素淡墨；拱洞倒影成一个整圆。"""
    xs = [p[0] for l in lines for p in l]
    x1, x2 = min(xs), max(xs)
    allp = sorted([p for l in lines for p in l])
    cx = (x1 + x2) / 2
    r = (x2 - x1) * 0.32
    base = water
    for x in range(int(cx - r), int(cx + r) + 1):
        h = math.sqrt(max(0, r * r - (x - cx) ** 2))
        cv.put(x + ox, rnd(base - h * 0.9), 'ink2')
        cv.put(x + ox, rnd(base + h * 0.5), 'ink1' if x % 2 else None)   # 倒影（虚）
    # 桥身外轮廓：从桥面两端斜下到水
    cv.line(x1 + ox, allp[0][1] + 3, x1 + ox - 4, base, 'ink2')
    cv.line(x2 + ox, allp[-1][1] + 3, x2 + ox + 4, base, 'ink2')
    # 桥面下一道细线
    for x in range(x1, x2 + 1):
        if x % 2 == 0:
            cv.put(x + ox, rnd(y_at(allp, x)) + 4, 'ink1')
    # 断口：桥面中间缺的那一块，画两笔碎石
    for l in lines[:-1]:
        e = l[-1]
        cv.put(e[0] + ox + 2, e[1] + 5, 'ink1'); cv.put(e[0] + ox + 3, e[1] + 7, 'ink1')


# ------------------------------------------------------------ 景物
def deco_willow(cv, x, y):
    """近层垂柳：2 像素树干（浓墨），垂下来的柳丝用抖色。"""
    top = y - 54
    for yy in range(top + 10, y + 1):
        sway = rnd(math.sin((yy - top) / 9.0) * 1.5)
        cv.put(x + sway, yy, 'ink5'); cv.put(x + sway + 1, yy, 'ink4')
    for i, (bx, by, L) in enumerate([(-14, 12, 28), (-8, 6, 36), (-2, 2, 40), (5, 4, 34), (11, 9, 26), (17, 15, 20), (-19, 18, 18)]):
        # 枝条
        cv.line(x, top + 14, x + bx, top + by, 'ink4')
        for k in range(L):
            xx = x + bx + rnd(math.sin(k / 6.0 + i) * 1.2)
            yy = top + by + k
            if yy > y - 4:
                break
            c = 'ink3' if k < L * 0.6 else 'ink2'
            if k % 3 != 2 or k < 4:
                cv.put(xx, yy, c)
            if k % 4 == 1:
                cv.put(xx + 1, yy, 'ink2')


def deco_reeds(cv, x, y):
    for i in range(9):
        xx = x + i * 3 + rnd(hash01(i, x) * 2)
        h = 10 + rnd(hash01(x, i) * 12)
        lean = 1 if i % 2 else -1
        for k in range(h):
            cv.put(xx + (lean if k > h * 0.6 else 0), y - k, 'ink4' if k < h * 0.5 else 'ink3')
        cv.put(xx + lean, y - h, 'ink2'); cv.put(xx + lean, y - h - 1, 'ink2')
        cv.dither(xx + lean + 1, y - h + 1, 'ink2', 8)


def deco_house(cv, x, y, w=46):
    """近层民居：白墙（纸色）+ 黑瓦马头墙，2 像素轮廓。"""
    x0, x1 = x - w // 2, x + w // 2
    wall_top = y - 22
    for xx in range(x0, x1 + 1):
        for yy in range(wall_top, y + 1):
            cv.put(xx, yy, 'paper')
        cv.dither(xx, y - 1, 'ink1', 8)
        cv.dither(xx, y, 'ink1', 12)
    for yy in range(wall_top, y + 1):
        cv.put(x0, yy, 'ink4'); cv.put(x1, yy, 'ink4')
    # 屋檐与瓦
    for xx in range(x0 - 3, x1 + 4):
        cv.put(xx, wall_top - 1, 'ink5'); cv.put(xx, wall_top - 2, 'ink4')
        if xx % 2 == 0:
            cv.put(xx, wall_top - 3, 'ink4')
    # 马头墙（两端阶梯形高起）
    for side in (x0, x1 - 9):
        for k in range(3):
            sx, sy = side + (k * 3 if side == x0 else 6 - k * 3), wall_top - 5 - k * 4
            cv.rect(sx - 1, sy, 5, 2, 'ink5')
            cv.rect(sx, sy + 2, 3, 4, 'paper')
            cv.put(sx - 1, sy + 2, 'ink4'); cv.put(sx + 3, sy + 2, 'ink4')
    # 门与花窗
    cv.rect(x - 3, y - 11, 6, 11, 'ink4'); cv.put(x, y - 11, 'ink3')
    cv.rect(x - 3, y - 12, 6, 1, 'ink5')
    for wx in (x0 + 7, x1 - 11):
        cv.rect(wx, y - 17, 5, 5, 'ink3')
        cv.put(wx + 2, y - 15, 'paper'); cv.put(wx + 1, y - 16, 'ink5'); cv.put(wx + 3, y - 14, 'ink5')


def deco_hall(cv, x, y, w=62):
    """高台上的小亭阁：两根柱、歇山顶，近层。"""
    x0, x1 = x, x + w
    for px in (x0 + 8, x1 - 8):
        for yy in range(y - 24, y):
            cv.put(px, yy, 'ink5'); cv.put(px + 1, yy, 'ink4')
    # 栏杆
    for xx in range(x0 + 2, x1 - 1):
        cv.put(xx, y - 7, 'ink4')
        if xx % 5 == 0:
            for yy in range(y - 7, y):
                cv.put(xx, yy, 'ink3')
    # 屋顶：翘角
    ry = y - 26
    for xx in range(x0 - 2, x1 + 3):
        t = (xx - x0 + 2) / (w + 4)
        lift = rnd(3 * (abs(t - 0.5) * 2) ** 4)
        cv.put(xx, ry - lift, 'ink5'); cv.put(xx, ry - lift - 1, 'ink4')
    for k in range(1, 10):
        a, b = x0 + 4 + k * 2, x1 - 4 - k * 2
        for xx in range(a, b + 1):
            c = 'ink4' if (xx + k) % 3 else 'ink5'
            cv.put(xx, ry - 1 - k, c)
    cv.rect(x0 + 22, ry - 11, w - 44, 1, 'ink5')
    # 一盏小红灯笼挂在檐下
    lx = x0 + w // 2
    cv.put(lx, ry + 1, 'ink4')
    cv.rect(lx - 1, ry + 2, 3, 3, 'red')


def deco_pagoda(cv, x, y):
    """远层塔：只用 1 像素淡墨线，七层。"""
    w = 14
    yy = y - 6
    for k in range(7):
        h = 7 - k // 3
        ww = w - k * 1.4
        a, b = rnd(x - ww / 2), rnd(x + ww / 2)
        cv.line(a - 2, yy, b + 2, yy, 'ink1')
        cv.put(a - 3, yy - 1, 'ink1'); cv.put(b + 3, yy - 1, 'ink1')
        cv.line(a, yy, a, yy - h + 1, 'ink1'); cv.line(b, yy, b, yy - h + 1, 'ink1')
        yy -= h
    cv.line(x, yy, x, yy - 6, 'ink1')
    cv.line(x - 2, y - 6, x + 2, y - 6, 'ink1')



def draw_floor(cv, pts, ox, water):
    """近层园林地面（回廊、甬路）：近层石板图块铺出来，2 像素描边，底下抖色化开。"""
    tile = PROPS_T['near_slab']
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        top = rnd(y_at(pts, x))
        for k in range(3, 16):
            v = tile.get((x - x1) % 16, k)
            if v:
                cv.px[(top + k) * cv.w + x + ox] = v if 0 <= top + k < cv.h and 0 <= x + ox < cv.w else 0
        for y in range(top + 16, water + 2):
            cv.put(x + ox, y, 'paper2'); cv.dither(x + ox, y, 'ink1', max(0, 6 - (y - top - 16)))
    for x, sgn in ((x1, 1), (x2, -1)):
        top = rnd(y_at(pts, x))
        for y in range(top + 1, min(water, top + 18)):
            cv.put(x + ox, y, 'ink5'); cv.put(x + ox + sgn, y, 'ink4')


def draw_mid_floor(cv, pts, ox, water):
    """中层地面/平台：回廊地砖图块（#55555C 平涂 + 1 像素亮边），下面一段平涂台基。"""
    tile = PROPS_T['mid_corridor']
    x1, x2 = pts[0][0], pts[-1][0]
    for x in range(x1, x2 + 1):
        top = rnd(y_at(pts, x))
        for k in range(3, 16):
            v = tile.get((x - x1) % 16, k)
            if v:
                cv.px[(top + k) * cv.w + x + ox] = v
        for y in range(top + 16, water + 1):
            cv.put(x + ox, y, 'ink3' if (x - x1) % 16 in (3, 11) else None)
    for x in (x1, x2):
        for y in range(rnd(y_at(pts, x)) + 3, water + 1):
            cv.put(x + ox, y, 'ink3')


def draw_path_far(cv, pts, ox, water):
    """远层园林小径：栈道式，只用淡墨 1 像素线（柱、斜撑）。"""
    for x in range(pts[0][0], pts[-1][0] + 1):
        y = rnd(y_at(pts, x))
        if x % 2 == 0:
            cv.put(x + ox, y + 5, 'ink1')
        if x % 14 == 3:
            cv.line(x + ox, y + 3, x + ox, min(water, y + 26), 'ink1')


def draw_path_mid(cv, pts, ox, water):
    """中层园林小径：#55555C 平涂的石阶路基 + 1 像素亮边。"""
    for x in range(pts[0][0], pts[-1][0] + 1):
        y = rnd(y_at(pts, x))
        for yy in range(y + 3, y + 9):
            cv.put(x + ox, yy, 'ink3')
        cv.put(x + ox, y + 3, 'ink2')
        if x % 6 == 0:
            cv.put(x + ox, y + 6, 'ink2')
        cv.put(x + ox, y + 9, 'ink2' if x % 3 else None)


def deco_prop(name, flip=False):
    def f(cv, x, y, *a):
        p = PROPS[name]
        cv.blit(p, x - p.w // 2, y - p.h, flip)
    return f


def deco_wall(cv, d, ox):
    """近层粉墙：白墙 + 黑瓦压顶，2 像素焦墨描边，墙脚抖色；墙上开月洞门 / 漏窗（纯透明镂空）。"""
    x1, x2, y1, y2 = d['x1'] + ox, d['x2'] + ox, d['y1'], d['y2']
    for x in range(x1, x2 + 1):
        for y in range(y1, y2 + 1):
            cv.put(x, y, 'paper')
            if y > y2 - 6:
                cv.dither(x, y, 'ink1', (y - (y2 - 6)) * 2)
            elif hash01(x // 5, y // 7, 3) < 0.04:
                cv.dither(x, y, 'paper2', 8)          # 墙面旧水渍
        # 瓦顶
        cv.put(x, y1 - 1, 'ink5'); cv.put(x, y1 - 2, 'ink5'); cv.put(x, y1 - 3, 'ink4')
        if x % 3 == 0:
            cv.put(x, y1 - 4, 'ink4')
        cv.dither(x, y1, 'ink3', 6)
    for y in range(y1 - 3, y2 + 1):
        cv.put(x1, y, 'ink5'); cv.put(x1 + 1, y, 'ink4'); cv.put(x2, y, 'ink5'); cv.put(x2 - 1, y, 'ink4')
    cv.put(x1 - 1, y1 - 3, 'ink5'); cv.put(x2 + 1, y1 - 3, 'ink5')
    for h in d.get('holes', []):
        hx1, hx2, hy1, hy2 = h['x1'] + ox, h['x2'] + ox, h['y1'], h['y2']
        if h['kind'] == 'gate':
            p = PROPS['moon_gate']                       # 48×64，圈心在 (23.5, 27.5)，门槛在 58
            px, py = hx1, hy2 - 58
        else:
            p = PROPS['lattice_window']                  # 32×32
            px, py = hx1, hy1
        inside = atlas.flood_inside(p, p.w // 2, p.h // 2)
        if h['kind'] == 'gate':                          # 门洞一直开到门槛以下（人要走进去）
            inside |= {(x, y) for x in range(4, 44) for y in range(40, 58) if not p.get(x, y)}
        for (x, y) in inside:
            cv.put(px + x, py + y, None)
        if h['kind'] == 'window':                        # 漏窗下沿到地面也开通（窗做成落地的“景窗”）
            for x in range(hx1 + 2, hx2 - 1):
                for y in range(py + 30, hy2 + 1):
                    cv.put(x, y, None)
        cv.blit(p, px, py)
        if h['kind'] == 'window':
            for y in range(py + 30, hy2 + 1):
                for x in (hx1, hx1 + 1, hx2 - 1, hx2):
                    cv.put(x, y, 'ink5')


def bg_scene(L):
    water = L.get('water', 150)
    region = L.get('region', 'jiangnan')
    bg = Cv(320, 180)
    bg.rect(0, 0, 320, 180, 'paper')
    env = ENV
    shift = (L.get('bg', {}).get('hills', 3) * 37) % 320
    m = ATL['env_landscape']['mountains']
    top = water - 62 if region == 'jiangnan' else water - 70
    for x in range(320):
        sx = (x + shift) % 320
        for y in range(m['h']):
            v = env.get(sx, y)
            if v and (region == 'jiangnan' or v == IDX['ink1']):
                bg.px[(top + y) * 320 + x] = v
    if region == 'garden':
        # 园林：墙外远处的屋脊和塔尖（淡墨 1 像素）
        for k in range(4):
            cx = 40 + k * 80 + rnd(hash01(k, 9) * 30)
            yy = top + 40 - rnd(hash01(k, 4) * 10)
            bg.line(cx - 14, yy, cx + 14, yy, 'ink1')
            bg.line(cx - 16, yy + 1, cx - 14, yy, 'ink1'); bg.line(cx + 14, yy, cx + 16, yy + 1, 'ink1')
    for k, yy in enumerate(range(water + 3, 180, 4)):
        for x in range(0, 320):
            n = hash01(x // 7, yy, shift)
            if n < 0.14 + k * 0.05:
                bg.put(x, yy, 'ink1')
    return bg


DRAW = {'bank': draw_bank, 'terrace': draw_terrace, 'plank': draw_plank, 'stair': draw_stair,
        'floor': draw_floor}
DECO = {'reeds': deco_reeds, 'pagoda': deco_pagoda, 'hall': deco_hall}


def bake_level(L, meta, report):
    water = L.get('water', 150)
    bg = bg_scene(L)
    bg.save(os.path.join(OUT, 'levels', L['id'] + '_bg.png'))
    info = {'layers': []}
    comp = Cv(320, 180)
    comp.px[:] = bg.px
    for k in range(3):
        d = L['layers'][k]
        o0 = d.get('o', 0)
        mn, mx = d.get('min', o0), d.get('max', o0)
        w = 320 + mx - mn
        ox = mx
        cv = Cv(w, 180)
        for dd in d.get('deco', []):
            if dd['k'] == 'wall':
                continue
            if dd['k'] in ('willow', 'house', 'pavilion'):
                name = {'willow': 'willow', 'house': 'horse_wall', 'pavilion': 'pavilion'}[dd['k']]
                deco_prop(name)(cv, dd['x'] + ox, dd['y'])
                continue
            fn = DECO[dd['k']]
            args = [cv, dd['x'] + ox, dd['y']]
            if 'w' in dd:
                args.append(dd['w'])
            fn(*args)
        if k == 0:
            for i, r in enumerate(d.get('rocks', [])):
                rk = ROCKS[r['n']]
                cv.blit(rk, r['x'] + ox - rk.w // 2, r['y'] - rk.h)
        lines = d.get('lines', [])
        arches = [l['pts'] for l in lines if l.get('kind') == 'arch']
        if arches:
            draw_arch(cv, arches, ox, water)
        for l in lines:
            kind = l.get('kind')
            if kind == 'path':
                (draw_path_far if k == 0 else draw_path_mid)(cv, l['pts'], ox, water)
            elif kind == 'boat':
                p = PROPS['boat']
                x1, x2 = l['pts'][0][0], l['pts'][-1][0]
                cv.blit(p, (x1 + x2) // 2 - 16 + ox, rnd(l['pts'][0][1]) - 8)
            elif k == 1 and kind in ('floor', 'terrace'):
                draw_mid_floor(cv, l['pts'], ox, water)      # 中层的地面用中层笔法
            else:
                f = DRAW.get(kind)
                if f:
                    f(cv, l['pts'], ox, water)
        for dd in d.get('deco', []):
            if dd['k'] == 'wall':
                deco_wall(cv, dd, ox)
        for l in lines:
            walk_stroke(cv, l['pts'], ox, k)
        name = '%s_L%d.png' % (L['id'], k)
        cv.save(os.path.join(OUT, 'levels', name))
        info['layers'].append({'img': 'levels/' + name, 'dx': -mx})
        # 留白统计：按初始偏移叠起来
        for y in range(180):
            for x in range(320):
                v = cv.px[y * w + x + ox - o0] if 0 <= x + ox - o0 < w else 0
                if v and not (L.get('frames') and any(f['target'] == k for f in L['frames'])):
                    comp.px[y * 320 + x] = v
    blank = sum(1 for v in comp.px if v == IDX['paper']) / (320 * 180)
    report.append('%s %s 留白 %d%%' % (L['id'], L['name'], rnd(blank * 100)))
    meta[L['id']] = info


def paper_noise():
    """纸纹：灰度图，乘到整幅画面上（5–8% 左右）。"""
    from PIL import Image
    im = Image.new('L', (320, 180))
    px = []
    for y in range(180):
        for x in range(320):
            n = hash01(x, y, 5)
            fiber = hash01(x // 9, y // 2, 11) < 0.06
            px.append(max(0, min(255, 255 - int(n * 14) - (8 if fiber else 0))))
    im.putdata(px)
    im.save(os.path.join(OUT, 'paper_noise.png'))


def main():
    global PROPS, PROPS_T, ENV, ROCKS, ATL
    lv = json.load(open(os.path.join(ROOT, 'data/levels.json'), encoding='utf8'))['levels']
    PROPS = atlas.build_all(lv)
    ATL = atlas.ATLAS
    # 读回烘焙好的图集，按名字切出部件给关卡拼
    from PIL import Image
    def load(name):
        im = Image.open(os.path.join(OUT, name + '.png'))
        c = Cv(im.width, im.height); c.px[:] = bytes(im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()); return c
    def cut(sheet, src, n):
        r = ATL[sheet][n]; c = Cv(r['w'], r['h'])
        for y in range(r['h']):
            for x in range(r['w']):
                c.px[y * r['w'] + x] = src.get(r['x'] + x, r['y'] + y)
        return c
    T = load('tiles_walkable'); ENV = load('env_landscape')
    PROPS_T = {n: cut('tiles_walkable', T, n) for n in ATL['tiles_walkable']}
    ROCKS = [cut('env_landscape', ENV, 'rock%d' % i) for i in range(3)]
    paper_noise()
    meta, report = {}, []
    for L in lv:
        bake_level(L, meta, report)
    json.dump(ATL, open(os.path.join(ROOT, 'data/atlas.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump({'levels': meta}, open(os.path.join(ROOT, 'data/art.json'), 'w'), ensure_ascii=False, indent=1)
    for r in report:
        print(r)
    print('烘焙完成：五张图集 +', len(lv), '景')


if __name__ == '__main__':
    main()
