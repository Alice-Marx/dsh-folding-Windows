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

  function getListArea() {
    currentSearchButton = null;
    // Structural checks match SidebarRoot without relying on CSS-module names.
    for (const newSessionBtn of doc.querySelectorAll('button[aria-label="新建会话"], button[aria-label="New session"]')) {
      const sidebarRoot = newSessionBtn.parentElement;
      const sidebarColumn = sidebarRoot?.parentElement;
      if (!sidebarRoot || sidebarRoot.tagName !== 'DIV' || sidebarColumn?.tagName !== 'DIV'
        || sidebarColumn.parentElement?.firstElementChild !== sidebarColumn) continue;
      for (const regionArea of sidebarRoot.children) {
        if (regionArea.tagName !== 'DIV') continue;
        for (const wsBrowser of regionArea.children) {
          if (wsBrowser.tagName !== 'DIV') continue;
          const searchBtn = wsBrowser.querySelector('button[aria-label="搜索会话"], button[aria-label="Search sessions"]');
          if (!searchBtn) continue;
          const listArea = Array.from(wsBrowser.children).find(child => child.querySelector('[role="tree"][aria-label="会话"], [role="tree"][aria-label="Sessions"]'));
          if (!listArea) continue;
          currentSearchButton = searchBtn;
          // A separate owned flex child avoids the search pill's clipping.
          if (noticeEl.parentElement !== wsBrowser) wsBrowser.insertBefore(noticeEl, listArea);
          return listArea;
        }
      }
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
    const listArea = getListArea();
    const sessionsTree = listArea?.querySelector('[role="tree"][aria-label="会话"], [role="tree"][aria-label="Sessions"]');
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
