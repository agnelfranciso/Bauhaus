# Export Formats & Verification

`scripts/export-design.mjs` supports:
- `png`: Lossless raster via Chromium (`scale` 1x–4x, supports transparent canvas).
- `jpeg`: Compressed raster via `sharp`.
- `webp`: Web-optimized raster via `sharp`.
- `svg`: Pure vector SVG (`mode: 'pure-svg'`).
- `pdf`: Vector/raster PDF at exact canvas dimensions.
- `print-pdf`: Adds bleed (default 36px / 3mm) and corner crop marks at 2x scale.
- `html`: Standalone HTML5/CSS/SVG file with embedded font links.
- `json`: Validated `.bauhaus.json` editable project file.

## Automated Post-Export Verification
Every export automatically verifies:
1. File exists and byte size > 0.
2. Raster formats (`png`, `jpeg`, `webp`) match expected `width * scale` × `height * scale` via `sharp().metadata()`.
3. PDF files begin with `%PDF-` magic bytes.
4. SVG files contain a valid `<svg` root element.
