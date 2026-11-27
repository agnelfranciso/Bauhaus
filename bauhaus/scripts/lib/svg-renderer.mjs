import { escapeHtml, sanitizeSvg, isSafeAssetUri } from './security.mjs';
import { buildFontHeadTags, resolveFontFamily } from './fonts.mjs';

function buildGradientDef(id, grad) {
  if (!grad || typeof grad !== 'object') return '';
  const stops = (grad.stops || [])
    .map((s) => `<stop offset="${Math.round((s.offset ?? 0) * 100)}%" stop-color="${escapeHtml(s.color || '#000000')}" />`)
    .join('');
  if (grad.type === 'radial') {
    return `<radialGradient id="${escapeHtml(id)}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`;
  }
  const angle = typeof grad.angle === 'number' ? grad.angle : 135;
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = 50 - Math.cos(rad) * 50;
  const y1 = 50 - Math.sin(rad) * 50;
  const x2 = 50 + Math.cos(rad) * 50;
  const y2 = 50 + Math.sin(rad) * 50;
  return `<linearGradient id="${escapeHtml(id)}" x1="${x1.toFixed(1)}%" y1="${y1.toFixed(1)}%" x2="${x2.toFixed(1)}%" y2="${y2.toFixed(1)}%">${stops}</linearGradient>`;
}

function resolveFill(el, defs) {
  const fill = el.style?.fill;
  if (!fill) return 'none';
  if (typeof fill === 'string') return fill;
  const gradId = `grad-${el.id}`;
  defs.push(buildGradientDef(gradId, fill));
  return `url(#${gradId})`;
}

function buildPolygonPoints(el) {
  const pts = el.content?.points;
  if (typeof pts === 'string') return pts;
  if (Array.isArray(pts)) {
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  }
  const sides = el.content?.sides || 6;
  const rx = el.width / 2;
  const ry = el.height / 2;
  const coords = [];
  for (let i = 0; i < sides; i++) {
    const a = (i * 2 * Math.PI) / sides - Math.PI / 2;
    coords.push(`${(rx + rx * Math.cos(a)).toFixed(2)},${(ry + ry * Math.sin(a)).toFixed(2)}`);
  }
  return coords.join(' ');
}

/**
 * Renders a Bauhaus design document to an SVG string.
 * @param {object} design
 * @param {object} opts { mode: 'browser' | 'pure-svg', includeBleedMarks?: boolean }
 */
