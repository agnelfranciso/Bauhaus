import { escapeHtml } from './security.mjs';

const SCRIPT_PATTERNS = [
  { name: 'malayalam', regex: /[\u0D00-\u0D7F]/, defaultFont: 'Noto Sans Malayalam', systemFallback: "'Noto Sans Malayalam', 'Kartika', 'Nirmala UI', sans-serif" },
  { name: 'devanagari', regex: /[\u0900-\u097F]/, defaultFont: 'Noto Sans Devanagari', systemFallback: "'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', sans-serif" },
  { name: 'tamil', regex: /[\u0B80-\u0BFF]/, defaultFont: 'Noto Sans Tamil', systemFallback: "'Noto Sans Tamil', 'Latha', 'Nirmala UI', sans-serif" },
  { name: 'arabic', regex: /[\u0600-\u06FF]/, defaultFont: 'Noto Sans Arabic', systemFallback: "'Noto Sans Arabic', 'Tahoma', sans-serif" },
  { name: 'cjk', regex: /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/, defaultFont: 'Noto Sans', systemFallback: "'Noto Sans', 'Microsoft YaHei', sans-serif" },
];

/**
 * Detects non-Latin scripts present in a string or across an entire design.
 */
export function detectScripts(text) {
  const found = [];
  if (!text) return found;
  for (const s of SCRIPT_PATTERNS) {
    if (s.regex.test(text)) found.push(s);
  }
  return found;
}

/**
 * Collects all font families referenced by the design and auto-adds script-appropriate
 * Google Fonts (e.g., Noto Sans Malayalam, Noto Sans Devanagari) if needed.
 */
export function collectDesignFonts(design) {
  const fontMap = new Map();

  for (const f of design.fonts || []) {
    fontMap.set(f.family, {
      family: f.family,
      source: f.source || 'google',
      url: f.url,
      weights: f.weights || [400, 500, 600, 700, 800],
    });
  }

  let allText = '';
  for (const el of design.elements || []) {
    if (el.type === 'text') {
      allText += ' ' + (el.content?.text || '');
      const fam = el.style?.fontFamily;
      if (fam) {
        const primary = fam.split(',')[0].replace(/['"]/g, '').trim();
        if (primary && !fontMap.has(primary) && !isGenericFont(primary)) {
          fontMap.set(primary, {
            family: primary,
            source: 'google',
            weights: [400, 500, 600, 700, 800],
          });
        }
      }
    }
  }

  const detectedScripts = detectScripts(allText);
  for (const script of detectedScripts) {
    if (!fontMap.has(script.defaultFont)) {
      fontMap.set(script.defaultFont, {
        family: script.defaultFont,
        source: 'google',
        weights: [400, 500, 600, 700],
      });
    }
  }

  return { fonts: Array.from(fontMap.values()), detectedScripts };
}

function isGenericFont(name) {
  return ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'].includes(name.toLowerCase());
}

/**
 * Builds Google Fonts <link> and local @font-face <style> tags for HTML/Chromium rendering.
 */
export function buildFontHeadTags(design) {
  const { fonts } = collectDesignFonts(design);
  const googleFamilies = [];
  const localRules = [];

  for (const f of fonts) {
    if (f.source === 'google') {
      const weights = (f.weights && f.weights.length ? f.weights : [400, 600, 700]).join(';');
      const encoded = encodeURIComponent(f.family).replace(/%20/g, '+');
      googleFamilies.push(`family=${encoded}:wght@${weights}`);
    } else if (f.source === 'local' && f.url) {
      localRules.push(`@font-face { font-family: '${escapeHtml(f.family)}'; src: url('${escapeHtml(f.url)}'); font-display: swap; }`);
    }
  }

  const tags = [];
  if (googleFamilies.length > 0) {
    const href = `https://fonts.googleapis.com/css2?${googleFamilies.join('&')}&display=swap`;
    tags.push(`<link rel="stylesheet" href="${href}" />`);
  }
  if (localRules.length > 0) {
    tags.push(`<style>${localRules.join('\n')}</style>`);
  }
  return tags.join('\n');
}

/**
 * Returns a font-family CSS string augmented with script-safe fallbacks.
 */
export function resolveFontFamily(requestedFamily, text) {
  const base = requestedFamily || 'Inter, system-ui, sans-serif';
  const scripts = detectScripts(text);
  if (scripts.length === 0) return base;
  const fallbacks = scripts.map((s) => s.systemFallback).join(', ');
  return `${base}, ${fallbacks}`;
}
