const BASE = 'viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  undo: `<svg ${BASE}><path d="M3.5 6.5H10a3.5 3.5 0 1 1 0 7H7.5"/><path d="M5.5 4L3 6.5 5.5 9"/></svg>`,
  redo: `<svg ${BASE}><path d="M12.5 6.5H6a3.5 3.5 0 1 0 0 7h2.5"/><path d="M10.5 4L13 6.5 10.5 9"/></svg>`,
  save: `<svg ${BASE}><path d="M3 2.5h8.5L13.5 4.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z"/><path d="M5.5 2.5v3.5h5V2.5"/><rect x="5" y="9" width="6" height="4.5"/></svg>`,
  export: `<svg ${BASE}><path d="M8 2.5v7"/><path d="M5.5 7L8 9.5 10.5 7"/><path d="M3 11.5v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-1.5"/></svg>`,
  upload: `<svg ${BASE}><path d="M8 10V3"/><path d="M5.5 5.5L8 3l2.5 2.5"/><path d="M3 11.5v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-1.5"/></svg>`,
  text: `<svg ${BASE}><path d="M3.5 4V3h9v1"/><path d="M8 3v10"/><path d="M6 13h4"/></svg>`,
  rect: `<svg ${BASE}><rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/></svg>`,
  circle: `<svg ${BASE}><circle cx="8" cy="8" r="5.5"/></svg>`,
  line: `<svg ${BASE}><path d="M3 13L13 3"/></svg>`,
  polygon: `<svg ${BASE}><polygon points="8,2 13.2,5 13.2,11 8,14 2.8,11 2.8,5"/></svg>`,
  eye: `<svg ${BASE}><path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4Z"/><circle cx="8" cy="8" r="1.75"/></svg>`,
  eyeOff: `<svg ${BASE}><path d="M2 2l12 12"/><path d="M6.5 4.2A6.5 6.5 0 0 1 14.5 8s-.9 1.6-2.5 2.7"/><path d="M4.2 5.2C2.5 6.3 1.5 8 1.5 8s2.3 4 6.5 4c1 0 1.9-.2 2.7-.6"/></svg>`,
  lock: `<svg ${BASE}><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`,
  unlock: `<svg ${BASE}><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/></svg>`,
  arrowUp: `<svg ${BASE}><path d="M8 12.5v-9"/><path d="M4.5 7L8 3.5 11.5 7"/></svg>`,
  arrowDown: `<svg ${BASE}><path d="M8 3.5v9"/><path d="M4.5 9L8 12.5 11.5 9"/></svg>`,
  trash: `<svg ${BASE}><path d="M3 4.5h10"/><path d="M6 4.5V3h4v1.5"/><path d="M4.5 4.5l.5 8.5h6l.5-8.5"/></svg>`,
  refresh: `<svg ${BASE}><path d="M13 8a5 5 0 1 1-1.4-3.5"/><path d="M13 2.5v2.5h-2.5"/></svg>`,
  zoomIn: `<svg ${BASE}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13.5 13.5"/><path d="M7 5v4M5 7h4"/></svg>`,
  zoomOut: `<svg ${BASE}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13.5 13.5"/><path d="M5 7h4"/></svg>`,
  fit: `<svg ${BASE}><path d="M2.5 5.5V3a.5.5 0 0 1 .5-.5h2.5M10.5 2.5H13a.5.5 0 0 1 .5.5v2.5M13.5 10.5V13a.5.5 0 0 1-.5.5h-2.5M5.5 13.5H3a.5.5 0 0 1-.5-.5v-2.5"/></svg>`,
  alignLeft: `<svg ${BASE}><path d="M2.5 2.5v11"/><rect x="5" y="4.5" width="7.5" height="2.5" rx=".5"/><rect x="5" y="9" width="5" height="2.5" rx=".5"/></svg>`,
  alignCenterH: `<svg ${BASE}><path d="M8 2.5v11"/><rect x="4" y="4.5" width="8" height="2.5" rx=".5"/><rect x="5.5" y="9" width="5" height="2.5" rx=".5"/></svg>`,
  alignRight: `<svg ${BASE}><path d="M13.5 2.5v11"/><rect x="3.5" y="4.5" width="7.5" height="2.5" rx=".5"/><rect x="6" y="9" width="5" height="2.5" rx=".5"/></svg>`,
  alignTop: `<svg ${BASE}><path d="M2.5 2.5h11"/><rect x="4.5" y="5" width="2.5" height="7.5" rx=".5"/><rect x="9" y="5" width="2.5" height="5" rx=".5"/></svg>`,
  alignCenterV: `<svg ${BASE}><path d="M2.5 8h11"/><rect x="4.5" y="4" width="2.5" height="8" rx=".5"/><rect x="9" y="5.5" width="2.5" height="5" rx=".5"/></svg>`,
  alignBottom: `<svg ${BASE}><path d="M2.5 13.5h11"/><rect x="4.5" y="3.5" width="2.5" height="7.5" rx=".5"/><rect x="9" y="6" width="2.5" height="5" rx=".5"/></svg>`,
  arrowRight: `<svg ${BASE}><path d="M3 8h10"/><path d="M9.5 4.5L13 8l-3.5 3.5"/></svg>`,
  templates: `<svg ${BASE}><rect x="2.5" y="2.5" width="4.5" height="6" rx="1"/><rect x="9" y="2.5" width="4.5" height="4" rx="1"/><rect x="2.5" y="10.5" width="4.5" height="3" rx="1"/><rect x="9" y="8.5" width="4.5" height="5" rx="1"/></svg>`,
  elements: `<svg ${BASE}><circle cx="5.5" cy="5.5" r="3"/><rect x="8.5" y="8.5" width="5" height="5" rx="1"/><polygon points="11,2.5 13.5,6.5 8.5,6.5"/></svg>`,
  layers: `<svg ${BASE}><polygon points="8,2 14,5.5 8,9 2,5.5"/><path d="M2 8.5L8 12l6-3.5"/><path d="M2 11.5L8 15l6-3.5"/></svg>`,
  canvas: `<svg ${BASE}><rect x="3" y="3" width="10" height="10" rx="1.5"/><path d="M3 6.5h10M6.5 3v10"/></svg>`,
  duplicate: `<svg ${BASE}><rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M3.5 10.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v.5"/></svg>`,
  sparkles: `<svg ${BASE}><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4L8 2Z"/><path d="M13 11l.5 1.5L15 13l-1.5.5L13 15l-.5-1.5L11 13l1.5-.5L13 11Z"/></svg>`,
  plus: `<svg ${BASE}><path d="M8 3v10M3 8h10"/></svg>`,
};

export function icon(name, cls = 'ui-icon') {
  const svg = ICONS[name] || '';
  return svg ? `<span class="${cls}" aria-hidden="true">${svg}</span>` : '';
}
