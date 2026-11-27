#!/usr/bin/env node
import fs from 'node:fs';
import { validateDesign } from './lib/scene-graph.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node validate-design.mjs <path-to-design.json>');
  process.exit(1);
}

try {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = validateDesign(raw);
  if (res.valid) {
    console.log(`VALID: ${file} (${res.document.elements.length} elements, ${res.document.canvas.width}x${res.document.canvas.height})`);
    process.exit(0);
  } else {
    console.error('INVALID:', res.errors.join('\n'));
    process.exit(1);
  }
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
}
