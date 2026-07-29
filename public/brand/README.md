# HueVista brand assets

Two marks, and they are not interchangeable.

## `mark.png` — the painterly mark

The real artwork: brushstroke, serif H, brush and sprig. Use it at **128px and
above** — hero panels, print, the colour-board PDF cover, signage, social.
Below about 64px the brushwork turns to mush and the H stops reading.

The supplied original was a circle with its bottom third cropped away (paint
stopped dead at y=617 on a disc that should have reached 882). Rather than
invent brushwork to close it, the mark is framed as an **arch** — the domed top
is the artwork's own circle, and the flat base is exactly where the crop
already fell, so the stroke runs off the bottom edge the way paint runs off a
swatch card. The only thing added is empty lilac field around the artwork,
which is the same flat colour the field already was. No paint is fabricated.

If a full uncropped export of the original ever turns up, re-run
`docs/brand/build_assets.py` against it and the arch can become a full circle.

## `mark.svg` — the simplified mark

Same silhouette (arch), same crescent, same H, drawn as vectors so it survives
16px. Use it for **anything under ~64px**: nav, favicons, app icons, email.

In React, prefer `<BrandMark />` (`src/components/layout/brand-mark.tsx`) over
this file — it is the same shape but its crescent and H are painted in
`--hv-mark-negative`, so the mark keeps its contrast on the translucent nav bar
and on `Logo`'s inverted plate, in both themes. This standalone file uses a
plain `evenodd` knockout instead, for contexts that cannot carry CSS.

## The rest

| file | use |
| --- | --- |
| `og.png` | 1200×630 social card — wired into `openGraph` / `twitter` metadata |
| `icon-192.png`, `icon-512.png` | PWA icons, referenced from `site.webmanifest` |
| `apple-touch-icon.png` | 180×180 iOS home screen |
| `/favicon.svg` (in `public/`) | browser tab; dark plate + simplified mark |

Icons sit on an opaque dark plate on purpose: a transparent arch looks broken
against an arbitrary home-screen wallpaper.

## Tagline

**Shades & colours** — set in `--mono`, uppercase, `.2em` tracking. It appears
in the footer lockup and on the social card. The wordmark alone is fine
anywhere the tagline would crowd it (the nav, small chips).
