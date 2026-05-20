# Ru-Soam — brand icon assets

The Lepcha cane suspension bridge, rendered as a freeform glyph.
Built from one 64-unit vector source; all rasters export from it without
hand-editing.

## Folder layout

```
icon/
├── README.md                  ← this file
├── master/                    ← vector source of truth (do edits here)
│   ├── bridge.full.svg        ← currentColor variant for inlining in app code
│   ├── bridge.full.light.svg  ← #F0EDE5 fill — for dark-mode raster export
│   ├── bridge.full.dark.svg   ← #2A2A26 fill — for light-mode raster export
│   ├── bridge.simple.svg      ← currentColor, no hangers (≤24px)
│   ├── bridge.simple.light.svg
│   ├── bridge.simple.dark.svg
│   ├── bridge.tile.svg        ← squircle ground + bridge — for installer / About
│   └── bridge.mask.svg        ← single white path — for tray / menu-bar templates
└── png/
    ├── light/                 ← dark-mode rasters (light glyph on dark dock)
    │   └── bridge-{1024,512,256,128,64,48,32,24,16}.png
    ├── dark/                  ← light-mode rasters (dark glyph on light dock)
    │   └── bridge-{1024,512,256,128,64,48,32,24,16}.png
    ├── tile/                  ← squircle variant for installer / About / App Store
    │   └── bridge-tile-{1024,512,256,128,48}.png
    └── mask/                  ← pure-white silhouette for tray / menu-bar template
        └── bridge-mask-{512,256,128,64,32,16}.png
```

> **Simplified silhouette** (no hangers) is used for the **24 px** and **16 px**
> rungs — the 2u hanger strokes don't survive sub-pixel rounding below 32 px.
> Everything ≥ 32 px uses the full bridge.

## Colours baked into the rasters

| Token            | Hex       | Used in                              |
| ---------------- | --------- | ------------------------------------ |
| bamboo accent    | `#B8C66F` | tile ground                          |
| accent-fg (dark) | `#1F1F17` | bridge inside the tile               |
| fg-primary light | `#F0EDE5` | glyph on dark-mode surfaces          |
| fg-primary dark  | `#2A2A26` | glyph on light-mode surfaces         |
| white            | `#FFFFFF` | mask icon (OS recolours at runtime)  |

If the bamboo accent changes, re-edit `bridge.tile.svg` and re-run the export.

## Bundling for shipping

The browser sandbox can't produce `.icns` / `.ico` directly. Run these from
your dev machine once the PNG set is committed.

### macOS `.icns`

```sh
cd icon/png/light                                # or dark for light-mode builds

mkdir bridge.iconset
cp bridge-16.png  bridge.iconset/icon_16x16.png
cp bridge-32.png  bridge.iconset/icon_16x16@2x.png
cp bridge-32.png  bridge.iconset/icon_32x32.png
cp bridge-64.png  bridge.iconset/icon_32x32@2x.png
cp bridge-128.png bridge.iconset/icon_128x128.png
cp bridge-256.png bridge.iconset/icon_128x128@2x.png
cp bridge-256.png bridge.iconset/icon_256x256.png
cp bridge-512.png bridge.iconset/icon_256x256@2x.png
cp bridge-512.png bridge.iconset/icon_512x512.png
cp bridge-1024.png bridge.iconset/icon_512x512@2x.png

iconutil -c icns bridge.iconset -o ../../bundles/ru-soam.icns
```

> The macOS dock historically expects the **tile** form for shipped apps.
> If you're shipping a normal app and want it to feel native in the dock,
> build the `.icns` from `icon/png/tile/` instead — `.icns` doesn't carry
> transparency the same way for icon thumbnails.

### Windows `.ico`

```sh
# ImageMagick — Windows expects multi-size .ico
magick \
  icon/png/light/bridge-16.png \
  icon/png/light/bridge-24.png \
  icon/png/light/bridge-32.png \
  icon/png/light/bridge-48.png \
  icon/png/light/bridge-64.png \
  icon/png/light/bridge-128.png \
  icon/png/light/bridge-256.png \
  icon/bundles/ru-soam.ico
```

### Electron / Tauri config

```jsonc
{
  "icon": "icon/bundles/ru-soam.icns",        // macOS
  "win": { "icon": "icon/bundles/ru-soam.ico" },
  "linux": { "icon": "icon/png/light/bridge-512.png" }
}
```

### Tray / menu-bar template (macOS)

```js
const tray = new Tray(path.join(__dirname, 'icon/png/mask/bridge-mask-16.png'));
tray.setImage(nativeImage.createFromPath(...).setTemplateImage(true));
```

The mask PNG is pure white on transparent. `setTemplateImage(true)` tells
macOS to render it as a template — it adopts the menu-bar colour automatically
(light in light menu bar, white in dark menu bar, blue when selected).

## Re-exporting

If you edit one of the master SVGs, re-run the raster batches in
`Brand Icon A - Spec.html` (or its successor) to regenerate the PNGs.
Don't hand-edit PNGs.
