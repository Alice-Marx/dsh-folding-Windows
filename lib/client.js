window.__ModuleLoader__.load({ id: "@ljwei-stak/dsh-folding-windows", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict';

// The DSH sidebar surfaces this plugin enhances, located in one place.
//
// DSH 0.2.2-rc.5 (SidebarRoot / AppFrame) renders:
//   div[data-sidebar-collapsed]                             AppFrame frame
//   └── div                                                 sidebar column
//       └── div                                             sidebar root
//           ├── div (brand row)       … button[data-sidebar-toggle]
//           ├── div (new session row) … button[aria-label="新建会话"]
//           ├── div (scroll region)
//           │   └── div[data-sidebar-scrollport]            scroll area (grid)
//           │       ├── nav[aria-label="全局面板"]           tools navigation
//           │       └── div                                 workspace seat
//           │           └── div                             workspace browser
//           └── div (foot area)
//
// Only DSH-owned semantics identify these nodes: no CSS-module class names and
// no assumptions about the slot wrappers in between. An ancestor only counts as
// a sidebar root when it owns the rail toggle or the New Session affordance AND
// holds no second copy of the seed being resolved — the second half keeps an
// unrelated navigation or browser mounted elsewhere in the page untouched.

const SIDEBAR_PANELS_LABELS = ['全局面板', 'Global panels'];
const SIDEBAR_NEW_SESSION_LABELS = ['新建会话', 'New session'];
const SIDEBAR_SEARCH_LABELS = ['搜索会话', 'Search sessions'];
const SIDEBAR_SESSION_TREE_LABELS = ['会话', 'Sessions'];
const SIDEBAR_TOGGLE_SELECTOR = '[data-sidebar-toggle]';
const SIDEBAR_COLLAPSED_ATTRIBUTE = 'data-sidebar-collapsed';
const SIDEBAR_WALK_LIMIT = 12;

function isSidebarElementNode(node) {
  return !!node && node.nodeType === 1;
}

function sidebarHasLabel(element, labels) {
  if (!isSidebarElementNode(element)) return false;
  return labels.indexOf(element.getAttribute('aria-label')) !== -1;
}

/** Matching buttons under a scope, in document order. */
function collectSidebarButtons(scope, labels) {
  const matches = [];
  if (!scope || typeof scope.querySelectorAll !== 'function') return matches;
  const buttons = scope.querySelectorAll('button[aria-label]');
  for (let index = 0; index < buttons.length; index++) {
    if (sidebarHasLabel(buttons[index], labels)) matches.push(buttons[index]);
  }
  return matches;
}

/** Every tools navigation DSH mounts, matched by its semantic label only. */
function findSidebarNavs(doc) {
  const navs = [];
  const candidates = doc.querySelectorAll('nav[aria-label]');
  for (let index = 0; index < candidates.length; index++) {
    if (sidebarHasLabel(candidates[index], SIDEBAR_PANELS_LABELS)) navs.push(candidates[index]);
  }
  return navs;
}

function findSidebarSearchButton(scope) {
  const matches = collectSidebarButtons(scope, SIDEBAR_SEARCH_LABELS);
  return matches.length ? matches[0] : null;
}

function findSidebarSessionTree(scope) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return null;
  const trees = scope.querySelectorAll('[role="tree"]');
  let fallback = null;
  for (let index = 0; index < trees.length; index++) {
    if (sidebarHasLabel(trees[index], SIDEBAR_SESSION_TREE_LABELS)) return trees[index];
    if (!fallback) fallback = trees[index];
  }
  return fallback;
}

/** A sidebar root owns the rail toggle and the New Session affordance. */
function sidebarIsRoot(element) {
  if (!isSidebarElementNode(element) || element.tagName !== 'DIV') return false;
  if (element.querySelector(SIDEBAR_TOGGLE_SELECTOR)) return true;
  return collectSidebarButtons(element, SIDEBAR_NEW_SESSION_LABELS).length > 0;
}

/**
 * The nearest root above a seed that owns no second copy of that seed. An
 * ancestor that holds another navigation or another workspace browser belongs
 * to the page around two sidebars, not to one of them.
 */
function findSidebarRoot(seed, foreignMatches) {
  let element = seed ? seed.parentElement : null;
  for (let depth = 0; element && depth < SIDEBAR_WALK_LIMIT; depth++) {
    if (sidebarIsRoot(element) && !foreignMatches(element)) return element;
    element = element.parentElement;
  }
  return null;
}

/** The sidebar root that owns this tools navigation. */
function findSidebarRootForNav(nav) {
  return findSidebarRoot(nav, function holdsAnotherNav(element) {
    const navs = element.querySelectorAll('nav[aria-label]');
    for (let index = 0; index < navs.length; index++) {
      if (navs[index] !== nav && sidebarHasLabel(navs[index], SIDEBAR_PANELS_LABELS)) return true;
    }
    return false;
  });
}

/** The sidebar root that owns this workspace search affordance. */
function findSidebarRootForBrowser(searchButton) {
  return findSidebarRoot(searchButton, function holdsAnotherBrowser(element) {
    const buttons = collectSidebarButtons(element, SIDEBAR_SEARCH_LABELS);
    for (let index = 0; index < buttons.length; index++) {
      if (buttons[index] !== searchButton) return true;
    }
    return false;
  });
}

/**
 * The workspace browser and the seat it is mounted in. The browser is the
 * shallowest ancestor of the search affordance that also owns the session tree,
 * whichever slot wrappers DSH puts above it; the seat is simply that browser's
 * parent, which is where a folding heading belongs.
 */
function findSidebarWorkspace(root) {
  if (!root) return null;
  const searchButton = findSidebarSearchButton(root);
  if (!searchButton) return null;

  let browser = searchButton.parentElement;
  for (let depth = 0; browser && browser !== root && depth < SIDEBAR_WALK_LIMIT; depth++) {
    const sessionTree = findSidebarSessionTree(browser);
    if (sessionTree) {
      const seat = browser.parentElement;
      if (!seat || seat === root || sidebarIsRoot(seat)) return null;
      return { browser: browser, seat: seat, searchButton: searchButton, sessionTree: sessionTree };
    }
    browser = browser.parentElement;
  }
  return null;
}

/** Every sidebar on the page, discovered from its navigation or its browser. */
function findSidebarRoots(doc) {
  const roots = [];
  function add(root) {
    if (root && roots.indexOf(root) === -1) roots.push(root);
  }

  for (const nav of findSidebarNavs(doc)) add(findSidebarRootForNav(nav));

  const browsers = collectSidebarButtons(doc, SIDEBAR_SEARCH_LABELS);
  for (let index = 0; index < browsers.length; index++) {
    add(findSidebarRootForBrowser(browsers[index]));
  }

  return roots;
}

/** The rail state AppFrame publishes while the whole sidebar is collapsed. */
function isSidebarRailMode(doc) {
  return !!doc.querySelector('[' + SIDEBAR_COLLAPSED_ATTRIBUTE + ']');
}

function createProjectPinController(service, win) {
  let disposed = false;
  let busy = false;
  let error = null;
  let pinnedIds = [];
  let baseOrder = [];
  const listeners = new Set();
  let sourceUnsubscribe = null;
  let failureLatch = false;
  let sourceChangedDuringBusy = false;
  let pendingStorageUpdate = null;
  let lastSnapshotPhase = service.list.getSnapshot().phase;
  let internalOrders = null;
  let storageRevision = 0;

  function validIds(value) {
    return Array.isArray(value) ? Array.from(new Set(value.filter(id => typeof id === 'string' && id.length > 0))) : [];
  }

  function loadPersistedState() {
    try {
      const stored = win.localStorage.getItem('dsh-folding-windows:project-pins:v1');
      if (!stored) return { pinnedIds: [], baseOrder: [] };
      const parsed = JSON.parse(stored);
      const pinnedIds = validIds(parsed?.pinnedIds);
      const baseOrder = validIds(parsed?.baseOrder);
      return { pinnedIds, baseOrder };
    } catch (e) {
      return { pinnedIds: [], baseOrder: [] };
    }
  }

  function savePersistedState() {
    if (disposed || pendingStorageUpdate) return;
    try {
      const data = { pinnedIds: [...pinnedIds], baseOrder: [...baseOrder] };
      const serialized = JSON.stringify(data);
      const existing = win.localStorage.getItem('dsh-folding-windows:project-pins:v1');
      if (existing === serialized) return;
      win.localStorage.setItem('dsh-folding-windows:project-pins:v1', serialized);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function syncBaseOrderWithSource(snapshot = service.list.getSnapshot()) {
    if (snapshot.phase !== 'ready') return;
    const currentIds = snapshot.items.map(item => item.workspaceId);
    const currentIdSet = new Set(currentIds);
    const currentPinnedSet = new Set(pinnedIds);
    const filteredOldBase = baseOrder.filter(id => currentIdSet.has(id));
    const newIds = currentIds.filter(id => !baseOrder.includes(id));
    const skeleton = [...filteredOldBase, ...newIds];
    const unpinnedSequence = currentIds.filter(id => !currentPinnedSet.has(id));
    let unpinnedIdx = 0;
    const newBase = skeleton.map(id => currentPinnedSet.has(id) ? id : unpinnedSequence[unpinnedIdx++]);
    const newPinned = pinnedIds.filter(id => currentIdSet.has(id));
    const baseChanged = JSON.stringify(newBase) !== JSON.stringify(baseOrder);
    const pinnedChanged = JSON.stringify(newPinned) !== JSON.stringify(pinnedIds);
    if (baseChanged || pinnedChanged) {
      baseOrder = newBase;
      pinnedIds = newPinned;
      savePersistedState();
    }
  }

  function computeDesiredOrder(pinnedSet, base) {
    return [...Array.from(pinnedSet), ...base.filter(id => !pinnedSet.has(id))];
  }

  async function reconcileOrder(desired) {
    try {
      const snapshot = service.list.getSnapshot();
      if (snapshot.phase !== 'ready' || disposed) return false;
      const currentOrder = snapshot.items.map(item => item.workspaceId);
      if (currentOrder.length === desired.length && currentOrder.every((id, i) => id === desired[i])) return true;
      const maxMoves = snapshot.items.length;
      let moves = 0;
      while (moves < maxMoves) {
        if (disposed) return false;
        const snap = service.list.getSnapshot();
        if (snap.phase !== 'ready') return false;
        const current = snap.items.map(item => item.workspaceId);
        if (current.length === desired.length && current.every((id, i) => id === desired[i])) return true;
        let firstMismatch = -1;
        const minLen = Math.min(current.length, desired.length);
        for (let i = 0; i < minLen; i++) {
          if (current[i] !== desired[i]) {
            firstMismatch = i;
            break;
          }
        }
        if (firstMismatch === -1) return current.length === desired.length;
        const idToMove = desired[firstMismatch];
        const currentIndex = current.indexOf(idToMove);
        if (currentIndex === -1) return false;
        const beforeId = current[firstMismatch];
        const nextOrder = current.filter(id => id !== idToMove);
        nextOrder.splice(firstMismatch, 0, idToMove);
        internalOrders = new Set([JSON.stringify(current), JSON.stringify(nextOrder)]);
        try {
          await service.insertBefore(idToMove, beforeId);
          moves++;
        } catch (e) {
          throw e;
        }
        if (disposed) return false;
        if (sourceChangedDuringBusy || pendingStorageUpdate) return true;
      }
      const finalSnap = service.list.getSnapshot();
      const finalOrder = finalSnap.items.map(item => item.workspaceId);
      return finalOrder.length === desired.length && finalOrder.every((id, i) => id === desired[i]);
    } finally {
      internalOrders = null;
    }
  }

  function applyStoredState(update) {
    pinnedIds = [...update.newPinned];
    baseOrder = [...update.newBase];
    const snapshot = service.list.getSnapshot();
    if (snapshot.phase === 'ready') {
      const ids = snapshot.items.map(item => item.workspaceId);
      const current = new Set(ids);
      pinnedIds = pinnedIds.filter(id => current.has(id));
      baseOrder = [...baseOrder.filter(id => current.has(id)), ...ids.filter(id => !baseOrder.includes(id))];
    }
    failureLatch = false;
    error = null;
    savePersistedState();
  }

  async function runReconciliation(desired, rollback = null) {
    if (disposed || busy) return false;
    busy = true;
    error = null;
    sourceChangedDuringBusy = false;
    notifyListener();
    let success = true;
    try {
      try {
        if (!await reconcileOrder(desired)) throw new Error('Order convergence failed');
      } catch (e) {
        success = false;
        if (disposed) return false;
        error = 'reorder_failed';
        failureLatch = true;
        if (rollback && storageRevision === rollback.revision && !pendingStorageUpdate) {
          pinnedIds = rollback.pinnedIds;
          baseOrder = rollback.baseOrder;
          savePersistedState();
        }
      }
      if (disposed) return false;
      // At most one coalesced follow-up in this transaction. Own optimistic
      // snapshots are excluded in handleSourceUpdate, including failure rollback.
      if (pendingStorageUpdate || (sourceChangedDuringBusy && !failureLatch)) {
        if (pendingStorageUpdate) {
          const pending = pendingStorageUpdate;
          pendingStorageUpdate = null;
          applyStoredState(pending);
        }
        sourceChangedDuringBusy = false;
        try {
          if (!await reconcileOrder(computeDesiredOrder(new Set(pinnedIds), baseOrder))) {
            throw new Error('Order convergence failed');
          }
        } catch (e) {
          if (!disposed) {
            error = 'reorder_failed';
            failureLatch = true;
          }
          success = false;
        }
      }
      return success && !disposed;
    } finally {
      busy = false;
      notifyListener();
      if (!disposed && (pendingStorageUpdate || (sourceChangedDuringBusy && !failureLatch))) {
        queueMicrotask(() => {
          if (disposed || busy) return;
          if (pendingStorageUpdate) {
            const pending = pendingStorageUpdate;
            pendingStorageUpdate = null;
            applyStoredState(pending);
          }
          sourceChangedDuringBusy = false;
          runReconciliation(computeDesiredOrder(new Set(pinnedIds), baseOrder));
        });
      }
    }
  }

  function notifyListener() {
    if (disposed) return;
    for (const listener of [...listeners]) listener(getState());
  }

  function getState() {
    const snapshot = service.list.getSnapshot();
    return {
      items: snapshot.items,
      phase: snapshot.phase,
      pinnedIds: [...pinnedIds],
      busy: busy,
      error: error
    };
  }

  function subscribe(listener) {
    if (disposed) return () => {};
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  async function toggle(id) {
    if (disposed) return false;
    const snapshot = service.list.getSnapshot();
    if (snapshot.phase !== 'ready') return false;
    if (typeof id !== 'string' || id.trim() === '' || !snapshot.items.some(item => item.workspaceId === id)) return false;
    if (busy) return false;
    failureLatch = false;
    syncBaseOrderWithSource();
    const oldPinned = [...pinnedIds];
    const oldBase = [...baseOrder];
    const revision = storageRevision;
    const newPinned = [...oldPinned];
    const idx = newPinned.indexOf(id);
    if (idx === -1) newPinned.unshift(id);
    else newPinned.splice(idx, 1);
    const currentIdSet = new Set(snapshot.items.map(item => item.workspaceId));
    const validPinned = newPinned.filter(pid => currentIdSet.has(pid));
    const validPinnedSet = new Set(validPinned);
    pinnedIds = Array.from(validPinnedSet);
    const desired = computeDesiredOrder(validPinnedSet, baseOrder);
    savePersistedState();
    return runReconciliation(desired, { pinnedIds: oldPinned, baseOrder: oldBase, revision });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (sourceUnsubscribe) {
      sourceUnsubscribe();
      sourceUnsubscribe = null;
    }
    if (typeof win.removeEventListener === 'function') {
      win.removeEventListener('storage', handleStorageEvent);
    }
    listeners.clear();
    busy = false;
    error = null;
    failureLatch = false;
    sourceChangedDuringBusy = false;
    pendingStorageUpdate = null;
  }

  function handleSourceUpdate() {
    if (disposed) return;
    const snapshot = service.list.getSnapshot();
    const phaseChanged = snapshot.phase !== lastSnapshotPhase;
    if (phaseChanged) lastSnapshotPhase = snapshot.phase;
    // A native call we are awaiting republishes the order we asked for. Anything
    // else — including an edit landing while that call is in flight — is external
    // and must be adopted as the ordinary order instead of being overwritten.
    if (!phaseChanged && internalOrders !== null && internalOrders.has(JSON.stringify(snapshot.items.map(item => item.workspaceId)))) {
      notifyListener();
      return;
    }
    if (snapshot.phase === 'ready') {
      syncBaseOrderWithSource(snapshot);
      if (pinnedIds.length > 0 && !failureLatch) {
        if (busy) sourceChangedDuringBusy = true;
        else {
          const desired = computeDesiredOrder(new Set(pinnedIds), baseOrder);
          runReconciliation(desired).then(() => notifyListener()).catch(() => notifyListener());
        }
      }
    }
    notifyListener();
  }

  function handleStorageEvent(event) {
    if (disposed) return;
    if (event.storageArea !== win.localStorage) return;
    // A key of null means another tab cleared the whole storage area.
    if (event.key !== 'dsh-folding-windows:project-pins:v1' && event.key !== null) return;
    let newPinned;
    let newBase;
    if (event.newValue === null) {
      // Another tab cleared the preference: drop the pins, keep the ordinary
      // order this tab already knows, and hand that order back to DSH.
      newPinned = [];
      newBase = [...baseOrder];
    } else {
      try {
        const parsed = JSON.parse(event.newValue);
        newPinned = validIds(parsed?.pinnedIds);
        newBase = validIds(parsed?.baseOrder);
      } catch (e) {
        return;
      }
    }
    if (JSON.stringify({ pinnedIds: newPinned, baseOrder: newBase }) === JSON.stringify({ pinnedIds, baseOrder })) return;
    failureLatch = false;
    if (busy) {
      pendingStorageUpdate = { newPinned, newBase };
      return;
    }
    applyStoredState({ newPinned, newBase });
    runReconciliation(computeDesiredOrder(new Set(pinnedIds), baseOrder))
      .then(() => notifyListener()).catch(() => notifyListener());
  }

  const initialPersisted = loadPersistedState();
  pinnedIds = initialPersisted.pinnedIds;
  baseOrder = initialPersisted.baseOrder;
  sourceUnsubscribe = service.list.subscribe(handleSourceUpdate);
  win.addEventListener('storage', handleStorageEvent);
  if (lastSnapshotPhase === 'ready') {
    syncBaseOrderWithSource();
    if (pinnedIds.length > 0) {
      const pinnedSet = new Set(pinnedIds);
      const desired = computeDesiredOrder(pinnedSet, baseOrder);
      runReconciliation(desired).catch(() => {});
    }
  }

  return { getState, subscribe, toggle, dispose };
}

function installProjectPinning(doc, win, service) {
  if (!doc || !win) return function dispose() {};
  if (typeof createProjectPinController !== 'function' || !service || !service.list
    || typeof service.list.getSnapshot !== 'function' || typeof service.list.subscribe !== 'function'
    || typeof service.insertBefore !== 'function') return function dispose() {};

  // Dispose existing runtime if present
  if (win.__dshProjectPinningRuntime__ && typeof win.__dshProjectPinningRuntime__.dispose === 'function') {
    win.__dshProjectPinningRuntime__.dispose();
    win.__dshProjectPinningRuntime__ = null;
  }

  // Initialize controller
  const controller = createProjectPinController(service, win);
  if (!controller) {
    return function dispose() {};
  }

  // Runtime state
  const runtime = { dispose: null };
  win.__dshProjectPinningRuntime__ = runtime;
  let disposed = false;
  const rowMap = new Map(); // Key: row DOM element, Value: { workspaceId, button }
  let currentLocale = 'en';
  let currentSearchButton = null;
  let scanScheduled = false;

  // ------------------------------
  // Style element
  // ------------------------------
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-dsh-project-pin-style', '');
  styleEl.textContent = `
    [data-dsh-project-pin] {
      margin-left: auto;
      padding: 2px;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }
    [data-dsh-project-pin][aria-pressed="true"] {
      opacity: 1;
    }
    [role="treeitem"]:hover > [data-dsh-project-pin],
    [role="treeitem"]:focus > [data-dsh-project-pin],
    [role="treeitem"]:focus-within > [data-dsh-project-pin],
    [data-dsh-project-pin][aria-pressed="true"] {
      opacity: 1;
    }
    [data-dsh-project-pin]:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    [data-dsh-project-pin]:focus-visible {
      opacity: 1;
      outline: 2px solid Highlight;
      outline-offset: 2px;
    }
    [data-dsh-project-pin-notice] {
      padding: 4px 8px;
      flex: none;
      font-size: 12px;
      color: #d32f2f;
      display: none;
    }
    [data-dsh-project-pin-notice][data-visible="true"] {
      display: block;
    }
  `;
  (doc.head || doc.documentElement).appendChild(styleEl);

  // ------------------------------
  // Notice element
  // ------------------------------
  const noticeEl = doc.createElement('span');
  noticeEl.setAttribute('data-dsh-project-pin-notice', '');
  noticeEl.setAttribute('role', 'status');
  noticeEl.setAttribute('aria-live', 'polite');
  noticeEl.setAttribute('data-visible', 'false');

  // ------------------------------
  // Helper functions
  // ------------------------------
  function getLocale() {
    const searchBtn = currentSearchButton;
    if (!searchBtn) return /^zh/i.test(doc.documentElement?.lang || '') ? 'zh' : 'en';
    return searchBtn.getAttribute('aria-label') === '搜索会话' ? 'zh' : 'en';
  }

  function getErrorText() {
    return getLocale() === 'zh' ? '项目置顶失败，请重试。' : 'Could not pin project. Please try again.';
  }

  function getButtonText(items, workspaceId, isPinned) {
    const item = items.find(i => i.workspaceId === workspaceId);
    const title = item ? item.title : '';
    if (getLocale() === 'zh') {
      return isPinned ? `取消置顶项目 ${title}` : `置顶项目 ${title}`;
    } else {
      return isPinned ? `Unpin project ${title}` : `Pin project ${title}`;
    }
  }

  function createPinButton(workspaceId, isPinned, disabled, text) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('data-dsh-project-pin', workspaceId);
    button.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
    button.disabled = disabled;
    button.setAttribute('aria-label', text);
    button.setAttribute('title', text);

    // SVG pin icon
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = doc.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M16 9l3 3v2H5v-2l3-3V4H7V2h10v2h-1v5zM12 14v8');

    svg.appendChild(path);
    svg.setAttribute('aria-hidden', 'true');
    button.appendChild(svg);

    // Event handlers
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      controller.toggle(workspaceId).catch(() => {});
    });

    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
      }
    });

    button.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });

    return button;
  }

  // The sidebar's workspace browser, located through DSH's own semantics: the
  // seat owns the search affordance, and the list area is the seat child that
  // carries the session tree (the notice must not land inside the search pill).
  function resolveBrowser() {
    for (const root of findSidebarRoots(doc)) {
      const workspace = findSidebarWorkspace(root);
      if (!workspace) continue;

      let listArea = workspace.sessionTree;
      while (listArea.parentElement && listArea.parentElement !== workspace.browser) {
        listArea = listArea.parentElement;
      }
      if (listArea.parentElement !== workspace.browser) listArea = workspace.browser.firstElementChild;

      return {
        browser: workspace.browser,
        searchButton: workspace.searchButton,
        sessionsTree: workspace.sessionTree,
        listArea: listArea
      };
    }
    return null;
  }

  function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function setTextIfChanged(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  // ------------------------------
  // UI Update logic
  // ------------------------------
  function updateUI() {
    if (disposed) return;
    const browser = resolveBrowser();
    const sessionsTree = browser ? browser.sessionsTree : null;
    currentSearchButton = browser ? browser.searchButton : null;
    if (browser) {
      // A separate owned flex child avoids the search pill's clipping.
      if (noticeEl.parentElement !== browser.browser) browser.browser.insertBefore(noticeEl, browser.listArea);
    } else if (noticeEl.parentNode) {
      noticeEl.parentNode.removeChild(noticeEl);
    }
    const state = controller.getState();
    const { items, pinnedIds, busy, phase, error } = state;
    const validWorkspaceIds = new Set(items.map(item => item.workspaceId));
    const newLocale = getLocale();

    // Update locale if changed
    if (newLocale !== currentLocale) {
      currentLocale = newLocale;
      // Update all existing button labels
      for (const [row, { workspaceId, button }] of rowMap) {
        const isPinned = pinnedIds.includes(workspaceId);
        const text = getButtonText(items, workspaceId, isPinned);
        setAttributeIfChanged(button, 'aria-label', text);
        setAttributeIfChanged(button, 'title', text);
      }
      // Update notice if visible
      if (noticeEl.getAttribute('data-visible') === 'true') {
        setTextIfChanged(noticeEl, getErrorText());
      }
    }

    // Update notice visibility
    if (error === 'reorder_failed') {
      setTextIfChanged(noticeEl, getErrorText());
      setAttributeIfChanged(noticeEl, 'data-visible', 'true');
    } else {
      setAttributeIfChanged(noticeEl, 'data-visible', 'false');
      setTextIfChanged(noticeEl, '');
    }

    // Clean up invalid/detached rows
    for (const [row, { workspaceId, button }] of rowMap) {
      if (!doc.contains(row) || !sessionsTree?.contains(row)
        || row.getAttribute('role') !== 'treeitem'
        || row.getAttribute('data-row-key') !== 'workspace:' + workspaceId) {
        button.remove();
        rowMap.delete(row);
        continue;
      }
      if (!validWorkspaceIds.has(workspaceId)) {
        button.remove();
        rowMap.delete(row);
        continue;
      }

      // Restore button if removed by React
      if (!row.contains(button)) {
        const isPinned = pinnedIds.includes(workspaceId);
        const disabled = busy || phase === 'pending';
        const text = getButtonText(items, workspaceId, isPinned);
        const newButton = createPinButton(workspaceId, isPinned, disabled, text);
        row.appendChild(newButton);
        rowMap.set(row, { workspaceId, button: newButton });
        continue;
      }

      // Update button state
      const isPinned = pinnedIds.includes(workspaceId);
      const disabled = busy || phase === 'pending';
      const text = getButtonText(items, workspaceId, isPinned);

      if (button.getAttribute('aria-pressed') !== (isPinned ? 'true' : 'false')) {
        button.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
      }
      if (button.disabled !== disabled) {
        button.disabled = disabled;
      }
      if (button.getAttribute('aria-label') !== text) {
        button.setAttribute('aria-label', text);
      }
      if (button.getAttribute('title') !== text) {
        button.setAttribute('title', text);
      }
    }

    // Add buttons to new project rows
    if (!sessionsTree) return;

    // Stable semantic row keys support grouped and nested workspace views.
    const projectRows = sessionsTree.querySelectorAll('[role="treeitem"][data-row-key^="workspace:"]');
    for (const projectRow of projectRows) {

      const rowKey = projectRow.getAttribute('data-row-key');
      if (!rowKey || !rowKey.startsWith('workspace:')) continue;
      const workspaceId = rowKey.slice('workspace:'.length);
      if (!workspaceId || !validWorkspaceIds.has(workspaceId)) continue;

      // Skip if already in rowMap
      if (rowMap.has(projectRow)) continue;

      // Create and add button
      const isPinned = pinnedIds.includes(workspaceId);
      const disabled = busy || phase === 'pending';
      const text = getButtonText(items, workspaceId, isPinned);
      const button = createPinButton(workspaceId, isPinned, disabled, text);
      projectRow.appendChild(button);
      rowMap.set(projectRow, { workspaceId, button });
    }

    // Clean up rows that are no longer valid project rows
    for (const [row, { workspaceId, button }] of rowMap) {
      const rowKey = row.getAttribute('data-row-key');
      if (rowKey !== 'workspace:' + workspaceId) {
        button.remove();
        rowMap.delete(row);
      }
    }
  }

  // ------------------------------
  // Observers and subscriptions
  // ------------------------------
  function scheduleScan() {
    if (disposed || scanScheduled) return;
    scanScheduled = true;
    Promise.resolve().then(() => {
      scanScheduled = false;
      if (!disposed) updateUI();
    });
  }
  const unsubscribeController = controller.subscribe(scheduleScan);
  const domObserver = new win.MutationObserver(scheduleScan);
  domObserver.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-row-key', 'aria-label', 'role', 'lang'],
  });
  updateUI();

  // ------------------------------
  // Dispose function
  // ------------------------------
  function dispose() {
    if (disposed) return;
    disposed = true;

    // Disconnect observers
    domObserver.disconnect();

    // Clean up controller
    unsubscribeController();
    controller.dispose();

    // Remove all pin buttons
    for (const [row, { button }] of rowMap) {
      button.remove();
    }
    rowMap.clear();

    // Remove style and notice
    if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    if (noticeEl.parentNode) noticeEl.parentNode.removeChild(noticeEl);

    // Clear runtime reference
    if (win.__dshProjectPinningRuntime__ === runtime) {
      win.__dshProjectPinningRuntime__ = null;
    }
  }

  runtime.dispose = dispose;
  return dispose;
}

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

