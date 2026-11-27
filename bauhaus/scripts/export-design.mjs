#!/usr/bin/env node
import fs from 'node:fs';
import { exportDesign } from './lib/exporter.mjs';

const [designPath, format, outPath, scaleArg] = process.argv.slice(2);
if (!designPath || !format || !outPath) {
  console.error('Usage: node export-design.mjs <design.json> <png|jpeg|webp|svg|pdf|print-pdf|html|json> <outPath> [scale]');
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(designPath, 'utf8'));
const scale = scaleArg ? Number(scaleArg) : 1;
const result = await exportDesign(doc, format, outPath, { scale });
console.log(JSON.stringify(result, null, 2));
