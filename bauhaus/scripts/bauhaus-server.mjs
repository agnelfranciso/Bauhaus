#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import sharp from 'sharp';
import { DesignStore, createNewDesign } from './lib/scene-graph.mjs';
import { exportDesign } from './lib/exporter.mjs';
import { renderToSvg } from './lib/svg-renderer.mjs';
import { buildFontHeadTags } from './lib/fonts.mjs';
import { sanitizeSvg, resolveSafePath, resolveSafeWritePath } from './lib/security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BAUHAUS_ROOT = path.resolve(__dirname, '..');
const STUDIO_DIR = path.resolve(BAUHAUS_ROOT, 'studio');
const UPLOADS_DIR = path.resolve(BAUHAUS_ROOT, 'assets/uploads');
const PROJECTS_DIR = path.resolve(BAUHAUS_ROOT, 'projects');
const EXPORTS_DIR = path.resolve(BAUHAUS_ROOT, 'exports');
const TEMPLATES_DIR = path.resolve(BAUHAUS_ROOT, 'assets/templates');
const EXAMPLES_DIR = path.resolve(BAUHAUS_ROOT, 'assets/examples');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

async function decodeImageBuffer(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.svg') {
    const raw = sanitizeSvg(buffer.toString('utf8'));
    const vbMatch = raw.match(/viewBox=["']([^"']+)["']/i);
    return {
      kind: 'svg',
      width: 400,
      height: 400,
      aspectRatio: '1:1',
      palette: [],
      summary: `Vector SVG (${buffer.length} bytes)${vbMatch ? `, viewBox="${vbMatch[1]}"` : ''}. Ready to insert as an editable SVG layer.`,
    };
  }

  const img = sharp(buffer);
  const meta = await img.metadata();
  const stats = await img.stats();

  const { data } = await img.clone().resize(6, 6, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const colorBuckets = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const r = Math.round(data[i] / 24) * 24;
    const g = Math.round(data[i + 1] / 24) * 24;
    const b = Math.round(data[i + 2] / 24) * 24;
    const hex = rgbToHex(r, g, b);
    colorBuckets.set(hex, (colorBuckets.get(hex) || 0) + 1);
  }
  const palette = [...colorBuckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hex]) => hex);

  const dom = stats.dominant ? rgbToHex(stats.dominant.r, stats.dominant.g, stats.dominant.b) : palette[0] || '#000000';
  if (!palette.includes(dom)) palette.unshift(dom);

  const w = meta.width || 1080;
  const h = meta.height || 1080;
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  const ratio = `${w / d}:${h / d}`;
  const orientation = w > h ? 'landscape' : w < h ? 'portrait' : 'square';

  return {
    kind: 'raster',
    format: meta.format,
    width: w,
    height: h,
    orientation,
    aspectRatio: ratio,
    hasAlpha: Boolean(meta.hasAlpha),
    palette: palette.slice(0, 6),
    summary: `${w}×${h}px (${orientation}, ${ratio}), ${meta.format?.toUpperCase() || 'image'}. Dominant palette: ${palette.slice(0, 5).join(', ')}.`,
  };
}

function listGalleryItems() {
  const items = [];
  const scanDir = (dir, source) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const designFile = path.join(dir, entry.name, 'design.bauhaus.json');
        const previewFile = path.join(dir, entry.name, 'preview.png');
        if (fs.existsSync(designFile)) {
          try {
            const doc = JSON.parse(fs.readFileSync(designFile, 'utf8'));
            items.push({
              id: doc.id,
              title: doc.title,
              category: doc.category || 'other',
              width: doc.canvas?.width,
              height: doc.canvas?.height,
              palette: doc.metadata?.palette || [],
              creativeDirection: doc.metadata?.creativeDirection || '',
              filePath: designFile,
              previewUrl: fs.existsSync(previewFile)
                ? `/gallery-preview/${source}/${encodeURIComponent(entry.name)}/preview.png`
                : null,
            });
          } catch {
            // ignore
          }
        }
      } else if (entry.name.endsWith('.bauhaus.json')) {
        const designFile = path.join(dir, entry.name);
        try {
          const doc = JSON.parse(fs.readFileSync(designFile, 'utf8'));
          if (!items.some((x) => x.id === doc.id)) {
            items.push({
              id: doc.id,
              title: doc.title,
              category: doc.category || 'other',
              width: doc.canvas?.width,
              height: doc.canvas?.height,
              palette: doc.metadata?.palette || [],
              creativeDirection: doc.metadata?.creativeDirection || '',
              filePath: designFile,
              previewUrl: null,
            });
          }
        } catch {
          // ignore
        }
      }
    }
  };
  scanDir(EXAMPLES_DIR, 'examples');
  scanDir(TEMPLATES_DIR, 'templates');
  return items;
}

