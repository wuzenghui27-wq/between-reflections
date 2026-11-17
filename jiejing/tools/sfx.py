# 借景 · 音效烘焙（全部代码合成，不用外部素材）：古琴式拨弦（五声音阶）、木鱼、落水墨晕、过关和弦。
# 用法：python3 jiejing/tools/sfx.py   输出 jiejing/audio/*.wav（16 位单声道 44.1k）
import math, os, struct, wave

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')


def save(name, xs):
    os.makedirs(OUT, exist_ok=True)
    peak = max(1e-9, max(abs(v) for v in xs))
    g = 0.8 / peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v * g)) * 32767)) for v in xs))


def pluck(f, dur, bright=0.5):
    """Karplus-Strong 拨弦，加一点按弦滑音，像古琴的散音。"""
    n = int(SR * dur)
    N = int(SR / f)
    buf = [((i * 7919) % 200) / 100.0 - 1.0 for i in range(N)]   # 确定的“噪声”激励
    out = []
    i = 0
    for t in range(n):
        a = buf[i % N]; b = buf[(i + 1) % N]
        v = (a + b) * 0.5 * (0.996 + 0.003 * bright)
        buf[i % N] = v
        out.append(a)
        i += 1
    # 起音处一个小的指甲声
    for t in range(min(n, 220)):
        out[t] += 0.3 * math.sin(t * 0.9) * (1 - t / 220)
    return out


def knock(f, dur=0.14):
    n = int(SR * dur)
    return [math.sin(2 * math.pi * f * (1 - 0.35 * t / n) * t / SR) * math.exp(-t / (SR * 0.025)) for t in range(n)]


def mix(*parts):
    n = max(len(p) + d for p, d in parts)
    out = [0.0] * n
    for p, d in parts:
        for i, v in enumerate(p):
            out[i + d] += v
    return out


PENT = [196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25]
for i, f in enumerate(PENT):
    save('pluck%d' % i, pluck(f, 1.6))
save('knock_hi', knock(660))
save('knock_lo', knock(300))
save('locked', knock(150, 0.18))
save('fall', [v * math.exp(-t / (SR * 0.6)) for t, v in enumerate(pluck(98.0, 2.0, 0.0))])
save('win', mix((pluck(392.0, 2.6), 0), (pluck(523.25, 2.6), int(SR * 0.18)), (pluck(659.25, 3.0), int(SR * 0.36))))
print('ok')
