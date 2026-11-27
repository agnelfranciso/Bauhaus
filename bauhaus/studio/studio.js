import { icon } from '/icons.js';

document.querySelectorAll('[data-icon]').forEach((el) => {
  const name = el.getAttribute('data-icon');
  if (name) el.insertAdjacentHTML('afterbegin', icon(name));
});

const state = {
  doc: null,
  selectedId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  drag: null,
  lastUpload: null,
  galleryItems: [],
  activeFilter: 'all',
};

const svgHost = document.getElementById('svg-host');
const viewport = document.getElementById('viewport');
const stage = document.getElementById('canvas-stage');
const overlay = document.getElementById('selection-overlay');
const contextBar = document.getElementById('context-bar');
const contextMenu = document.getElementById('context-menu');
const toastEl = document.getElementById('toast');
const layersList = document.getElementById('layers-list');
const layerCount = document.getElementById('layer-count');
const inspectorTitle = document.getElementById('inspector-title');
const inspectorBody = document.getElementById('inspector-body');
const statusBar = document.getElementById('status-bar');
const docTitleInput = document.getElementById('doc-title-input');
const docDims = document.getElementById('doc-dims');
const artboardLabel = document.getElementById('artboard-label');
const zoomLabel = document.getElementById('zoom-label');
const dynamicFonts = document.getElementById('dynamic-fonts');
const sidebarProjectsList = document.getElementById('sidebar-projects-list');
const dashGallery = document.getElementById('dash-gallery');

const FONT_PRESETS = [
  'Inter',
  'Space Grotesk',
  'Syne',
  'Outfit',
  'Plus Jakarta Sans',
  'Bricolage Grotesque',
  'Sora',
  'Manrope',
  'Urbanist',
  'DM Sans',
  'Poppins',
  'Montserrat',
  'Archivo',
  'Figtree',
  'Instrument Sans',
  'Raleway',
  'Work Sans',
  'Rubik',
  'Nunito',
  'Lato',
  'Open Sans',
  'Bebas Neue',
  'Oswald',
  'Anton',
  'Unbounded',
  'Playfair Display',
  'Fraunces',
  'Instrument Serif',
  'DM Serif Display',
  'Cormorant Garamond',
  'Lora',
  'Merriweather',
  'Libre Baskerville',
  'Cinzel',
  'JetBrains Mono',
  'Fira Code',
  'IBM Plex Mono',
  'Space Mono',
  'Noto Sans Malayalam',
  'Manjari',
  'Gayathri',
  'Noto Sans Devanagari',
  'Noto Sans Tamil',
  'Noto Sans Arabic',
];

async function api(path, method = 'GET', body = null) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setMode(mode, designId = null, push = true) {
  const isDash = mode === 'dashboard';
  document.getElementById('dashboard-view').classList.toggle('hidden', !isDash);
  document.getElementById('studio-view').classList.toggle('hidden', isDash);
  document.getElementById('topbar-doc-meta').classList.toggle('hidden', isDash);
  document.getElementById('topbar-editor-center').classList.toggle('hidden', isDash);
  document.getElementById('topbar-editor-right').classList.toggle('hidden', isDash);
  document.getElementById('topbar-dash-right').classList.toggle('hidden', !isDash);
  if (push) {
    const targetUrl = isDash ? '/' : (designId ? `/design/${encodeURIComponent(designId)}` : `/design/${encodeURIComponent(state.doc?.id || 'current')}`);
    if (location.pathname !== targetUrl) history.pushState({ mode, designId }, '', targetUrl);
  }
  if (!isDash) setTimeout(fitZoom, 30);
}

window.onpopstate = () => syncRouteFromLocation();

async function syncRouteFromLocation() {
  const p = location.pathname;
  if (p === '/design' || p.startsWith('/design/')) {
    const seg = p.slice('/design/'.length).replace(/\/+$/, '');
    if (seg && seg !== 'current' && state.doc?.id !== decodeURIComponent(seg)) {
      await api('/api/design/open-by-id', 'POST', { id: decodeURIComponent(seg) }).catch(() => { });
    }
    setMode('studio', seg || null, false);
  } else {
    setMode('dashboard', null, false);
  }
}

const leaveModal = document.getElementById('leave-modal');
document.getElementById('btn-home-dash').onclick = () => {
  const inStudio = !document.getElementById('studio-view').classList.contains('hidden');
  if (inStudio) {
    leaveModal.classList.remove('hidden');
  }
};
document.getElementById('leave-modal-close').onclick = () => leaveModal.classList.add('hidden');
document.getElementById('leave-cancel').onclick = () => leaveModal.classList.add('hidden');
document.getElementById('leave-discard').onclick = () => {
  leaveModal.classList.add('hidden');
  setMode('dashboard');
};
document.getElementById('leave-save').onclick = async () => {
  await api('/api/design/save', 'POST', {}).catch(() => { });
  leaveModal.classList.add('hidden');
  setMode('dashboard');
};
document.getElementById('btn-resume-studio').onclick = () => setMode('studio', state.doc?.id);
document.getElementById('btn-top-resume').onclick = () => setMode('studio', state.doc?.id);

