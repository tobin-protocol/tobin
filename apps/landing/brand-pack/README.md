# Tobin brand pack

- svg/: symbol (glossy; flat black, white, blue). The original lockup SVGs, whose wordmarks were outlined in Aalto Display, are not included (see Removed artwork). The website renders the wordmark as live JetBrains Mono text (see `src/components/logo-art.ts`).
- png/symbol, png/avatars: raster exports.
- favicon/: favicon.ico (16/32/48), favicon.svg, apple-touch-icon, PWA icons, manifest, head snippet.
- colors.css: palette and font variables.

## Type
- Website type system: **JetBrains Mono** for the wordmark, headings, labels and code; **Instrument Sans** for body text and UI. Both are free (SIL Open Font License) on Google Fonts.
- Aalto Display was used in the original pack artwork (outlined wordmarks and the social and logo images). It is a personal-use font, so the site does not use it and the affected files are not included here.

## Removed artwork
Twenty files were removed from this repository, and from its Git history, because redistribution permission for the font they are described as using was not available: the four lockup SVGs in `svg/` (`tobin-logo-{black,dark,light,white}.svg`), the two logo PNGs in `png/logo/`, and the four social PNGs in `png/social/`, each also as a copy under `public/brand/`. Nothing in this repository establishes that the replacement font or any remaining asset is cleared for redistribution; the symbol and icon files are of unrecorded authorship and licence. `scripts/build-logo-art.mjs` reads the removed lockup SVGs, so it cannot regenerate `src/components/logo-art.ts` until new lockups exist; the committed `logo-art.ts` is unaffected. The original Open Graph and Twitter share images that carried the same wordmark were replaced in history by the JetBrains Mono versions.

## Usage
Symbol minimum size 16px. Clear space = stroke width. Use flat versions for print and single-color contexts. The glossy mark needs a near-black or near-white ground.
