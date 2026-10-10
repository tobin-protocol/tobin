# Tobin brand pack

- svg/: symbol (glossy; flat black, white, blue) and lockups. The pack's lockup wordmarks are outlined (Aalto Display), so no font is needed. The website does not use these outlined wordmarks: `scripts/build-logo-art.mjs` swaps them for live JetBrains Mono text (see `src/components/logo-art.ts`).
- png/symbol, png/avatars, png/social, png/logo: raster exports.
- favicon/: favicon.ico (16/32/48), favicon.svg, apple-touch-icon, PWA icons, manifest, head snippet.
- colors.css: palette and font variables.

## Type
- Website type system: **JetBrains Mono** for the wordmark, headings, labels and code; **Instrument Sans** for body text and UI. Both are free (SIL Open Font License) on Google Fonts.
- Aalto Display is only in the original pack artwork (outlined wordmarks, social images, favicons). It is a personal-use font, so the site does not use it.

## Usage
Symbol minimum size 16px. Clear space = stroke width. Use flat versions for print and single-color contexts. The glossy mark needs a near-black or near-white ground.
