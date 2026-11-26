#!/usr/bin/env python3
"""Overlay the story's text draws onto the shape frames from scripts/render-greenscreen.mjs.

The Node renderer rasterises the story's shapes (its mock context has no font
renderer), so it records every text draw to out/greenscreen/texts.json with
absolute position, size and colour. This script draws those texts with Pillow
and the system bold font (DejaVuSans-Bold) into out/greenscreen/final/frame-XXXX.png.

    python3 scripts/greenscreen_texts.py [shapeDir] [finalDir]
"""

import glob
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SHAPE_DIR = sys.argv[1] if len(sys.argv) > 1 else "out/greenscreen"
FINAL_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(SHAPE_DIR, "final")
os.makedirs(FINAL_DIR, exist_ok=True)

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if not os.path.exists(FONT_PATH):
    raise SystemExit(f"missing font: {FONT_PATH}")

with open(os.path.join(SHAPE_DIR, "texts.json")) as fh:
    BY_FRAME = {}
    for t in json.load(fh):
        BY_FRAME.setdefault(t["frame"], []).append(t)

_fonts = {}


def font_for(size):
    key = max(1, int(round(size)))
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(FONT_PATH, key)
    return _fonts[key]


def parse_color(c):
    s = (c or "#000000").lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4))


ANCHORS = {"center": "mm", "left": "lm", "start": "lm", "right": "rm", "end": "rm"}

count = 0
files = sorted(glob.glob(os.path.join(SHAPE_DIR, "frame-*.png")))
for path in files:
    idx = int(os.path.basename(path)[6:10])
    img = Image.open(path).convert("RGB")
    d = ImageDraw.Draw(img)
    for t in BY_FRAME.get(idx, []):
        text = t["str"]
        if not text:
            continue
        d.text(
            (t["x"], t["y"]),
            text,
            fill=parse_color(t["color"]),
            font=font_for(t["size"]),
            anchor=ANCHORS.get(t["align"], "mm"),
        )
        count += 1
    img.save(os.path.join(FINAL_DIR, os.path.basename(path)))
print(f"overlaid {count} text draws onto {len(files)} frames -> {FINAL_DIR}")
