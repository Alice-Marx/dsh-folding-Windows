'use strict';

const PACKAGE_NAME = '@ljwei-stak/dsh-folding-windows';
const STORAGE_KEY = 'dsh-folding-windows:collapsed:v1';
const RUNTIME_KEY = '__dshFoldingWindowsRuntime__';

const NAV_SELECTOR = 'nav[aria-label="全局面板"],nav[aria-label="Global panels"]';
const NEW_SESSION_LABELS = ['新建会话', 'New session'];

const CONTROL_ATTR = 'data-dsh-folding-control';
const ROLE_ATTR = 'data-dsh-folding-role';
const EMPTY_ATTR = 'data-dsh-folding-empty';
const COLUMN_COLLAPSED_ATTR = 'data-dsh-folding-column-collapsed';
const HIDDEN_ATTR = 'data-dsh-folding-hidden';
const STYLE_ATTR = 'data-dsh-folding-style';

const CSS_TEXT = `
button[data-dsh-folding-control] {
  --dsh-folding-fg: rgba(0, 0, 0, 0.65);
  --dsh-folding-hover-bg: rgba(0, 0, 0, 0.06);
  --dsh-folding-focus: #2563eb;

  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  height: 36px;
  margin: 0 0 4px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-md, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, var(--dsh-folding-fg));
  font: inherit;
  font-size: 13px;
  line-height: 1;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

button[data-dsh-folding-control] > [data-dsh-folding-role="label"] {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

button[data-dsh-folding-control] > [data-dsh-folding-role="count"] {
  flex: 0 0 auto;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

button[data-dsh-folding-control] > [data-dsh-folding-role="arrow"] {
  flex: 0 0 auto;
  width: 1em;
  text-align: center;
}

button[data-dsh-folding-control]:hover {
  background-color: var(--dsw-alias-interactive-bg-hover, var(--dsh-folding-hover-bg));
}

button[data-dsh-folding-control]:focus-visible {
  outline: 2px solid var(--dsh-folding-focus);
  outline-offset: 2px;
}

@media (prefers-color-scheme: dark) {
  button[data-dsh-folding-control] {
    --dsh-folding-fg: rgba(255, 255, 255, 0.7);
    --dsh-folding-hover-bg: rgba(255, 255, 255, 0.08);
    --dsh-folding-focus: #93c5fd;
  }
}

@media (prefers-reduced-motion: reduce) {
  button[data-dsh-folding-control] {
    transition: none;
  }
}

nav[aria-label][data-dsh-folding-hidden="true"] {
  display: none !important;
}

button[data-dsh-folding-control][data-dsh-folding-empty="true"],
button[data-dsh-folding-control][data-dsh-folding-column-collapsed="true"] {
  display: none !important;
}
`;

function isElement(node) {
  return !!node && node.nodeType === 1;
}

function isNewSessionButton(element) {
  if (!isElement(element) || element.tagName !== 'BUTTON') return false;
  const label = element.getAttribute('aria-label');
  return label === NEW_SESSION_LABELS[0] || label === NEW_SESSION_LABELS[1];
}

function isValidSidebarNav(nav) {
  if (!isElement(nav) || nav.tagName !== 'NAV') return false;

  const navLabel = nav.getAttribute('aria-label');
  if (navLabel !== '全局面板' && navLabel !== 'Global panels') return false;

  const sidebarRoot = nav.parentElement;
  if (!sidebarRoot) return false;

  let hasNewSessionButton = false;
  for (const child of Array.from(sidebarRoot.children)) {
    if (isNewSessionButton(child)) {
      hasNewSessionButton = true;
      break;
    }
  }
  if (!hasNewSessionButton) return false;

  const sidebarColumn = sidebarRoot.parentElement;
  const frame = sidebarColumn ? sidebarColumn.parentElement : null;
  if (!sidebarColumn || !frame) return false;
  if (frame.tagName !== 'DIV' || sidebarColumn.tagName !== 'DIV') return false;
  if (frame.firstElementChild !== sidebarColumn) return false;

  return true;
}

function getNavItemCount(nav) {
  let count = 0;
  for (const child of Array.from(nav.children)) {
    if (child.tagName === 'BUTTON' && child.hasAttribute('aria-label')) count += 1;
  }
  return count;
}

function isSidebarColumnCollapsed(nav) {
  const sidebarColumn = nav.parentElement ? nav.parentElement.parentElement : null;
  const frame = sidebarColumn ? sidebarColumn.parentElement : null;
  return !!frame && frame.getAttribute('data-sidebar-collapsed') === 'true';
}

function setAttributeIfChanged(element, name, value) {
  if (element.getAttribute(name) === value) return;
  element.setAttribute(name, value);
}

function setTextIfChanged(element, text) {
  if (element.textContent === text) return;
  element.textContent = text;
}

