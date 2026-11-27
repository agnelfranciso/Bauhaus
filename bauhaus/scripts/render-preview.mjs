#!/usr/bin/env node
import fs from 'node:fs';
import { exportDesign } from './lib/exporter.mjs';

const [designPath, outPath, scaleArg] = process.argv.slice(2);
if (!designPath || !outPath) {
  console.error('Usage: node render-preview.mjs <design.json> <preview.png> [scale]');
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(designPath, 'utf8'));
const scale = scaleArg ? Number(scaleArg) : 1;
const result = await exportDesign(doc, 'png', outPath, { scale });
console.log(JSON.stringify(result, null, 2));
