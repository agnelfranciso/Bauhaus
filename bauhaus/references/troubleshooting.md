# Troubleshooting

- **No Chromium/Chrome/Edge found**: Set `BAUHAUS_BROWSER_PATH` to your local Chrome, Edge, or Chromium binary path.
- **Google Fonts timeout offline**: `exporter.mjs` waits up to 3.5s for `document.fonts.ready` and falls back to system fonts (`Nirmala UI`, `Segoe UI`, `Arial`) so offline rendering never hangs.
- **Schema validation errors**: Run `node scripts/validate-design.mjs <file>` to see exact JSON path errors against `schemas/design.schema.json`.
- **Studio port in use**: Pass `--port 4821` or set `BAUHAUS_PORT=4821`.
