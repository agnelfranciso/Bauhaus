import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { DesignStore, createNewDesign, validateDesign } from '../scripts/lib/scene-graph.mjs';
import { exportDesign } from '../scripts/lib/exporter.mjs';
import { sanitizeSvg, resolveSafePath, resolveSafeWritePath } from '../scripts/lib/security.mjs';
import { detectScripts, resolveFontFamily } from '../scripts/lib/fonts.mjs';
import { startBauhausServer } from '../scripts/bauhaus-server.mjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bauhaus-test-'));
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name}\n`, err);
    failed++;
    process.exitCode = 1;
  }
}

await test('Scene graph CRUD, grouping, layer reorder, undo/redo, save/reload', () => {
  const doc = createNewDesign({ id: 'test-doc', title: 'Test Design', width: 800, height: 600 });
  const filePath = path.join(tmpDir, 'test.bauhaus.json');
  const store = new DesignStore(doc, filePath);

  const rect = store.addElement({ id: 'r1', type: 'rect', x: 20, y: 20, width: 200, height: 100, style: { fill: '#111111' } });
  const txt = store.addElement({ id: 't1', type: 'text', x: 40, y: 40, width: 160, height: 60, content: { text: 'Hello' }, style: { fontSize: 24, color: '#ffffff' } });
  assert.equal(store.doc.elements.length, 2);

  store.updateElement('t1', { content: { text: 'Updated' } });
  assert.equal(store.doc.elements.find((e) => e.id === 't1').content.text, 'Updated');

  assert.equal(store.undo(), true);
  assert.equal(store.doc.elements.find((e) => e.id === 't1').content.text, 'Hello');
  assert.equal(store.redo(), true);
  assert.equal(store.doc.elements.find((e) => e.id === 't1').content.text, 'Updated');

  store.reorderLayers(['t1', 'r1']);
  assert.equal(store.doc.elements[0].id, 't1');

  const grp = store.groupElements(['r1', 't1'], 'Card');
  assert.equal(grp.type, 'group');
  store.ungroupElements(grp.id);
  assert.equal(store.doc.elements.some((e) => e.type === 'group'), false);

  store.save();
  const reloaded = DesignStore.load(filePath);
  assert.equal(reloaded.doc.elements.length, 2);
  assert.equal(validateDesign(reloaded.doc).valid, true);

  store.deleteElement('r1');
  assert.equal(store.doc.elements.length, 1);
});

await test('Security: SVG sanitization (bypass vectors) and path traversal protection', () => {
  const dirty = [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '<script>alert(1)</script>',
    '<rect onload="evil()" width="10" height="10"/>',
    '<a href="java&#115;cript:alert(1)"><text>x</text></a>',
    '<set attributeName="href" to="javascript:alert(1)"/>',
    '<image href="http://attacker.example/leak.png" width="10" height="10"/>',
    '<foreignObject width="100" height="100"><div><img src="x" onerror="alert(1)"/></div></foreignObject>',
    '<path d="M0 0 L10 10" fill="#111"/>',
    '</svg>',
  ].join('');
  const clean = sanitizeSvg(dirty);
  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('onload'), false);
  assert.equal(/javascript:/i.test(clean), false);
  assert.equal(/<set\b/i.test(clean), false);
  assert.equal(/attacker\.example/i.test(clean), false);
  assert.equal(/foreignObject/i.test(clean), false);
  assert.equal(clean.includes('M0 0 L10 10'), true);
  assert.throws(() => resolveSafePath(tmpDir, '../../outside.txt'));
  assert.throws(() => resolveSafeWritePath([tmpDir], '../../outside.txt'));
});

await test('Multilingual script detection (Malayalam & Hindi) & font fallbacks', () => {
  const scripts = detectScripts('കലോത്സവം स्वागत');
  const names = scripts.map((s) => s.name);
  assert.ok(names.includes('malayalam'));
  assert.ok(names.includes('devanagari'));
  assert.equal(resolveFontFamily('Inter', 'Hello'), 'Inter, system-ui, sans-serif');
  assert.equal(resolveFontFamily('JetBrains Mono', 'Code'), 'JetBrains Mono, monospace');
  assert.ok(resolveFontFamily('Playfair Display', 'Title').endsWith('serif'));
});

await test('Live Studio HTTP API CRUD & Undo', async () => {
  const port = 4899;
  const { server, url } = await startBauhausServer({ port });
  try {
    const health = await fetch(`${url}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);

    const added = await fetch(`${url}/api/elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'api-rect', type: 'rect', x: 10, y: 10, width: 100, height: 100, style: { fill: '#3b82f6' } }),
    }).then((r) => r.json());
    assert.equal(added.totalElements, 1);

    await fetch(`${url}/api/elements/api-rect`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 50 }),
    });

    const design = await fetch(`${url}/api/design`).then((r) => r.json());
    assert.equal(design.doc.elements[0].x, 50);

    await fetch(`${url}/api/design/undo`, { method: 'POST' });
    const afterUndo = await fetch(`${url}/api/design`).then((r) => r.json());
    assert.equal(afterUndo.doc.elements[0].x, 10);

    // Routes, assets, gallery, projects, download & path-traversal security
    const rootRes = await fetch(`${url}/`);
    assert.equal(rootRes.status, 200);
    const designRouteRes = await fetch(`${url}/design/zeroday-hackathon-2026`);
    assert.equal(designRouteRes.status, 200);
    const logoRes = await fetch(`${url}/logo.svg`);
    assert.equal(logoRes.status, 200);
    const iconsRes = await fetch(`${url}/icons.js`);
    assert.equal(iconsRes.status, 200);

    const gallery = await fetch(`${url}/api/gallery`).then((r) => r.json());
    assert.ok(Array.isArray(gallery.items) && gallery.items.length >= 6);

    const projects = await fetch(`${url}/api/projects`).then((r) => r.json());
    assert.ok(Array.isArray(projects.projects));

    const dlSvg = await fetch(`${url}/api/export/download?format=svg`);
    assert.equal(dlSvg.status, 200);
    assert.ok(dlSvg.headers.get('content-disposition')?.includes('attachment'));

    const traversalRes = await fetch(`${url}/api/design/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: 'C:\\Windows\\System32\\drivers\\etc\\hosts' }),
    });
    assert.equal(traversalRes.status, 400);

    // Origin, CORS, WebSocket origin, and arbitrary write path protections
    const evilOriginRes = await fetch(`${url}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(evilOriginRes.status, 403);
    assert.equal(evilOriginRes.headers.get('access-control-allow-origin'), null);

    const evilSaveRes = await fetch(`${url}/api/design/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: '../../evil.json' }),
    });
    assert.equal(evilSaveRes.status, 400);

    const evilCreateRes = await fetch(`${url}/api/design/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Evil', filePath: path.join(os.tmpdir(), 'evil-create.json') }),
    });
    assert.equal(evilCreateRes.status, 400);

    const evilExportRes = await fetch(`${url}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'svg', outPath: path.join(os.tmpdir(), 'evil-export.svg') }),
    });
    assert.equal(evilExportRes.status, 400);

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { Origin: 'https://evil.example' },
      });
      ws.on('open', () => {
        ws.close();
        reject(new Error('Foreign WebSocket origin should have been rejected'));
      });
      ws.on('unexpected-response', (_req, res) => {
        assert.equal(res.statusCode, 403);
        resolve();
      });
      ws.on('error', () => resolve());
    });
  } finally {
    server.close();
  }
});