// Tool Rail -> Drawer Switching
document.querySelectorAll('.rail-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.rail-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.drawer-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`drawer-${btn.dataset.drawer}`).classList.add('active');
  };
});

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'state') {
      state.doc = msg.doc;
      if (msg.fontTags) dynamicFonts.innerHTML = msg.fontTags;
      svgHost.innerHTML = msg.svg;
      docTitleInput.value = state.doc.title;
      docDims.textContent = `${state.doc.canvas.width} × ${state.doc.canvas.height}`;
      artboardLabel.textContent = `${state.doc.title} — ${state.doc.canvas.width} × ${state.doc.canvas.height}`;
      document.getElementById('btn-undo').disabled = !msg.canUndo;
      document.getElementById('btn-redo').disabled = !msg.canRedo;
      renderLayers();
      renderSelection();
      renderInspector();
      if (msg.source === 'init') fitZoom();
      setStatus(`Synced (${state.doc.elements.length} layers)`);
    }
  };
  ws.onclose = () => setTimeout(connectWs, 1500);
}

docTitleInput.onchange = () => {
  if (!state.doc) return;
  api('/api/design', 'PUT', { ...state.doc, title: docTitleInput.value || 'Untitled Design' });
};

function setStatus(msg) {
  statusBar.textContent = msg;
}

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3200);
}

function buildAiRef(el) {
  const docId = state.doc?.id || 'design';
  return `[bauhaus:ref id="${el.id}" name="${el.name || el.id}" type="${el.type}" design="${docId}"]`;
}

async function copyAiRef(el, instruction = '') {
  if (!el) return;
  const ref = buildAiRef(el);
  const payload = instruction ? `${ref} ${instruction}` : ref;
  await navigator.clipboard?.writeText(payload).catch(() => { });
  showToast(`Copied AI ref for "${el.name || el.id}" — paste in chat to edit with Bauhaus!`);
  setStatus(`Copied ref: ${el.id}`);
}

function applyTransform(instant = false) {
  stage.classList.toggle('no-transition', instant);
  stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

// Figma-style Wheel Pan & Cursor-Anchored Ctrl/Pinch Zoom
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const rect = viewport.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const mx = e.clientX - cx;
    const my = e.clientY - cy;

    const factor = Math.exp(-e.deltaY * 0.0025);
    const nextZoom = Math.min(4, Math.max(0.1, state.zoom * factor));
    const ratio = nextZoom / state.zoom;

    state.panX = mx - (mx - state.panX) * ratio;
    state.panY = my - (my - state.panY) * ratio;
    state.zoom = nextZoom;
    applyTransform(true);
  } else {
    state.panX -= e.deltaX;
    state.panY -= e.deltaY;
    applyTransform(true);
  }
}, { passive: false });

// Space + Drag or Middle-Mouse Drag to Pan
let spaceDown = false;
let panDrag = null;

viewport.addEventListener('mousedown', (e) => {
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    e.preventDefault();
    e.stopPropagation();
    panDrag = { startX: e.clientX, startY: e.clientY, origX: state.panX, origY: state.panY };
    viewport.classList.add('panning-active');
  }
}, true);

window.addEventListener('mousemove', (e) => {
  if (!panDrag) return;
  state.panX = panDrag.origX + (e.clientX - panDrag.startX);
  state.panY = panDrag.origY + (e.clientY - panDrag.startY);
  applyTransform(true);
});

window.addEventListener('mouseup', () => {
  if (panDrag) {
    panDrag = null;
    viewport.classList.remove('panning-active');
  }
});

function fitZoom() {
  if (!state.doc) return;
  const vp = document.getElementById('viewport').getBoundingClientRect();
  if (vp.width <= 0 || vp.height <= 0) return;
  const scaleX = (vp.width - 110) / state.doc.canvas.width;
  const scaleY = (vp.height - 110) / state.doc.canvas.height;
  state.zoom = Math.max(0.1, Math.min(1.5, Math.min(scaleX, scaleY)));
  state.panX = 0;
  state.panY = 0;
  applyTransform();
}

// Presets (Dashboard & Page Drawer)
document.querySelectorAll('.preset-card').forEach((btn) => {
  btn.onclick = async () => {
    state.selectedId = null;
    await api('/api/design/create', 'POST', {
      title: btn.dataset.title,
      category: btn.dataset.cat,
      width: Number(btn.dataset.w),
      height: Number(btn.dataset.h),
      background: { type: 'solid', color: btn.dataset.bg },
    });
    setMode('studio');
  };
});

document.querySelectorAll('#drawer-page-presets .preset-item').forEach((btn) => {
  btn.onclick = () => {
    if (!state.doc) return;
    const updated = {
      ...state.doc,
      canvas: { ...state.doc.canvas, width: Number(btn.dataset.pw), height: Number(btn.dataset.ph) },
    };
    api('/api/design', 'PUT', updated).then(() => setTimeout(fitZoom, 40));
  };
});

