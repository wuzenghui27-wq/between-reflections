"""背景色调：从每张背景图取几处平均色，生成 js/bgtone.js。
地面、水面、深谷和人物会往这些颜色上靠一点，让前景和背景像同一幅画。
（浏览器从本地文件打开时读不了图片像素，所以提前算好。）
用法：python3 tools/bgtone.py   （换了背景图后运行）
"""
import glob, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def avg(im, y0, y1):
    return '#%02x%02x%02x' % im.crop((0, y0, im.width, y1)).resize((1, 1), Image.BOX).getpixel((0, 0))

out = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'bg', '*.png'))):
    name = os.path.basename(f)[:-4]
    if not name.isdigit():
        continue
    im = Image.open(f).convert('RGB')
    # low：被地面挡住的下半截；hor：地面上方的远景带；sky：天空
    out[name] = {'low': avg(im, 140, 180), 'hor': avg(im, 105, 140), 'sky': avg(im, 0, 40)}
with open(os.path.join(ROOT, 'js', 'bgtone.js'), 'w', encoding='utf-8') as fp:
    fp.write('// 由 tools/bgtone.py 生成：每张背景的平均色（low 下半截 / hor 远景带 / sky 天空）\n')
    fp.write('window.RF = window.RF || {};\nRF.BGTONE = ' + json.dumps(out) + ';\n')
print(len(out), 'backgrounds')
