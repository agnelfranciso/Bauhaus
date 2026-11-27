# Asset & Multilingual Font Management

## Asset Rules
- **Licensing**: Respect image and font licenses; record `sourceType` (`user`, `generated`, `stock`, `local`), `license`, and `attribution` in `design.assets[]`.
- **Integrity**: Never fabricate official corporate/university logos or invent sponsors/partners.
- **Safety**: All SVG markup is sanitized (`scripts/lib/security.mjs`) to strip scripts, event handlers, and `javascript:` URIs. Only safe image URIs (`https://`, local relative paths, or `data:image/*`) are permitted.

## Multilingual Font Selection
`scripts/lib/fonts.mjs` automatically scans all text elements for Unicode script ranges:
- **Malayalam** (`U+0D00–U+0D7F`): Auto-loads `Noto Sans Malayalam` + system fallbacks (`Kartika`, `Nirmala UI`).
- **Hindi / Devanagari** (`U+0900–U+097F`): Auto-loads `Noto Sans Devanagari` + system fallbacks (`Mangal`, `Nirmala UI`).
- **Tamil / Arabic / CJK**: Auto-loads corresponding `Noto Sans` family.

For offline environments, register local `.ttf`/`.woff2` fonts in `design.fonts[]` with `source: "local"` and `url`.
