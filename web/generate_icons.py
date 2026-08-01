"""Erzeugt die App-Icons (PNG) fuer die PWA. Aufruf:  python generate_icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)

BG = (15, 17, 21, 255)        # #0f1115
RED = (255, 40, 40, 255)      # Play-Button
LINE = (232, 234, 237, 255)   # Zusammenfassungs-Linien
LINE2 = (154, 163, 178, 255)  # gedaempfte Linie


def make(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        # Volle Flaeche (das System maskiert), Inhalt im sicheren Innenbereich.
        d.rectangle([0, 0, size, size], fill=BG)
        margin = size * 0.20
    else:
        r = size * 0.22
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
        margin = size * 0.16

    cw = size - 2 * margin          # Breite des Inhaltsbereichs
    ox = margin
    oy = margin

    # Roter Play-Button (abgerundete Karte)
    card_w = cw * 0.92
    card_h = cw * 0.50
    card_x = ox + (cw - card_w) / 2
    card_y = oy + cw * 0.02
    d.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                        radius=card_h * 0.30, fill=RED)

    # Weisses Play-Dreieck
    tri = card_h * 0.46
    cx = card_x + card_w / 2
    cy = card_y + card_h / 2
    d.polygon([(cx - tri * 0.42, cy - tri * 0.62),
               (cx - tri * 0.42, cy + tri * 0.62),
               (cx + tri * 0.70, cy)], fill=(255, 255, 255, 255))

    # Drei "Zusammenfassungs"-Linien darunter
    line_h = cw * 0.085
    gap = cw * 0.075
    ly = card_y + card_h + cw * 0.13
    widths = [(1.0, LINE), (0.82, LINE), (0.55, LINE2)]
    for w, col in widths:
        d.rounded_rectangle([ox, ly, ox + cw * w, ly + line_h],
                            radius=line_h / 2, fill=col)
        ly += line_h + gap

    return img


make(192).save(os.path.join(OUT, "icon-192.png"))
make(512).save(os.path.join(OUT, "icon-512.png"))
make(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
print("Icons erstellt in", OUT)