'use strict';

const PACKAGE_NAME = '@ljwei-stak/dsh-folding-windows';
const STORAGE_KEY = 'dsh-folding-windows:collapsed:v1';
const RUNTIME_KEY = '__dshFoldingWindowsRuntime__';

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
  gap: var(--dsh-sidebar-label-gap, 10px);
  width: 100%;
  min-width: 0;
  min-height: 32px;
  flex: none;
  margin: 0;
  padding: 5px 8px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary, var(--dsh-folding-fg));
  font: inherit;
  font-size: 13px;
  line-height: 22px;
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

/* The control owns the tools heading; the entries behind it are the region. */
nav[aria-label][data-dsh-folding-hidden="true"] > :not(button[data-dsh-folding-control]) {
  display: none !important;
}

button[data-dsh-folding-control][data-dsh-folding-empty="true"],
button[data-dsh-folding-control][data-dsh-folding-column-collapsed="true"] {
  display: none !important;
}
`;

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
      const element = target && target.nodeType === 1 ? target : (target ? target.parentElement : null);
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

  function getNavItemCount(nav, control) {
    let count = 0;
    for (const child of Array.from(nav.children)) {
      if (child !== control) count += 1;
    }
    return count;
  }

  function updateRecord(record, rail) {
    const nav = record.nav;
    const control = record.control;

    record.english = nav.getAttribute('aria-label') === 'Global panels';
    record.count = getNavItemCount(nav, control);
    record.columnCollapsed = rail;

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

    // The heading belongs to the entries it folds, so it lives in the navigation
    // itself; DSH renders that list as a plain flex column.
    mountControl(record);

    return record;
  }

  function mountControl(record) {
    const nav = record.nav;
    const control = record.control;
    if (nav.firstElementChild === control) return;
    if (typeof nav.insertBefore === 'function') {
      nav.insertBefore(control, nav.firstElementChild);
    }
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

  function updateAllStates(rail) {
    for (const record of instances.values()) {
      updateRecord(record, rail);
    }
  }

  function moveFocusOutOfNav(active) {
    if (!active || active.nodeType !== 1) return;

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
    updateAllStates(isSidebarRailMode(doc));
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
      if (!nav.isConnected || !record.control.isConnected || !findSidebarRootForNav(nav)) {
        removeRecord(record);
        instances.delete(nav);
      }
    }

    const rail = isSidebarRailMode(doc);
    for (const nav of findSidebarNavs(doc)) {
      if (!findSidebarRootForNav(nav)) continue;

      let record = instances.get(nav);
      if (!record) {
        record = createRecord(nav);
        instances.set(nav, record);
      } else {
        mountControl(record);
      }

      updateRecord(record, rail);
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

return module.exports;
} });
