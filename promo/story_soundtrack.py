"""Soundtrack for promo/story.js: sparse intro under the chat, a drop when the screen
flips to white, a break for the kiln and a hit on the reveal (20.5 s, 120 bpm).

    python3 promo/story_soundtrack.py out.wav
"""
import sys

import numpy as np

from ad_soundtrack import bass, clap, hat, impact, kick, whoosh
from soundtrack import SR, bell, click, kiln, lowpass, rng, t_axis, write

DUR = 20.5
mix = np.zeros((int(SR * DUR), 2))
DROP, BREAK, REVEAL, END = 5.4, 15.4, 17.2, 18.75
ROOTS = [55.0, 43.65, 65.41, 49.0]


def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if 0 <= i < len(mix):
        sig = sig[: len(mix) - i] * gain
        mix[i:i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
        mix[i:i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def send():
    """outgoing message: a quick rising swoosh"""
    t = t_axis(0.28)
    f = 600 + 2600 * (t / 0.28) ** 1.5
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.12
    n = rng.standard_normal(len(t))
    air = (lowpass(n, 5000) - lowpass(n, 1200)) * 0.5
    return (tone + air) * np.sin(np.pi * t / 0.28) ** 2


def receive():
    """incoming message: two soft glassy notes"""
    return np.concatenate([bell(1174.66, 0.09), np.zeros(10)]) * 0.6, bell(1567.98, 0.5) * 0.5


def pluck(f, length=0.6):
    t = t_axis(length)
    tone = sum(a * np.sin(2 * np.pi * f * m * t) for m, a in [(1, 1), (2, 0.4), (3, 0.15)])
    return tone * np.exp(-t * 6) * np.minimum(1, t / 0.003) * 0.25


def chime():
    out = np.zeros(int(SR * 1.2))
    for k, (f, d) in enumerate([(1318.5, 0), (1760, 0.11)]):
        b = bell(f, 1.0)
        i = int(d * SR)
        out[i:i + len(b)] += b[: len(out) - i]
    return out * 0.7


# --- music
beats = np.arange(0.4, DUR, 0.5)
for n, at in enumerate(beats):
    bar = int((at - 0.4) // 2) % 4
    if at < DROP:  # intro: a pulse on every other beat and a quiet pluck line
        if n % 2 == 0:
            place(kick(), at, 0.45)
            place(pluck([220, 261.63, 329.63, 293.66][bar]), at, 0.6, pan=-0.2)
        continue
    if BREAK <= at < REVEAL or at >= END:
        continue
    place(kick(), at, 0.9)
    place(bass(ROOTS[bar] * (2 if n % 4 == 3 else 1)), at, 0.75)
    place(hat(), at + 0.25, 0.45, pan=0.3)
    if n % 2 == 1:
        place(clap(), at, 0.4, pan=-0.1)
    if n % 8 == 7:
        place(hat(open_=True), at + 0.25, 0.4, pan=0.3)

# --- the chat
place(receive()[0], 0.15, 0.5); place(receive()[1], 0.24, 0.5)
for at in (1.45, 2.45):
    place(send(), at - 0.05, 0.9, pan=0.3)
place(receive()[0], 3.6, 0.5); place(receive()[1], 3.69, 0.5)
for at in (4.55, 9.4, 11.0):
    place(click(), at, 0.7)

# --- the morphing element
place(whoosh(0.9), DROP - 0.9, 0.6)
place(impact(), DROP, 0.55)
for start in (5.25, 6.25, 6.55, 8.1, 9.65, 11.15, 11.45, 14.0):
    place(whoosh(0.35, rising=False), start, 0.35, pan=0.15)
for i, at in enumerate((7.3, 7.45, 7.6, 7.75)):
    place(click(), at, 0.4, pan=-0.2 + i * 0.12)
for i in range(9):
    place(click(), 11.95 + i * 0.1, 0.12)
place(bell(1046.5, 0.6), 12.9, 0.2)
place(bell(1318.5, 0.6), 13.5, 0.2)

# --- the kiln and the reveal
place(whoosh(1.0), BREAK - 0.6, 0.6)
place(kiln(BREAK, REVEAL + 0.2, 1240), BREAK, 1.3)
place(whoosh(1.2), REVEAL - 1.2, 0.7)
place(impact(), REVEAL, 0.9)
place(chime(), 17.55, 0.6)
place(impact(), END, 0.7)
place(bell(440, 2.4), END, 0.4)
place(bell(659.25, 2.4), END + 0.02, 0.28)

fade = np.minimum(1, (DUR - np.arange(len(mix)) / SR) / 1.0)[:, None]
write(sys.argv[1] if len(sys.argv) > 1 else 'kiln-story.wav', mix * fade)
