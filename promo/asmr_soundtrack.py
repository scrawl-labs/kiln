"""Close-up foley for promo/asmr.js (20 s): wet clay, the loop tool, the kiln, and the
high pings a glaze makes as it cools.

    python3 promo/asmr_soundtrack.py out.wav
"""
import sys

import numpy as np

from soundtrack import SR, bell, click, dip, kiln, lowpass, plop, rng, scrape, t_axis, write

DUR = 20.0
mix = np.zeros((int(SR * DUR), 2))


def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if 0 <= i < len(mix):
        sig = sig[: len(mix) - i] * gain
        mix[i:i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
        mix[i:i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def squelch(length):
    """slow wet pressure: filtered noise with little suction pops"""
    t = t_axis(length)
    env = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 1.5
    body = lowpass(rng.standard_normal(len(t)), 700) * 3.2 * env
    pops = np.zeros_like(t)
    for _ in range(int(length * 14)):
        i = int(rng.uniform(0, len(t) - 2000))
        p = plop(rng.uniform(260, 420), rng.uniform(90, 140), 0.05)
        pops[i:i + len(p)] += p[: len(t) - i] * rng.uniform(0.05, 0.18)
    return body + pops


def crackle(length, density=60, gain=0.25):
    t = t_axis(length)
    out = lowpass(rng.standard_normal(len(t)), 6000) * 0.02
    for _ in range(int(length * density)):
        i = int(rng.uniform(0, len(t) - 2000))
        c = click()
        out[i:i + len(c)] += c[: len(t) - i] * rng.uniform(0.05, gain)
    return out


def ping(f):
    """a glaze crazing as it cools: tiny, high, glassy"""
    t = t_axis(1.2)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.71 * t)) * np.exp(-t * 7) * np.minimum(1, t / 0.0008) * 0.35


def bubbles(length):
    out = np.zeros(int(length * SR))
    for _ in range(int(length * 9)):
        at = rng.uniform(0, length - 0.1)
        b = plop(rng.uniform(500, 900), rng.uniform(250, 400), 0.07)
        i = int(at * SR)
        out[i:i + len(b)] += b[: len(out) - i] * rng.uniform(0.05, 0.15)
    return out


def pad():
    t = t_axis(DUR)
    out = np.zeros_like(t)
    for f, a in [(98, 0.5), (146.83, 0.32), (196, 0.22), (246.94, 0.14), (293.66, 0.1)]:
        out += a * np.sin(2 * np.pi * f * t + 0.4 * np.sin(2 * np.pi * 0.13 * t + f)) * (0.65 + 0.35 * np.sin(2 * np.pi * 0.09 * t + f))
    duck = 1 - 0.75 * (np.clip((t - 7.6) / 0.4, 0, 1) * (t < 10.0)) - 0.75 * (np.clip((t - 11.6) / 0.4, 0, 1) * (t < 13.8))
    fade = np.minimum(1, t / 1.5) * np.minimum(1, (DUR - t) / 1.5)
    return lowpass(out, 1200) * fade * duck * 0.045


place(pad(), 0)
# wedge: lumps slapped down
for i, at in enumerate([0.3, 0.75, 1.2, 1.65]):
    place(plop(170, 55, 0.3), at + 0.1, 0.8, pan=-0.3 + i * 0.2)
    place(squelch(0.18), at + 0.1, 0.35, pan=-0.3 + i * 0.2)
place(squelch(0.85), 2.72, 0.7, pan=-0.15)        # press
place(scrape(0.95), 4.03, 0.32, pan=0.15)          # carve
place(crackle(0.9, 30, 0.12), 4.03, 0.6, pan=0.15)
place(squelch(0.6), 5.28, 0.6, pan=0.2)            # add
place(crackle(1.2, 25, 0.1), 6.3, 0.7)             # drying
place(kiln(7.6, 10.4, 950)[: int(2.4 * SR)], 7.6, 1.2)
place(crackle(2.2, 18, 0.2), 7.8, 0.6)
place(dip(), 10.2, 0.7)                            # dip
place(bubbles(1.0), 10.35, 0.8)
place(kiln(11.6, 14.6, 1240)[: int(2.2 * SR)], 11.6, 1.4)
place(crackle(2.0, 20, 0.22), 11.8, 0.6)
for at, f in zip(np.sort(rng.uniform(13.9, 15.8, 9)), rng.uniform(2600, 5200, 9)):
    place(ping(f), at, 0.5, pan=rng.uniform(-0.6, 0.6))
for i, at in enumerate([16.0, 16.4, 16.8, 17.2]):
    place(ping([3136, 3520, 3951, 4699][i]), at, 0.6, pan=-0.3 + i * 0.2)
place(bell(587.33, 2.4), 17.6, 0.35)
place(bell(880, 2.4), 17.62, 0.22)

fade = np.minimum(1, (DUR - np.arange(len(mix)) / SR) / 1.0)[:, None]
write(sys.argv[1] if len(sys.argv) > 1 else 'kiln-asmr.wav', mix * fade)
