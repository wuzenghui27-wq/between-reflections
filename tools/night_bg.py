# 把每张白天背景做成一张真正的夜景（不是简单压暗）：
# 天空重画成夜空（星星、月亮、银河），地面换成月光色调，雾带、月亮在水里的倒影；
# 有灯的建筑保留暖色窗光。参考中国古画夜景的做法：大片水墨般的冷色，只点几处暖亮。
# 用法：python3 tools/night_bg.py   → assets/bg/<编号>n.png
import os, sys, math, random
import numpy as np
from PIL import Image
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'assets', 'bg')

# cap：天空最低到哪（一个数，或 [(x,y)...] 折线）；moon：(x,y,半径) 或 None；water：倒影所在水面 (y0,y1)
# mist：雾带 [(y, 厚度)]；warm：保留暖色灯光；sky：'clear' 晴夜 / 'haze' 薄云 / 'rain' 雨夜；milky：银河
CFG = {
  '8518': dict(cap=20, moon=(250, 8, 6), water=(112, 180), mist=[(100, 10)], sky='haze'),
  '8519': dict(cap=15, moon=None, water=(88, 180), mist=[(80, 8)], sky='clear'),
  '8520': dict(cap=40, moon=(60, 14, 7), mist=[(70, 10)], sky='haze'),
  '8521': dict(cap=60, moon=(228, 22, 8), water=(102, 180), mist=[(96, 6)], sky='clear'),
  '8522': dict(cap=10, moon=None, water=(150, 180), mist=[(140, 8)], sky='clear'),
  '8523': dict(cap=110, moon=(160, 30, 7), water=(156, 180), mist=[(98, 8)], sky='clear', milky=True, lit=[(64, 108, 8, 6), (82, 108, 7, 6)]),
  '8524': dict(cap=80, moon=(265, 18, 7), sky='clear', milky=True),
  '8525': dict(cap=[(0, 120), (60, 110), (110, 60), (140, 20), (152, 0)], moon=(50, 26, 8), sky='clear', milky=True),
  '8526': dict(cap=70, moon=(70, 14, 6), water=(146, 172), mist=[(110, 8)], sky='clear', milky=True),
  '8527': dict(cap=25, moon=None, mist=[(60, 10)], sky='clear', milky=True),
  '8528': dict(cap=45, moon=(240, 14, 7), mist=[(58, 12)], sky='haze'),
  '8530': dict(cap=70, moon=(255, 20, 8), mist=[(64, 8)], sky='clear'),
  '8531': dict(cap=60, moon=(255, 16, 7), water=(152, 180), mist=[(118, 6)], sky='clear', warm=True,
               force=[(0, 38), (92, 38), (95, 21), (152, 21), (160, 13), (205, 13), (210, 38), (320, 42)]),
  '8532': dict(cap=40, moon=None, sky='clear'),
  '8533': dict(cap=92, moon=(215, 26, 9), water=(100, 150), mist=[(92, 5)], sky='clear'),
  '8534': dict(cap=50, moon=(60, 16, 7), water=(120, 180), sky='haze', lit=[(186, 78, 26, 12)]),
  '8535': dict(cap=0, moon=None, water=(150, 180), sky='clear', lit=[(200, 74, 40, 19), (150, 78, 30, 17)]),
  '8536': dict(cap=60, moon=None, water=(110, 180), warm=True, sky='rain'),
  '8537': dict(cap=40, moon=None, warm=True, sky='rain'),
  '8538': dict(cap=35, moon=(70, 14, 7), water=(140, 180), mist=[(70, 10), (110, 8)], sky='haze'),
  '8539': dict(cap=50, moon=(250, 22, 8), water=(110, 180), mist=[(84, 10)], sky='haze'),
}

def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)
def capline(cap, W):
    if isinstance(cap, (int, float)): return np.full(W, cap)
    xs, ys = zip(*cap)
    return np.interp(np.arange(W), xs, ys)

