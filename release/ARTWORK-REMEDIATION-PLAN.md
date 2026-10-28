# Artwork remediation plan (landing page assets)

**Status: the 20 wordmark files listed below were excluded from this repository and from the landing history it carries (founder-authorized Option B, see the execution record). No replacement artwork was produced, no asset was relicensed, and nothing here clears any remaining asset for publication.** Related: `release/PROPOSED-POLICY-UPDATE-MONOREPO.md` section 5; pending approval PA-1.

## Execution record (Option B)

Permission to redistribute the Aalto Display-derived artwork was not available (the founder holds no licence), so the files were excluded instead of replaced.

- The 20 files in the first inventory table below were removed from the tree and from the 14 landing commits that carried them (`ca46ee2` onward).
- In those commits the original share images (`src/app/opengraph-image.png` and `twitter-image.png`, blob `eaa4d583…`, the original wordmark artwork) were repointed to the JetBrains Mono versions already committed at `f2eee53` (blob `369e0d40…`). Those two images are existing project files; no new image was produced and no font was downloaded.
- The first 30 landing commits are unchanged. Authors, committers, dates and messages of all 44 are unchanged. The rewritten commit `f2eee53` became empty and is kept.
- The original history remains only in local recovery refs and a local archive; these are never pushed.
- This does not establish that the JetBrains Mono wordmark in the remaining share images, the symbol, or any other remaining file is cleared. The symbol and icon files are of unrecorded authorship and licence.
- The separate public `tobin-landing` repository still contains the original files; it was not changed.

Rewritten landing commits (old hash, new hash):

| Old | New |
|---|---|
| `ca46ee2` | `0e0fb67` |
| `2a7467c` | `77fe490` |
| `5ff09ba` | `bfc4f5b` |
| `47efa74` | `5f3f5f8` |
| `c349c92` | `3ca5ae0` |
| `4b7d0eb` | `712813e` |
| `be7ade2` | `5fd2d4a` |
| `4dc90ef` | `d0a0465` |
| `bff08cc` | `c813311` |
| `c8526b3` | `0b06c00` |
| `4c57fed` | `c6276d1` |
| `f2eee53` | `4efe9ba` |
| `941352d` | `b403dd3` |
| `033f28a` | `4c817a7` |

The site does not load any removed file. `scripts/build-logo-art.mjs` reads the removed lockup SVGs, so it cannot regenerate `src/components/logo-art.ts` until new lockups exist; the committed `logo-art.ts` holds live text, not the removed outlines.

## Findings

1. **Permission is not established.** `apps/landing/brand-pack/README.md` calls Aalto Display a personal-use font and says it appears in the original wordmarks, social images and favicons. `NOTICE` and `LICENSE` grant no right to the font or the artwork. The NOTICE reserves brand rights, and a reservation of rights is not a permission to redistribute. No document in the repository records a licence for the font.
2. **Which files show the wordmark** (individual inspection):
   - The 20 files in the first table carry the TOBIN wordmark in a tall condensed face. Viewed directly: `brand-pack/png/logo/tobin-logo-light-2400x800.png`, `og-image-1200x630-dark.png`, `og-image-1200x630-light.png`, `linkedin-banner-1584x396-dark.png` and `x-header-1500x500-dark.png`. Every file under `public/brand` in these groups is byte-identical (SHA-256) to its `brand-pack` twin. The four lockup SVGs and `tobin-logo-dark-2400x800.png` were not viewed: `scripts/build-logo-art.mjs` confirms that the lockup SVGs hold an outlined wordmark group, and the PNG is classified by name and by its identical twin only.
   - The 42 files in the second table are symbol-only as far as inspected. Viewed: `favicon/icon-512.png`, `png/avatars/github-org-500.png` and `src/app/apple-icon.png`; the symbol SVGs hold no wordmark. The README groups favicons with the Aalto artwork, but no wordmark is visible in the favicon, avatar or app-icon images viewed. Not every file in that table was viewed; the rest are classified by name and by hash-identical copies.
   - `src/app/opengraph-image.png` already shows a monospace wordmark (regenerated in commit `f2eee53`). `twitter-image.png` was not changed.
