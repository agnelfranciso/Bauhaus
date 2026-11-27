import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(__dirname, '../../schemas');

const elementSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'element.schema.json'), 'utf8'));
const designSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'design.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, useDefaults: true });
addFormats(ajv);
ajv.addSchema(elementSchema);
const validateDesignFn = ajv.compile(designSchema);
const validateElementFn = ajv.compile(elementSchema);

export function validateDesign(doc) {
  const clone = structuredClone(doc);
  const valid = validateDesignFn(clone);
  return {
    valid,
    errors: valid ? [] : (validateDesignFn.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`),
    document: clone,
  };
}

export function validateElement(el) {
  const clone = structuredClone(el);
  const valid = validateElementFn(clone);
  return {
    valid,
    errors: valid ? [] : (validateElementFn.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`),
    element: clone,
  };
}

export function createNewDesign({
  id,
  title,
  category = 'other',
  width = 1080,
  height = 1080,
  unit = 'px',
  dpi = 72,
  bleed = 0,
  background = { type: 'solid', color: '#ffffff' },
  fonts = [],
  metadata = {},
}) {
  const now = new Date().toISOString();
  const doc = {
    schemaVersion: '1.0.0',
    id: id || `design-${Date.now()}`,
    title: title || 'Untitled Design',
    category,
    createdAt: now,
    updatedAt: now,
    canvas: { width, height, unit, dpi, bleed, background },
    fonts,
    assets: [],
    elements: [],
    metadata,
  };
  const res = validateDesign(doc);
  if (!res.valid) {
    throw new Error(`Invalid design: ${res.errors.join('; ')}`);
  }
  return res.document;
}

/**
 * Stateful scene-graph manager with Undo/Redo history and persistence.
 */
export class DesignStore {
  constructor(doc = null, filePath = null) {
    this.doc = doc ? validateDesign(doc).document : null;
    this.filePath = filePath;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;
  }

  static load(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const res = validateDesign(parsed);
    if (!res.valid) {
      throw new Error(`Schema validation failed for ${filePath}: ${res.errors.join('; ')}`);
    }
    return new DesignStore(res.document, path.resolve(filePath));
  }

  save(targetPath = null) {
    const outPath = targetPath ? path.resolve(targetPath) : this.filePath;
    if (!outPath) throw new Error('No file path specified for saving.');
    this.doc.updatedAt = new Date().toISOString();
    const res = validateDesign(this.doc);
    if (!res.valid) {
      throw new Error(`Cannot save invalid design: ${res.errors.join('; ')}`);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(res.document, null, 2), 'utf8');
    this.filePath = outPath;
    return outPath;
  }

  _pushHistory() {
    if (!this.doc) return;
    this.undoStack.push(JSON.stringify(this.doc));
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(this.undoStack.pop());
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(this.redoStack.pop());
    return true;
  }

  replaceDocument(newDoc) {
    const res = validateDesign(newDoc);
    if (!res.valid) throw new Error(`Invalid design: ${res.errors.join('; ')}`);
    this._pushHistory();
    this.doc = res.document;
    this.doc.updatedAt = new Date().toISOString();
    return this.doc;
  }

  addElement(elInput) {
    const el = {
      id: elInput.id || `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      parentId: null,
      layerOrder: this.doc.elements.length,
      ...elInput,
    };
    if (this.doc.elements.some((e) => e.id === el.id)) {
      throw new Error(`Duplicate element id: ${el.id}`);
    }
    const res = validateElement(el);
    if (!res.valid) throw new Error(`Invalid element: ${res.errors.join('; ')}`);
    this._pushHistory();
    this.doc.elements.push(res.element);
    this.doc.updatedAt = new Date().toISOString();
    return res.element;
  }

  batchAddElements(elements) {
    this._pushHistory();
    const added = [];
    try {
      for (const elInput of elements) {
        const el = {
          id: elInput.id || `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          parentId: null,
          layerOrder: this.doc.elements.length,
          ...elInput,
        };
        if (this.doc.elements.some((e) => e.id === el.id)) {
          throw new Error(`Duplicate element id: ${el.id}`);
        }
        const res = validateElement(el);
        if (!res.valid) throw new Error(`Invalid element (${el.id}): ${res.errors.join('; ')}`);
        this.doc.elements.push(res.element);
        added.push(res.element);
      }
      this.doc.updatedAt = new Date().toISOString();
      return added;
    } catch (err) {
      this.undo();
      throw err;
    }
  }

  updateElement(id, patch) {
    const idx = this.doc.elements.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Element not found: ${id}`);
    const current = this.doc.elements[idx];
    const merged = {
      ...current,
      ...patch,
      id: current.id,
      content: patch.content ? { ...(current.content || {}), ...patch.content } : current.content,
      style: patch.style ? { ...(current.style || {}), ...patch.style } : current.style,
    };
    const res = validateElement(merged);
    if (!res.valid) throw new Error(`Invalid element update: ${res.errors.join('; ')}`);
    this._pushHistory();
    this.doc.elements[idx] = res.element;
    this.doc.updatedAt = new Date().toISOString();
    return res.element;
  }

  deleteElement(id) {
    const idx = this.doc.elements.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Element not found: ${id}`);
    this._pushHistory();
    const [removed] = this.doc.elements.splice(idx, 1);
    for (const el of this.doc.elements) {
      if (el.parentId === id) el.parentId = null;
    }
    this.doc.updatedAt = new Date().toISOString();
    return removed;
  }

  reorderLayers(orderedIds) {
    const map = new Map(this.doc.elements.map((e) => [e.id, e]));
    const reordered = [];
    for (const id of orderedIds) {
      if (map.has(id)) {
        reordered.push(map.get(id));
        map.delete(id);
      }
    }
    for (const remaining of map.values()) {
      reordered.push(remaining);
    }
    this._pushHistory();
    reordered.forEach((el, i) => {
      el.layerOrder = i;
    });
    this.doc.elements = reordered;
    this.doc.updatedAt = new Date().toISOString();
    return this.doc.elements;
  }

  groupElements(elementIds, groupName = 'Group') {
    const targets = this.doc.elements.filter((e) => elementIds.includes(e.id));
    if (targets.length < 2) throw new Error('Need at least 2 elements to group.');
    const minX = Math.min(...targets.map((e) => e.x));
    const minY = Math.min(...targets.map((e) => e.y));
    const maxX = Math.max(...targets.map((e) => e.x + e.width));
    const maxY = Math.max(...targets.map((e) => e.y + e.height));
    const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

    this._pushHistory();
    const groupEl = {
      id: groupId,
      type: 'group',
      name: groupName,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      parentId: null,
      children: targets.map((t) => t.id),
      layerOrder: this.doc.elements.length,
    };
    for (const t of targets) {
      t.parentId = groupId;
    }
    this.doc.elements.push(groupEl);
    this.doc.updatedAt = new Date().toISOString();
    return groupEl;
  }

  ungroupElements(groupId) {
    const idx = this.doc.elements.findIndex((e) => e.id === groupId && e.type === 'group');
    if (idx === -1) throw new Error(`Group not found: ${groupId}`);
    this._pushHistory();
    this.doc.elements.splice(idx, 1);
    for (const el of this.doc.elements) {
      if (el.parentId === groupId) el.parentId = null;
    }
    this.doc.updatedAt = new Date().toISOString();
    return true;
  }
}