def skymask(a, cap):
    H, W, _ = a.shape
    r, g, b = [a[:, :, i].astype(int) for i in range(3)]
    lum = (r * 3 + g * 6 + b) / 10
    mx, mn = a.max(2).astype(int), a.min(2).astype(int)
    sat = (mx - mn) / np.maximum(mx, 1)
    pred = ((b > r + 18) & (b >= g - 6) & (lum > 70)) | ((lum > 150) & (sat < 0.22))
    cl = capline(cap, W)
    pred &= np.arange(H)[:, None] < cl[None, :]
    m = np.zeros((H, W), bool); q = deque()
    for x in range(W):
        if pred[0, x]: m[0, x] = True; q.append((0, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and not m[yy, xx] and pred[yy, xx] and abs(lum[yy, xx] - lum[y, x]) < 28:
                m[yy, xx] = True; q.append((yy, xx))
    # 填掉天空里零星的小洞（星点状的云边）
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if not m[y, x] and m[y - 1, x] and m[y + 1, x] and m[y, x - 1] and m[y, x + 1]: m[y, x] = True
    return m

RAMP = [(0.0, '#070a1c'), (0.25, '#141c3c'), (0.5, '#2c3c68'), (0.75, '#5e729e'), (1.0, '#b4c4e4')]
RAMP_C = [(p, hexc(c)) for p, c in RAMP]
def ramp(t):
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,))
    for (p0, c0), (p1, c1) in zip(RAMP_C, RAMP_C[1:]):
        k = np.clip((t - p0) / (p1 - p0), 0, 1)[..., None]
        sel = ((t >= p0) & (t <= p1))[..., None]
        out = np.where(sel, c0 * (1 - k) + c1 * k, out)
    return out

def grade_land(a, warm):
    f = a.astype(float)
    lum = (f[..., 0] * 0.3 + f[..., 1] * 0.6 + f[..., 2] * 0.1) / 255
    base = ramp(lum ** 1.15 * 0.88)
    chroma = f - (lum * 255)[..., None]
    out = base + chroma * 0.22 * (0.4 + lum)[..., None]
    if warm:   # 亮着的窗和灯笼：留住暖色，再提亮一点
        r, g, b = f[..., 0], f[..., 1], f[..., 2]
        lamp = (r > 170) & (g > 95) & (b < 140) & (r - b > 80)
        red = (r > 150) & (g < 90) & (b < 90)
        k = np.clip((r - 170) / 60, 0.4, 0.8)[..., None]
        lampc = np.stack([np.minimum(255, r * 0.98 + 6), np.minimum(220, g * 0.8 + 12), b * 0.4 + 14], -1)
        out = np.where(lamp[..., None], lampc * k + out * (1 - k), out)
        out = np.where(red[..., None], np.stack([r * 0.95, g * 0.45 + 8, b * 0.5 + 12], -1), out)
    return out

