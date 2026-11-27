# Scene Graph Schema Reference

Bauhaus stores every design as a versioned JSON document (`schemaVersion: "1.0.0"`) validated by `schemas/design.schema.json` and `schemas/element.schema.json`.

## Supported Element Types (12)
1. `text`: Multilingual text block (`content: { text, lang?, dir? }`, `style: { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textAlign, verticalAlign, color, textTransform }`).
2. `image`: Raster or SVG image (`content: { src, alt?, fit?: "cover"|"contain"|"fill", assetId? }`).
3. `rect`: Rectangle or rounded card (`style: { fill, stroke, strokeWidth, borderRadius, shadow }`).
4. `ellipse`: Circle or oval.
5. `line`: Line segment (`content: { x2, y2 }`, `style: { stroke, strokeWidth, strokeDasharray }`).
6. `polygon`: Custom polygon or regular N-gon (`content: { points? | sides? }`).
7. `svg`: Inline sanitized SVG illustration (`content: { svgMarkup, viewBox }`).
8. `icon`: Vector icon (`content: { svgMarkup, viewBox }`).
9. `background`: Full-canvas or section backdrop layer.
10. `gradient`: Dedicated gradient shape/overlay (`style.fill: { type: "linear"|"radial", angle?, stops: [{ offset, color }] }`).
11. `group`: Logical container (`children: string[]`) with child elements referencing `parentId`.
12. `imported_asset`: External/user-supplied asset tracked in `design.assets[]`.

Validate any file with:
```bash
node scripts/validate-design.mjs ./path/to/design.bauhaus.json
```
