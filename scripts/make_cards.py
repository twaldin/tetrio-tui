"""Generate section title cards for the tetrio-tui demo (PIL)."""
from PIL import Image, ImageDraw, ImageFont
import sys, os

W, H = 900, 782  # match DPR-1 game frames
BG = (8, 8, 14)
ACCENT = (255, 85, 200)
TEXT = (235, 235, 245)
DIM = (150, 150, 180)

FONT_BIG = "/System/Library/Fonts/Menlo.ttc"
def font(sz):
    return ImageFont.truetype(FONT_BIG, sz)

def card(path, lines):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    total_h = sum(sz + 14 for _, sz, _ in lines) - 14
    y = (H - total_h) // 2
    for text, sz, color in lines:
        f = font(sz)
        bbox = d.textbbox((0, 0), text, font=f)
        tw = bbox[2] - bbox[0]
        d.text(((W - tw) // 2, y), text, font=f, fill=color)
        y += sz + 14
    im.save(path)

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
card(f"{out}/title.png", [("tetrio-tui", 64, ACCENT), ("a terminal TETR.IO client", 28, TEXT)])
card(f"{out}/themes.png", [("8 THEMES", 48, TEXT), ("+ load your own from disk", 24, DIM)])
card(f"{out}/configs.png", [("PIECE STYLES", 48, TEXT), ("x BORDER STYLES", 48, TEXT), ("bevel / flat / shiny / halfblock ...", 22, DIM)])
card(f"{out}/minimal.png", [("MINIMAL MODE", 44, TEXT), ("no ascii, no shake, no particles", 22, DIM)])
card(f"{out}/game40.png", [("40 LINES", 48, TEXT), ("auto-played - all back-to-back", 22, DIM)])
card(f"{out}/blitz.png", [("BLITZ", 52, TEXT), ("2 minutes - all back-to-back", 22, DIM)])
print("cards written to", out)