def night(id_, cfg, seed):
    rnd = random.Random(seed)
    a = np.array(Image.open(os.path.join(BG, id_ + '.png')).convert('RGB'))
    H, W, _ = a.shape
    m = skymask(a, cfg['cap']) if (isinstance(cfg['cap'], list) or cfg['cap'] > 0) else np.zeros((H, W), bool)
    if cfg.get('force'):      # 晚霞的暖色云块认不出是天，按折线直接划进天空
        fl = capline(cfg['force'], W)
        m |= np.arange(H)[:, None] < fl[None, :]
    out = grade_land(a, cfg.get('warm'))
    f = a.astype(float)
    kind = cfg.get('sky', 'clear')
    top, hor = {'clear': ('#04071a', '#1e2c58'), 'haze': ('#0c1128', '#2c3860'), 'rain': ('#0e1226', '#262e48')}[kind]
    top, hor = hexc(top), hexc(hor)
    # 天空：每列从天顶到“地平线”（这一列天空最低处）的渐变
    ys = np.arange(H)[:, None]
    low = np.where(m.any(0), (H - 1 - np.argmax(m[::-1], 0)), 1)
    t = np.clip(ys / np.maximum(low, 1)[None, :] * 0.85, 0, 1) ** 1.3
    sky = top[None, None, :] * (1 - t[..., None]) + hor[None, None, :] * t[..., None]
    lum = (f[..., 0] * 0.3 + f[..., 1] * 0.6 + f[..., 2] * 0.1) / 255
    if kind == 'clear':
        cloud = np.clip((f.min(2) / 255 - 0.42) / 0.4, 0, 1)
    else:   # 灰天：用明暗起伏当云纹
        mean = lum[m].mean() if m.any() else 0.7
        cloud = np.clip((lum - mean) * 2.4 + 0.35, 0, 1)
    cloudc = hexc('#4a5a88') * (1 - cloud[..., None]) + hexc('#9aaad0') * cloud[..., None]
    skyc = sky * (1 - cloud[..., None] * 0.8) + cloudc * cloud[..., None] * 0.8
    out = np.where(m[..., None], skyc, out)
    # 亮灯的窗：保留原来的窗棂，亮的格子换成暖黄，暗的木条变深褐
    for (lx, ly, lw, lh) in cfg.get('lit', []):
        sl = (slice(ly, ly + lh), slice(lx, lx + lw))
        L = lum[sl] ** 0.8
        out[sl] = hexc('#3a2014')[None, None, :] * (1 - L[..., None]) + hexc('#ffd890')[None, None, :] * L[..., None]
    # 星星：只撒在没有云的天上
    if kind != 'rain':
        dens = 0.016 if kind == 'clear' else 0.004
        for y in range(H):
            for x in range(W):
                if not m[y, x] or cloud[y, x] > 0.25: continue
                d = dens
                if cfg.get('milky'):            # 银河：从左下斜向右上的一条星带
                    dist = abs((x - 40) * 0.5 - (H * 0.9 - y) * 1.0 - 20) / 30
                    band = math.exp(-dist * dist)
                    d += band * 0.09
                    out[y, x] += band * np.array([10, 12, 22]) * (0.6 + rnd.random() * 0.6)
                if rnd.random() < d:
                    v = rnd.choice([150, 180, 210, 255])
                    out[y, x] = np.array([v, v, min(255, v + 20)]) if rnd.random() < 0.9 else np.array([255, 240, 214])
                    if v == 255 and rnd.random() < 0.3 and 1 <= x < W - 1 and 1 <= y < H - 1:
                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            if m[y + dy, x + dx]: out[y + dy, x + dx] = out[y + dy, x + dx] * 0.4 + np.array([170, 180, 220]) * 0.6
    # 月亮：画在天空层，被山遮住的部分就不画
    mo = cfg.get('moon')
    if mo and kind != 'rain':
        mx, my, mr = mo
        for y in range(max(0, my - mr * 4), min(H, my + mr * 4 + 1)):
            for x in range(max(0, mx - mr * 4), min(W, mx + mr * 4 + 1)):
                if not m[y, x]: continue
                d = math.hypot(x - mx, y - my)
                if d <= mr:
                    c = hexc('#f6eed2')
                    # 月面上淡淡的暗斑（用确定的伪随机，不同月亮不一样）
                    if math.hypot(x - mx + mr * 0.3, y - my + mr * 0.2) < mr * 0.35 or math.hypot(x - mx - mr * 0.35, y - my - mr * 0.3) < mr * 0.25:
                        c = hexc('#d8ceb0')
                    if d > mr - 1: c = hexc('#e4dcc0')
                    out[y, x] = c
                elif d <= mr * 3.6:            # 月晕：三圈逐渐稀疏的点
                    k = (d - mr) / (mr * 2.6)
                    halo = (1 - k) ** 2 * (0.55 if kind == 'clear' else 0.75)
                    out[y, x] = out[y, x] * (1 - halo) + hexc('#8a9ac8') * halo
                    if k > 0.5 and (x + y) % 2 == 0: out[y, x] = out[y, x] * 0.96
        # 水里的月影：一列断续的横线
        w = cfg.get('water')
        if w:
            y0, y1 = w
            for y in range(y0 + 1, y1, 2 if rnd.random() < 0.5 else 3):
                k = (y - y0) / max(1, y1 - y0)
                half = int(mr * (0.6 + k * 1.8) * (0.6 + 0.4 * rnd.random()))
                off = rnd.randint(-1, 1)
                a_ = 0.4 * (1 - k * 0.7)
                for x in range(mx - half + off, mx + half + off + 1):
                    if 0 <= x < W and not m[y, x] and rnd.random() < 0.85:
                        out[y, x] = out[y, x] * (1 - a_) + hexc('#e8e4cc') * a_
    # 雾带：水墨里横在山前的那层淡雾，用抖动点做边
    for (my_, th) in cfg.get('mist', []):
        for y in range(max(0, my_ - th), min(H, my_ + th)):
            k = 1 - abs(y - my_) / th
            for x in range(W):
                # 雾不是一整条：用几道不同频率的起伏把它断成一团一团
                wob = math.sin(x * 0.031 + my_ * 0.7) * 0.6 + math.sin(x * 0.083 + my_) * 0.35 + math.sin(x * 0.19) * 0.15
                yo = math.sin(x * 0.04 + my_) * th * 0.5
                kk = max(0.0, 1 - abs(y - my_ - yo) / th)
                a_ = max(0.0, kk * (0.45 + wob * 0.55)) * 0.26
                if a_ <= 0.02: continue
                if a_ < 0.09 and (x + y) % 2: continue
                out[y, x] = out[y, x] * (1 - a_) + hexc('#7486b4') * a_
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    return img.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)

if __name__ == '__main__':
    only = sys.argv[1:]
    for i, (k, c) in enumerate(sorted(CFG.items())):
        if only and k not in only: continue
        night(k, c, 1000 + i).save(os.path.join(BG, k + 'n.png'), optimize=True)
        print('night', k)
