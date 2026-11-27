# Editor Integration: Bauhaus Studio, CLI, HTTP & MCP

## 1. Live Interactive Studio
Start the local Studio server:
```bash
node scripts/bauhaus-server.mjs --port 4820 --file ./my-design.bauhaus.json
```
Open `http://127.0.0.1:4820` in a browser. The Studio provides:
- Live WebSocket sync (`/ws`) for every agent edit
- Interactive drag, 8-handle resize, rotation, and properties inspector
- Layer hierarchy panel (reorder, lock, hide/show, delete)
- Undo/Redo stack and one-click export

## 2. HTTP REST API
- `GET /api/design` — Fetch current scene graph
- `POST /api/elements` — Add one element or `{ elements: [...] }` batch
- `PATCH /api/elements/:id` — Update element properties/style/content
- `DELETE /api/elements/:id` — Remove element
- `POST /api/layers/reorder` — `{ orderedIds }`
- `POST /api/groups` / `DELETE /api/groups/:id` — Group/ungroup
- `POST /api/export` — `{ format, outPath, scale }`

## 3. CLI (`scripts/bauhaus-cli.mjs`)
Works headless directly on `.bauhaus.json` files:
```bash
node scripts/bauhaus-cli.mjs create --out ./poster.bauhaus.json --title "Poster" --width 1080 --height 1350 --bg "#0a0e17"
node scripts/bauhaus-cli.mjs export --file ./poster.bauhaus.json --format png --out ./poster.png
```

## 4. MCP Server (`scripts/bauhaus-mcp.mjs`)
Exposes full-parity stdio MCP tools with **live Studio sync** (`BAUHAUS_STUDIO_URL`, default `http://127.0.0.1:4820`):
- **Projects & Workspace**: `list_projects`, `create_project`, `open_design`, `create_design`, `get_design`, `update_canvas`
- **Elements & Layers**: `create_element`, `batch_create_elements`, `update_element`, `delete_element`, `reorder_layers`, `group_elements`, `ungroup_elements`, `undo_design`, `redo_design`
- **Assets & Vision**: `list_uploads`, `decode_image`, `capture_screenshot`, `export_design`

When `filePath` is omitted, MCP tools operate directly on the live design currently open in Bauhaus Studio.
