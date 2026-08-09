# tetrio-tui theme authoring

Drop a JSON file into `~/.config/tetrio-tui/themes/` (or `$XDG_CONFIG_HOME/tetrio-tui/themes/`)
and it appears in **CONFIG → VIDEO → THEME** — no rebuild, no restart of the app beyond
re-opening the config screen. The file name (minus `.json`) is the theme key.

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

Every color the TUI uses is overridable. Values are `#rgb` / `#rrggbb` hex strings
or `[r, g, b]` arrays. Missing colors fall back to the `extends` theme (default `tetrio`),
so a one-color theme is fine.

| group | keys |
|---|---|
| depth layers | `base` `mantle` `surface` `overlay` (aliases: `bg` `panel` `panelAlt`) |
| borders | `border` `borderBright` `borderActive` `borderSubtle` `boardFrame` |
| text | `text` `subtext` `dim` `faint` |
| accents | `accent` `accent2` `good` `warn` `bad` `info` |
| menu sections | `league` `solo` `channel` `config` |
| board | `boardA` `boardB` (checkerboard) `gridLine` |
| game | `ghost` `garbage` `lockFlash` `clearFlash` |
| pieces | `pieces.i` `pieces.o` `pieces.t` `pieces.s` `pieces.z` `pieces.l` `pieces.j` `pieces.g` (garbage) `pieces.ghost` |

`pieces` may also be a nested object: `"pieces": { "i": "#2ee6ff" }`.

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
— any of them works as an `extends` base (disk themes can extend each other too;
later files in alphabetical order win key collisions).

## piece styles & more

Piece rendering is a separate axis: CONFIG → VIDEO → PIECE STYLE
(`bevel` `flat` `outline` `gradient` `halfblock` `shiny`), plus MINIMAL MODE
(no ASCII art / shake / particles). Everything composes with themes.
