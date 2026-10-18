"""Synthesise the reel's sound design, timed to promo/reel.js.

    python3 promo/soundtrack.py out.wav
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 25.0
rng = np.random.default_rng(7)
n = int(SR * DUR)
mix = np.zeros((n, 2))

TYPE_AT = [0.45, 0.8, 1.15, 1.5]
TOOLS = [(3.55, 'press'), (3.95, 'press'), (4.35, 'press'), (4.85, 'add')]
CARVE = (5.35, 0.7)
SCENES = [3.2, 6.6, 8.8, 11.8, 14.0, 17.8, 20.2, 22.6]
BISQUE = (9.0, 11.6, 950)
GLOST = (14.3, 17.6, 1240)
DIP = 12.1
MONTAGE = [20.2 + i * 0.48 for i in range(5)]


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= n:
        return
    sig = sig[: n - i] * gain
    left, right = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    mix[i:i + len(sig), 0] += sig * left
    mix[i:i + len(sig), 1] += sig * right


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def click():
    t = t_axis(0.03)
    return rng.standard_normal(len(t)) * np.exp(-t * 260) * 0.5 + np.sin(2 * np.pi * 3200 * t) * np.exp(-t * 400) * 0.2


def plop(f0=190, f1=62, length=0.22):
    t = t_axis(length)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 16)
    thud = lowpass(rng.standard_normal(len(t)), 500) * np.exp(-t * 45) * 2.5
    return body + thud


def squish(length=0.18):
    t = t_axis(length)
    env = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 2
    return lowpass(rng.standard_normal(len(t)), 900) * env * 3 + plop(120, 55, length) * 0.5


def scrape(length):
    t = t_axis(length)
    env = np.minimum(1, t / 0.05) * np.minimum(1, (length - t) / 0.1)
    noise = rng.standard_normal(len(t))
    band = lowpass(noise, 3500) - lowpass(noise, 1200)
    grit = 1 + 0.6 * np.sin(2 * np.pi * 23 * t)
    return band * env * grit * 1.6


def tick():
    t = t_axis(0.05)
    return np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120) * 0.35


def bell(f=660, length=2.2):
    t = t_axis(length)
    out = np.zeros_like(t)
    for ratio, amp, decay in [(1, 1, 2.2), (2.76, 0.45, 3.5), (5.4, 0.25, 5), (8.9, 0.12, 7)]:
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * decay)
    return out * np.minimum(1, t / 0.004) * 0.4


def kiln_profile(u, peak):
    if u < 0.55:
        x = u / 0.55
        e = 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
        return 20 + (peak - 20) * e
    if u < 0.66:
        return peak
    return 20 + (peak - 20) * np.exp(-((u - 0.66) / 0.34) * 3.4)


def kiln(start, end, peak):
    length = end - start + 0.6
    t = t_axis(length)
    temps = np.array([kiln_profile(min(1, x / (end - start)), peak) for x in t[::200]])
    env = np.interp(t, t[::200], np.clip((temps - 150) / (1240 - 150), 0, 1)) ** 1.3
    brown = np.cumsum(rng.standard_normal(len(t)))
    brown -= lowpass(brown, 8)
    roar = lowpass(brown, 220) * 0.04
    hiss = lowpass(rng.standard_normal(len(t)), 2500) * 0.08
    flutter = 1 + 0.25 * np.sin(2 * np.pi * 5.3 * t) * np.sin(2 * np.pi * 0.7 * t)
    sig = (roar + hiss * env) * env * flutter
    crackle = np.zeros_like(t)
    for _ in range(int(40 * peak / 1240)):
        at = rng.uniform(0.25, 0.75) * (end - start)
        i = int(at * SR)
        k = click()[: len(t) - i]
        crackle[i:i + len(k)] += k * rng.uniform(0.2, 0.6) * env[i]
    return sig + crackle * 0.6


def dip():
    t = t_axis(1.2)
    f = 300 + 500 * np.exp(-t * 3)
    gl = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4) * 0.4
    wash = lowpass(rng.standard_normal(len(t)), 1400) * np.sin(np.pi * np.clip(t / 1.2, 0, 1)) * 1.4
    return gl + wash


def pad():
    t = t_axis(DUR)
    out = np.zeros_like(t)
    for f, a in [(110, 0.5), (164.81, 0.35), (220, 0.25), (277.18, 0.18), (329.63, 0.12)]:
        lfo = 0.6 + 0.4 * np.sin(2 * np.pi * (0.07 + f / 4000) * t + f)
        out += a * np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.2 * t)) * lfo
    fade = np.minimum(1, t / 1.2) * np.minimum(1, (DUR - t) / 1.5)
    duck = np.ones_like(t)
    for s, e, _ in (BISQUE, GLOST):
        duck -= 0.6 * np.clip(np.minimum((t - s) / 0.6, (e + 0.6 - t) / 0.6), 0, 1)
    return lowpass(out, 1800) * fade * duck * 0.05


place(pad(), 0)
for i, at in enumerate(TYPE_AT):
    place(click(), at - 0.02, 0.5, pan=-0.2 + i * 0.13)
    place(plop(), at + 0.05, 0.55, pan=-0.3 + i * 0.2)
for at, kind in TOOLS:
    place(squish() if kind == 'press' else plop(150, 70, 0.25), at, 0.5)
place(scrape(CARVE[1]), CARVE[0], 0.35, pan=-0.1)
for at in SCENES:
    place(tick(), at, 0.6)
place(kiln(*BISQUE), BISQUE[0], 1.0)
place(kiln(*GLOST), GLOST[0], 1.2)
place(dip(), DIP, 0.6)
for i, at in enumerate(MONTAGE):
    place(bell(523.25 * 2 ** ([0, 4, 7, 9, 12][i] / 12), 0.9), at, 0.18, pan=-0.4 + i * 0.2)
place(bell(523.25), 22.6, 0.5)
place(bell(783.99), 22.62, 0.3)

peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.4) * 0.85
pcm = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'kiln-reel.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