function readCollapsed(win) {
  try {
    return win.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch (err) {
    return true;
  }
}

exports.apply = function apply(ctx) {
  if (!ctx || typeof ctx.effect !== 'function') {
    throw new TypeError(PACKAGE_NAME + ': ctx.effect is required');
  }

  const dispose = ctx.effect(function installEffect() {
    return exports.install(document, window);
  }, 'folding-windows: sidebar');

  if (typeof ctx.inject === 'function') {
    ctx.inject(['workspaces'], function (owner) {
      owner.effect(function () {
        return exports.installProjectPinning(document, window, owner.get('workspaces'));
      }, 'folding-windows: project pinning');
    });
  }
  return dispose;
};

exports.installProjectPinning = installProjectPinning;

exports.install = function install(doc, win) {
  if (!doc || !win) {
    throw new TypeError(PACKAGE_NAME + ': install(document, window) requires both arguments');
  }

  const previous = win[RUNTIME_KEY];
  if (previous && typeof previous.dispose === 'function') {
    previous.dispose();
  }
  if (win[RUNTIME_KEY]) {
    delete win[RUNTIME_KEY];
  }

  const instances = new Map();
  let disposed = false;
  let scheduled = false;
  let collapsed = readCollapsed(win);
  let navIdSequence = 0;

  const style = doc.createElement('style');
  style.setAttribute('type', 'text/css');
  style.setAttribute(STYLE_ATTR, 'true');
  style.textContent = CSS_TEXT;

  Array.from(doc.querySelectorAll('style[' + STYLE_ATTR + ']')).forEach(function removeOwnStyle(node) {
    if (node !== style && node.parentNode) node.parentNode.removeChild(node);
  });
  (doc.head || doc.documentElement).appendChild(style);

  const disposeWorkspaces = installWorkspaceFolding(doc, win);

  function queueScan() {
    if (disposed || scheduled) return;
    scheduled = true;
    Promise.resolve().then(function runScan() {
      scheduled = false;
      if (!disposed) scan();
    });
  }

  function onMutation(mutations) {
    if (disposed) return;

    for (const mutation of mutations) {
      const target = mutation.target;
      const element = isElement(target) ? target : target && target.parentElement;
      if (!element) continue;
      if (element === style || element.contains(style)) continue;
      if (typeof element.closest === 'function' && element.closest('[' + CONTROL_ATTR + ']')) continue;
      queueScan();
      return;
    }
  }

  function ensureNavId(nav, record) {
    if (record.hadId === undefined) {
      record.hadId = nav.hasAttribute('id');
      record.oldId = nav.getAttribute('id');
    }

    const currentId = nav.getAttribute('id');
    if (currentId) return currentId;

    if (!record.generatedId) {
      navIdSequence += 1;
      record.generatedId = 'dsh-folding-windows-nav-' + navIdSequence;
    }

    if (nav.getAttribute('id') !== record.generatedId) {
      nav.setAttribute('id', record.generatedId);
    }
    return record.generatedId;
  }

  function applyNavVisibility(nav, record, count) {
    if (record.hadHidden === undefined) {
      record.hadHidden = nav.hasAttribute(HIDDEN_ATTR);
      record.oldHidden = nav.getAttribute(HIDDEN_ATTR);
    }

    const shouldHide = collapsed && count > 0;
    const current = nav.getAttribute(HIDDEN_ATTR);

    if (shouldHide) {
      if (current !== 'true') nav.setAttribute(HIDDEN_ATTR, 'true');
      return;
    }

    if (current !== null) nav.removeAttribute(HIDDEN_ATTR);
  }

  function updateRecord(record) {
    const nav = record.nav;
    const control = record.control;

    record.english = nav.getAttribute('aria-label') === 'Global panels';
    record.count = getNavItemCount(nav);

    const expanded = !collapsed;
    const labelText = record.english ? 'Tools' : '功能区';
    const arrowText = expanded ? '▾' : '▸';
    const titleText = expanded
      ? (record.english ? 'Collapse tools area' : '收起功能区')
      : (record.english ? 'Expand tools area' : '展开功能区');

    setTextIfChanged(record.label, labelText);
    setTextIfChanged(record.countElement, String(record.count));
    setTextIfChanged(record.arrow, arrowText);

    setAttributeIfChanged(control, 'aria-expanded', expanded ? 'true' : 'false');
    setAttributeIfChanged(control, 'aria-controls', ensureNavId(nav, record));
    setAttributeIfChanged(control, 'title', titleText);
    setAttributeIfChanged(control, EMPTY_ATTR, record.count > 0 ? 'false' : 'true');

    record.columnCollapsed = isSidebarColumnCollapsed(nav);
    setAttributeIfChanged(control, COLUMN_COLLAPSED_ATTR, record.columnCollapsed ? 'true' : 'false');

    applyNavVisibility(nav, record, record.count);
  }

  function createRecord(nav) {
    const control = doc.createElement('button');
    control.setAttribute('type', 'button');
    control.setAttribute(CONTROL_ATTR, 'true');
    control.setAttribute('data-dsh-folding-section', 'tools');
    control.setAttribute(EMPTY_ATTR, 'false');
    control.setAttribute(COLUMN_COLLAPSED_ATTR, 'false');

    const label = doc.createElement('span');
    label.setAttribute(ROLE_ATTR, 'label');

    const countElement = doc.createElement('span');
    countElement.setAttribute(ROLE_ATTR, 'count');

    const arrow = doc.createElement('span');
    arrow.setAttribute(ROLE_ATTR, 'arrow');
    arrow.setAttribute('aria-hidden', 'true');

    control.appendChild(label);
    control.appendChild(countElement);
    control.appendChild(arrow);

    const record = {
      nav: nav,
      control: control,
      label: label,
      countElement: countElement,
      arrow: arrow,
      onClick: null,
      english: false,
      count: 0,
      columnCollapsed: false,
      hadId: undefined,
      oldId: null,
      generatedId: null,
      hadHidden: undefined,
      oldHidden: null
    };

    record.onClick = function onClick() {
      setCollapsed(!collapsed);
    };
    control.addEventListener('click', record.onClick);

    if (nav.parentElement) {
      nav.parentElement.insertBefore(control, nav);
    }

    return record;
  }

  function restoreNavAttributes(nav, record) {
    if (record.hadHidden !== undefined) {
      const current = nav.getAttribute(HIDDEN_ATTR);
      if (record.hadHidden) {
        if (current !== record.oldHidden) {
          if (record.oldHidden === null) {
            nav.removeAttribute(HIDDEN_ATTR);
          } else {
            nav.setAttribute(HIDDEN_ATTR, record.oldHidden);
          }
        }
      } else if (current !== null) {
        nav.removeAttribute(HIDDEN_ATTR);
      }
    }

    if (record.generatedId && nav.getAttribute('id') === record.generatedId) {
      if (record.hadId) {
        const oldId = record.oldId === null ? '' : record.oldId;
        if (nav.getAttribute('id') !== oldId) nav.setAttribute('id', oldId);
      } else {
        nav.removeAttribute('id');
      }
    }
  }

  function removeRecord(record) {
    const control = record.control;
    if (control.parentNode) control.parentNode.removeChild(control);
    if (record.onClick) control.removeEventListener('click', record.onClick);
    restoreNavAttributes(record.nav, record);
  }

  function updateAllStates() {
    for (const record of instances.values()) {
      updateRecord(record);
    }
  }

  function moveFocusOutOfNav(active) {
    if (!isElement(active)) return;

    for (const record of instances.values()) {
      if (record.nav.contains(active)) {
        if (record.count > 0 && record.columnCollapsed !== true) {
          record.control.focus();
        } else if (typeof active.blur === 'function') {
          active.blur();
        }
        return;
      }
    }
  }

  function setCollapsed(next, options) {
    if (next === collapsed) return;
    collapsed = next;

    if (!options || options.persist !== false) {
      try {
        win.localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
      } catch (err) {
        // Storage may be unavailable or full; in-memory state still works.
      }
    }

    const active = doc.activeElement;
    updateAllStates();
    if (collapsed) moveFocusOutOfNav(active);
  }

  function onStorage(event) {
    if (!event || event.key !== STORAGE_KEY) return;
    if (event.newValue === 'true') {
      setCollapsed(true, { persist: false });
    } else if (event.newValue === 'false') {
      setCollapsed(false, { persist: false });
    }
  }

  function scan() {
    if (disposed) return;

    for (const [nav, record] of Array.from(instances.entries())) {
      if (!nav.isConnected || !record.control.isConnected || !isValidSidebarNav(nav)) {
        removeRecord(record);
        instances.delete(nav);
      }
    }

    for (const nav of Array.from(doc.querySelectorAll(NAV_SELECTOR))) {
      if (!isValidSidebarNav(nav)) continue;

      let record = instances.get(nav);
      if (!record) {
        record = createRecord(nav);
        instances.set(nav, record);
      } else if (
        nav.parentElement &&
        (record.control.parentNode !== nav.parentElement || nav.previousElementSibling !== record.control)
      ) {
        nav.parentElement.insertBefore(record.control, nav);
      }

      updateRecord(record);
    }

    if (collapsed) moveFocusOutOfNav(doc.activeElement);
  }

  const observer = new win.MutationObserver(onMutation);
  if (doc.documentElement) {
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-sidebar-collapsed']
    });
  }

  win.addEventListener('storage', onStorage);
  scan();
  queueScan();

  const instance = {
    dispose: function dispose() {
      if (disposed) return;

      const current = win[RUNTIME_KEY];
      if (current && current !== instance) {
        disposed = true;
        return;
      }

      cleanup();
    }
  };

  function cleanup() {
    disposed = true;
    observer.disconnect();
    win.removeEventListener('storage', onStorage);
    disposeWorkspaces();

    for (const record of Array.from(instances.values())) {
      removeRecord(record);
    }
    instances.clear();

    if (style.parentNode) style.parentNode.removeChild(style);
    if (win[RUNTIME_KEY] === instance) delete win[RUNTIME_KEY];
  }

  win[RUNTIME_KEY] = instance;
  return instance.dispose;
};
