# KILN — clay type studio

Type a word and it is built out of clay. Work it with your hands, let it dry,
fire it, dip it in glaze and fire it again.

흙으로 빚는 글자. 단어를 입력하면 흙 덩어리가 글자로 빚어지고, 손으로 누르고
깎은 뒤 건조 → 초벌 → 시유 → 재벌 과정을 거쳐 도자기 글자로 완성됩니다.

## Process

| Step | | What happens |
| --- | --- | --- |
| 01 Wedge | 꼬박밀기 | Pick a clay body and a mould (letterform), then type. Each new letter is slapped on as a fresh lump. |
| 02 Shape | 성형 | Press, add, carve and smooth the clay. Drag the empty space to turn the banding wheel. |
| 03 Dry | 건조 | Water drops from 22% to bone dry; the clay pales and shrinks about 5%. |
| 04 Bisque | 초벌 | First firing to cone 08 (950°C). |
| 05 Glaze | 시유 | Choose a glaze and a dip depth. Raw glaze is chalky until fired. |
| 06 Glaze fire | 재벌 | Second firing to the body's cone. The glaze melts, runs and turns glossy. |

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
