# 界面的木框、朱漆按钮、朱文印键：照明代家具和印章做，替换原来通用的深色方框和键帽。
#  - wood：紫檀木框。外一道墨线，三像素木色（上左受光、下右背光，带木纹），里一道描金细线，四角折成回纹；框里是半透明的墨色
#  - lacquer：朱漆描金，用在“开始”这类主按钮上
#  - seal_key：朱文印，红色印边有磨损，纸色印面；按键名用朱色写在里面
# 都是 9 宫格像素图，CSS 里 border-image + image-rendering: pixelated 放大。
import random
from PIL import Image

INK = (23, 19, 28, 255)
GOLD, GOLD2 = (200, 154, 72, 255), (240, 200, 110, 255)


def frame(band, fill, seed, size=12):
    """band: [亮, 中, 暗]，fill: 框里的颜色。外一道墨线、两像素木 / 漆（上左亮、下右暗、带纹）、一道描金线；size×size，九宫格切 4。"""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); p = im.load()
    n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            if d == 0:
                c = INK if not ((x in (0, n)) and (y in (0, n))) else (0, 0, 0, 0)   # 圆角：四个角空掉
            elif d == 1:
                c = band[0] if (x == 1 or y == 1) and x < n - 1 and y < n - 1 else band[2]
            elif d == 2:
                c = band[1] if rnd.random() > 0.18 else band[2]                       # 木纹
            elif d == 3:
                c = GOLD2 if (x in (3, n - 3)) and (y in (3, n - 3)) else GOLD       # 描金线，四角一点亮
            else:
                c = fill
            p[x, y] = c
    return im


def seal(seed=3, size=11):
    """朱文印的印边：两像素朱红，偶尔一点磨损；印面纸色。"""
    rnd = random.Random(seed)
    ZHU, ZHU2, PAPER = (184, 58, 40, 255), (206, 96, 72, 255), (242, 230, 204, 255)
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); p = im.load()
    n = size - 1
    for y in range(size):
        for x in range(size):
            d = min(x, y, n - x, n - y)
            if d <= 1:
                c = ZHU if rnd.random() > 0.1 else ZHU2
                if d == 0 and (x in (0, n)) and (y in (0, n)): c = (0, 0, 0, 0)    # 圆一点的印角
            else:
                c = PAPER
            p[x, y] = c
    return im


if __name__ == '__main__':
    import os, sys
    out = os.path.join(sys.argv[1] if len(sys.argv) > 1 else '.', 'assets/ui')
    WOOD = [(150, 92, 58, 255), (104, 54, 34, 255), (66, 32, 22, 255)]
    WOOD_H = [(190, 128, 80, 255), (138, 78, 48, 255), (88, 46, 30, 255)]
    LAC = [(236, 112, 82, 255), (190, 58, 40, 255), (128, 30, 24, 255)]
    LAC_H = [(255, 150, 110, 255), (214, 80, 56, 255), (150, 40, 30, 255)]
    frame(WOOD, (28, 22, 30, 232), 11).save(os.path.join(out, 'wood.png'))
    frame(WOOD_H, (60, 40, 34, 240), 11).save(os.path.join(out, 'wood_hover.png'))
    frame(LAC, (176, 50, 36, 255), 12).save(os.path.join(out, 'lacquer.png'))
    frame(LAC_H, (200, 66, 46, 255), 12).save(os.path.join(out, 'lacquer_hover.png'))
    seal().save(os.path.join(out, 'seal_key.png'))
    print('ok')
