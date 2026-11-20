function installWorkspaceFolding(doc, win) {
  if (!doc || !win) {
    return function dispose() {};
  }

  const STORAGE_KEY = 'dsh-folding-windows:workspaces-collapsed:v1';
  const HIDDEN_ATTR = 'data-dsh-folding-workspaces-hidden';
  const STYLE_ATTR = 'data-dsh-folding-workspaces-style';
  const TOGGLE_SELECTOR = 'button[data-dsh-folding-control][data-dsh-folding-section="workspaces"]';

  const records = new Map();
  let collapsed = false;
  let disposed = false;
  let scanScheduled = false;
  let idCounter = 0;
  let styleElement = null;
  let observer = null;

  function setAttrIfChanged(el, name, value) {
    if (el && el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }

  function removeAttrIfChanged(el, name) {
    if (el && el.hasAttribute(name)) {
      el.removeAttribute(name);
    }
  }

  function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  function getLocalStorage() {
    try {
      return win.localStorage;
    } catch (e) {
      return null;
    }
  }

  function readStoredCollapsed() {
    const ls = getLocalStorage();
    if (!ls) return false;
    try {
      return ls.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function writeStoredCollapsed(value) {
    const ls = getLocalStorage();
    if (!ls) return;
    try {
      ls.setItem(STORAGE_KEY, value ? 'true' : 'false');
    } catch (e) {}
  }

  function ensureStyle() {
    let style = doc.querySelector('style[' + STYLE_ATTR + ']');
    if (!style) {
      style = doc.createElement('style');
      style.setAttribute(STYLE_ATTR, '');
      (doc.head || doc.documentElement).appendChild(style);
    }
    // The heading folds the browser it heads; the browser keeps its own markup.
    style.textContent =
      'button[data-dsh-folding-control][data-dsh-folding-section="workspaces"]{flex:none;}' +
      '[' + HIDDEN_ATTR + '="true"]{display:none!important;}';
    return style;
  }

  function detectLanguage(searchButton) {
    return searchButton && searchButton.getAttribute('aria-label') === '搜索会话' ? 'zh' : 'en';
  }

  function generateUniqueId() {
    let id;
    do {
      idCounter += 1;
      id = 'dsh-folding-workspaces-browser-' + idCounter;
    } while (doc.getElementById(id));
    return id;
  }

  function ensureBrowserId(record) {
    const browser = record.browser;
    const existing = browser.getAttribute('id');
    if (existing) return existing;

    if (record.generatedId && !doc.getElementById(record.generatedId)) {
      browser.setAttribute('id', record.generatedId);
      return record.generatedId;
    }

    const id = generateUniqueId();
    record.generatedId = id;
    browser.setAttribute('id', id);
    return id;
  }

  function createRecord(workspace) {
    const browser = workspace.browser;
    const record = {
      browser: browser,
      seat: workspace.seat,
      searchButton: workspace.searchButton,
      language: detectLanguage(workspace.searchButton),
      toggle: null,
      rail: false,
      oldId: browser.getAttribute('id'),
      oldHidden: browser.getAttribute(HIDDEN_ATTR),
      generatedId: null,
      handleClick: null
    };

    record.handleClick = function (event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      applyCollapsed(!collapsed, { persist: true });
    };

    return record;
  }

  function detachToggle(record) {
    const toggle = record.toggle;
    if (!toggle) return;
    if (record.handleClick) {
      toggle.removeEventListener('click', record.handleClick);
    }
    if (toggle.parentNode) {
      toggle.parentNode.removeChild(toggle);
    }
    record.toggle = null;
  }

  function createToggle(record) {
    const toggle = doc.createElement('button');
    toggle.type = 'button';
    setAttrIfChanged(toggle, 'data-dsh-folding-control', '');
    setAttrIfChanged(toggle, 'data-dsh-folding-section', 'workspaces');

    const label = doc.createElement('span');
    setAttrIfChanged(label, 'data-dsh-folding-role', 'label');

    const arrow = doc.createElement('span');
    setAttrIfChanged(arrow, 'data-dsh-folding-role', 'arrow');
    setAttrIfChanged(arrow, 'aria-hidden', 'true');

    toggle.appendChild(label);
    toggle.appendChild(arrow);
    toggle.addEventListener('click', record.handleClick);
    record.toggle = toggle;
  }

  function mountToggle(record) {
    const toggle = record.toggle;
    const seat = record.seat;
    if (!toggle || !seat || typeof seat.insertBefore !== 'function') return;
    if (toggle.parentNode === seat && toggle.nextElementSibling === record.browser) return;
    const anchor = record.browser.parentNode === seat ? record.browser : seat.firstElementChild;
    seat.insertBefore(toggle, anchor);
  }

  function ensureToggle(record) {
    let toggle = record.toggle;
    if (toggle && (!toggle.isConnected || toggle.getAttribute('data-dsh-folding-section') !== 'workspaces')) {
      detachToggle(record);
      toggle = null;
    }
    if (!toggle) {
      createToggle(record);
    }
    mountToggle(record);
  }

  function applyRecord(record) {
    const browser = record.browser;
    const toggle = record.toggle;
    if (!browser.isConnected || !toggle || !toggle.isConnected) return;

    mountToggle(record);

    const browserId = ensureBrowserId(record);
    setAttrIfChanged(toggle, 'aria-controls', browserId);
    setAttrIfChanged(toggle, 'aria-expanded', collapsed ? 'false' : 'true');
    setAttrIfChanged(toggle, 'data-dsh-folding-column-collapsed', record.rail ? 'true' : 'false');
    setAttrIfChanged(
      toggle,
      'title',
      record.language === 'zh'
        ? (collapsed ? '展开工作区' : '收起工作区')
        : (collapsed ? 'Expand workspaces' : 'Collapse workspaces')
    );

    const label = toggle.querySelector('[data-dsh-folding-role="label"]');
    setTextIfChanged(label, record.language === 'zh' ? '工作区' : 'Workspaces');

    const arrow = toggle.querySelector('[data-dsh-folding-role="arrow"]');
    setTextIfChanged(arrow, collapsed ? '▸' : '▾');

    if (collapsed) {
      setAttrIfChanged(browser, HIDDEN_ATTR, 'true');
    } else {
      removeAttrIfChanged(browser, HIDDEN_ATTR);
    }
  }

  function applyAll() {
    records.forEach(function (record) {
      applyRecord(record);
    });
  }

  function moveFocusOutOfSeats() {
    const active = doc.activeElement;
    if (!active || active === doc.body) return;

    records.forEach(function (record) {
      if (record.browser.contains(active)) {
        const toggle = record.toggle;
        if (toggle && typeof toggle.focus === 'function') {
          try {
            toggle.focus({ preventScroll: true });
          } catch (e) {
            toggle.focus();
          }
        }
      }
    });
  }

  function applyCollapsed(next, options) {
    if (disposed) return;
    const opts = options || {};
    const changed = collapsed !== next;
    collapsed = next;

    if (changed && opts.persist) {
      writeStoredCollapsed(collapsed);
    }
    if (changed && collapsed) {
      moveFocusOutOfSeats();
    }
    applyAll();
  }

  function restoreBrowserAttributes(record) {
    const browser = record.browser;
    if (!browser) return;
    if (record.oldHidden === null) removeAttrIfChanged(browser, HIDDEN_ATTR);
    else setAttrIfChanged(browser, HIDDEN_ATTR, record.oldHidden);
    if (record.generatedId && browser.getAttribute('id') === record.generatedId) {
      if (record.oldId === null) browser.removeAttribute('id');
      else browser.setAttribute('id', record.oldId);
    }
  }

  function removeRecord(record) {
    detachToggle(record);
    restoreBrowserAttributes(record);
    records.delete(record.browser);
  }

  function scan() {
    if (disposed) return;

    const seen = new Set();
    const rail = isSidebarRailMode(doc);

    for (const root of findSidebarRoots(doc)) {
      const workspace = findSidebarWorkspace(root);
      if (!workspace) continue;

      let record = records.get(workspace.browser);
      if (!record) {
        record = createRecord(workspace);
        records.set(workspace.browser, record);
      } else {
        record.seat = workspace.seat;
        record.searchButton = workspace.searchButton;
        record.language = detectLanguage(workspace.searchButton);
      }
      record.rail = rail;

      seen.add(workspace.browser);
      ensureToggle(record);
      if (collapsed && workspace.browser.contains(doc.activeElement)) moveFocusOutOfSeats();
      applyRecord(record);
    }

    Array.from(records.values()).forEach(function (record) {
      if (!seen.has(record.browser)) {
        removeRecord(record);
      }
    });
  }

  function scheduleScan() {
    if (disposed || scanScheduled) return;
    scanScheduled = true;
    Promise.resolve().then(function () {
      scanScheduled = false;
      if (!disposed) scan();
    });
  }

  function mutationIsOwnOnly(mutation) {
    if (!mutation || mutation.type !== 'childList') return false;

    const nodes = [];
    Array.from(mutation.addedNodes).forEach(function (node) { nodes.push(node); });
    Array.from(mutation.removedNodes).forEach(function (node) { nodes.push(node); });
    if (!nodes.length) return false;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType === 1 && typeof node.matches === 'function' && node.matches(TOGGLE_SELECTOR)) {
        if (mutation.removedNodes.length) return false;
      }
    }

    const onlyOwnToggles = nodes.every(function (node) {
      return node.nodeType === 1 && typeof node.matches === 'function' && node.matches(TOGGLE_SELECTOR);
    });
    if (onlyOwnToggles) return true;

    let ownTextChange = false;
    records.forEach(function (record) {
      const toggle = record.toggle;
      if (!toggle) return;
      if (toggle === mutation.target || toggle.contains(mutation.target)) {
        const allInsideToggle = nodes.every(function (node) {
          return toggle === node || toggle.contains(node);
        });
        if (allInsideToggle) ownTextChange = true;
      }
    });

    return ownTextChange;
  }

  function onMutations(mutations) {
    if (disposed) return;
    for (let i = 0; i < mutations.length; i++) {
      if (!mutationIsOwnOnly(mutations[i])) {
        scheduleScan();
        return;
      }
    }
  }

  function onStorage(event) {
    if (disposed || !event) return;
    if (event.key !== null && event.key !== STORAGE_KEY) return;

    const ls = getLocalStorage();
    if (event.storageArea && (!ls || event.storageArea !== ls)) return;

    applyCollapsed(readStoredCollapsed(), { persist: false });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;

    if (observer) observer.disconnect();
    if (typeof win.removeEventListener === 'function') {
      win.removeEventListener('storage', onStorage);
    }

    Array.from(records.values()).forEach(function (record) {
      removeRecord(record);
    });
    records.clear();

    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
  }

  collapsed = readStoredCollapsed();

  styleElement = ensureStyle();

  if (typeof win.MutationObserver === 'function' && doc.documentElement) {
    observer = new win.MutationObserver(onMutations);
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-sidebar-collapsed']
    });
  }

  if (typeof win.addEventListener === 'function') {
    win.addEventListener('storage', onStorage);
  }

  scan();

  return dispose;
}
