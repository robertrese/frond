"""Draw Frond's app icons from the leaf mark.

Usage: python -I icons.py <frond dir>

Writes assets/icons/: icon-192.png, icon-512.png, maskable-512.png,
apple-touch-icon.png (180) and favicon-32.png. The leaf is the same path as
the in-app brand mark (a 26 x 30 box): a green leaf printed over an offset
pink one, on paper.
"""
import pathlib
import sys

from PIL import Image, ImageDraw

PAPER, GREEN, PINK = (242, 235, 221), (0, 112, 79), (255, 94, 126)
SS = 4  # supersampling factor


def bezier(p0, p1, p2, p3, steps=48):
    out = []
    for i in range(steps + 1):
        t = i / steps
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


# M13 29 C 3 21, 2 9, 13 1 C 24 9, 23 21, 13 29 Z
LEAF = bezier((13, 29), (3, 21), (2, 9), (13, 1)) + bezier((13, 1), (24, 9), (23, 21), (13, 29))
VEINS = [((13, 27), (13, 5)), ((13, 12), (8, 8)), ((13, 17), (18, 13)), ((13, 22), (8, 18))]


def draw(size, leaf_height, round_corners):
    big = size * SS
    img = Image.new("RGBA", (big, big), PAPER + (255,) if not round_corners else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if round_corners:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=PAPER)
    scale = big * leaf_height / 30
    ox, oy = big / 2 - 13 * scale, big / 2 - 15 * scale
    pt = lambda x, y, dx=0, dy=0: (ox + x * scale + dx, oy + y * scale + dy)
    off = big * 0.035
    d.polygon([pt(x, y, off, off * 0.7) for x, y in LEAF], fill=PINK)
    d.polygon([pt(x, y) for x, y in LEAF], fill=GREEN)
    w = max(1, int(scale * 2))
    for a, b in VEINS:
        d.line([pt(*a), pt(*b)], fill=PAPER, width=w)
        for p in (a, b):
            cx, cy = pt(*p)
            d.ellipse((cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2), fill=PAPER)
    return img.resize((size, size), Image.LANCZOS)


root = pathlib.Path(sys.argv[1]).resolve()
out = root / "assets" / "icons"
out.mkdir(parents=True, exist_ok=True)
draw(192, 0.72, False).save(out / "icon-192.png")
draw(512, 0.72, False).save(out / "icon-512.png")
# maskable: keep the leaf inside the central safe circle (80% of the canvas)
draw(512, 0.56, False).save(out / "maskable-512.png")
draw(180, 0.68, False).convert("RGB").save(out / "apple-touch-icon.png")
draw(32, 0.86, True).save(out / "favicon-32.png")
print("icons written to", out)