await test('Rendering & Multi-format Export (PNG, JPEG, WebP, SVG, PDF, Print-PDF, HTML, JSON)', async () => {
  const doc = createNewDesign({
    id: 'export-test',
    title: 'Export Test',
    width: 600,
    height: 400,
    bleed: 24,
    background: { type: 'solid', color: '#111827' },
  });
  const store = new DesignStore(doc);
  store.addElement({
    id: 'title',
    type: 'text',
    x: 40,
    y: 120,
    width: 520,
    height: 120,
    content: { text: 'Bauhaus Export Test\nമലയാളം • हिन्दी' },
    style: { fontFamily: 'Inter', fontSize: 36, fontWeight: 700, color: '#F9FAFB', textAlign: 'center' },
  });

  for (const fmt of ['png', 'jpeg', 'webp', 'svg', 'pdf', 'print-pdf', 'html', 'json']) {
    const ext = fmt === 'print-pdf' ? 'print.pdf' : fmt;
    const outPath = path.join(tmpDir, `out.${ext}`);
    const info = await exportDesign(store.doc, fmt, outPath);
    assert.equal(info.verified, true);
    assert.ok(info.bytes > 0);
  }
});

if (failed > 0) {
  console.error(`\nFAILED: ${failed} of ${passed + failed} test suite(s) failed.`);
} else {
  console.log(`\nAll ${passed} test suites passed.`);
}
try {
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
} catch {
  // Ignore Windows file-handle lock on temp dir cleanup
}
