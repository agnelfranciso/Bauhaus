#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { DesignStore, createNewDesign } from './lib/scene-graph.mjs';
import { exportDesign } from './lib/exporter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BAUHAUS_ROOT = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.resolve(BAUHAUS_ROOT, 'assets/uploads');
const STUDIO_URL = process.env.BAUHAUS_STUDIO_URL || 'http://127.0.0.1:4820';

const server = new McpServer({
  name: 'bauhaus-design-engine',
  version: '1.0.0',
});

const stores = new Map();

function getStore(filePath) {
  if (stores.has(filePath)) return stores.get(filePath);
  const store = DesignStore.load(filePath);
  stores.set(filePath, store);
  return store;
}

async function studioFetch(endpoint, method = 'GET', body = null) {
  try {
    const res = await fetch(`${STUDIO_URL}${endpoint}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(2500),
    });
    const data = await res.json().catch(() => ({}));
    return { online: true, ok: res.ok, status: res.status, data };
  } catch {
    return { online: false, ok: false };
  }
}

async function syncDocToStudioIfActive(filePath, doc) {
  const health = await studioFetch('/api/health');
  if (!health.online) return false;
  if (!filePath || health.data?.filePath === path.resolve(filePath) || health.data?.designId === doc.id) {
    await studioFetch('/api/design', 'PUT', { doc });
    return true;
  }
  return false;
}

const okText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

server.tool(
  'list_projects',
  'List all agent-created projects and gallery designs available in Bauhaus Studio',
  {},
  async () => {
    const res = await studioFetch('/api/projects');
    const gal = await studioFetch('/api/gallery');
    return okText({
      studioOnline: res.online,
      projects: res.online ? res.data.projects : [],
      gallery: gal.online ? gal.data.items : [],
    });
  }
);

server.tool(
  'create_project',
  'Create a new saved project in Bauhaus Studio and open it live on the canvas',
  {
    title: z.string(),
    category: z.string().optional(),
    width: z.number().positive(),
    height: z.number().positive(),
    backgroundColor: z.string().optional(),
  },
  async (args) => {
    const res = await studioFetch('/api/projects/create', 'POST', args);
    if (res.online && res.ok) return okText({ ok: true, liveStudio: true, studioUrl: `${STUDIO_URL}/design/${encodeURIComponent(res.data.doc.id)}`, ...res.data });
    const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
    const filePath = path.resolve(BAUHAUS_ROOT, 'projects', `${slug}-${Date.now().toString(36)}.bauhaus.json`);
    const doc = createNewDesign({
      title: args.title,
      category: args.category || 'other',
      width: args.width,
      height: args.height,
      background: { type: 'solid', color: args.backgroundColor || '#ffffff' },
    });
    const store = new DesignStore(doc, filePath);
    store.save();
    stores.set(filePath, store);
    return okText({ ok: true, liveStudio: false, filePath, doc });
  }
);

server.tool(
  'open_design',
  'Open a design by ID in the live Bauhaus Studio',
  { id: z.string() },
  async ({ id }) => {
    const res = await studioFetch('/api/design/open-by-id', 'POST', { id });
    if (!res.online) throw new Error('Bauhaus Studio is not running.');
    if (!res.ok) throw new Error(res.data?.error || 'Failed to open design');
    return okText({ ok: true, ...res.data });
  }
);

server.tool(
  'create_design',
  'Create a new editable Bauhaus design document (.bauhaus.json)',
  {
    filePath: z.string(),
    title: z.string(),
    category: z.string().optional(),
    width: z.number().positive(),
    height: z.number().positive(),
    backgroundColor: z.string().optional(),
  },
  async ({ filePath, title, category, width, height, backgroundColor }) => {
    const doc = createNewDesign({
      title,
      category: category || 'other',
      width,
      height,
      background: { type: 'solid', color: backgroundColor || '#ffffff' },
    });
    const store = new DesignStore(doc, filePath);
    store.save();
    stores.set(filePath, store);
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, filePath, id: doc.id, studioUrl: `${STUDIO_URL}/design/${encodeURIComponent(doc.id)}` });
  }
);

server.tool(
  'get_design',
  'Inspect the current scene graph and layers of a Bauhaus design (or the active Studio design if filePath omitted)',
  { filePath: z.string().optional() },
  async ({ filePath }) => {
    if (!filePath) {
      const res = await studioFetch('/api/design');
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText(res.data.doc);
    }
    const store = getStore(filePath);
    return okText(store.doc);
  }
);

server.tool(
  'update_canvas',
  'Update canvas dimensions, background (solid or linear/radial gradient), bleed, or registered fonts',
  {
    filePath: z.string().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    bleed: z.number().min(0).optional(),
    background: z.record(z.any()).optional(),
    fonts: z.array(z.record(z.any())).optional(),
  },
  async ({ filePath, width, height, bleed, background, fonts }) => {
    if (!filePath) {
      const cur = await studioFetch('/api/design');
      if (!cur.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      const doc = cur.data.doc;
      if (width) doc.canvas.width = width;
      if (height) doc.canvas.height = height;
      if (typeof bleed === 'number') doc.canvas.bleed = bleed;
      if (background) doc.canvas.background = background;
      if (fonts) doc.fonts = fonts;
      const put = await studioFetch('/api/design', 'PUT', { doc });
      return okText({ ok: true, canvas: put.data.doc.canvas });
    }
    const store = getStore(filePath);
    const next = structuredClone(store.doc);
    if (width) next.canvas.width = width;
    if (height) next.canvas.height = height;
    if (typeof bleed === 'number') next.canvas.bleed = bleed;
    if (background) next.canvas.background = background;
    if (fonts) next.fonts = fonts;
    store.replaceDocument(next);
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, canvas: store.doc.canvas });
  }
);

server.tool(
  'create_element',
  'Add an editable element (text, rect, ellipse, line, polygon, image, svg, icon, etc.) to a design',
  {
    filePath: z.string().optional(),
    element: z.record(z.any()),
  },
  async ({ filePath, element }) => {
    if (!filePath) {
      const res = await studioFetch('/api/elements', 'POST', element);
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: true, ...res.data });
    }
    const store = getStore(filePath);
    const added = store.addElement(element);
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, element: added });
  }
);

server.tool(
  'batch_create_elements',
  'Add multiple editable elements in a single atomic operation',
  {
    filePath: z.string().optional(),
    elements: z.array(z.record(z.any())),
  },
  async ({ filePath, elements }) => {
    if (!filePath) {
      const res = await studioFetch('/api/elements', 'POST', { elements });
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: true, ...res.data });
    }
    const store = getStore(filePath);
    const added = store.batchAddElements(elements);
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, count: added.length });
  }
);

server.tool(
  'update_element',
  'Update properties, position, style, or text of an existing element',
  {
    filePath: z.string().optional(),
    elementId: z.string(),
    patch: z.record(z.any()),
  },
  async ({ filePath, elementId, patch }) => {
    if (!filePath) {
      const res = await studioFetch(`/api/elements/${encodeURIComponent(elementId)}`, 'PATCH', patch);
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: true, ...res.data });
    }
    const store = getStore(filePath);
    const updated = store.updateElement(elementId, patch);
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, element: updated });
  }
);

server.tool(
  'delete_element',
  'Delete an element from a design',
  { filePath: z.string().optional(), elementId: z.string() },
  async ({ filePath, elementId }) => {
    if (!filePath) {
      const res = await studioFetch(`/api/elements/${encodeURIComponent(elementId)}`, 'DELETE');
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: true, ...res.data });
    }
    const store = getStore(filePath);
    const removed = store.deleteElement(elementId);
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, removed });
  }
);

server.tool(
  'reorder_layers',
  'Reorder element stacking order from bottom to top',
  { filePath: z.string().optional(), orderedIds: z.array(z.string()) },
  async ({ filePath, orderedIds }) => {
    if (!filePath) {
      const res = await studioFetch('/api/layers/reorder', 'POST', { orderedIds });
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: true, count: res.data.layers?.length });
    }
    const store = getStore(filePath);
    const layers = store.reorderLayers(orderedIds);
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, count: layers.length });
  }
);

server.tool(
  'group_elements',
  'Group multiple elements into a named section/group',
  { filePath: z.string().optional(), elementIds: z.array(z.string()), name: z.string().optional() },
  async ({ filePath, elementIds, name }) => {
    if (!filePath) {
      const res = await studioFetch('/api/groups', 'POST', { elementIds, name: name || 'Section' });
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: true, ...res.data });
    }
    const store = getStore(filePath);
    const group = store.groupElements(elementIds, name || 'Section');
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, group });
  }
);

server.tool(
  'ungroup_elements',
  'Ungroup a section/group back into individual elements',
  { filePath: z.string().optional(), groupId: z.string() },
  async ({ filePath, groupId }) => {
    if (!filePath) {
      const res = await studioFetch(`/api/groups/${encodeURIComponent(groupId)}`, 'DELETE');
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: true, ...res.data });
    }
    const store = getStore(filePath);
    store.ungroupElements(groupId);
    store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok: true, ungrouped: groupId });
  }
);

server.tool(
  'undo_design',
  'Undo the last edit in a design or live Studio',
  { filePath: z.string().optional() },
  async ({ filePath }) => {
    if (!filePath) {
      const res = await studioFetch('/api/design/undo', 'POST');
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: res.data.ok });
    }
    const store = getStore(filePath);
    const ok = store.undo();
    if (ok) store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok });
  }
);

server.tool(
  'redo_design',
  'Redo a previously undone edit in a design or live Studio',
  { filePath: z.string().optional() },
  async ({ filePath }) => {
    if (!filePath) {
      const res = await studioFetch('/api/design/redo', 'POST');
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      return okText({ ok: res.data.ok });
    }
    const store = getStore(filePath);
    const ok = store.redo();
    if (ok) store.save();
    await syncDocToStudioIfActive(filePath, store.doc);
    return okText({ ok });
  }
);

server.tool(
  'list_uploads',
  'List user-uploaded images and SVGs in Bauhaus Studio',
  {},
  async () => {
    const files = fs.existsSync(UPLOADS_DIR)
      ? fs.readdirSync(UPLOADS_DIR).filter((f) => f !== '.gitkeep')
      : [];
    return okText({
      uploads: files.map((f) => ({
        filename: f,
        filePath: path.join(UPLOADS_DIR, f),
        studioUrl: `${STUDIO_URL}/uploads/${encodeURIComponent(f)}`,
      })),
    });
  }
);

server.tool(
  'decode_image',
  'Inspect an image file to extract dimensions, aspect ratio, and dominant color palette',
  { imagePath: z.string() },
  async ({ imagePath }) => {
    const meta = await sharp(imagePath).metadata();
    const { data } = await sharp(imagePath).resize(6, 6, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const counts = new Map();
    for (let i = 0; i < data.length; i += 3) {
      const hex = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => (Math.round(v / 24) * 24).toString(16).padStart(2, '0')).join('');
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
    const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h]) => h);
    return okText({ width: meta.width, height: meta.height, format: meta.format, palette });
  }
);

server.tool(
  'capture_screenshot',
  'Render the current design to a PNG preview for visual inspection',
  { filePath: z.string().optional(), outPath: z.string(), scale: z.number().optional() },
  async ({ filePath, outPath, scale }) => {
    let doc;
    if (!filePath) {
      const res = await studioFetch('/api/design');
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      doc = res.data.doc;
    } else {
      doc = getStore(filePath).doc;
    }
    const info = await exportDesign(doc, 'png', outPath, { scale: scale || 1 });
    return okText(info);
  }
);

server.tool(
  'export_design',
  'Export a Bauhaus design to png, jpeg, webp, svg, pdf, print-pdf, html, or json',
  {
    filePath: z.string().optional(),
    format: z.enum(['png', 'jpeg', 'webp', 'svg', 'pdf', 'print-pdf', 'html', 'json']),
    outPath: z.string(),
    scale: z.number().optional(),
  },
  async ({ filePath, format, outPath, scale }) => {
    let doc;
    if (!filePath) {
      const res = await studioFetch('/api/design');
      if (!res.online) throw new Error('Provide filePath when Bauhaus Studio is offline.');
      doc = res.data.doc;
    } else {
      doc = getStore(filePath).doc;
    }
    const info = await exportDesign(doc, format, outPath, { scale: scale || 1 });
    return okText(info);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