export function startBauhausServer({ port = 4820, designPath = null } = {}) {
  let store;
  if (designPath && fs.existsSync(designPath)) {
    store = DesignStore.load(designPath);
  } else {
    const initial = createNewDesign({
      id: 'bauhaus-workspace',
      title: 'Untitled Bauhaus Design',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#F7F5F0' },
    });
    store = new DesignStore(initial, designPath ? path.resolve(designPath) : null);
  }

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  function broadcastState(source = 'server') {
    const payload = JSON.stringify({
      type: 'state',
      source,
      doc: store.doc,
      fontTags: buildFontHeadTags(store.doc),
      svg: renderToSvg(store.doc, { mode: 'browser' }),
      canUndo: store.undoStack.length > 0,
      canRedo: store.redoStack.length > 0,
    });
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(payload);
    }
  }

  function persistIfBound() {
    if (store.filePath) {
      lastSelfWriteAt = Date.now();
      store.save(store.filePath);
    }
  }

  let lastSelfWriteAt = 0;
  let activeWatcher = null;
  let watchDebounce = null;
  function attachFileWatcher() {
    if (activeWatcher) { activeWatcher.close(); activeWatcher = null; }
    if (!store.filePath || !fs.existsSync(store.filePath)) return;
    try {
      activeWatcher = fs.watch(store.filePath, () => {
        if (Date.now() - lastSelfWriteAt < 400) return;
        clearTimeout(watchDebounce);
        watchDebounce = setTimeout(() => {
          try {
            store = DesignStore.load(store.filePath);
            broadcastState('external-sync');
          } catch {}
        }, 120);
      });
    } catch {}
  }
  attachFileWatcher();

  async function readJsonBody(req, limitBytes = 25 * 1024 * 1024) {
    const chunks = [];
    let total = 0;
    for await (const c of req) {
      total += c.length;
      if (total > limitBytes) throw new Error('Payload too large');
      chunks.push(c);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  }

  function isAllowedHost(hostHeader) {
    if (!hostHeader || typeof hostHeader !== 'string') return false;
    const normalized = hostHeader.trim().toLowerCase();
    return normalized === `127.0.0.1:${port}` || normalized === `localhost:${port}`;
  }

  function isAllowedOrigin(originHeader) {
    if (originHeader === undefined) return true;
    if (typeof originHeader !== 'string') return false;
    const normalized = originHeader.trim().toLowerCase();
    return normalized === `http://127.0.0.1:${port}` || normalized === `http://localhost:${port}`;
  }

  function sendJson(res, status, data) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(data));
  }

  const server = http.createServer(async (req, res) => {
    if (!isAllowedHost(req.headers.host) || !isAllowedOrigin(req.headers.origin)) {
      return sendJson(res, 403, { error: 'Forbidden: invalid Host or Origin' });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;

    try {
      if (p === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          designId: store.doc?.id,
          filePath: store.filePath,
          elements: store.doc?.elements?.length || 0,
        });
      }

      if (p === '/api/gallery' && req.method === 'GET') {
        return sendJson(res, 200, { items: listGalleryItems() });
      }

      if (p === '/api/projects' && req.method === 'GET') {
        const projects = [];
        for (const entry of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.bauhaus.json')) {
            const fp = path.join(PROJECTS_DIR, entry.name);
            try {
              const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
              projects.push({
                id: doc.id,
                title: doc.title,
                category: doc.category || 'other',
                width: doc.canvas?.width,
                height: doc.canvas?.height,
                updatedAt: doc.updatedAt,
                elementsCount: doc.elements?.length || 0,
                filePath: fp,
              });
            } catch {}
          }
        }
        projects.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return sendJson(res, 200, { projects });
      }

      if (p === '/api/projects/create' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const slug = (body.title || 'untitled')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'design';
        const filename = `${slug}-${Date.now().toString(36)}.bauhaus.json`;
        const filePath = resolveSafePath(PROJECTS_DIR, filename);
        const doc = createNewDesign({
          id: `${slug}-${Date.now().toString(36)}`,
          title: body.title || 'Untitled Project',
          category: body.category || 'other',
          width: Number(body.width || 1080),
          height: Number(body.height || 1080),
          background: { type: 'solid', color: body.backgroundColor || '#FFFFFF' },
        });
        store = new DesignStore(doc, filePath);
        lastSelfWriteAt = Date.now();
        store.save();
        attachFileWatcher();
        broadcastState('init');
        return sendJson(res, 201, { doc: store.doc, filePath, studioUrl: `http://127.0.0.1:${port}/design/${encodeURIComponent(store.doc.id)}` });
      }

      if (p === '/api/projects' && req.method === 'DELETE') {
        const fp = url.searchParams.get('filePath');
        if (!fp) throw new Error('filePath is required');
        const safe = resolveSafeWritePath([PROJECTS_DIR], fp);
        if (fs.existsSync(safe)) fs.unlinkSync(safe);
        return sendJson(res, 200, { deleted: safe });
      }

      if (p === '/api/upload' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const { filename, dataUrl, mode } = body;
        if (!filename || !dataUrl) throw new Error('filename and dataUrl are required');
        const safeName = `${Date.now()}-${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) throw new Error('Invalid base64 dataUrl');
        const buffer = Buffer.from(match[2], 'base64');

        if (safeName.endsWith('.json')) {
          const parsed = JSON.parse(buffer.toString('utf8'));
          store.replaceDocument(parsed);
          broadcastState();
          return sendJson(res, 200, { loadedDesign: true, title: store.doc.title });
        }

        const outFile = resolveSafePath(UPLOADS_DIR, safeName);
        fs.writeFileSync(outFile, buffer);
        const decoded = await decodeImageBuffer(buffer, safeName);
        const publicUrl = `/uploads/${encodeURIComponent(safeName)}`;

        let addedElement = null;
        if (mode === 'insert') {
          const maxDim = Math.min(store.doc.canvas.width * 0.55, store.doc.canvas.height * 0.55);
          const scale = Math.min(1, maxDim / Math.max(decoded.width || 400, decoded.height || 400));
          const w = Math.round((decoded.width || 400) * scale);
          const h = Math.round((decoded.height || 400) * scale);
          const x = Math.round((store.doc.canvas.width - w) / 2);
          const y = Math.round((store.doc.canvas.height - h) / 2);

          if (decoded.kind === 'svg') {
            addedElement = store.addElement({
              type: 'svg',
              name: path.basename(filename, '.svg'),
              x, y, width: w, height: h,
              content: { svgMarkup: sanitizeSvg(buffer.toString('utf8')), viewBox: `0 0 ${w} ${h}` },
            });
          } else {
            addedElement = store.addElement({
              type: 'imported_asset',
              name: path.basename(filename),
              x, y, width: w, height: h,
              content: { src: `http://127.0.0.1:${port}${publicUrl}`, fit: 'contain', alt: filename },
            });
          }
          persistIfBound();
          broadcastState();
        }

        return sendJson(res, 201, {
          ok: true,
          filename: safeName,
          filePath: outFile,
          url: publicUrl,
          decoded,
          addedElement,
        });
      }

      if (p === '/api/design' && req.method === 'GET') {
        return sendJson(res, 200, {
          doc: store.doc,
          filePath: store.filePath,
          canUndo: store.undoStack.length > 0,
          canRedo: store.redoStack.length > 0,
        });
      }

      if (p === '/api/design/create' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const doc = createNewDesign(body);
        const targetPath = body.filePath
          ? resolveSafeWritePath([PROJECTS_DIR], body.filePath)
          : store.filePath;
        store = new DesignStore(doc, targetPath);
        persistIfBound();
        broadcastState();
        return sendJson(res, 201, { doc: store.doc, filePath: store.filePath });
      }

      if (p === '/api/design/load' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.filePath) throw new Error('filePath is required');
        const resolved = path.resolve(body.filePath);
        const allowedRoots = [PROJECTS_DIR, EXAMPLES_DIR, TEMPLATES_DIR];
        if (!allowedRoots.some((root) => resolved.startsWith(root + path.sep))) {
          throw new Error('Access denied: filePath must be inside projects, examples, or templates.');
        }
        store = DesignStore.load(resolved);
        attachFileWatcher();
        broadcastState('init');
        return sendJson(res, 200, { doc: store.doc, filePath: store.filePath, studioUrl: `http://127.0.0.1:${port}/design/${encodeURIComponent(store.doc.id)}` });
      }

      if (p === '/api/design/open-by-id' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const targetId = body.id;
        if (!targetId) throw new Error('id is required');
        if (store.doc?.id === targetId) {
          return sendJson(res, 200, { doc: store.doc, filePath: store.filePath });
        }
        let foundPath = null;
        for (const dir of [PROJECTS_DIR, EXAMPLES_DIR, TEMPLATES_DIR]) {
          if (!fs.existsSync(dir)) continue;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = entry.isDirectory()
              ? path.join(dir, entry.name, 'design.bauhaus.json')
              : path.join(dir, entry.name);
            if (!fp.endsWith('.json') || !fs.existsSync(fp)) continue;
            try {
              const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
              if (parsed.id === targetId) { foundPath = fp; break; }
            } catch {}
          }
          if (foundPath) break;
        }
        if (!foundPath) throw new Error(`Design not found: ${targetId}`);
        store = DesignStore.load(foundPath);
        broadcastState('init');
        return sendJson(res, 200, { doc: store.doc, filePath: store.filePath });
      }

      if (p === '/api/design' && req.method === 'PUT') {
        const body = await readJsonBody(req);
        store.replaceDocument(body.doc || body);
        persistIfBound();
        broadcastState();
        return sendJson(res, 200, { doc: store.doc });
      }

      if (p === '/api/design/save' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const targetPath = body.filePath
          ? resolveSafeWritePath([PROJECTS_DIR], body.filePath)
          : store.filePath;
        const saved = store.save(targetPath);
        return sendJson(res, 200, { saved });
      }

      if (p === '/api/design/undo' && req.method === 'POST') {
        const ok = store.undo();
        if (ok) persistIfBound();
        broadcastState();
        return sendJson(res, 200, { ok, doc: store.doc });
      }

      if (p === '/api/design/redo' && req.method === 'POST') {
        const ok = store.redo();
        if (ok) persistIfBound();
        broadcastState();
        return sendJson(res, 200, { ok, doc: store.doc });
      }

      if (p === '/api/elements' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = Array.isArray(body.elements)
          ? store.batchAddElements(body.elements)
          : store.addElement(body);
        persistIfBound();
        broadcastState();
        return sendJson(res, 201, { result, totalElements: store.doc.elements.length });
      }

      if (p.startsWith('/api/elements/') && req.method === 'PATCH') {
        const id = decodeURIComponent(p.slice('/api/elements/'.length));
        const body = await readJsonBody(req);
        const updated = store.updateElement(id, body);
        persistIfBound();
        broadcastState();
        return sendJson(res, 200, { element: updated });
      }

      if (p.startsWith('/api/elements/') && req.method === 'DELETE') {
        const id = decodeURIComponent(p.slice('/api/elements/'.length));
        const removed = store.deleteElement(id);
        persistIfBound();
        broadcastState();
        return sendJson(res, 200, { removed });
      }

      if (p === '/api/layers/reorder' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const layers = store.reorderLayers(body.orderedIds || []);
        persistIfBound();
        broadcastState();
        return sendJson(res, 200, { layers });
      }

      if (p === '/api/groups' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const group = store.groupElements(body.elementIds || [], body.name || 'Group');
        persistIfBound();
        broadcastState();
        return sendJson(res, 201, { group });
      }

      if (p.startsWith('/api/groups/') && req.method === 'DELETE') {
        const id = decodeURIComponent(p.slice('/api/groups/'.length));
        store.ungroupElements(id);
        persistIfBound();
        broadcastState();
        return sendJson(res, 200, { ungrouped: id });
      }

      if (p === '/api/export/download' && req.method === 'GET') {
        const fmt = (url.searchParams.get('format') || 'png').toLowerCase();
        const scale = Number(url.searchParams.get('scale') || 1);
        const ext = fmt === 'print-pdf' ? 'print.pdf' : fmt;
        const filename = `${store.doc?.id || 'design'}.${ext}`;
        const tmpFile = path.join(os.tmpdir(), `bauhaus-dl-${Date.now()}-${filename}`);
        try {
          await exportDesign(store.doc, fmt, tmpFile, { scale });
          const data = fs.readFileSync(tmpFile);
          const mime =
            fmt === 'pdf' || fmt === 'print-pdf' ? 'application/pdf'
            : fmt === 'svg' ? 'image/svg+xml'
            : fmt === 'html' ? 'text/html; charset=utf-8'
            : fmt === 'json' ? 'application/json; charset=utf-8'
            : fmt === 'jpeg' ? 'image/jpeg'
            : fmt === 'webp' ? 'image/webp'
            : 'image/png';
          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': data.length,
          });
          return res.end(data);
        } finally {
          try { fs.unlinkSync(tmpFile); } catch {}
        }
      }

      if (p === '/api/export' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const fmt = body.format || 'png';
        const ext = fmt === 'print-pdf' ? 'print.pdf' : fmt;
        const defaultOut = `${store.doc?.id || 'design'}.${ext}`;
        const safeOutPath = resolveSafeWritePath([EXPORTS_DIR, PROJECTS_DIR], body.outPath || defaultOut);
        const info = await exportDesign(store.doc, fmt, safeOutPath, {
          scale: body.scale || 1,
          quality: body.quality,
        });
        return sendJson(res, 200, info);
      }

      if (p.startsWith('/uploads/')) {
        const name = decodeURIComponent(p.slice('/uploads/'.length));
        const fullPath = resolveSafePath(UPLOADS_DIR, name);
        if (!fs.existsSync(fullPath)) {
          res.writeHead(404);
          return res.end('Not found');
        }
        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        return fs.createReadStream(fullPath).pipe(res);
      }

      if (p.startsWith('/gallery-preview/')) {
        const rel = decodeURIComponent(p.slice('/gallery-preview/'.length));
        const base = rel.startsWith('examples/') ? EXAMPLES_DIR : TEMPLATES_DIR;
        const sub = rel.replace(/^(examples|templates)\//, '');
        const fullPath = resolveSafePath(base, sub);
        if (!fs.existsSync(fullPath)) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return fs.createReadStream(fullPath).pipe(res);
      }

      const isAppRoute = p === '/' || p === '/dashboard' || p === '/design' || p.startsWith('/design/');
      const relPath = isAppRoute ? 'index.html' : p.replace(/^\/+/, '');
      const fullPath = path.resolve(STUDIO_DIR, relPath);
      if (!fullPath.startsWith(STUDIO_DIR) || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(fullPath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
      });
      fs.createReadStream(fullPath).pipe(res);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  });

  server.on('upgrade', (request, socket, head) => {
    if (!isAllowedHost(request.headers.host) || !isAllowedOrigin(request.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
        ws.on('message', (msg) => {
          try {
            const data = JSON.parse(msg.toString('utf8'));
            if (data.type === 'update_element' && data.id) {
              store.updateElement(data.id, data.patch);
              persistIfBound();
              broadcastState('client');
            }
          } catch {
            // ignore
          }
        });
        ws.send(
          JSON.stringify({
            type: 'state',
            source: 'init',
            doc: store.doc,
            fontTags: buildFontHeadTags(store.doc),
            svg: renderToSvg(store.doc, { mode: 'browser' }),
            canUndo: store.undoStack.length > 0,
            canRedo: store.redoStack.length > 0,
          })
        );
      });
    } else {
      socket.destroy();
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIdx = process.argv.indexOf('--port');
  const fileIdx = process.argv.indexOf('--file');
  const port = portIdx !== -1 ? Number(process.argv[portIdx + 1]) : Number(process.env.BAUHAUS_PORT || 4820);
  const designPath = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;
  const info = await startBauhausServer({ port, designPath });
  console.log(`Bauhaus Studio running at ${info.url}`);
  const shutdown = () => {
    info.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
