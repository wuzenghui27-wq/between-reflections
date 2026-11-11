"""夜景照片 → 320×180 像素画（来源照片与署名见 CREDITS.md）：裁成 16:9，缩小，轻微提亮暗部、提饱和，压成有限色板（带一点有序抖动）。"""
import sys
from PIL import Image, ImageEnhance, ImageFilter
def pixelate(src, dst, cy=0.5, cx=0.5, colors=48, gamma=0.85, sat=1.2, shift=0):
    im = Image.open(src).convert('RGB'); w, h = im.size
    tw, th = (w, round(w * 9 / 16)) if w / h < 16 / 9 else (round(h * 16 / 9), h)
    x0 = round((w - tw) * cx); y0 = round((h - th) * cy)
    im = im.crop((x0, y0, x0 + tw, y0 + th))
    im = im.filter(ImageFilter.GaussianBlur(tw / 320 * 0.35)).resize((320, 180), Image.BOX)   # 去噪点再缩
    if shift:      # 画面整体上移：游戏里地面会挡住下面一截，把主体抬到看得见的位置；下面用最后一行补
        out = Image.new('RGB', (320, 180)); out.paste(im, (0, -shift))
        row = im.crop((0, 179, 320, 180))
        for y in range(180 - shift, 180): out.paste(row, (0, y))
        im = out
    im = im.point(lambda v: round(255 * (v / 255) ** gamma))
    im = ImageEnhance.Color(im).enhance(sat)
    im = ImageEnhance.Contrast(im).enhance(1.05)
    q = im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
    q.convert('RGB').save(dst, optimize=True)
if __name__ == '__main__':
    a = sys.argv
    pixelate(a[1], a[2], *(float(v) for v in a[3:5])) if len(a) > 3 else pixelate(a[1], a[2])
