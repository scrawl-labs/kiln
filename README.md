# KILN — clay type studio

Type a word and it is built out of clay. Work it with your hands, let it dry,
fire it, dip it in glaze and fire it again.

## Process

| Step | What happens |
| --- | --- |
| 01 Wedge | Pick a clay body and a mould (letterform), then type. Each new letter is slapped on as a fresh lump. |
| 02 Shape | Press, add, carve and smooth the clay. Drag the empty space to turn the banding wheel. |
| 03 Dry | Water drops from 22% to bone dry; the clay pales and shrinks about 5%. |
| 04 Bisque | First firing to cone 08 (950°C). |
| 05 Glaze | Choose a glaze and a dip depth. Raw glaze is chalky until fired. |
| 06 Glaze fire | Second firing to the body's cone. The glaze melts, runs and turns glossy. |

Keys in Shape: `1`–`4` tools, `[` `]` tool size, `⌘Z` / `Ctrl+Z` undo.

## How it works

- `js/clay.js` — the clay is a signed scalar field on a voxel grid. Glyphs are
  rasterised to a canvas, turned into a 2D signed distance field, then inflated
  into rounded coils. Hand tools edit the field directly (smooth-max dimples,
  smooth-min lumps, capsule grooves, local relaxation) and the surface is
  re-meshed with surface nets. Picking ray-marches the same field.
- `js/material.js` — one `MeshPhysicalMaterial` with injected shader code for
  moisture, iron speckle, grog bump, dipped glaze with runs and beading,
  glaze melt and kiln heat.
- `js/main.js` — scene, turntable, process steps, kiln log and firing curves.

No build step. Three.js r169 is vendored in `vendor/`.

## Run locally

```sh
npx http-server -c-1 .
# or
python3 -m http.server
```

Then open the printed address. It needs to be served over HTTP because it uses
ES modules.

## Promo reel

`promo/` holds the 25-second 9:16 reel (1080×1920, 30 fps). It reuses the
site's clay engine and shader, driven by a fixed script so every frame is
reproducible.

```sh
python3 promo/soundtrack.py reel.wav          # synthesised sound design (numpy)
node promo/render.mjs --out kiln-reel.mp4 --audio reel.wav   # needs playwright + ffmpeg
```

`--only 30,200,450` renders just those frames as PNGs for a quick check.

`promo/ad.html` is a second, 21-second cut in a UI-animation style: the site in a
phone, kinetic type cards and full-bleed clay close-ups, cut to a 120 bpm beat.

```sh
python3 promo/ad_soundtrack.py ad.wav
node promo/render.mjs --page ad.html --out kiln-ad.mp4 --audio ad.wav
```

`promo/story.html` is a third cut modelled on morphing UI ads: a chat story hands off to
one element that keeps changing shape (pill, app icon, input, option card, product card,
progress) until the fired piece and a notification.

```sh
python3 promo/story_soundtrack.py story.wav
node promo/render.mjs --page story.html --out kiln-story.mp4 --audio story.wav
```

`promo/asmr.html` is the wordless cut: macro shots with depth of field and bloom, close
foley (wet clay, the loop tool, the kiln, glaze pinging as it cools) and one-line captions.

```sh
python3 promo/asmr_soundtrack.py asmr.wav
node promo/render.mjs --page asmr.html --out kiln-asmr.mp4 --audio asmr.wav
```