export function renderToSvg(design, opts = {}) {
  const mode = opts.mode || 'browser';
  const { width, height, background, bleed = 0 } = design.canvas;
  const includeBleed = Boolean(opts.includeBleedMarks && bleed > 0);
  const pad = includeBleed ? bleed : 0;
  const totalW = width + pad * 2;
  const totalH = height + pad * 2;

  const defs = [];
  let bgMarkup = '';
  if (background && background.type !== 'transparent') {
    if (background.type === 'linear' || background.type === 'radial') {
      defs.push(buildGradientDef('canvas-bg-grad', background));
      bgMarkup = `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="url(#canvas-bg-grad)" />`;
    } else {
      bgMarkup = `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${escapeHtml(background.color || '#ffffff')}" />`;
    }
  }

  const elementsMarkup = (design.elements || [])
    .filter((el) => el.visible !== false && el.type !== 'group')
    .map((el) => renderElementSvg(el, defs, mode))
    .join('\n  ');

  let cropMarks = '';
  if (includeBleed) {
    const m = Math.min(pad, 18);
    const x0 = pad;
    const y0 = pad;
    const x1 = pad + width;
    const y1 = pad + height;
    cropMarks = `
  <g stroke="#000000" stroke-width="0.75" opacity="0.85">
    <line x1="${x0 - m}" y1="${y0}" x2="${x0 - 2}" y2="${y0}" />
    <line x1="${x0}" y1="${y0 - m}" x2="${x0}" y2="${y0 - 2}" />
    <line x1="${x1 + 2}" y1="${y0}" x2="${x1 + m}" y2="${y0}" />
    <line x1="${x1}" y1="${y0 - m}" x2="${x1}" y2="${y0 - 2}" />
    <line x1="${x0 - m}" y1="${y1}" x2="${x0 - 2}" y2="${y1}" />
    <line x1="${x0}" y1="${y1 + 2}" x2="${x0}" y2="${y1 + m}" />
    <line x1="${x1 + 2}" y1="${y1}" x2="${x1 + m}" y2="${y1}" />
    <line x1="${x1}" y1="${y1 + 2}" x2="${x1}" y2="${y1 + m}" />
  </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <defs>
    ${defs.join('\n    ')}
  </defs>
  ${bgMarkup}
  <g transform="translate(${pad}, ${pad})">
    ${elementsMarkup}
  </g>${cropMarks}
</svg>`;
}

function renderElementSvg(el, defs, mode) {
  const s = el.style || {};
  const opacity = el.opacity ?? 1;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rot = el.rotation ? ` rotate(${el.rotation} ${cx} ${cy})` : '';
  const commonAttrs = `data-element-id="${escapeHtml(el.id)}" opacity="${opacity}"${rot ? ` transform="${rot.trim()}"` : ''}`;

  let filterAttr = '';
  if (s.shadow && typeof s.shadow === 'object') {
    const fid = `shadow-${el.id}`;
    defs.push(`<filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${s.shadow.x || 0}" dy="${s.shadow.y || 4}" stdDeviation="${(s.shadow.blur || 8) / 2}" flood-color="${escapeHtml(s.shadow.color || 'rgba(0,0,0,0.25)')}" /></filter>`);
    filterAttr = ` filter="url(#${fid})"`;
  }

  if (el.type === 'rect' || el.type === 'background' || el.type === 'gradient') {
    const fill = resolveFill(el, defs);
    const rx = Array.isArray(s.borderRadius) ? s.borderRadius[0] : (s.borderRadius || 0);
    const stroke = s.stroke ? ` stroke="${escapeHtml(s.stroke)}" stroke-width="${s.strokeWidth ?? 1}"` : '';
    const dash = s.strokeDasharray ? ` stroke-dasharray="${escapeHtml(s.strokeDasharray)}"` : '';
    return `<rect ${commonAttrs}${filterAttr} x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${rx}" fill="${fill}"${stroke}${dash} />`;
  }

  if (el.type === 'ellipse') {
    const fill = resolveFill(el, defs);
    const stroke = s.stroke ? ` stroke="${escapeHtml(s.stroke)}" stroke-width="${s.strokeWidth ?? 1}"` : '';
    return `<ellipse ${commonAttrs}${filterAttr} cx="${cx}" cy="${cy}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${fill}"${stroke} />`;
  }

  if (el.type === 'line') {
    const x2 = el.content?.x2 ?? (el.x + el.width);
    const y2 = el.content?.y2 ?? el.y;
    const stroke = escapeHtml(s.stroke || s.fill || '#000000');
    const dash = s.strokeDasharray ? ` stroke-dasharray="${escapeHtml(s.strokeDasharray)}"` : '';
    return `<line ${commonAttrs} x1="${el.x}" y1="${el.y}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${s.strokeWidth ?? 2}"${dash} />`;
  }

  if (el.type === 'polygon') {
    const fill = resolveFill(el, defs);
    const stroke = s.stroke ? ` stroke="${escapeHtml(s.stroke)}" stroke-width="${s.strokeWidth ?? 1}"` : '';
    const pts = buildPolygonPoints(el);
    return `<g ${commonAttrs}${filterAttr} transform="translate(${el.x}, ${el.y})${rot}"><polygon points="${escapeHtml(pts)}" fill="${fill}"${stroke} /></g>`;
  }

  if (el.type === 'image' || el.type === 'imported_asset') {
    const src = el.content?.src || '';
    if (!isSafeAssetUri(src)) return '';
    const fit = el.content?.fit === 'contain' ? 'xMidYMid meet' : el.content?.fit === 'fill' ? 'none' : 'xMidYMid slice';
    const rx = Array.isArray(s.borderRadius) ? s.borderRadius[0] : (s.borderRadius || 0);
    let clipAttr = '';
    if (rx > 0) {
      const cid = `clip-${el.id}`;
      defs.push(`<clipPath id="${cid}"><rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${rx}" /></clipPath>`);
      clipAttr = ` clip-path="url(#${cid})"`;
    }
    return `<image ${commonAttrs}${filterAttr}${clipAttr} x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" href="${escapeHtml(src)}" preserveAspectRatio="${fit}" />`;
  }

  if (el.type === 'svg' || el.type === 'icon') {
    const rawSvg = sanitizeSvg(el.content?.svgMarkup || '');
    const vb = el.content?.viewBox || '0 0 24 24';
    const inner = rawSvg.replace(/^<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    return `<svg ${commonAttrs}${filterAttr} x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" viewBox="${escapeHtml(vb)}">${inner}</svg>`;
  }

  if (el.type === 'text') {
    const text = el.content?.text || '';
    const fontFamily = resolveFontFamily(s.fontFamily, text);
    const fontSize = s.fontSize || 24;
    const fontWeight = s.fontWeight || 400;
    const fontStyle = s.fontStyle || 'normal';
    const lineHeight = s.lineHeight || 1.25;
    const letterSpacing = s.letterSpacing ?? 0;
    const textAlign = s.textAlign || 'left';
    const color = s.color || (typeof s.fill === 'string' ? s.fill : '#111111');
    const transform = s.textTransform || 'none';
    const decoration = s.textDecoration || 'none';
    const dir = el.content?.dir || 'auto';
    const lang = el.content?.lang ? ` lang="${escapeHtml(el.content.lang)}"` : '';

    if (mode === 'pure-svg') {
      const anchor = textAlign === 'center' ? 'middle' : textAlign === 'right' ? 'end' : 'start';
      const tx = textAlign === 'center' ? el.x + el.width / 2 : textAlign === 'right' ? el.x + el.width : el.x;
      const lines = text.split(/\r?\n/);
      const tspans = lines
        .map((line, i) => `<tspan x="${tx}" dy="${i === 0 ? fontSize : fontSize * lineHeight}">${escapeHtml(line || ' ')}</tspan>`)
        .join('');
      return `<text ${commonAttrs} y="${el.y}" font-family="${escapeHtml(fontFamily)}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" letter-spacing="${letterSpacing}px" text-anchor="${anchor}" fill="${escapeHtml(color)}">${tspans}</text>`;
    }

    const justifyContent = s.verticalAlign === 'middle' ? 'center' : s.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
    const css = [
      'width:100%',
      'height:100%',
      'margin:0',
      'padding:0',
      'display:flex',
      'flex-direction:column',
      `justify-content:${justifyContent}`,
      `font-family:${fontFamily}`,
      `font-size:${fontSize}px`,
      `font-weight:${fontWeight}`,
      `font-style:${fontStyle}`,
      `line-height:${lineHeight}`,
      `letter-spacing:${letterSpacing}px`,
      `text-align:${textAlign}`,
      `color:${color}`,
      `text-transform:${transform}`,
      `text-decoration:${decoration}`,
      'white-space:pre-wrap',
      'word-break:break-word',
      'overflow:visible',
    ].join(';');

    return `<foreignObject ${commonAttrs} x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"><div xmlns="http://www.w3.org/1999/xhtml" dir="${escapeHtml(dir)}"${lang} style="${escapeHtml(css)}">${escapeHtml(text)}</div></foreignObject>`;
  }

  return '';
}

/**
 * Renders a standalone HTML5 document wrapping the design SVG + Google/local fonts.
 */
export function renderToHtml(design, opts = {}) {
  const fontTags = buildFontHeadTags(design);
  const svg = renderToSvg(design, { mode: 'browser', includeBleedMarks: opts.includeBleedMarks });
  const { width, height, bleed = 0 } = design.canvas;
  const pad = opts.includeBleedMarks && bleed > 0 ? bleed : 0;
  const totalW = width + pad * 2;
  const totalH = height + pad * 2;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(design.title || 'Bauhaus Design')}</title>
  ${fontTags}
  <style>
    @page { size: ${totalW}px ${totalH}px; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${totalW}px;
      height: ${totalH}px;
      overflow: hidden;
      background: transparent;
    }
    svg { display: block; width: ${totalW}px; height: ${totalH}px; }
  </style>
</head>
<body>
${svg}
</body>
</html>`;
}
