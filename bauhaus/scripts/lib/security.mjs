import path from 'node:path';
import sanitizeHtml from 'sanitize-html';

/**
 * Escapes text for safe inclusion in HTML/XML/SVG text nodes.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_SVG_TAGS = [
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop',
  'clipPath', 'mask', 'pattern', 'use', 'symbol', 'title', 'desc', 'image',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix',
  'feDropShadow', 'feFlood', 'feComposite', 'feMerge', 'feMergeNode',
];

const COMMON_SVG_ATTRS = [
  'id', 'class', 'style', 'transform', 'opacity', 'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'clip-path', 'clip-rule', 'mask', 'filter',
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2',
  'dx', 'dy', 'd', 'points', 'viewBox', 'preserveAspectRatio', 'xmlns', 'xmlns:xlink',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'patternUnits', 'patternTransform', 'clipPathUnits', 'maskUnits',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'word-spacing', 'xml:space',
  'stdDeviation', 'in', 'in2', 'result', 'mode', 'type', 'values', 'flood-color',
  'flood-opacity', 'operator', 'k1', 'k2', 'k3', 'k4', 'href', 'xlink:href',
];

const ALLOWED_SVG_ATTRS = Object.fromEntries(
  ALLOWED_SVG_TAGS.map((tag) => [tag, COMMON_SVG_ATTRS])
);

function isSafeSvgHref(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return /^#[a-zA-Z0-9_-]+$/.test(trimmed);
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) return true;
  return false;
}

/**
 * Sanitizes untrusted SVG markup using an HTML/XML parser and strict allowlist
 * (blocks scripts, foreignObject, SMIL animation/set, event handlers, javascript: URIs,
 * and external http/https network fetches).
 */
export function sanitizeSvg(svgMarkup) {
  if (!svgMarkup || typeof svgMarkup !== 'string') return '';
  const clean = sanitizeHtml(svgMarkup, {
    allowedTags: ALLOWED_SVG_TAGS,
    allowedAttributes: ALLOWED_SVG_ATTRS,
    allowedSchemes: ['data'],
    allowedSchemesByTag: {
      image: ['data'],
      use: [],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'style', 'foreignObject', 'iframe', 'object', 'embed', 'applet', 'textarea', 'option', 'noscript'],
    parser: {
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
      decodeEntities: true,
    },
    transformTags: {
      '*': (tagName, attribs) => {
        const next = {};
        for (const [k, v] of Object.entries(attribs)) {
          if (/^on/i.test(k)) continue;
          if (k === 'href' || k === 'xlink:href' || k === 'src') {
            if (!isSafeSvgHref(v)) continue;
          }
          if (k === 'style' && /url\s*\(|expression\s*\(/i.test(v)) {
            continue;
          }
          next[k] = v;
        }
        return { tagName, attribs: next };
      },
    },
  });
  return clean.trim();
}

/**
 * Validates that an image/asset URI is safe (http/https, relative file, or safe data:image/*).
 */
export function isSafeAssetUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  if (/^(javascript:|vbscript:|data:text\/html)/i.test(trimmed)) return false;
  if (/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^[a-zA-Z0-9._\-\/\\:]+$/.test(trimmed)) return true;
  return false;
}

/**
 * Resolves a target path safely within a base directory, throwing on traversal.
 */
export function resolveSafePath(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, targetPath);
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error(`Path traversal blocked: ${targetPath}`);
  }
  return resolvedTarget;
}

/**
 * Resolves a target write path safely inside one of the allowed base directories.
 * Relative paths resolve against the first allowed directory; absolute paths must fall
 * strictly within one of the allowed directories.
 */
export function resolveSafeWritePath(allowedDirs, targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Target path is required');
  }
  const isAbs = path.isAbsolute(targetPath);
  for (const dir of allowedDirs) {
    const resolvedBase = path.resolve(dir);
    const candidate = isAbs ? path.resolve(targetPath) : path.resolve(resolvedBase, targetPath);
    if (candidate === resolvedBase || candidate.startsWith(resolvedBase + path.sep)) {
      return candidate;
    }
  }
  throw new Error(
    `Access denied: path must be inside ${allowedDirs.map((d) => path.basename(d)).join(' or ')}.`
  );
}
