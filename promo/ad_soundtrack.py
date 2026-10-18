"""Beat-driven soundtrack for promo/ad.js (120 bpm, 21 s).

    python3 promo/ad_soundtrack.py out.wav
"""
import sys

import numpy as np

from soundtrack import SR, bell, click, dip, kiln, lowpass, plop, rng, scrape, squish, t_axis, write

DUR = 21.0
BEAT = 0.5
mix = np.zeros((int(SR * DUR), 2))

TYPE_AT = [3.0, 3.25, 3.5, 3.75]
TOUCHES = [2.8, 12.85, 13.35]
TOOLS = [(6.45, 'press'), (6.95, 'press'), (7.45, 'add')]
CARVE = (7.95, 0.6)
FIRE1 = (10.0, 12.0, 950)
FIRE2 = (14.5, 16.6, 1240)
DROPS = [(10.0, 12.0), (14.5, 16.5)]  # no drums inside the kiln
ROOTS = [55.0, 43.65, 65.41, 49.0]    # A1, F1, C2, G1 — one per bar


def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= len(mix) or i < 0:
        return
    sig = sig[: len(mix) - i] * gain
    mix[i:i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    mix[i:i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def kick():
    t = t_axis(0.35)
    f = 45 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 1.1


def hat(open_=False):
    t = t_axis(0.18 if open_ else 0.05)
    n = rng.standard_normal(len(t))
    return (n - lowpass(n, 7000)) * np.exp(-t * (18 if open_ else 70)) * 0.35


def clap():
    t = t_axis(0.22)
    n = rng.standard_normal(len(t))
    band = lowpass(n, 2600) - lowpass(n, 900)
    env = np.exp(-t * 22) + 0.6 * np.exp(-((t - 0.012) * 300) ** 2) + 0.5 * np.exp(-((t - 0.024) * 300) ** 2)
    return band * env * 1.4


def bass(f, length=0.42):
    t = t_axis(length)
    saw = 2 * ((f * t) % 1) - 1
    env = np.exp(-t * 12)  # filter opens on the attack, then closes
    tone = lowpass(saw, 1200) * env + lowpass(saw, 300) * (1 - env)
    return tone * np.exp(-t * 4) * np.minimum(1, t / 0.005) * 0.55


def whoosh(length, rising=True):
    t = t_axis(length)
    n = rng.standard_normal(len(t))
    env = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 2
    lo, hi = lowpass(n, 600), lowpass(n, 4000)
    k = t / length if rising else 1 - t / length
    return (lo * (1 - k) + (hi - lo) * k) * env * 0.9


def impact():
    t = t_axis(1.6)
    boom = np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-t * 8)) / SR) * np.exp(-t * 2.5)
    return boom + lowpass(rng.standard_normal(len(t)), 900) * np.exp(-t * 6) * 0.8


def dropped(at):
    return any(a - 0.01 <= at < b for a, b in DROPS) or at >= 18.5


# drums and bass
for i in range(int(DUR / (BEAT / 2))):
    at = i * BEAT / 2
    if at < 1.0 or dropped(at):
        continue
    on_beat = i % 2 == 0
    if on_beat:
        place(kick(), at, 0.9)
        bar = int(at // 2) % 4
        place(bass(ROOTS[bar] * (2 if (i // 2) % 4 == 3 else 1)), at, 0.8)
    else:
        place(hat(open_=(i % 8 == 7)), at, 0.5, pan=0.3)
    if i % 4 == 2:
        place(clap(), at, 0.45, pan=-0.1)

# the opening words land on hits
for at in [0.15, 0.4, 0.65]:
    place(kick(), at, 0.8)
    place(click(), at, 0.3)
place(whoosh(1.0), 1.0, 0.5)

# phone UI
place(whoosh(0.5, rising=False), 2.0, 0.6, pan=0.2)
place(whoosh(0.5, rising=False), 12.0, 0.6, pan=0.2)
for at in TOUCHES:
    place(click(), at, 0.55)
for i, at in enumerate(TYPE_AT):
    place(click(), at - 0.02, 0.45, pan=-0.2 + i * 0.13)
    place(plop(), at + 0.04, 0.5, pan=-0.3 + i * 0.2)
place(whoosh(0.7), 4.3, 0.8)

# shaping
for at, kind in TOOLS:
    place(squish() if kind == 'press' else plop(150, 70, 0.25), at, 0.55)
place(scrape(CARVE[1]), CARVE[0], 0.35)

# kilns, with a riser into each and an impact out of the second
place(whoosh(1.0), 9.0, 0.6)
place(kiln(*FIRE1), FIRE1[0], 1.3)
place(dip(), 13.4, 0.6)
place(whoosh(0.5), 14.0, 0.6)
place(kiln(*FIRE2), FIRE2[0], 1.5)
place(impact(), 16.5, 0.9)

# glaze swaps and the sign-off
for at, semis in [(17.0, 4), (17.5, 7), (18.0, 12)]:
    place(bell(440 * 2 ** (semis / 12), 0.8), at, 0.2, pan=-0.3 + semis / 30)
place(impact(), 18.5, 0.6)
place(bell(440, 2.4), 18.5, 0.45)
place(bell(659.25, 2.4), 18.52, 0.3)
place(bell(880, 2.4), 18.54, 0.2)

fade = np.minimum(1, (DUR - np.arange(len(mix)) / SR) / 1.2)[:, None]
write(sys.argv[1] if len(sys.argv) > 1 else 'kiln-ad.wav', mix * fade)