3. **Provenance metadata.** The `brand-pack` PNGs and SVGs carry C2PA content credentials stating that "Claude provided this file at the request of a user and may have created or modified the file contents" (origin confidence "unknown", signer Anthropic). That records how the file was handled. It does not say who drew the outlines, which font they use, or under what licence, and it is not evidence of permission either way.
4. **Why no replacement was produced in this stage.**
   - The only documented licence for a replacement face is the repository's own statement that JetBrains Mono is under the SIL Open Font License. No font file and no OFL text for it exist in this checkout or its dependencies, and fetching them needs network access that is not authorized here.
   - The current wordmark is a tall condensed face and JetBrains Mono is a wide monospace face, so a faithful regeneration changes the logo's look (the existing monospace Open Graph image shows the effect). That is a founder design decision, not a mechanical substitution.
   - Several files are rasters with gradients and fixed layouts that need a reviewed rebuild.

## Remediation options (executed: Option 3 for the history, with replacement deferred to the redesign)

- **Option 1: confirm permission.** Record in writing that you hold a licence allowing redistribution of Aalto Display-derived artwork in a public repository (source, holder, scope), and store the record in `release/`. No replacement is then needed.
- **Option 2: replace the 20 wordmark files.**
  1. Obtain JetBrains Mono (ExtraBold) with its `OFL.txt` from its upstream release into a fresh scratch directory; record the version and SHA-256. Do not commit the font file; outline the glyphs into the SVGs.
  2. Rebuild the four lockup SVGs in `brand-pack/svg`, keeping each viewBox (`0 0 258 120`), the colours and the symbol group. Regenerate the two logo PNGs (2400x800) and the four social PNGs at their current sizes from them. Copy into `public/brand` and verify the pairs are identical again.
  3. Keep the originals recoverable (Git history plus a scratch backup) until the new files are reviewed at full and small sizes. Then replace in place, rerun `scripts/build-logo-art.mjs` if its output changes, and run landing lint, the build and the browser journeys.
  4. Update the Aalto statements in `brand-pack/README.md` only after the files are replaced.
- **Option 3: publish without the 20 wordmark files**, only on the founder's instruction. The site itself does not load them (its logo is live JetBrains Mono text).
- The symbol-only files need no replacement on the evidence above, but the symbol's authorship and licence are also unrecorded and should be covered by the same founder record.

## Inventory (SHA-256, first 12 hex characters)

### Wordmark-bearing (20; now removed from the tree and the publication history, listed to allow verification)
| Path | SHA-256 |
|---|---|
| `apps/landing/brand-pack/svg/tobin-logo-black.svg` | ef658e5a697a |
| `apps/landing/brand-pack/svg/tobin-logo-dark.svg` | 342fab73c122 |
| `apps/landing/brand-pack/svg/tobin-logo-light.svg` | f1c5f927d9d5 |
| `apps/landing/brand-pack/svg/tobin-logo-white.svg` | 2f216f15b110 |
| `apps/landing/public/brand/tobin-logo-black.svg` | ef658e5a697a |
| `apps/landing/public/brand/tobin-logo-dark.svg` | 342fab73c122 |
| `apps/landing/public/brand/tobin-logo-light.svg` | f1c5f927d9d5 |
| `apps/landing/public/brand/tobin-logo-white.svg` | 2f216f15b110 |
| `apps/landing/brand-pack/png/logo/tobin-logo-dark-2400x800.png` | 72f21189bd69 |
| `apps/landing/brand-pack/png/logo/tobin-logo-light-2400x800.png` | ff57092b1f42 |
| `apps/landing/public/brand/png/logo/tobin-logo-dark-2400x800.png` | 72f21189bd69 |
| `apps/landing/public/brand/png/logo/tobin-logo-light-2400x800.png` | ff57092b1f42 |
| `apps/landing/brand-pack/png/social/linkedin-banner-1584x396-dark.png` | f7de83d94e60 |
| `apps/landing/brand-pack/png/social/og-image-1200x630-dark.png` | f8d556276c52 |
| `apps/landing/brand-pack/png/social/og-image-1200x630-light.png` | 419f897a7ff0 |
| `apps/landing/brand-pack/png/social/x-header-1500x500-dark.png` | 43e67b6eb93f |
| `apps/landing/public/brand/png/social/linkedin-banner-1584x396-dark.png` | f7de83d94e60 |
| `apps/landing/public/brand/png/social/og-image-1200x630-dark.png` | f8d556276c52 |
| `apps/landing/public/brand/png/social/og-image-1200x630-light.png` | 419f897a7ff0 |
| `apps/landing/public/brand/png/social/x-header-1500x500-dark.png` | 43e67b6eb93f |

