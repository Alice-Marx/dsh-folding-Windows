function installWorkspaceFolding(doc, win) {
  if (!doc || !win) {
    return function dispose() {};
  }

  const STORAGE_KEY = 'dsh-folding-windows:workspaces-collapsed:v1';
  const HIDDEN_ATTR = 'data-dsh-folding-workspaces-hidden';
  const STYLE_ATTR = 'data-dsh-folding-workspaces-style';
  const TOGGLE_SELECTOR = 'button[data-dsh-folding-control][data-dsh-folding-section="workspaces"]';
  const NEW_SESSION_LABELS = ['新建会话', 'New session'];
  const SEARCH_LABELS = ['搜索会话', 'Search sessions'];
  const SESSION_TREE_LABELS = ['会话', 'Sessions'];

  const records = new Map();
  let collapsed = false;
  let disposed = false;
  let scanScheduled = false;
  let idCounter = 0;

  function isDiv(el) {
    return !!el && el.nodeType === 1 && el.tagName === 'DIV';
  }

  function isButton(el) {
    return !!el && el.nodeType === 1 && el.tagName === 'BUTTON';
  }

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
    style.textContent =
      'button[data-dsh-folding-control][data-dsh-folding-section="workspaces"]{flex:none;}' +
      'button[data-dsh-folding-control][data-dsh-folding-section="workspaces"][aria-expanded="false"]{margin-bottom:auto;}' +
      '[data-dsh-folding-workspaces-hidden="true"]{display:none!important;}';
    return style;
  }

  function isSearchButton(el) {
    if (!isButton(el)) return false;
    return SEARCH_LABELS.indexOf(el.getAttribute('aria-label')) !== -1;
  }

  function findSearchButton(scope) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return null;
    const buttons = scope.querySelectorAll('button[aria-label]');
    for (let i = 0; i < buttons.length; i++) {
      if (isSearchButton(buttons[i])) return buttons[i];
    }
    return null;
  }

  function detectLanguage(searchButton) {
    return searchButton && searchButton.getAttribute('aria-label') === '搜索会话' ? 'zh' : 'en';
  }

  function findSessionTree(scope) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return null;
    const trees = scope.querySelectorAll('[role="tree"]');
    let fallback = null;
    for (let i = 0; i < trees.length; i++) {
      const label = trees[i].getAttribute('aria-label');
      if (label === SESSION_TREE_LABELS[0] || label === SESSION_TREE_LABELS[1]) return trees[i];
      if (!fallback) fallback = trees[i];
    }
    return fallback;
  }

  function findBrowser(seat) {
    const searchButton = findSearchButton(seat);
    if (!searchButton) return null;
    // DSH renders the browser inside slot wrappers whose depth is not part of
    // its public contract, so the session tree — not a child layout — proves
    // this seat owns the workspace area.
    if (!findSessionTree(seat)) return null;
    return { searchButton: searchButton };
  }

  function findRoots() {
    const roots = [];
    const buttons = doc.querySelectorAll('button[aria-label]');
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      if (NEW_SESSION_LABELS.indexOf(button.getAttribute('aria-label')) === -1) continue;

      const root = button.parentElement;
      if (!isDiv(root)) continue;

      const column = root.parentElement;
      if (!isDiv(column)) continue;

      const frame = column.parentElement;
      if (!isDiv(frame)) continue;
      if (frame.firstElementChild !== column) continue;

      if (roots.indexOf(root) === -1) roots.push(root);
    }
    return roots;
  }

  function generateUniqueId() {
    let id;
    do {
      idCounter += 1;
      id = 'dsh-folding-workspaces-seat-' + idCounter;
    } while (doc.getElementById(id));
    return id;
  }

  function ensureSeatId(record) {
    const seat = record.seat;
    const existing = seat.getAttribute('id');
    if (existing) return existing;

    if (record.generatedId && !doc.getElementById(record.generatedId)) {
      seat.setAttribute('id', record.generatedId);
      return record.generatedId;
    }

    const id = generateUniqueId();
    record.generatedId = id;
    seat.setAttribute('id', id);
    return id;
  }

  function createRecord(root, appFrame, seat, browserInfo) {
    const record = {
      root: root,
      appFrame: appFrame,
      seat: seat,
      searchButton: browserInfo.searchButton,
      language: detectLanguage(browserInfo.searchButton),
      toggle: null,
      oldId: seat.getAttribute('id'),
      oldHidden: seat.getAttribute(HIDDEN_ATTR),
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

  function ensureToggle(record) {
    let toggle = record.toggle;
    if (toggle && (!toggle.isConnected || toggle.getAttribute('data-dsh-folding-section') !== 'workspaces')) {
      detachToggle(record);
      toggle = null;
    }
    if (!toggle) {
      createToggle(record);
      toggle = record.toggle;
    }
    if (toggle.parentNode !== record.root || toggle.nextSibling !== record.seat) {
      record.root.insertBefore(toggle, record.seat);
    }
  }

  function applyRecord(record) {
    const seat = record.seat;
    const toggle = record.toggle;
    if (!seat.isConnected || !toggle || !toggle.isConnected) return;

    if (toggle.parentNode !== record.root || toggle.nextSibling !== seat) {
      record.root.insertBefore(toggle, seat);
    }

    const seatId = ensureSeatId(record);
    setAttrIfChanged(toggle, 'aria-controls', seatId);
    setAttrIfChanged(toggle, 'aria-expanded', collapsed ? 'false' : 'true');
    setAttrIfChanged(
      toggle,
      'title',
      record.language === 'zh'
        ? (collapsed ? '展开工作区' : '收起工作区')
        : (collapsed ? 'Expand workspaces' : 'Collapse workspaces')
    );

    const columnCollapsed = !!record.appFrame && record.appFrame.getAttribute('data-sidebar-collapsed') === 'true';
    setAttrIfChanged(toggle, 'data-dsh-folding-column-collapsed', columnCollapsed ? 'true' : 'false');

    const label = toggle.querySelector('[data-dsh-folding-role="label"]');
    setTextIfChanged(label, record.language === 'zh' ? '工作区' : 'Workspaces');

    const arrow = toggle.querySelector('[data-dsh-folding-role="arrow"]');
    setTextIfChanged(arrow, collapsed ? '▸' : '▾');

    if (collapsed) {
      setAttrIfChanged(seat, HIDDEN_ATTR, 'true');
    } else {
      removeAttrIfChanged(seat, HIDDEN_ATTR);
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
      if (record.seat.contains(active)) {
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

  function restoreSeatAttributes(record) {
    const seat = record.seat;
    if (!seat) return;
    if (record.oldHidden === null) removeAttrIfChanged(seat, HIDDEN_ATTR);
    else setAttrIfChanged(seat, HIDDEN_ATTR, record.oldHidden);
    if (record.generatedId && seat.getAttribute('id') === record.generatedId) {
      if (record.oldId === null) seat.removeAttribute('id');
      else seat.setAttribute('id', record.oldId);
    }
  }

  function removeRecord(record) {
    detachToggle(record);
    restoreSeatAttributes(record);
    records.delete(record.seat);
  }

  function scan() {
    if (disposed) return;

    const seen = new Set();
    const roots = findRoots();

    for (let r = 0; r < roots.length; r++) {
      const root = roots[r];
      const column = root.parentElement;
      const appFrame = column ? column.parentElement : null;
      const children = Array.from(root.children);

      for (let i = 0; i < children.length; i++) {
        const seat = children[i];
        if (!isDiv(seat)) continue;

        const browserInfo = findBrowser(seat);
        if (!browserInfo) continue;

        let record = records.get(seat);
        if (!record) {
          record = createRecord(root, appFrame, seat, browserInfo);
          records.set(seat, record);
        } else {
          record.root = root;
          record.appFrame = appFrame;
          record.searchButton = browserInfo.searchButton;
          record.language = detectLanguage(browserInfo.searchButton);
        }

        seen.add(seat);
        ensureToggle(record);
        if (collapsed && seat.contains(doc.activeElement)) moveFocusOutOfSeats();
        applyRecord(record);
      }
    }

    Array.from(records.values()).forEach(function (record) {
      if (!seen.has(record.seat)) {
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

  const styleElement = ensureStyle();

  const ObserverCtor = win.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  const observer = ObserverCtor ? new ObserverCtor(onMutations) : null;

  if (observer) {
    observer.observe(doc.documentElement || doc, {
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
