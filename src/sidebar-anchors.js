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
