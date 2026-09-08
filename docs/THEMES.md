# tetrio-tui theme authoring

Drop a JSON file into `~/.config/tetrio-tui/themes/` (or `$XDG_CONFIG_HOME/tetrio-tui/themes/`),
then restart the app to load it. Select it in **CONFIG → VIDEO → THEME** — no rebuild needed.
Re-opening CONFIG does not reload files. The file name (minus `.json`) is the theme key.

```json
{
  "name": "Synthwave",
  "extends": "tetrio",
  "colors": {
    "accent": "#ff2e88",
    "pieces": { "i": "#2ee6ff", "ghost": [70, 70, 95] },
    "pieces.t": "#ff2e88",
    "boardA": "#10101c"
  },
  "borders": { "h": "═", "v": "║", "tl": "╔", "tr": "╗", "bl": "╚", "br": "╝" },
  "words": { "tetris": "WAVE", "single": "BLIP", "tspin": "T-SPIN", "allclear": "ALL CLEAR" }
}
```

## colors

The theme color fields below accept `#rgb` / `#rrggbb` hex strings or `[r, g, b]` arrays.
Missing colors fall back to the `extends` theme (default `tetrio`), so a one-color theme is fine.

| group | keys |
|---|---|
| depth layers | `bg` (screen background) `panel` (panel fill); accepted fields `base` `mantle` `surface` `overlay` `panelAlt` are not currently read by the renderer |
| borders | `border` `borderBright` `borderActive` `borderSubtle` `boardFrame` |
| text | `text` `subtext` `dim` `faint` |
| accents | `accent` `accent2` `good` `warn` `bad` `info` |
| menu sections | `league` `solo` `channel` `config` |
| board | `boardA` `boardB` (checkerboard) `gridLine` |
| game | `ghost` `garbage` `lockFlash` `clearFlash` |
| pieces | `pieces.i` `pieces.o` `pieces.t` `pieces.s` `pieces.z` `pieces.l` `pieces.j` `pieces.g` (garbage) `pieces.ghost` |

`pieces` may also be a nested object: `"pieces": { "i": "#2ee6ff" }`.

The loader assigns each color field independently. Setting `base`, `mantle` or `surface`
does not update `bg`, `panel` or `panelAlt`; set `bg` and `panel` for visible background changes.

## borders

Glyph overrides applied on top of the active **BORDER STYLE** preset
(CONFIG → VIDEO → BORDER STYLE): `tl` `tr` `bl` `br` (corners), `h` (top edge),
`hb` (bottom edge — tetro-tui's solid `▀` floor trick), `v` (sides),
`titleL` / `titleR` (the ┤ ├ panel-title joins). Any subset.

## words

Action-text word overrides: `single` `double` `triple` `tetris` `tspin`
`tspin_mini` `allclear`. The big block-font popup uses your word instead.

## built-in themes

`tetrio` `tokyo-night` `catppuccin` `gruvbox` `nord` `dracula` `solarized` `monokai`
— any of them works as an `extends` base. Files load once in alphabetical order;
to extend another disk theme, its file must sort before yours. An unknown or not-yet-loaded
base falls back to `tetrio`. A disk theme with a built-in key replaces that entry.

## piece styles & more

Piece rendering is a separate axis: CONFIG → VIDEO → PIECE STYLE
(`bevel` `flat` `blocks` `shiny` `outline` `gradient` `halfblock` `ascii` `braille`
`nes` `elektronika`), plus MINIMAL MODE (no ASCII art / shake / particles).
Everything composes with themes.
