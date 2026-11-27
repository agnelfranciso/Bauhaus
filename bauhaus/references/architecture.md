# Architecture Decision Record: Bauhaus Design Engine

## Status
Accepted

## Context
Bauhaus requires an authentic, editable design environment that:
1. Preserves every visual element as a structured, editable object (no flattened-image generation).
2. Allows an AI agent to construct, inspect, critique, and refine designs programmatically.
3. Allows a human user to observe live construction in a browser workspace and directly manipulate elements (drag, resize, rotate, edit text, reorder layers, group/ungroup, undo/redo, export).
4. Runs local-first with zero external database or Docker dependencies so the `bauhaus` skill remains portable.
5. Renders English, Malayalam, Hindi, and other Unicode scripts accurately and exports to PNG, JPEG, WebP, SVG, PDF, Print-ready PDF, HTML/CSS, and native JSON.

## Decision
We implement a **hybrid lightweight architecture** combining:
1. **Canonical Versioned Scene Graph (`.bauhaus.json`)**: Validated against `schemas/design.schema.json` and `schemas/element.schema.json` using Ajv. Supports all 12 object types (`text`, `image`, `rect`, `ellipse`, `line`, `polygon`, `svg`, `icon`, `background`, `gradient`, `group`, `imported_asset`).
2. **Bauhaus Studio (Local Node.js + WebSocket + Interactive SVG/DOM Canvas)**:
   - Served locally by `scripts/bauhaus-server.mjs` (zero DB, pure filesystem persistence).
   - Live browser UI (`studio/index.html`, `studio/studio.js`, `studio/studio.css`) with layer hierarchy panel, interactive artboard (select, drag, 8-handle resize, rotate, inline text editing, zoom/pan), properties inspector, undo/redo stack, and real-time WebSocket sync when the agent modifies the design.
3. **Agentic Control Surface (CLI + HTTP API + MCP Server)**:
   - `scripts/bauhaus-cli.mjs` for direct command-line operations (works both headless and synced with a running Studio server).
   - `scripts/bauhaus-mcp.mjs` exposing standard Model Context Protocol (stdio) tools (`create_design`, `get_design`, `create_element`, `batch_create_elements`, `update_element`, `delete_element`, `reorder_layers`, `group_elements`, `ungroup_elements`, `capture_screenshot`, `export_design`).
4. **Rendering & Export Pipeline**:
   - `scripts/lib/svg-renderer.mjs` compiles any `.bauhaus.json` into a deterministic SVG/HTML document with Google Fonts / local font `@font-face` embedding, sanitized SVG/HTML, and optional print bleed/crop marks.
   - `scripts/render-preview.mjs` and `scripts/export-design.mjs` use `playwright-core` (driving the system's Chrome/Edge) + `sharp` to capture visual-feedback screenshots and export PNG, JPEG, WebP, SVG, PDF, Print-ready PDF, HTML/CSS, and native JSON, followed by automated dimension and file verification.

## Consequences
### Local vs. External
- **100% Local**: Scene graph storage, Studio UI, WebSocket sync, schema validation, SVG/HTML/PDF/PNG/JPEG/WebP rendering, and MCP server all run locally.
- **Optional External**: Google Fonts stylesheets (fetched by browser if online; falls back gracefully to local/system fonts if offline) and optional external image/stock/generation tools when configured by the user.

### Known Limitations
- True CMYK ICC color profile separation for commercial offset printing is not natively produced by Chromium PDF; Print-ready PDF outputs sRGB vector/raster PDF with exact physical dimensions, 300 DPI rasterized assets, bleed, and crop marks.
- Pure SVG export converts `<foreignObject>` text blocks into `<text>`/`<tspan>` elements for vector compatibility; complex Indic ligatures are best preserved in PNG/PDF exports rendered via Chromium's HarfBuzz engine.
