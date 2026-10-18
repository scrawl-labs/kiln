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
