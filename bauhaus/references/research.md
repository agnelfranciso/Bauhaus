# Design Engine Research

This document records the evaluation of open-source and commercial design editors, canvas libraries, and rendering engines conducted for **Bauhaus**.

## Evaluation Criteria

| Criterion | Description |
|---|---|
| Editing | Genuine editable elements, layers, groups, transforms, and text editing |
| Agent integration | MCP, HTTP/WebSocket API, CLI, or browser automation support |
| Rendering | Accurate live canvas rendering, including multilingual scripts (Malayalam, Hindi, Latin) |
| Export | PNG, JPEG, WebP, SVG, PDF, Print-ready PDF, HTML/CSS, and native editable JSON |
| Extensibility | Ability to add custom tools, schemas, and design intelligence |
| Licensing | Permissive open-source license allowing commercial use and redistribution |
| Maintenance | Repository activity, stability, and ecosystem health |
| Portability | Works across Agent Skills-compatible agents without heavy external infrastructure |
| Privacy | Local-first and offline-capable without mandatory cloud uploads |

## Candidate Comparison

| Candidate | Type | License | Maintenance | Infra Needed | Multilingual Shaping | Verdict |
|---|---|---|---|---|---|---|
| **Doop** (`kgoedecke/doop`) | Multiplayer HTML/iframe canvas + MCP | AGPL-3.0 | Active | Node + PostgreSQL + Docker | Browser DOM/HarfBuzz | Rejected: AGPL-3.0 copyleft + Postgres/Docker infra too heavy for a portable skill |
| **Canvix** (`mir-ashiq/canvix`) | Self-hosted Canva alternative + MCP | MIT | Active | Next.js 16 + PostgreSQL 17 + Prisma + Docker | Browser DOM/HarfBuzz | Rejected as embedded dependency: requires PostgreSQL 17 & Docker Compose; useful architectural reference for MCP tool design |
| **Penpot** | Full Figma-like design platform + MCP | MPL-2.0 | Very High | Clojure + Rust WASM + Postgres + Redis + Docker | Custom/WASM | Rejected: full enterprise platform, far too heavy to bundle in a portable Agent Skill |
| **Polotno** | Commercial Konva-based editor SDK | Commercial / Closed-Source | Active | Node/Browser | Canvas2D | Rejected: proprietary paid license required for production |
| **tldraw** | Whiteboard SDK | Source-Available / Commercial | Very Active | Browser | Canvas/DOM | Rejected: commercial license/watermark required in production; whiteboard focus |
| **Excalidraw** | Hand-drawn diagramming canvas | MIT | Very Active | Browser | Canvas2D | Rejected: hand-drawn aesthetic unsuitable for professional typography, print PDF, and graphic design |
| **Fabric.js** | HTML5 Canvas2D object model | MIT | Moderate | Browser | Canvas2D `fillText` | Partial fit: Canvas2D text shaping struggles with complex Indic ligatures (Malayalam/Devanagari) and lacks native print PDF bleed/crop marks |
| **Konva.js** | 2D HTML5 Canvas framework | MIT | Very Active | Browser | Canvas2D `fillText` | Partial fit: strong node hierarchy, but Canvas2D text rendering has Indic shaping limitations and requires extra PDF pipeline |
| **Paper.js** | Vector scripting framework | MIT | Low / Niche | Browser | Limited | Rejected: low maintenance and lacks UI/layer/text/export tooling |
| **Bauhaus SVG/DOM Studio + Headless Chromium + Sharp** | Purpose-built lightweight local Studio + Scene Graph + Chromium/Sharp pipeline | MIT (Chromium/Playwright Apache-2.0, Sharp Apache-2.0) | Self-contained | Node.js + system Chrome/Edge (zero DB, zero Docker) | Native Chromium HarfBuzz / DirectWrite | **Selected**: zero external DB, 100% local-first, full Indic script shaping, live interactive browser Studio, native SVG/HTML/PDF/PNG/WebP/JPEG export |

## Key Findings

1. **Multilingual Typography Requirement**: Pure HTML5 `<canvas>` (`fillText`) libraries like Fabric.js and Konva.js do not match browser DOM/SVG text layout for complex Indic scripts (Malayalam conjuncts/chillu, Hindi Devanagari matras), multi-weight inline wrapping, and CSS font loading. Rendering the editable scene graph in an SVG + HTML/CSS artboard inside Chromium provides native HarfBuzz shaping and exact parity between live editing, visual inspection screenshots, and exported PNG/PDF/SVG files.
2. **Zero-Infrastructure Portability**: Requiring PostgreSQL or Docker (as in Doop, Canvix, or Penpot) breaks portability for an Agent Skill. A file-backed `.bauhaus.json` scene graph with a lightweight Node.js HTTP/WebSocket Studio server and stdio MCP server runs anywhere Node.js and Chrome/Edge are present.
3. **Export Pipeline**: Playwright/Chromium (`playwright-core` using system Chrome/Edge) paired with `sharp` provides pixel-accurate rasterization (PNG, JPEG, WebP at arbitrary DPI scale), vector SVG serialization, HTML/CSS export, and print-ready PDF with CSS `@page` dimensions, bleed, and crop marks.
