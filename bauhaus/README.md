# Bauhaus

**Autonomous Professional Graphic Design Intelligence** — a portable Agent Skill (`bauhaus`) paired with a local-first editable design workspace (**Bauhaus Studio**), validated JSON scene graph, real-time WebSocket canvas, MCP server, and multi-format export pipeline.

## Requirements

- **Node.js** `>= 20.0.0`
- **Google Chrome / Microsoft Edge / Chromium** (used by `playwright-core` for HarfBuzz multilingual text shaping, visual-feedback previews, and PNG/PDF export)

## One-Prompt AI Setup (Copy & Paste)

```text
Install and configure the Bauhaus (bhs) graphic design skill from https://github.com/agnelfranciso/Bauhaus:
1. Fetch the latest release from https://github.com/agnelfranciso/Bauhaus/releases/latest (or clone https://github.com/agnelfranciso/Bauhaus.git) and place `bauhaus/` in your agent's skills directory:
   - Antigravity: `.agents/skills/bauhaus` or `~/.gemini/config/skills/bauhaus`
   - Claude Code: `.claude/skills/bauhaus` or `~/.claude/skills/bauhaus`
   - Cursor: `.agents/skills/bauhaus` or `.cursor/skills/bauhaus`
   - Codex / Gemini CLI: `.agents/skills/bauhaus`
   - GitHub Copilot: `.github/skills/bauhaus`
2. Run `npm install` inside `bauhaus/` and validate with `skills-ref validate .`.
3. Register `<abs-path>/bauhaus/scripts/bauhaus-mcp.mjs` as an MCP server for your agent, start Bauhaus Studio (`npm start`), and share http://127.0.0.1:4820.
```

## Installation & Validation

```bash
npm install
npm test
skills-ref validate .
```

## Supported Agents

Compatible with any [Agent Skills](https://agentskills.io)-compliant agent—including **Antigravity**, **Claude Code**, **Cursor**, **OpenAI Codex / Codex CLI**, **Gemini CLI**, and **GitHub Copilot**—by copying or linking the `bauhaus/` folder into the agent's skills directory (e.g. `.agents/skills/bauhaus/`, `.claude/skills/bauhaus/`, `.github/skills/bauhaus/`).

## Quick Start

- **Start Bauhaus Studio** (`http://127.0.0.1:4820`): `npm start`
- **Start stdio MCP Server**: `npm run mcp`
- **Validate a design**: `node scripts/validate-design.mjs <file.bauhaus.json>`
- **Render preview**: `node scripts/render-preview.mjs <file.bauhaus.json> <out.png>`
- **Export**: `node scripts/export-design.mjs <file.bauhaus.json> <png|jpeg|webp|svg|pdf|print-pdf|html|json> <outPath>`

## Documentation

See [SKILL.md](./SKILL.md) and the [references/](./references) directory for design methodology, critique rubrics, scene-graph schemas, and troubleshooting.
