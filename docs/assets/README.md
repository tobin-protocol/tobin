# README brand assets

| File | What it is |
|---|---|
| `tobin-banner.png` | The README banner: the stencil-cut "Tobin Protocol" wordmark on black |

## Provenance of `tobin-banner.png`

It is **not** new artwork. It is a plain rectangular crop of an image that already exists in this repository, [`apps/landing/src/app/opengraph-image.png`](../../apps/landing/src/app/opengraph-image.png) (1200 x 630, the landing page's social preview card). That card shows the same stencil-cut wordmark as the landing page footer, which is set as live text in the site and so has no image file of its own.

- Crop: columns 0 to 1094 and rows 171 to 360 of the source (1095 x 190 pixels). The source's own black background is kept.
- Nothing was recoloured, redrawn, retyped or resized, and no font file or wordmark artwork was added. The crop excludes the T mark, the tagline and the status line that appear elsewhere on the card.
- The README logo is not copied: it points at the existing file [`apps/landing/src/app/icon.svg`](../../apps/landing/src/app/icon.svg).

The Tobin name, logo and brand assets are not licensed under Apache-2.0; see [`apps/landing/NOTICE`](../../apps/landing/NOTICE). If the landing page's social card changes, regenerate the banner from the new card by the same crop rule.
