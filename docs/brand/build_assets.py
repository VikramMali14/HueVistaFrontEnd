#!/usr/bin/env python3
"""Regenerate the HueVista brand assets in public/brand/ and public/.

    pip install pillow cairosvg
    python3 docs/brand/build_assets.py

Inputs (this directory)
    source-artwork.png   the supplied mark — a circle cropped off at y=617
    mark-simple.svg      the simplified arch, drawn to survive favicon sizes

The painterly mark is framed as an arch rather than a circle: the artwork's
bottom third was cropped away before it reached us, and an arch uses the crop
line as a deliberate base instead of inventing brushwork to close the disc.
The only pixels added are flat lilac field, which is what the field already
was. See README.md in public/brand/.

The social card needs the real brand faces. They are fetched from Google Fonts
at build time rather than vendored, since nothing else here needs them.
"""
from __future__ import annotations

import io
import os
import re
import shutil
import urllib.request
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent.parent / "public"
BRAND = PUBLIC / "brand"

# Geometry of the supplied artwork, measured from its own pixels.
CX, CY, R, CUT = 490, 490, 391, 617
LILAC = (212, 201, 250)      # the circle's flat field
INK = (10, 9, 15)            # --bg
IVORY = (234, 232, 227)      # --fg
MUTE = (143, 141, 166)       # --fg-mute
ACCENT_SOFT = (160, 128, 255)
PAD, CORNER = 52, 34


def build_mark() -> Image.Image:
    """Arch-framed painterly mark, transparent, 1024px wide."""
    art = Image.open(HERE / "source-artwork.png").convert("RGBA")
    r2 = R + PAD
    left, top = CX - r2, CY - r2
    w, h = 2 * r2, CUT - top

    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    cx, cy = CX - left, CY - top
    d.pieslice([cx - r2, cy - r2, cx + r2, cy + r2], 180, 360, fill=255)
    d.rectangle([0, cy, w, h - CORNER], fill=255)
    d.rounded_rectangle([0, h - 2 * CORNER, w, h], radius=CORNER, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.5))

    plate = Image.new("RGBA", (w, h), LILAC + (255,))
    plate.alpha_composite(art, (-left, -top))
    plate.putalpha(mask)
    return plate.resize((1024, round(1024 * h / w)), Image.LANCZOS)


def simple_png(width: int) -> Image.Image:
    svg = (HERE / "mark-simple.svg").read_bytes()
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg, output_width=width))).convert("RGBA")


def app_icon(size: int) -> Image.Image:
    """Square dark plate with the simplified arch centred. OS icons need an
    opaque background — a bare arch looks broken on a home-screen wallpaper."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate = Image.new("RGBA", (size, size), INK + (255,))
    rr = Image.new("L", (size, size), 0)
    ImageDraw.Draw(rr).rounded_rectangle([0, 0, size - 1, size - 1],
                                         radius=round(size * 0.22), fill=255)
    plate.putalpha(rr)
    im.alpha_composite(plate)
    g = simple_png(round(size * 0.66))
    im.alpha_composite(g, ((size - g.width) // 2,
                           (size - g.height) // 2 + round(size * 0.02)))
    return im


def build_favicon() -> None:
    inner = (HERE / "mark-simple.svg").read_text().split(">", 1)[1].rsplit("</svg>", 1)[0]
    inner = inner.replace('id="hv-arch"', 'id="hv-fav"').replace("url(#hv-arch)", "url(#hv-fav)")
    (PUBLIC / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="HueVista">\n'
        '  <rect width="48" height="48" rx="11" fill="#0a090f"/>\n'
        '  <g transform="translate(4.8 10.2) scale(0.8)">' + inner + "</g>\n</svg>\n"
    )


def brand_font(family: str, weight: int) -> ImageFont.FreeTypeFont:
    """Fetch a Google font once into a build cache and open it."""
    cache = HERE / ".fonts"
    cache.mkdir(exist_ok=True)
    dest = cache / f"{family.replace(' ', '')}-{weight}.ttf"
    if not dest.exists():
        css_url = f"https://fonts.googleapis.com/css2?family={family.replace(' ', '+')}:wght@{weight}&display=swap"
        req = urllib.request.Request(css_url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"})
        css = urllib.request.urlopen(req, timeout=30).read().decode()
        url = re.search(r"src: url\((https://[^)]+\.ttf)\)", css).group(1)
        dest.write_bytes(urllib.request.urlopen(url, timeout=30).read())
    return ImageFont.truetype(str(dest), 10)  # size set by the caller via font_variant


def build_og(mark: Image.Image) -> Image.Image:
    w, h = 1200, 630
    og = Image.new("RGB", (w, h), INK)
    bloom = Image.new("RGB", (w, h), INK)
    ImageDraw.Draw(bloom).ellipse([-140, 60, 620, 760], fill=(38, 28, 78))
    og = Image.blend(og, bloom.filter(ImageFilter.GaussianBlur(120)), 0.85)

    m = mark.copy()
    m.thumbnail((430, 430), Image.LANCZOS)
    og.paste(m, (96, (h - m.height) // 2), m)

    grotesk = brand_font("Space Grotesk", 700).font_variant(size=92)
    mono = brand_font("JetBrains Mono", 500).font_variant(size=25)
    body = brand_font("Space Grotesk", 500).font_variant(size=31)

    dr = ImageDraw.Draw(og)
    tx = 96 + m.width + 74
    dr.text((tx, 232), "HueVista", font=grotesk, fill=IVORY)

    sp = 0.0
    for ch in "SHADES  &  COLOURS":          # PIL has no letter-spacing
        dr.text((tx + sp + 3, 344), ch, font=mono, fill=ACCENT_SOFT)
        sp += dr.textlength(ch, font=mono) + 3.4

    dr.text((tx, 400), "See any paint colour on your walls,", font=body, fill=MUTE)
    dr.text((tx, 442), "before a single tin is opened.", font=body, fill=MUTE)
    return og


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)

    mark = build_mark()
    mark.save(BRAND / "mark.png")
    shutil.copy(HERE / "mark-simple.svg", BRAND / "mark.svg")

    for size, name in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")):
        app_icon(size).save(BRAND / name)

    build_favicon()
    build_og(mark).save(BRAND / "og.png", quality=95)

    for p in sorted(BRAND.iterdir()):
        if p.suffix in {".png", ".svg"}:
            print(f"{p.relative_to(PUBLIC.parent)}  {os.path.getsize(p):,}b")
    print(f"{(PUBLIC / 'favicon.svg').relative_to(PUBLIC.parent)}  "
          f"{os.path.getsize(PUBLIC / 'favicon.svg'):,}b")


if __name__ == "__main__":
    main()