### Symbol-only as far as inspected (42)
| Path | SHA-256 |
|---|---|
| `apps/landing/brand-pack/png/avatars/avatar-dark-circle-1024.png` | 70281c337948 |
| `apps/landing/brand-pack/png/avatars/avatar-dark-square-1024.png` | 65dba4f9a604 |
| `apps/landing/brand-pack/png/avatars/avatar-light-circle-1024.png` | 30ad8a289c3e |
| `apps/landing/brand-pack/png/avatars/avatar-light-square-1024.png` | 6ab0db4d450f |
| `apps/landing/brand-pack/png/avatars/avatar-violet-square-1024.png` | b8a3ce080cc1 |
| `apps/landing/brand-pack/png/avatars/github-org-500.png` | 2f43ef0f54bf |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-flat-black-512.png` | d5536ec98b4b |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-flat-blue-512.png` | 15e46ccda513 |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-flat-white-512.png` | 8c594af4f83a |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-1024.png` | e0f8c56e1e97 |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-128.png` | 63e4251e871b |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-16.png` | 7cb9de9b5613 |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-256.png` | accf439eb06c |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-32.png` | 61b6d9594e4f |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-48.png` | 07b2fa0debfa |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-512.png` | c7ee9c4b2302 |
| `apps/landing/brand-pack/png/symbol/tobin-symbol-glossy-64.png` | 4e99dfb9a087 |
| `apps/landing/brand-pack/svg/tobin-symbol-flat-black.svg` | c010933f086f |
| `apps/landing/brand-pack/svg/tobin-symbol-flat-blue.svg` | c8f2f5883414 |
| `apps/landing/brand-pack/svg/tobin-symbol-flat-white.svg` | b26868253968 |
| `apps/landing/brand-pack/svg/tobin-symbol-glossy.svg` | fc16b1b83186 |
| `apps/landing/public/brand/tobin-symbol-flat-black.svg` | c010933f086f |
| `apps/landing/public/brand/tobin-symbol-flat-blue.svg` | c8f2f5883414 |
| `apps/landing/public/brand/tobin-symbol-flat-white.svg` | b26868253968 |
| `apps/landing/public/brand/tobin-symbol-glossy.svg` | fc16b1b83186 |
| `apps/landing/brand-pack/favicon/apple-touch-icon.png` | db501c19870e |
| `apps/landing/brand-pack/favicon/favicon-16.png` | 6ccfe45575b7 |
| `apps/landing/brand-pack/favicon/favicon-32.png` | 02a7b45a0fa5 |
| `apps/landing/brand-pack/favicon/favicon-48.png` | 8030db72a290 |
| `apps/landing/brand-pack/favicon/favicon.ico` | 335ee4bb5c47 |
| `apps/landing/brand-pack/favicon/favicon.svg` | 2ce4b149d216 |
| `apps/landing/brand-pack/favicon/head-snippet.html` | 66f2165f753c |
| `apps/landing/brand-pack/favicon/icon-192.png` | 16302e438855 |
| `apps/landing/brand-pack/favicon/icon-512.png` | dec6100e8f13 |
| `apps/landing/brand-pack/favicon/icon-maskable-512.png` | 946b1a8c414b |
| `apps/landing/brand-pack/favicon/site.webmanifest` | 6ae7b380664a |
| `apps/landing/public/icon-192.png` | 16302e438855 |
| `apps/landing/public/icon-512.png` | dec6100e8f13 |
| `apps/landing/public/icon-maskable-512.png` | 946b1a8c414b |
| `apps/landing/src/app/icon.svg` | 2ce4b149d216 |
| `apps/landing/src/app/favicon.ico` | 335ee4bb5c47 |
| `apps/landing/src/app/apple-icon.png` | db501c19870e |