document.querySelectorAll('.filter-pill').forEach((pill) => {
  pill.onclick = () => {
    document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    state.activeFilter = pill.dataset.cat;
    renderDashboardGallery();
  };
});

async function loadGallery() {
  try {
    const { items } = await api('/api/gallery');
    state.galleryItems = items;
    renderSidebarGallery();
    renderDashboardGallery();
  } catch (err) {
    setStatus(`Gallery error: ${err.message}`);
  }
}

async function loadProjects() {
  try {
    const { projects } = await api('/api/projects');
    state.savedProjects = projects;
    renderSidebarGallery();
    const list = document.getElementById('projects-list');
    const count = document.getElementById('projects-count');
    count.textContent = `${projects.length} saved project${projects.length === 1 ? '' : 's'}`;
    list.innerHTML = '';
    if (projects.length === 0) {
      list.innerHTML = '<div style="color:var(--muted);font-size:12px;">No agent-created projects in <code>bauhaus/projects/</code> yet. Ask Bauhaus in chat to create a new design!</div>';
      return;
    }
    for (const proj of projects) {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div>
          <div class="project-card-title">${proj.title}</div>
          <div class="project-card-meta">${proj.category} • ${proj.width}×${proj.height} • ${proj.elementsCount} layers</div>
        </div>
        <button class="icon-btn" data-del="1" title="Delete project">${icon('trash')}</button>
      `;
      card.onclick = async (e) => {
        if (e.target.closest('[data-del]')) {
          await api(`/api/projects?filePath=${encodeURIComponent(proj.filePath)}`, 'DELETE');
          loadProjects();
          showToast(`Deleted "${proj.title}"`);
          return;
        }
        state.selectedId = null;
        await api('/api/design/load', 'POST', { filePath: proj.filePath });
        setMode('studio');
      };
      list.appendChild(card);
    }
  } catch (err) {
    setStatus(`Projects error: ${err.message}`);
  }
}

function renderSidebarGallery() {
  if (!sidebarProjectsList) return;
  sidebarProjectsList.innerHTML = '';
  const all = [...(state.savedProjects || []), ...(state.galleryItems || [])];
  for (const item of all) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    const swatches = (item.palette || []).slice(0, 5).map((c) => `<span class="swatch-dot" style="background:${c}"></span>`).join('');
    card.innerHTML = `
      ${item.previewUrl ? `<img class="gallery-thumb" src="${item.previewUrl}" alt="${item.title}" />` : ''}
      <div class="gallery-info">
        <div class="gallery-title">${item.title}</div>
        <div class="gallery-meta"><span>${item.category}</span><span>${item.width}×${item.height}</span></div>
        ${swatches ? `<div class="gallery-swatches">${swatches}</div>` : ''}
      </div>
    `;
    card.onclick = async () => {
      state.selectedId = null;
      await api('/api/design/load', 'POST', { filePath: item.filePath });
      setMode('studio', item.id);
      setStatus(`Opened: ${item.title}`);
    };
    sidebarProjectsList.appendChild(card);
  }
}

function renderDashboardGallery() {
  dashGallery.innerHTML = '';
  const filtered = state.activeFilter === 'all'
    ? state.galleryItems
    : state.galleryItems.filter((i) => i.category === state.activeFilter);

  for (const item of filtered) {
    const card = document.createElement('div');
    card.className = 'dash-card';
    const swatches = (item.palette || []).slice(0, 5).map((c) => `<span class="swatch-dot" style="background:${c}"></span>`).join('');
    card.innerHTML = `
      ${item.previewUrl ? `<img class="dash-card-thumb" src="${item.previewUrl}" alt="${item.title}" />` : ''}
      <div class="dash-card-body">
        <div class="dash-card-top">
          <div class="dash-card-title">${item.title}</div>
          <span class="dash-card-cat">${item.category}</span>
        </div>
        <div class="dash-card-desc">${item.creativeDirection || 'Editable Bauhaus scene graph template.'}</div>
        <div class="dash-card-foot">
          <div class="gallery-swatches">${swatches}</div>
          <span class="doc-dims">${item.width}×${item.height}</span>
        </div>
      </div>
    `;
    card.onclick = async () => {
      state.selectedId = null;
      await api('/api/design/load', 'POST', { filePath: item.filePath });
      setMode('studio', item.id);
    };
    dashGallery.appendChild(card);
  }
}

function renderLayers() {
  layersList.innerHTML = '';
  const elements = [...(state.doc?.elements || [])].reverse();
  layerCount.textContent = `Layers (${elements.length})`;
  for (const el of elements) {
    const li = document.createElement('li');
    li.className = `layer-item${el.id === state.selectedId ? ' selected' : ''}`;
    li.innerHTML = `
      <span class="layer-name">${el.name || el.id}</span>
      <span class="layer-type">${el.type}</span>
      <button class="layer-btn" data-act="vis" title="Toggle visibility">${el.visible === false ? icon('eyeOff') : icon('eye')}</button>
      <button class="layer-btn" data-act="lock" title="Toggle lock">${el.locked ? icon('lock') : icon('unlock')}</button>
    `;
    li.onclick = (e) => {
      const btn = e.target?.closest('[data-act]');
      const act = btn?.dataset?.act;
      if (act === 'vis') return api(`/api/elements/${el.id}`, 'PATCH', { visible: el.visible === false });
      if (act === 'lock') return api(`/api/elements/${el.id}`, 'PATCH', { locked: !el.locked });
      state.selectedId = el.id;
      renderLayers();
      renderSelection();
      renderInspector();
    };
    layersList.appendChild(li);
  }
}

function getSelected() {
  return state.doc?.elements?.find((e) => e.id === state.selectedId) || null;
}

function renderSelection() {
  const el = getSelected();
  if (!el) {
    overlay.classList.add('hidden');
    contextBar.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  contextBar.classList.remove('hidden');
  overlay.style.left = `${el.x}px`;
  overlay.style.top = `${el.y}px`;
  overlay.style.width = `${el.width}px`;
  overlay.style.height = `${el.height}px`;
  overlay.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : '';
}

function toHexColor(val, fallback = '#000000') {
  return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val) ? val : fallback;
}

function renderInspector() {
  const el = getSelected();
  if (!el) {
    inspectorTitle.textContent = 'Page Properties';
    if (!state.doc) return;
    const bg = state.doc.canvas.background || { type: 'solid', color: '#ffffff' };
    const bgHex = toHexColor(bg.color, '#ffffff');
    inspectorBody.innerHTML = `
      <div class="prop-grid">
        <div class="prop-field"><label>Width</label><input id="page-w" type="number" value="${state.doc.canvas.width}" /></div>
        <div class="prop-field"><label>Height</label><input id="page-h" type="number" value="${state.doc.canvas.height}" /></div>
      </div>
      <div class="prop-field"><label>Background Color</label>
        <div class="color-row">
          <input id="page-bg-pick" type="color" value="${bgHex}" />
          <input id="page-bg-hex" value="${bg.color || '#ffffff'}" />
        </div>
      </div>
      <div class="prop-section">Quick Info</div>
      <p style="color:var(--muted);line-height:1.5;margin:0;">Click any element on the canvas to edit its properties, or double-click text to edit directly.</p>
    `;
    const updatePage = (patch) => api('/api/design', 'PUT', { ...state.doc, canvas: { ...state.doc.canvas, ...patch } });
    document.getElementById('page-w').onchange = (e) => updatePage({ width: Math.max(100, Number(e.target.value)) });
    document.getElementById('page-h').onchange = (e) => updatePage({ height: Math.max(100, Number(e.target.value)) });
    document.getElementById('page-bg-pick').onchange = (e) => updatePage({ background: { type: 'solid', color: e.target.value } });
    document.getElementById('page-bg-hex').onchange = (e) => updatePage({ background: { type: 'solid', color: e.target.value } });
    return;
  }

  inspectorTitle.textContent = 'Element Properties';
  const s = el.style || {};
  const fillStr = typeof s.fill === 'string' ? s.fill : '#000000';
  const cw = state.doc.canvas.width;
  const ch = state.doc.canvas.height;

  inspectorBody.innerHTML = `
    <div class="prop-field"><label>Layer Name</label><input id="prop-name" value="${el.name || el.id}" /></div>
    <div class="align-bar">
      <button id="al-left" title="Align Left">${icon('alignLeft')}</button>
      <button id="al-cx" title="Center Horizontally">${icon('alignCenterH')}</button>
      <button id="al-right" title="Align Right">${icon('alignRight')}</button>
      <button id="al-top" title="Align Top">${icon('alignTop')}</button>
      <button id="al-cy" title="Center Vertically">${icon('alignCenterV')}</button>
      <button id="al-bottom" title="Align Bottom">${icon('alignBottom')}</button>
    </div>
    <div class="prop-grid">
      <div class="prop-field"><label>X</label><input id="prop-x" type="number" value="${Math.round(el.x)}" /></div>
      <div class="prop-field"><label>Y</label><input id="prop-y" type="number" value="${Math.round(el.y)}" /></div>
      <div class="prop-field"><label>Width</label><input id="prop-w" type="number" value="${Math.round(el.width)}" /></div>
      <div class="prop-field"><label>Height</label><input id="prop-h" type="number" value="${Math.round(el.height)}" /></div>
      <div class="prop-field"><label>Rotation</label><input id="prop-rot" type="number" value="${Math.round(el.rotation || 0)}" /></div>
      <div class="prop-field"><label>Opacity</label><input id="prop-op" type="number" step="0.05" min="0" max="1" value="${el.opacity ?? 1}" /></div>
    </div>
    <div class="prop-section">Appearance</div>
    <div class="prop-grid">
      <div class="prop-field"><label>Fill</label>
        <div class="color-row">
          <input id="prop-fill-pick" type="color" value="${toHexColor(fillStr)}" />
          <input id="prop-fill" value="${fillStr}" />
        </div>
      </div>
      <div class="prop-field"><label>Stroke</label>
        <div class="color-row">
          <input id="prop-stroke-pick" type="color" value="${toHexColor(s.stroke, '#ffffff')}" />
          <input id="prop-stroke" value="${s.stroke || ''}" />
        </div>
      </div>
    </div>
    ${el.type === 'text' ? `
      <div class="prop-section">Typography</div>
      <div class="prop-field"><label>Text Content</label><textarea id="prop-text" rows="3">${el.content?.text || ''}</textarea></div>
      <div class="prop-field"><label>Font Family</label>
        <select id="prop-font">
          ${[...new Set([s.fontFamily || 'Inter', ...FONT_PRESETS])].map((f) => `<option value="${f}" ${s.fontFamily === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="prop-grid">
        <div class="prop-field"><label>Size (px)</label><input id="prop-fsize" type="number" value="${s.fontSize || 24}" /></div>
        <div class="prop-field"><label>Weight</label><input id="prop-fweight" value="${s.fontWeight || 400}" /></div>
        <div class="prop-field"><label>Text Color</label>
          <div class="color-row">
            <input id="prop-color-pick" type="color" value="${toHexColor(s.color, '#111111')}" />
            <input id="prop-color" value="${s.color || '#111111'}" />
          </div>
        </div>
        <div class="prop-field"><label>Align</label>
          <select id="prop-align">
            ${['left', 'center', 'right'].map((a) => `<option value="${a}" ${s.textAlign === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
      </div>
    ` : ''}
  `;

  const bind = (id, fn) => {
    const node = document.getElementById(id);
    if (node) node.onchange = () => fn(node.value);
  };
  bind('prop-name', (v) => api(`/api/elements/${el.id}`, 'PATCH', { name: v }));
  bind('prop-x', (v) => api(`/api/elements/${el.id}`, 'PATCH', { x: Number(v) }));
  bind('prop-y', (v) => api(`/api/elements/${el.id}`, 'PATCH', { y: Number(v) }));
  bind('prop-w', (v) => api(`/api/elements/${el.id}`, 'PATCH', { width: Math.max(1, Number(v)) }));
  bind('prop-h', (v) => api(`/api/elements/${el.id}`, 'PATCH', { height: Math.max(1, Number(v)) }));
  bind('prop-rot', (v) => api(`/api/elements/${el.id}`, 'PATCH', { rotation: Number(v) }));
  bind('prop-op', (v) => api(`/api/elements/${el.id}`, 'PATCH', { opacity: Math.min(1, Math.max(0, Number(v))) }));
  bind('prop-fill', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { fill: v } }));
  bind('prop-fill-pick', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { fill: v } }));
  bind('prop-stroke', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { stroke: v } }));
  bind('prop-stroke-pick', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { stroke: v } }));

  document.getElementById('al-left').onclick = () => api(`/api/elements/${el.id}`, 'PATCH', { x: 0 });
  document.getElementById('al-cx').onclick = () => api(`/api/elements/${el.id}`, 'PATCH', { x: Math.round((cw - el.width) / 2) });
  document.getElementById('al-right').onclick = () => api(`/api/elements/${el.id}`, 'PATCH', { x: Math.round(cw - el.width) });
  document.getElementById('al-top').onclick = () => api(`/api/elements/${el.id}`, 'PATCH', { y: 0 });
  document.getElementById('al-cy').onclick = () => api(`/api/elements/${el.id}`, 'PATCH', { y: Math.round((ch - el.height) / 2) });
  document.getElementById('al-bottom').onclick = () => api(`/api/elements/${el.id}`, 'PATCH', { y: Math.round(ch - el.height) });

  if (el.type === 'text') {
    bind('prop-text', (v) => api(`/api/elements/${el.id}`, 'PATCH', { content: { text: v } }));
    bind('prop-font', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { fontFamily: v } }));
    bind('prop-fsize', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { fontSize: Number(v) } }));
    bind('prop-fweight', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { fontWeight: Number(v) || v } }));
    bind('prop-color', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { color: v } }));
    bind('prop-color-pick', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { color: v } }));
    bind('prop-align', (v) => api(`/api/elements/${el.id}`, 'PATCH', { style: { textAlign: v } }));
  }
}

// Upload & Decode
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
document.getElementById('btn-browse-file').onclick = () => fileInput.click();
dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
dropZone.ondragleave = () => dropZone.classList.remove('dragover');
dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]); };
fileInput.onchange = () => { if (fileInput.files?.[0]) handleFileUpload(fileInput.files[0]); };

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    setStatus(`Decoding ${file.name}...`);
    const res = await api('/api/upload', 'POST', { filename: file.name, dataUrl: reader.result, mode: 'decode' });
    if (res.loadedDesign) { setStatus(`Loaded: ${res.title}`); return; }
    state.lastUpload = { filename: file.name, dataUrl: reader.result, res };
    document.getElementById('decode-result').classList.remove('hidden');
    document.getElementById('decode-preview').src = res.url;
    document.getElementById('decode-summary').textContent = res.decoded.summary;
    document.getElementById('decode-palette').innerHTML = (res.decoded.palette || [])
      .map((hex) => `<span class="palette-chip" title="Copy ${hex}" onclick="navigator.clipboard?.writeText('${hex}')"><span class="swatch-dot" style="background:${hex}"></span>${hex}</span>`)
      .join('');
    document.getElementById('decode-brief').value = `Bauhaus Design Decode — ${file.name}\nFile Path: ${res.filePath}\nDimensions: ${res.decoded.width}x${res.decoded.height} (${res.decoded.aspectRatio})\nPalette: ${(res.decoded.palette || []).join(', ')}`;
    setStatus(`Decoded ${file.name}`);
  };
  reader.readAsDataURL(file);
}

document.getElementById('btn-insert-upload').onclick = async () => {
  if (!state.lastUpload) return;
  await api('/api/upload', 'POST', { filename: state.lastUpload.filename, dataUrl: state.lastUpload.dataUrl, mode: 'insert' });
  setStatus(`Inserted ${state.lastUpload.filename}`);
};

document.getElementById('btn-copy-brief').onclick = () => {
  navigator.clipboard?.writeText(document.getElementById('decode-brief').value);
  setStatus('AI Brief copied');
};

// Canvas interaction
svgHost.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || spaceDown) return;
  const target = e.target.closest('[data-element-id]');
  if (!target) {
    state.selectedId = null;
    renderLayers();
    renderSelection();
    renderInspector();
    return;
  }
  const id = target.getAttribute('data-element-id');
  state.selectedId = id;
  renderLayers();
  renderSelection();
  renderInspector();
  const el = getSelected();
  if (!el || el.locked) return;
  state.drag = { mode: 'move', id, moved: false, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation || 0 } };
});

svgHost.addEventListener('dblclick', (e) => {
  const target = e.target.closest('[data-element-id]');
  if (!target) return;
  const id = target.getAttribute('data-element-id');
  const el = state.doc?.elements?.find((x) => x.id === id);
  if (!el || el.type !== 'text' || el.locked) return;

  const existing = document.getElementById('inline-text-editor');
  if (existing) existing.remove();

  // Hide underlying SVG element so there is zero double-text ghosting
  target.style.visibility = 'hidden';

  const s = el.style || {};
  const ta = document.createElement('textarea');
  ta.id = 'inline-text-editor';
  ta.className = 'inline-text-editor';
  ta.value = el.content?.text || '';
  ta.style.left = `${el.x}px`;
  ta.style.top = `${el.y}px`;
  ta.style.width = `${Math.max(40, el.width)}px`;
  ta.style.height = `${Math.max(30, el.height)}px`;
  ta.style.fontFamily = s.fontFamily || 'Inter';
  ta.style.fontSize = `${s.fontSize || 24}px`;
  ta.style.fontWeight = `${s.fontWeight || 400}`;
  ta.style.fontStyle = s.fontStyle || 'normal';
  ta.style.lineHeight = `${s.lineHeight || 1.25}`;
  ta.style.letterSpacing = `${s.letterSpacing || 0}px`;
  ta.style.textAlign = s.textAlign || 'left';
  ta.style.textTransform = s.textTransform || 'none';
  ta.style.color = s.color || '#111111';
  if (el.rotation) ta.style.transform = `rotate(${el.rotation}deg)`;

  const artboard = document.getElementById('artboard-wrap');
  artboard.appendChild(ta);
  ta.focus();
  ta.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const val = ta.value;
    ta.remove();
    target.style.visibility = '';
    if (commit && val !== (el.content?.text || '')) {
      api(`/api/elements/${id}`, 'PATCH', { content: { text: val } });
    }
  };

  ta.addEventListener('blur', () => finish(true));
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      finish(false);
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      ev.preventDefault();
      finish(true);
    }
  });
});

overlay.addEventListener('mousedown', (e) => {
  const handle = e.target?.dataset?.handle;
  const el = getSelected();
  if (!handle || !el || el.locked) return;
  e.stopPropagation();
  state.drag = { mode: handle === 'rot' ? 'rotate' : 'resize', handle, id: el.id, moved: false, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation || 0 } };
});

window.addEventListener('mousemove', (e) => {
  if (!state.drag) return;
  const el = getSelected();
  if (!el) return;
  if (Math.abs(e.clientX - state.drag.startX) > 2 || Math.abs(e.clientY - state.drag.startY) > 2) {
    state.drag.moved = true;
  }
  if (!state.drag.moved) return;
  const dx = (e.clientX - state.drag.startX) / state.zoom;
  const dy = (e.clientY - state.drag.startY) / state.zoom;
  const o = state.drag.orig;
  if (state.drag.mode === 'move') {
    el.x = Math.round(o.x + dx);
    el.y = Math.round(o.y + dy);
    const domNode = svgHost.querySelector(`[data-element-id="${el.id}"]`);
    if (domNode) domNode.style.transform = `translate(${el.x - o.x}px, ${el.y - o.y}px)`;
  } else if (state.drag.mode === 'resize') {
    const h = state.drag.handle;
    if (h.includes('e')) el.width = Math.max(10, Math.round(o.width + dx));
    if (h.includes('s')) el.height = Math.max(10, Math.round(o.height + dy));
    if (h.includes('w')) { el.x = Math.round(o.x + dx); el.width = Math.max(10, Math.round(o.width - dx)); }
    if (h.includes('n')) { el.y = Math.round(o.y + dy); el.height = Math.max(10, Math.round(o.height - dy)); }
  } else if (state.drag.mode === 'rotate') { el.rotation = Math.round(o.rotation + dx); }
  renderSelection();
});

window.addEventListener('mouseup', () => {
  if (!state.drag) return;
  const el = getSelected();
  const { id, moved } = state.drag;
  state.drag = null;
  if (el && moved) api(`/api/elements/${id}`, 'PATCH', { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation });
});

function duplicateSelected() {
  const el = getSelected();
  if (!el) return;
  const copy = structuredClone(el);
  delete copy.id;
  copy.name = `${el.name || el.type} Copy`;
  copy.x += 24;
  copy.y += 24;
  api('/api/elements', 'POST', copy);
}

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    spaceDown = true;
    viewport.classList.add('panning');
  } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    state.zoom = Math.min(4, state.zoom * 1.18);
    applyTransform(false);
  } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault();
    state.zoom = Math.max(0.1, state.zoom / 1.18);
    applyTransform(false);
  } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault();
    fitZoom();
  } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
    e.preventDefault();
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyTransform(false);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    api(e.shiftKey ? '/api/design/redo' : '/api/design/undo', 'POST');
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
    const id = state.selectedId;
    state.selectedId = null;
    api(`/api/elements/${id}`, 'DELETE');
  } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.selectedId) {
    e.preventDefault();
    const el = getSelected();
    if (!el || el.locked) return;
    const step = e.shiftKey ? 10 : 1;
    const patch = {};
    if (e.key === 'ArrowLeft') patch.x = el.x - step;
    if (e.key === 'ArrowRight') patch.x = el.x + step;
    if (e.key === 'ArrowUp') patch.y = el.y - step;
    if (e.key === 'ArrowDown') patch.y = el.y + step;
    api(`/api/elements/${el.id}`, 'PATCH', patch);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceDown = false;
    viewport.classList.remove('panning');
  }
});

// Add element handlers
const addText = (name, text, size, weight, font = 'Space Grotesk', color = '#111111') =>
  api('/api/elements', 'POST', { type: 'text', name, x: 100, y: 120, width: 460, height: 90, content: { text }, style: { fontFamily: font, fontSize: size, fontWeight: weight, color } });

document.getElementById('btn-add-text').onclick = () => addText('Text Box', 'Edit text', 32, 600, 'Inter');
document.getElementById('btn-text-display').onclick = () => addText('Display Heading', 'Display Heading', 72, 700, 'Syne');
document.getElementById('btn-text-sub').onclick = () => addText('Subheading', 'Section Subheading', 36, 600, 'Space Grotesk');
document.getElementById('btn-text-body').onclick = () => addText('Body Copy', 'Add concise supporting copy here.', 22, 400, 'Inter');
document.getElementById('btn-text-mono').onclick = () => addText('Mono Label', '01 // LABEL', 16, 700, 'JetBrains Mono', '#3b82f6');

document.getElementById('btn-add-rect').onclick = () => api('/api/elements', 'POST', { type: 'rect', name: 'Rectangle', x: 120, y: 120, width: 240, height: 160, style: { fill: '#2563eb', borderRadius: 10 } });
document.getElementById('btn-add-ellipse').onclick = () => api('/api/elements', 'POST', { type: 'ellipse', name: 'Circle', x: 160, y: 160, width: 180, height: 180, style: { fill: '#e03c31' } });
document.getElementById('btn-add-line').onclick = () => api('/api/elements', 'POST', { type: 'line', name: 'Line', x: 100, y: 250, width: 300, height: 4, content: { x2: 400, y2: 250 }, style: { stroke: '#111111', strokeWidth: 4 } });
document.getElementById('btn-add-polygon').onclick = () => api('/api/elements', 'POST', { type: 'polygon', name: 'Hexagon', x: 200, y: 200, width: 180, height: 180, content: { sides: 6 }, style: { fill: '#f59e0b' } });
document.getElementById('btn-add-card').onclick = () => api('/api/elements', 'POST', { type: 'rect', name: 'Card', x: 100, y: 120, width: 380, height: 220, style: { fill: '#ffffff', stroke: '#e2e8f0', strokeWidth: 2, borderRadius: 14 } });
document.getElementById('btn-add-pill').onclick = () => api('/api/elements', 'POST', { type: 'rect', name: 'Pill Badge', x: 100, y: 100, width: 220, height: 44, style: { fill: '#3b82f6', borderRadius: 22 } });

document.getElementById('btn-undo').onclick = () => api('/api/design/undo', 'POST');
document.getElementById('btn-redo').onclick = () => api('/api/design/redo', 'POST');
document.getElementById('btn-zoom-in').onclick = () => { state.zoom = Math.min(4, state.zoom * 1.2); applyTransform(false); };
document.getElementById('btn-zoom-out').onclick = () => { state.zoom = Math.max(0.1, state.zoom / 1.2); applyTransform(false); };
document.getElementById('btn-zoom-fit').onclick = fitZoom;
document.getElementById('btn-refresh-gallery').onclick = loadGallery;

const deleteSelected = () => {
  if (!state.selectedId) return;
  const id = state.selectedId;
  state.selectedId = null;
  api(`/api/elements/${id}`, 'DELETE');
};
const layerMove = (dir) => {
  if (!state.selectedId || !state.doc) return;
  const ids = state.doc.elements.map((e) => e.id);
  const idx = ids.indexOf(state.selectedId);
  if (dir > 0 && idx !== -1 && idx < ids.length - 1) { [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]; api('/api/layers/reorder', 'POST', { orderedIds: ids }); }
  if (dir < 0 && idx > 0) { [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]]; api('/api/layers/reorder', 'POST', { orderedIds: ids }); }
};

document.getElementById('btn-delete').onclick = deleteSelected;
document.getElementById('ctx-del').onclick = deleteSelected;
document.getElementById('ctx-ask-ai').onclick = () => copyAiRef(getSelected());
document.getElementById('btn-duplicate').onclick = duplicateSelected;
document.getElementById('ctx-dup').onclick = duplicateSelected;
document.getElementById('btn-layer-up').onclick = () => layerMove(1);
document.getElementById('ctx-up').onclick = () => layerMove(1);
document.getElementById('btn-layer-down').onclick = () => layerMove(-1);
document.getElementById('ctx-down').onclick = () => layerMove(-1);

// Right-Click Context Menu on Canvas & Layers
function openContextMenu(x, y, elementId) {
  if (elementId) {
    state.selectedId = elementId;
    renderLayers();
    renderSelection();
    renderInspector();
  }
  if (!getSelected()) return;
  contextMenu.style.left = `${Math.min(x, window.innerWidth - 230)}px`;
  contextMenu.style.top = `${Math.min(y, window.innerHeight - 260)}px`;
  contextMenu.classList.remove('hidden');
}

svgHost.addEventListener('contextmenu', (e) => {
  const target = e.target.closest('[data-element-id]');
  if (!target) return;
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, target.getAttribute('data-element-id'));
});

layersList.addEventListener('contextmenu', (e) => {
  const li = e.target.closest('.layer-item');
  if (!li) return;
  e.preventDefault();
  const idx = [...layersList.children].indexOf(li);
  const elements = [...(state.doc?.elements || [])].reverse();
  const el = elements[idx];
  if (el) openContextMenu(e.clientX, e.clientY, el.id);
});

window.addEventListener('click', (e) => {
  if (!e.target.closest('#context-menu')) contextMenu.classList.add('hidden');
});

document.getElementById('rc-ask-ai').onclick = () => {
  contextMenu.classList.add('hidden');
  copyAiRef(getSelected());
};

document.getElementById('rc-ask-prompt').onclick = () => {
  contextMenu.classList.add('hidden');
  const el = getSelected();
  if (!el) return;
  document.getElementById('ai-modal-ref').textContent = buildAiRef(el);
  document.getElementById('ai-modal-input').value = '';
  document.getElementById('ai-prompt-modal').classList.remove('hidden');
  document.getElementById('ai-modal-input').focus();
};

document.getElementById('ai-modal-close').onclick = () => {
  document.getElementById('ai-prompt-modal').classList.add('hidden');
};

document.getElementById('ai-modal-copy').onclick = () => {
  const el = getSelected();
  const instr = document.getElementById('ai-modal-input').value.trim();
  copyAiRef(el, instr);
  document.getElementById('ai-prompt-modal').classList.add('hidden');
};

document.getElementById('rc-dup').onclick = () => { contextMenu.classList.add('hidden'); duplicateSelected(); };
document.getElementById('rc-up').onclick = () => { contextMenu.classList.add('hidden'); layerMove(1); };
document.getElementById('rc-down').onclick = () => { contextMenu.classList.add('hidden'); layerMove(-1); };
document.getElementById('rc-lock').onclick = () => {
  contextMenu.classList.add('hidden');
  const el = getSelected();
  if (el) api(`/api/elements/${el.id}`, 'PATCH', { locked: !el.locked });
};
document.getElementById('rc-del').onclick = () => { contextMenu.classList.add('hidden'); deleteSelected(); };

document.getElementById('btn-save').onclick = async () => {
  const res = await api('/api/design/save', 'POST', {});
  setStatus(`Saved: ${res.saved || 'in memory'}`);
};

document.getElementById('btn-export').onclick = async () => {
  const fmt = document.getElementById('export-format').value;
  const ext = fmt === 'print-pdf' ? 'print.pdf' : fmt;
  const filename = `${state.doc?.id || 'design'}.${ext}`;
  setStatus(`Exporting ${fmt.toUpperCase()}...`);
  try {
    const res = await fetch(`/api/export/download?format=${encodeURIComponent(fmt)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${filename} (${blob.size} bytes)`);
  } catch (err) {
    setStatus(`Export error: ${err.message}`);
  }
};

connectWs();
loadGallery();
loadProjects();
syncRouteFromLocation();
