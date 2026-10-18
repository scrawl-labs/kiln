"""Soundtrack for promo/achievee/story.js (21 s, 120 bpm, bright and bubbly): a quiet intro under
the chat, a drop when the screen turns to petals, pops for every badge and a rising run as the
month blooms.

    python3 promo/achievee/soundtrack.py out.wav
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ad_soundtrack import clap, hat, impact, kick, whoosh  # noqa: E402
from soundtrack import SR, bell, click, lowpass, plop, rng, t_axis, write  # noqa: E402

DUR = 21.0
mix = np.zeros((int(SR * DUR), 2))
DROP, END = 5.4, 18.75
# C major, one chord per bar: C G Am F
BASS = [65.41, 49.0, 55.0, 43.65]
CHORDS = [[523.25, 659.25, 783.99], [493.88, 587.33, 783.99], [523.25, 659.25, 880.0], [523.25, 698.46, 880.0]]


def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if 0 <= i < len(mix):
        sig = sig[: len(mix) - i] * gain
        mix[i:i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
        mix[i:i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def pluck(f, length=0.35, bright=1.0):
    t = t_axis(length)
    tone = sum(a * np.sin(2 * np.pi * f * m * t) for m, a in [(1, 1), (2, 0.35 * bright), (3, 0.12 * bright)])
    return tone * np.exp(-t * 9) * np.minimum(1, t / 0.002) * 0.3


def bubble(f=900):
    """a soft upward 'bloop' for a badge popping in"""
    t = t_axis(0.16)
    fr = f * (1 + 0.9 * (t / 0.16))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / 0.16) ** 2 * 0.45


def sparkle():
    out = np.zeros(int(0.5 * SR))
    for k in range(5):
        b = bell(rng.uniform(2400, 4200), 0.3) * 0.25
        i = int(k * 0.035 * SR)
        out[i:i + len(b)] += b[: len(out) - i]
    return out


def bass(f, length=0.45):
    t = t_axis(length)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 5) * np.minimum(1, t / 0.004) * 0.6


def send():
    t = t_axis(0.28)
    f = 600 + 2600 * (t / 0.28) ** 1.5
    n = rng.standard_normal(len(t))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.12 + (lowpass(n, 5000) - lowpass(n, 1200)) * 0.5) * np.sin(np.pi * t / 0.28) ** 2


def receive():
    out = np.zeros(int(0.6 * SR))
    for f, d in [(1174.66, 0), (1567.98, 0.09)]:
        b = bell(f, 0.5) * 0.5
        i = int(d * SR)
        out[i:i + len(b)] += b[: len(out) - i]
    return out


# --- music
for n, at in enumerate(np.arange(0.4, DUR, 0.5)):
    bar = int((at - 0.4) // 2) % 4
    chord = CHORDS[bar]
    if at < DROP:
        if n % 2 == 0:
            place(pluck(chord[n % 3] / 2, 0.5, 0.6), at, 0.5, pan=-0.2)
        continue
    if at >= END:
        continue
    place(kick(), at, 0.75)
    place(bass(BASS[bar]), at, 0.7)
    place(hat(), at + 0.25, 0.35, pan=0.3)
    if n % 2 == 1:
        place(clap(), at, 0.3, pan=-0.1)
    # a little arpeggio on the off-beats
    place(pluck(chord[(n * 2) % 3], 0.3), at + 0.25, 0.35, pan=0.25)

# --- chat
place(receive(), 0.15, 0.6)
for at in (1.45, 2.45):
    place(send(), at - 0.05, 0.9, pan=0.3)
place(receive(), 3.6, 0.6)
for at in (4.55, 7.5, 10.9):
    place(click(), at, 0.7)

# --- the element
place(whoosh(0.9), DROP - 0.9, 0.6)
place(impact(), DROP, 0.5)
for start in (5.25, 6.25, 6.55, 7.75, 9.25, 11.15, 12.6, 14.0, 15.4):
    place(whoosh(0.35, rising=False), start, 0.3, pan=0.15)
for i in range(14):                                   # summary counting up
    place(click(), 8.25 + i * 0.05, 0.12)
for i in range(7):                                    # the week's badges
    place(bubble(700 + i * 90), 9.75 + i * 0.12, 0.6, pan=-0.45 + i * 0.15)
place(sparkle(), 9.8, 0.6)
place(sparkle(), 10.92, 0.8)                          # Wednesday picked
for i in range(4):                                    # tasks ticked
    place(pluck([1046.5, 1174.66, 1318.5, 1568.0][i], 0.25), 11.75 + i * 0.16, 0.5)
for i in range(4):                                    # mood dots
    place(bubble(1000 + i * 120), 13.15 + i * 0.1, 0.4)
for i in range(3):                                    # emotion chips
    place(bubble(1300 + i * 150), 13.75 + i * 0.13, 0.4)
place(whoosh(0.6), 14.75, 0.3)                        # bars grow
# the month blooms: a rising run of pops along the diagonal wave
for k in range(11):
    place(bubble(500 * 2 ** (k / 12 * 1.4)), 16.2 + k * 0.07, 0.45, pan=-0.5 + k * 0.1)
place(sparkle(), 16.6, 0.7)
place(sparkle(), 16.95, 0.6)
place(bell(1318.5, 1.0), 17.45, 0.35)                 # notification
place(bell(1760, 1.0), 17.56, 0.3)
place(impact(), END, 0.55)
for i in range(4):                                    # floaters land
    place(bubble(800 + i * 140), END + 0.2 + i * 0.08, 0.45, pan=-0.4 + i * 0.25)
place(bell(523.25, 2.2), END, 0.35)
place(bell(783.99, 2.2), END + 0.02, 0.25)
place(bell(1046.5, 2.2), END + 0.04, 0.18)

fade = np.minimum(1, (DUR - np.arange(len(mix)) / SR) / 1.0)[:, None]
write(sys.argv[1] if len(sys.argv) > 1 else 'achievee-story.wav', mix * fade)
