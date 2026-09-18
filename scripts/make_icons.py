#!/usr/bin/env python3
"""Raster home-screen icons from the WIRING W-wire mark."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "public"
INK = (34, 36, 58)
WIRE_A = (125, 130, 196)
WIRE_B = (201, 137, 154)
NODE = (244, 245, 251)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def wire_points(size: int) -> list[tuple[float, float]]:
    return [
        (0.20 * size, 0.28 * size),
        (0.355 * size, 0.74 * size),
        (0.50 * size, 0.40 * size),
        (0.645 * size, 0.74 * size),
        (0.80 * size, 0.28 * size),
    ]


def stamp_wire(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], width: float, color: tuple[int, int, int]) -> None:
    radius = width / 2
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        dist = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(dist / max(1.0, radius * 0.28)))
        for step in range(steps + 1):
            t = step / steps
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def paint(size: int) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGB", (s, s), INK)
    overlay = Image.new("RGB", (s, s), INK)
    px = overlay.load()
    for y in range(s):
        for x in range(s):
            t = (x * 0.62 + y * 0.38) / s
            px[x, y] = mix(WIRE_A, WIRE_B, t)
    mask = Image.new("L", (s, s), 0)
    draw = ImageDraw.Draw(mask)
    points = wire_points(s)
    stamp_wire(draw, points, s * 0.118, 255)
    glow = mask.filter(ImageFilter.GaussianBlur(s * 0.03))
    img.paste(overlay, mask=glow)
    img.paste(overlay, mask=mask)
    nodes = ImageDraw.Draw(img)
    r = s * 0.048
    for x, y in (points[1], points[3]):
        nodes.ellipse((x - r, y - r, x + r, y + r), fill=NODE)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for size, name in ((180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        paint(size).save(ROOT / name, "PNG", optimize=True)
        print(ROOT / name)


if __name__ == "__main__":
    main()
