import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { renderToHtml, renderToSvg } from './svg-renderer.mjs';
import { validateDesign } from './scene-graph.mjs';
import { collectDesignFonts } from './fonts.mjs';

const BROWSER_CANDIDATES = [
  process.env.BAUHAUS_BROWSER_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowserExecutable() {
  for (const p of BROWSER_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium/Chrome/Edge executable found. Set BAUHAUS_BROWSER_PATH.');
}

async function launchBrowser(executablePath) {
  if (process.env.BAUHAUS_NO_SANDBOX === '1') {
    return chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu-sandbox'],
    });
  }
  try {
    return await chromium.launch({
      executablePath,
      headless: true,
    });
  } catch (err) {
    if (/sandbox|SUID|namespace|zygote/i.test(err?.message || '')) {
      return chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-gpu-sandbox'],
      });
    }
    throw err;
  }
}

async function withPage(design, opts, fn) {
  const executablePath = findBrowserExecutable();
  const browser = await launchBrowser(executablePath);
  try {
    const scale = opts.scale || 1;
    const pad = opts.includeBleedMarks && design.canvas.bleed ? design.canvas.bleed : 0;
    const width = Math.round(design.canvas.width + pad * 2);
    const height = Math.round(design.canvas.height + pad * 2);

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    const html = renderToHtml(design, { includeBleedMarks: opts.includeBleedMarks });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      page.evaluate(() => document.fonts?.ready),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
    await page.waitForTimeout(150);

    const { fonts } = collectDesignFonts(design);
    const requestedFamilies = fonts.map((f) => f.family).filter(Boolean);
    const missingFonts = requestedFamilies.length
      ? await page.evaluate((families) => {
          if (!document.fonts || typeof document.fonts.check !== 'function') return [];
          return families.filter((fam) => {
            try {
              return !document.fonts.check(`16px "${fam.replace(/"/g, '\\"')}"`);
            } catch {
              return false;
            }
          });
        }, requestedFamilies)
      : [];
    const fontWarnings = missingFonts.map(
      (f) => `Font "${f}" did not load before render; fallback stack was used.`
    );

    return await fn(page, { width, height, scale, fontWarnings });
  } finally {
    await browser.close();
  }
}

/**
 * Exports a validated design to png | jpeg | webp | svg | pdf | print-pdf | html | json
 * and verifies the generated output file.
 */
export async function exportDesign(designInput, format, outPath, options = {}) {
  const res = validateDesign(designInput);
  if (!res.valid) {
    throw new Error(`Invalid design: ${res.errors.join('; ')}`);
  }
  const design = res.document;
  const resolvedOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  const fmt = format.toLowerCase();

  if (fmt === 'json') {
    fs.writeFileSync(resolvedOut, JSON.stringify(design, null, 2), 'utf8');
    return verifyExport(resolvedOut, 'json', design);
  }

  if (fmt === 'svg') {
    const svg = renderToSvg(design, { mode: 'pure-svg', includeBleedMarks: options.includeBleedMarks });
    fs.writeFileSync(resolvedOut, svg, 'utf8');
    return verifyExport(resolvedOut, 'svg', design);
  }

  if (fmt === 'html') {
    const html = renderToHtml(design, { includeBleedMarks: options.includeBleedMarks });
    fs.writeFileSync(resolvedOut, html, 'utf8');
    return verifyExport(resolvedOut, 'html', design);
  }

  if (fmt === 'pdf' || fmt === 'print-pdf') {
    const isPrint = fmt === 'print-pdf';
    const bleed = isPrint ? (design.canvas.bleed || 36) : 0;
    const printDesign = isPrint
      ? { ...design, canvas: { ...design.canvas, bleed } }
      : design;

    let fontWarnings = [];
    await withPage(printDesign, { scale: isPrint ? 2 : 1, includeBleedMarks: isPrint }, async (page, dims) => {
      fontWarnings = dims.fontWarnings || [];
      await page.pdf({
        path: resolvedOut,
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    });
    const info = await verifyExport(resolvedOut, fmt, printDesign);
    if (fontWarnings.length > 0) info.fontWarnings = fontWarnings;
    return info;
  }

  if (fmt === 'png' || fmt === 'jpeg' || fmt === 'jpg' || fmt === 'webp') {
    const scale = options.scale || 1;
    const omitBg = fmt === 'png' && design.canvas.background?.type === 'transparent';
    const { pngBuffer, fontWarnings } = await withPage(design, { scale }, async (page, dims) => {
      return {
        pngBuffer: await page.screenshot({ type: 'png', omitBackground: omitBg }),
        fontWarnings: dims.fontWarnings || [],
      };
    });

    if (fmt === 'png') {
      fs.writeFileSync(resolvedOut, pngBuffer);
    } else if (fmt === 'jpeg' || fmt === 'jpg') {
      await sharp(pngBuffer).jpeg({ quality: options.quality || 92 }).toFile(resolvedOut);
    } else if (fmt === 'webp') {
      await sharp(pngBuffer).webp({ quality: options.quality || 90 }).toFile(resolvedOut);
    }
    const info = await verifyExport(resolvedOut, fmt, design, scale);
    if (fontWarnings.length > 0) info.fontWarnings = fontWarnings;
    return info;
  }

  throw new Error(`Unsupported export format: ${format}`);
}

export async function verifyExport(filePath, format, design, scale = 1) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Export verification failed: file does not exist at ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new Error(`Export verification failed: file is empty at ${filePath}`);
  }

  const info = {
    path: filePath,
    format,
    bytes: stat.size,
    verified: true,
  };

  if (['png', 'jpeg', 'jpg', 'webp'].includes(format)) {
    const meta = await sharp(filePath).metadata();
    info.width = meta.width;
    info.height = meta.height;
    const expectedW = Math.round(design.canvas.width * scale);
    const expectedH = Math.round(design.canvas.height * scale);
    if (meta.width !== expectedW || meta.height !== expectedH) {
      throw new Error(`Dimension mismatch: expected ${expectedW}x${expectedH}, got ${meta.width}x${meta.height}`);
    }
  } else if (format === 'pdf' || format === 'print-pdf') {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    if (buf.toString('utf8') !== '%PDF-') {
      throw new Error('Export verification failed: invalid PDF header.');
    }
  } else if (format === 'svg') {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('<svg')) {
      throw new Error('Export verification failed: missing <svg> root.');
    }
  }

  return info;
}
