#!/usr/bin/env node
import fs from 'node:fs';
import { DesignStore, createNewDesign } from './lib/scene-graph.mjs';
import { exportDesign } from './lib/exporter.mjs';

const [, , cmd, ...args] = process.argv;

function parseFlag(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}

async function main() {
  if (!cmd || cmd === '--help') {
    console.log(`Bauhaus CLI
Commands:
  create --out <file.bauhaus.json> --title <title> [--width 1080] [--height 1080] [--category poster] [--bg #ffffff]
  add-element --file <file.bauhaus.json> --json '<elementJson>'
  update-element --file <file.bauhaus.json> --id <id> --json '<patchJson>'
  delete-element --file <file.bauhaus.json> --id <id>
  reorder --file <file.bauhaus.json> --ids id1,id2,...
  group --file <file.bauhaus.json> --ids id1,id2 --name "Header"
  undo --file <file.bauhaus.json>
  export --file <file.bauhaus.json> --format <png|jpeg|webp|svg|pdf|print-pdf|html|json> --out <outPath> [--scale 1]`);
    return;
  }

  if (cmd === 'create') {
    const out = parseFlag('out');
    if (!out) throw new Error('--out is required');
    const doc = createNewDesign({
      title: parseFlag('title') || 'Untitled Design',
      category: parseFlag('category') || 'other',
      width: Number(parseFlag('width') || 1080),
      height: Number(parseFlag('height') || 1080),
      background: { type: 'solid', color: parseFlag('bg') || '#ffffff' },
    });
    const store = new DesignStore(doc, out);
    store.save();
    console.log(JSON.stringify({ created: out, id: doc.id }));
    return;
  }

  const file = parseFlag('file');
  if (!file) throw new Error('--file is required');
  const store = DesignStore.load(file);

  if (cmd === 'add-element') {
    const el = JSON.parse(parseFlag('json') || '{}');
    const added = store.addElement(el);
    store.save();
    console.log(JSON.stringify({ added }));
  } else if (cmd === 'update-element') {
    const id = parseFlag('id');
    const patch = JSON.parse(parseFlag('json') || '{}');
    const updated = store.updateElement(id, patch);
    store.save();
    console.log(JSON.stringify({ updated }));
  } else if (cmd === 'delete-element') {
    const id = parseFlag('id');
    const removed = store.deleteElement(id);
    store.save();
    console.log(JSON.stringify({ removed }));
  } else if (cmd === 'reorder') {
    const ids = (parseFlag('ids') || '').split(',').filter(Boolean);
    const layers = store.reorderLayers(ids);
    store.save();
    console.log(JSON.stringify({ count: layers.length }));
  } else if (cmd === 'group') {
    const ids = (parseFlag('ids') || '').split(',').filter(Boolean);
    const name = parseFlag('name') || 'Group';
    const group = store.groupElements(ids, name);
    store.save();
    console.log(JSON.stringify({ group }));
  } else if (cmd === 'export') {
    const format = parseFlag('format') || 'png';
    const out = parseFlag('out');
    const scale = Number(parseFlag('scale') || 1);
    const info = await exportDesign(store.doc, format, out, { scale });
    console.log(JSON.stringify(info, null, 2));
  } else {
    throw new Error(`Unknown command: ${cmd}`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
