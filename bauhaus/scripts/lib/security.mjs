import path from 'node:path';

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

/**
 * Sanitizes untrusted SVG markup by stripping scripts, event handlers,
 * javascript: URIs, and dangerous elements.
 */
export function sanitizeSvg(svgMarkup) {
  if (!svgMarkup || typeof svgMarkup !== 'string') return '';
  let clean = svgMarkup;
  // Remove script, iframe, object, embed, link[rel=import]
  clean = clean.replace(/<\s*(script|iframe|object|embed|applet|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  clean = clean.replace(/<\s*(script|iframe|object|embed|applet|meta)\b[^>]*\/?>/gi, '');
  // Remove inline event handlers (onClick, onload, onerror, etc.)
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Remove javascript: or data:text/html URIs in href/xlink:href/src
  clean = clean.replace(/(href|xlink:href|src)\s*=\s*(["'])\s*(?:javascript:|vbscript:|data:text\/html)[\s\S]*?\2/gi, '$1=$2#$2');
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
