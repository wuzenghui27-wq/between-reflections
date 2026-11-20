# 借景 · 关卡源文件。运行：python3 jiejing/tools/levels.py  → 写出 data/levels.json
# 四卷十六景：推景（春）、框景（暮）、灯影（夜）、合卷（冬）。
# 坐标：320×180 画面像素，y 向下；线是层内坐标的折线（x 递增）；o 初始偏移，[min,max] 可推范围。
# 每一景写完都要跑 node jiejing/core/solve.js <id> 求解，并用负向开关确认它真的需要这一卷的机制。
import json, os
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = json.load(open(os.path.join(ROOT, 'data/levels.json')))
OLD = {l['id']: l for l in SRC['levels']}

def ln(pts, kind, **kw):
    d = {'pts': [list(p) for p in pts], 'kind': kind}; d.update(kw); return d
def lay(o=0, lines=(), lo=None, hi=None, deco=()):
    d = {'o': o, 'lines': list(lines)}
    if lo is not None: d['min'] = lo; d['max'] = hi
    if deco: d['deco'] = list(deco)
    return d
def lv(id, name, en, region, layers, start, lamp, **kw):
    d = {'id': id, 'name': name, 'en': en, 'region': region, 'layers': layers,
         'start': {'layer': start[0], 'line': start[1], 'x': start[2]},
         'lamp': {'layer': lamp[0], 'line': lamp[1], 'x': lamp[2]}, 'water': 150, 'bg': {'hills': kw.pop('hills', 3)}}
    d.update(kw); return d
def lamp(layer, line, x, lit=False, r=40):
    d = {'layer': layer, 'line': line, 'x': x}
    if lit: d['lit'] = True
    if r != 40: d['r'] = r
    return d

L = []
# ---------------------------------------------------------------- 第一卷 推景（春）
L.append(OLD['1-1'])
L.append(OLD['1-2'])
# 1-3 乘船：对岸是高台，船只到得了水面。撑船过去，再把远处石阶推来接住船头。
L.append(lv('1-3', '乘船', 'By Boat', 'jiangnan', [
    lay(120, [ln([(0, 140), (20, 140), (44, 124), (60, 124)], 'stair')], 120, 250),
    lay(70, [ln([(0, 140), (24, 140)], 'boat', boat=True)], 60, 200),
    lay(0, [ln([(12, 140), (80, 140)], 'bank'), ln([(250, 124), (308, 124)], 'terrace')],
        deco=[{'k': 'willow', 'x': 40, 'y': 140}, {'k': 'house', 'x': 262, 'y': 124, 'w': 40}]),
], (2, 0, 28), (2, 1, 292), hills=11))
# 1-4 接力：中景一块木板有高低两截，远景一段石阶。木板接上岸、石阶接上木板、再把木板的高截推去接石阶顶——
# 自己站着的那一层推不动，只能两层轮流推、轮流踩。
L.append(lv('1-4', '接力', 'Relay', 'jiangnan', [
    lay(190, [ln([(0, 130), (24, 130), (48, 112), (70, 112)], 'stair')], 100, 190),
    lay(160, [ln([(0, 130), (60, 130)], 'plank'), ln([(100, 112), (150, 112)], 'plank')], 20, 160),
    lay(0, [ln([(10, 130), (80, 130)], 'bank'), ln([(250, 112), (310, 112)], 'terrace')],
        deco=[{'k': 'willow', 'x': 40, 'y': 130}, {'k': 'hall', 'x': 258, 'y': 112, 'w': 50}]),
], (2, 0, 26), (2, 1, 294), hills=13))
# ---------------------------------------------------------------- 第二卷 框景（暮）
for k in ('2-1', '2-2', '2-3'): L.append(OLD[k])
# 2-4 移步：远处一道起伏的园径，只在近处那扇月洞门里看得见、走得上。
# 先移门、再移景，从门里走上高台；再把门挪到高台另一头，把园径下坡那段对进门里，走下去。
# 人在门里时门推不动；远景和门都得各推两次。
L.append(lv('2-4', '移步', 'Shifting View', 'garden', [
    lay(200, [ln([(0, 130), (20, 130), (40, 110), (60, 110), (80, 130), (100, 130)], 'path')], 60, 220),
    lay(0, [ln([(10, 90), (90, 130)][:0] or [(10, 130), (90, 130)], 'floor'), ln([(130, 110), (180, 110)], 'terrace'), ln([(230, 130), (310, 130)], 'floor')]),
    lay(240, [], 60, 240, [{'k': 'wall', 'x1': -14, 'x2': 62, 'y1': 70, 'y2': 134, 'holes': [{'kind': 'gate', 'x1': 0, 'x2': 48, 'y1': 84, 'y2': 134}]}]),
], (1, 0, 26), (1, 2, 292), hills=10,
   frames=[{'layer': 2, 'x1': 0, 'x2': 48, 'y1': 80, 'y2': 136, 'target': 0, 'kind': 'gate'}]))

