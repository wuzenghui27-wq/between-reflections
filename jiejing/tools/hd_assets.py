"""借景 高清素材处理：把 assets_in/ 里生成的素材抠图、修接缝、对齐、缩放，输出到 hd/（webp）和 data/hd.json。
用法：python3 jiejing/tools/hd_assets.py [素材目录]（默认 /mnt/project-files/jiejing/assets_in）"""
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/jiejing/assets_in'
OUT = os.path.join(ROOT, 'hd')
os.makedirs(OUT, exist_ok=True)
META = {}


def load(name):
    return Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')


def save(im, key, q=86):
    im.save(os.path.join(OUT, key + '.webp'), quality=q, method=6)
    return key


# ---------------------------------------------------------------- 人物：抠掉纸底
def key_paper(im, t0=16, t1=46):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.abs(a - bg).max(axis=2)
    # 比纸暗的部分更可能是墨：加权
    dark = np.clip((bg.mean() - a.mean(axis=2)) / 60.0, 0, 1)
    d = np.maximum(d, dark * 60)
    al = np.clip((d - t0) / (t1 - t0), 0, 1)
    m = al > 0.5
    lab, n = nd.label(nd.binary_dilation(m, iterations=3))
    if n:
        sizes = nd.sum(m, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= max(400, sizes.max() * 0.02)
        al = al * keep[lab]
    solid = nd.binary_fill_holes(al > 0.5)
    al = np.where(solid & (al < 1), np.maximum(al, nd.binary_erosion(solid, iterations=2).astype(np.float32)), al)
    # 去纸色毛边：c = (c - (1-a)bg) / a
    aa = np.clip(al, 1e-3, 1)[..., None]
    c = np.clip((a - (1 - aa) * bg) / aa, 0, 255)
    out = np.dstack([c, al * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


CHAR_H = 150          # 1080p 下旅人站姿高（含斗笠）
POSES = ['idle', 'walk_a', 'walk_b', 'jump', 'fall', 'land', 'push', 'bow_lantern']


def characters():
    keyed = {p: key_paper(load('C-03_' + p)) for p in POSES}
    idle = keyed['idle']
    bb = idle.getbbox()
    scale = CHAR_H / (bb[3] - bb[1])
    frames = {}
    for p, im in keyed.items():
        A = np.asarray(im)[..., 3] > 128
        ys, xs = np.nonzero(A)
        top = ys.min()
        hat = A[top:top + int(0.06 * 1024)]
        hy, hx = np.nonzero(hat)
        ax = hx.mean()                      # 斗笠中心作水平锚点
        foot = ys.max()
        bb = im.getbbox()
        im = im.crop(bb)
        W, H = max(1, round(im.width * scale)), max(1, round(im.height * scale))
        im = im.resize((W, H), Image.LANCZOS)
        # 锚点：x = 斗笠中心，y = 脚底（站姿）；空中姿势也用同一套，画面再按规则的 y 摆
        save(im, 'char_' + p, 90)
        frames[p] = {'w': W, 'h': H, 'ax': round((ax - bb[0]) * scale, 1), 'ay': round((foot - bb[1]) * scale, 1)}
    META['char'] = frames


# ---------------------------------------------------------------- 接缝：两端淡入淡出，宽度减少 n
def seamless(im, n=160):
    a = np.asarray(im).astype(np.float32)
    w = a.shape[1]
    t = np.linspace(0, 1, n)[None, :, None]
    head, tail = a[:, :n], a[:, w - n:]
    blend = tail * (1 - t) + head * t
    out = np.concatenate([blend, a[:, n:w - n]], axis=1)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def backgrounds():
    names = {1: 'spring', 2: 'dusk', 3: 'night', 4: 'winter'}
    bg = {}
    for c, nm in names.items():
        d = {}
        d['sky'] = save(load('B-%d-1_%s_sky' % (c, nm)).convert('RGB'), 'sky%d' % c, 82)
        for i, part, n in ((2, 'distant_mountains', 200), (3, 'midground', 200), (4, 'mist', 240)):
            im = seamless(load('B-%d-%d_%s_%s' % (c, i, nm, part)), n)
            if part == 'mist':
                im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)   # 雾很软，半分辨率足够
            d[part.split('_')[-1]] = save(im, '%s%d' % (part.split('_')[-1], c), 84)
            d[part.split('_')[-1] + '_w'] = im.width * (2 if part == 'mist' else 1)
        try:
            wim = load('B-%d-5_%s_water' % (c, nm))
            if c in (3, 4):
                raise FileNotFoundError        # 夜水、冬水待重做
            arr = np.asarray(wim.convert('RGB')).mean(axis=(1, 2))
            cut = int(np.argmax(arr < 245))            # 去掉顶上的白边
            wim = wim.crop((0, cut, wim.width, wim.height))
            d['water'] = save(seamless(wim, 120).convert('RGB'), 'water%d' % c, 82)
        except FileNotFoundError:
            d['water'] = None
        bg[c] = d
    META['bg'] = bg


# ---------------------------------------------------------------- 组件：找桥面上沿
def deck_top(im):
    A = np.asarray(im)[..., 3] > 160
    cov = A.mean(axis=1)
    rows = np.nonzero(cov > 0.5)[0]
    return int(rows[0]) if len(rows) else int(np.nonzero(A.any(axis=1))[0][0])


def tight(im):
    bb = im.getbbox()
    return im.crop((0, bb[1], im.width, bb[3])), bb[1]


COMPS = {
    'bank': 'W-01_stone_bank', 'plank': 'W-02_wood_bridge', 'terrace': 'W-05_terrace', 'floor': 'W-06_garden_paving',
    'path': 'W-08_mountain_path', 'snowpath': 'W-09_snow_mountain_path', 'snowbank': 'W-09_snow_stone_bank', 'snowplank': 'W-09_snow_wood_bridge', 'ghost': 'W-10_ghost_bridge',
}


# 桥面（脚踩的那一条）离图片顶的像素：自动找得不准的，按图逐张量过
TOPS = {'bank': (146, 160, 136), 'plank': (133, 25, 5), 'terrace': (80, 122, 158), 'floor': (18, 18, 4), 'path': (18, 6, 24), 'ghost': (22, 113, 6)}
SINGLE_TOPS = {'boat': 100, 'boat_lit': 100}


def components():
    out = {}
    for k, base in COMPS.items():
        e = {}
        for part in ('left', 'middle', 'right'):
            im = load(base + '_' + part)
            if k == 'snowplank' and part == 'middle':
                L = im.crop((0, 0, im.width // 2, im.height))
                im = Image.new('RGBA', im.size); im.paste(L, (0, 0)); im.paste(L.transpose(Image.FLIP_LEFT_RIGHT), (im.width // 2, 0))
            im, cut = tight(im)
            top = deck_top(im) if k != 'ghost' else deck_top_soft(im)
            save(im, 'w_%s_%s' % (k, part), 88)
            if k in TOPS:
                top = TOPS[k][('left', 'middle', 'right').index(part)]
            e[part] = {'w': im.width, 'h': im.height, 'top': top}
        out[k] = e
    for k, name in (('arch', 'W-03_stone_arch_half'), ('stair', 'W-04_stone_steps'), ('boat', 'W-07_covered_boat_unlit'), ('boat_lit', 'W-07_covered_boat_lit')):
        im = load(name); bb = im.getbbox(); im = im.crop(bb)
        save(im, 'w_' + k, 88)
        out[k] = {'w': im.width, 'h': im.height, 'top': SINGLE_TOPS.get(k, deck_top(im))}
    META['comp'] = out


def deck_top_soft(im):
    A = np.asarray(im)[..., 3] > 60
    cov = A.mean(axis=1)
    rows = np.nonzero(cov > 0.4)[0]
    return int(rows[0]) if len(rows) else 0


PROPS = {'willow': 'P-01_weeping_willow', 'plum': 'P-03_plum_corner', 'reeds': 'P-04_reeds', 'house': 'P-05_jiangnan_house',
         'pine_cliff': 'P-02_pine_cliff', 'pine_upright': 'P-02_pine_upright',
         'branch1': 'P-01_willow_branch_1', 'branch2': 'P-01_willow_branch_2', 'branch3': 'P-01_willow_branch_3', 'branch4': 'P-01_willow_branch_4',
         'lamp_on': 'P-12_stone_lantern_lit', 'lamp_off': 'P-12_stone_lantern_unlit', 'paper_on': 'P-13_paper_lantern_lit', 'paper_off': 'P-13_paper_lantern_unlit'}


def props():
    out = {}
    for k, name in PROPS.items():
        im = load(name)
        if k != 'plum' and not k.startswith('branch'):
            bb = im.getbbox(); im = im.crop(bb)
        save(im, 'p_' + k, 88)
        out[k] = {'w': im.width, 'h': im.height}
    META['props'] = out


if __name__ == '__main__':
    only = os.environ.get('ONLY')          # ONLY=props,components 只重做这几步（其余沿用 data/hd.json）
    if only:
        META.update(json.load(open(os.path.join(ROOT, 'data/hd.json'))))
        for f in only.split(','):
            globals()[f]()
    else:
        characters(); backgrounds(); components(); props()
    json.dump(META, open(os.path.join(ROOT, 'data/hd.json'), 'w'), ensure_ascii=False, indent=1)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('hd/ %d 个文件，共 %.1f MB' % (len(os.listdir(OUT)), tot / 1e6))