# ---------------------------------------------------------------- 第三卷 灯影（夜）
# 3-1 一灯：远处亭边一盏亮着的灯，推远层把光送到中景那道淡墨虚桥上。
L.append(lv('3-1', '一灯', 'One Lamp', 'night', [
    lay(250, [ln([(0, 118), (24, 118)], 'path')], 0, 260, [{'k': 'pine', 'x': 6, 'y': 118}]),
    lay(0, [ln([(96, 130), (174, 130)], 'ghost', faint=True)]),
    lay(0, [ln([(10, 130), (100, 130)], 'bank'), ln([(170, 130), (310, 130)], 'bank')],
        deco=[{'k': 'reeds', 'x': 24, 'y': 130}, {'k': 'house', 'x': 250, 'y': 130, 'w': 44}]),
], (2, 0, 30), (2, 1, 290), lamps=[lamp(0, 0, 12, lit=True)], hills=4))

# 3-2 点灯：岸头一盏灯照亮虚桥的前半；虚桥中间挂着第二盏灯，得先趁它还在光里走过去点亮，再推桥。
L.append(lv('3-2', '点灯', 'Kindling', 'night', [
    lay(0, []),
    lay(70, [ln([(0, 130), (110, 130)], 'ghost', faint=True)], 40, 160),
    lay(0, [ln([(10, 130), (100, 130)], 'bank'), ln([(200, 130), (310, 130)], 'bank')],
        deco=[{'k': 'willow', 'x': 40, 'y': 130}, {'k': 'reeds', 'x': 290, 'y': 130}]),
], (2, 0, 26), (2, 1, 292), lamps=[lamp(2, 0, 94), lamp(1, 0, 60)], hills=9))

# 3-3 借光：两段虚桥中间一块石矶。远处的灯照得到一段、照不全第二段；第二段上的灯要先借远灯的光去点。
L.append(lv('3-3', '借光', 'Borrowed Light', 'night', [
    lay(40, [ln([(0, 118), (24, 118)], 'path')], 40, 260),
    lay(0, [ln([(88, 130), (150, 130)], 'ghost', faint=True), ln([(170, 130), (262, 130)], 'ghost', faint=True), ]),
    lay(0, [ln([(10, 130), (90, 130)], 'bank'), ln([(148, 130), (172, 130)], 'plank'), ln([(262, 130), (310, 130)], 'bank')],
        deco=[{'k': 'pine', 'x': 30, 'y': 130}]),
], (2, 0, 26), (2, 2, 296), lamps=[lamp(0, 0, 12, lit=True), lamp(1, 1, 196)], hills=6))

# 3-4 灯船：船头挑着灯，远处一道淡墨石阶，阶腰另有一盏灯。
# 船灯够不着阶腰的灯位（船撑不了那么远），所以得先趁石阶还在近处，借船灯走上去点亮它，
# 回到船上把石阶推到高岸下，再撑船去接——三次推，次序不能乱。
L.append(lv('3-4', '灯船', 'Lantern Boat', 'night', [
    lay(100, [ln([(0, 140), (40, 140), (64, 116), (84, 116)], 'ghost', faint=True)], 90, 180),
    lay(70, [ln([(0, 140), (24, 140)], 'boat', boat=True)], 70, 160),
    lay(0, [ln([(10, 140), (70, 140)], 'bank'), ln([(262, 116), (310, 116)], 'terrace')],
        deco=[{'k': 'reeds', 'x': 20, 'y': 140}]),
], (2, 0, 26), (2, 1, 292), lamps=[lamp(1, 0, 12, lit=True), lamp(0, 0, 50)], hills=12))

OUT = dict(SRC); OUT['levels'] = L
json.dump(OUT, open(os.path.join(ROOT, 'data/levels.json'), 'w'), ensure_ascii=False, indent=1)
print(len(L), 'levels')
