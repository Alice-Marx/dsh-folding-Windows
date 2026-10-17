import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A small offline replica of DSH's public sidebar markup and flex styles. */
export function fixture({ empty = false, autoInstall = true, pins = false, english = false, tree = false, pending = false, wrap = false } = {}) {
  return `<!doctype html>
<html lang="${english ? 'en' : 'zh-CN'}" data-platform="win32" data-windows-titlebar><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH 侧边栏折叠 · 预览</title>
<style>
:root{font:14px/1.5 system-ui,sans-serif;color:#202329;--dsw-specific-sidebar-fill:#f7f8fa;--dsw-alias-label-primary:#202329;--dsw-alias-label-secondary:#67717e;--dsw-alias-interactive-bg-hover:#e9edf1;--dsw-radius-md:12px;--dsw-focus-ring-width:2px;--dsw-focus-ring-color:#5075da}
*{box-sizing:border-box}body{margin:0;background:#fff}button{font:inherit;cursor:pointer;color:inherit}.frame{display:grid;min-height:100vh}.sidebar-column{background:#f7f8fa;border-right:1px solid #e6e8eb}.sidebar-root{width:280px;display:flex;flex-direction:column;height:100vh;padding:12px;gap:6px}.brand{display:flex;align-items:center;height:52px;font-size:20px;gap:8px;flex:none}.new-session{border:1px solid #dde1e7;background:white;border-radius:12px;padding:9px;margin-bottom:10px;flex:none}.panel-list{display:flex;flex-direction:column;gap:4px;flex:none;margin-bottom:8px}.panel-list button{display:flex;align-items:center;gap:10px;text-align:left;padding:8px;border:0;background:transparent;border-radius:12px;min-height:36px}.panel-list button:hover,.panel-list button[aria-current]{background:#e9edf1}.panel-list svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7}.region{flex:1;min-height:0;display:flex;flex-direction:column;margin-left:-4px;margin-right:-12px;padding-left:4px;overflow:hidden}.workspace-browser{flex:1;min-height:0;display:flex;flex-direction:column;padding-right:12px}.workspace-header{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:4px;height:36px;padding-left:4px;margin:2px -4px 4px 0;overflow:hidden;color:#67717e}.workspace-label{flex:none;max-width:45%;overflow:hidden;white-space:nowrap}.workspace-search{margin-left:auto;display:flex;align-items:center;max-width:28px;overflow:hidden}.workspace-search input{width:0;padding:0;border:0}.workspace-header button{height:28px;width:28px;flex:none;padding:0;border:0;border-radius:8px;background:transparent}.workspace-actions{display:flex}.workspace-list-area{flex:1;min-height:0;overflow:auto}.workspace-tree{display:flex;flex-direction:column;gap:4px}.workspace-group{margin:8px 0 4px;padding:0 8px;color:#78818d;font-size:12px}.session-row{padding:8px;border-radius:8px;cursor:pointer}.session-row:hover,.session-row[aria-selected=true]{background:#e9edf1}.session-row:focus-visible{outline:2px solid #5075da;outline-offset:-2px}.foot-area{flex:none;display:flex;flex-direction:column}.settings{border:0;padding:8px;background:transparent;text-align:left}main{padding:48px;max-width:900px}main h1{font-size:28px;font-weight:600;margin-top:0}main p{color:#67717e}main nav{display:flex;gap:20px;margin-top:28px}main a{color:#4868b5}.preview-hint{margin-top:40px;padding:20px;border:1px solid #e7eaf0;border-radius:16px;background:#fbfcfe}.frame[data-sidebar-collapsed]{grid-template-columns:56px minmax(0px,1fr) 0px!important}.frame[data-sidebar-collapsed] .sidebar-root{width:56px;padding:6px}.frame[data-sidebar-collapsed] .brand,.frame[data-sidebar-collapsed] .new-session,.frame[data-sidebar-collapsed] .panel-list,.frame[data-sidebar-collapsed] .region,.frame[data-sidebar-collapsed] .foot-area{display:none}
</style><style>
.workspace-group-section{margin:4px 0}.workspace-group{display:flex;align-items:center;gap:6px;min-height:34px;margin:0;padding:0 8px;cursor:pointer;font-size:14px;color:#202329;border-radius:8px}.workspace-group:hover{background:#e9edf1}.workspace-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-row-actions{display:flex;align-items:center;flex:none;gap:2px}.project-row-actions button{width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent}.workspace-group-section [role=group]{padding-left:8px}.workspace-group .workspace-title+button{flex:none}
</style></head><body>
<div class="frame" id="frame" style="grid-template-columns:280px minmax(0px,1fr) 0px">
  <div class="sidebar-column"><div class="sidebar-root">
    <div class="brand" data-window-drag>◈ <span>DeepSeek Harness</span></div>
    <button class="new-session" type="button" aria-label="${english ? 'New session' : '新建会话'}">＋ 新会话</button>
    ${empty ? '' : navigation()}
    ${workspace({ english, wrap })}
    <div class="foot-area"><div class="footer-actions"></div><div class="settings-area"><button class="settings" type="button" aria-label="设置">⚙ 设置</button></div></div>
  </div></div>
  <main><h1>侧边栏折叠</h1><p>功能区和工作区可以分别收起、展开，并各自记住状态。</p>
    <div class="preview-hint"><strong>独立预览</strong><p>此页面在本地运行，使用与 DSH 相同的导航语义和 flex 布局。</p><p>当前入口：<span id="opened-panel">尚未选择</span></p></div>
    <nav aria-label="页面目录"><a href="#preview">预览说明</a><a href="#install">安装说明</a></nav>
  </main>
</div>
<script>
window.__ModuleLoader__={load:function(registration){window.foldingPlugin=registration.factory(function(name){throw new Error('Unexpected browser dependency: '+name)})}};
window.clickedPanels=[];
window.clickedSessions=[];
document.addEventListener('click',function(event){const button=event.target.closest('nav[aria-label="全局面板"] button');if(button){window.clickedPanels.push(button.getAttribute('aria-label'));document.getElementById('opened-panel').textContent=button.getAttribute('aria-label')}});
document.addEventListener('click',function(event){const row=event.target.closest('[role="treeitem"][data-session]');if(row){window.clickedSessions.push(row.getAttribute('data-session'))}});
window.installFolding=function(){return window.foldingPlugin.install(document,window)};
</script>
<script src="/client.js"></script>
<script>${pins ? `(${installWorkspaceFixture.toString()})(${JSON.stringify({ english, tree, pending })});` : ''}
${autoInstall ? 'window.disposeFolding=window.installFolding();' : ''}
${pins && autoInstall ? 'window.disposePins=window.installPins();' : ''}</script>
</body></html>`
}

export function navigation() {
  const labels = ['插件', '自动化任务', '任务看板', '技能中心', '模型路由', 'SSH', 'MV 放映室']
  return `<nav class="panel-list" id="global-panels" aria-label="全局面板">${labels.map(label => `<button type="button" aria-label="${label}"><svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="M7 8l3 2-3 2m5 0h2"/></svg><span>${label}</span></button>`).join('')}</nav>`
}

/** SidebarRoot's regionArea seat containing WorkspaceBrowser's header and list. */
export function workspace({ english = false, flat = false, wrap = false } = {}) {
  const title = flat ? (english ? 'Sessions' : '会话') : (english ? 'Workspaces' : '工作区')
  const search = english ? 'Search sessions' : '搜索会话'
  const view = english ? 'View options' : '视图选项'
  const add = english ? 'Add workspace' : '添加工作区'
  // DSH mounts the browser inside slot wrappers; `wrap` reproduces that depth.
  const wrapperOpen = wrap ? '<div class="slot">' : ''
  const wrapperClose = wrap ? '</div>' : ''
  return `<div class="region" id="workspace-region">${wrapperOpen}<div class="workspace-browser">
      <div class="workspace-header"><span class="workspace-label">${title}</span>
        <div class="workspace-search"><button type="button" aria-label="${search}" aria-expanded="false">⌕</button><input type="text" placeholder="${search}" tabindex="-1"></div>
        <div class="workspace-actions"><button type="button" aria-label="${view}">☷</button><button type="button" aria-label="${add}">＋</button></div>
      </div>
      <div class="workspace-list-area"><div class="workspace-tree" role="tree" aria-label="${english ? 'Sessions' : '会话'}">
        ${flat ? '' : '<div class="workspace-group-section" data-fixture-project-id="demo"><div class="workspace-group" role="treeitem" data-row-key="workspace:demo" aria-expanded="true" draggable="true"><span aria-hidden="true">▾</span><span class="workspace-title">DSH 插件开发</span><span class="project-row-actions"><button type="button" aria-label="工作区“DSH 插件开发”的操作">⋯</button><button type="button" aria-label="在“DSH 插件开发”中新建会话">＋</button></span></div><div role="group">'}
        <div class="session-row" role="treeitem" data-row-key="session:today" tabindex="0" aria-selected="true" data-session="today">今天的会话</div>
        <div class="session-row" role="treeitem" data-row-key="session:local" tabindex="-1" aria-selected="false" data-session="local">本地项目</div>
        ${flat ? '' : '</div></div>'}
      </div></div>
    </div>${wrapperClose}</div>`
}

/**
 * A Host-backed workspace projection stand-in. Only this renderer replaces
 * project groups: the plugin must request service reorders instead of moving
 * React-owned DOM nodes. Full redraws also exercise pin button remounts.
 */
function installWorkspaceFixture({ english = false, tree = false, pending = false } = {}) {
  const HOST_KEY = 'dsh-folding-preview:host-workspaces:v1'
  const initialItems = [
    { workspaceId: 'alpha', title: 'DSH 插件开发', path: 'F:/Projects/alpha', sessionIds: ['alpha-session'] },
    { workspaceId: 'beta', title: '文献阅读', path: 'F:/Projects/beta', sessionIds: ['beta-session'] },
    { workspaceId: 'gamma', title: '可视化工具', path: 'F:/Projects/gamma', sessionIds: ['gamma-session'] },
  ].map(item => ({ ...item, createdAt: '2026-10-17T08:00:00.000Z', updatedAt: '2026-10-17T08:00:00.000Z' }))
  let items = initialItems
  try {
    const stored = JSON.parse(localStorage.getItem(HOST_KEY))
    if (Array.isArray(stored) && stored.length && stored.every(item => typeof item.workspaceId === 'string' && Array.isArray(item.sessionIds))) items = stored
  } catch {}
  let phase = pending ? 'pending' : 'ready'
  let snapshot
  let rejectNext = false
  let holdNext = false
  let releaseHeld
  let treeMode = tree
  const listeners = new Set()
  const expanded = new Map()
  const calls = []
  const events = { toggles: [], created: [], renders: 0, movedOwnedNodes: [] }
  const treeElement = document.querySelector('#workspace-region .workspace-tree')

  function persist() {
    try { localStorage.setItem(HOST_KEY, JSON.stringify(items)) } catch {}
  }

  function makeRow(item, depth) {
    const id = item.workspaceId
    const section = document.createElement('div')
    section.className = 'workspace-group-section'
    section.dataset.fixtureProjectId = id
    section.style.setProperty('--dsh-workspace-indent', String(depth * 12) + 'px')
    const header = document.createElement('div')
    header.className = 'workspace-group'
    header.setAttribute('role', 'treeitem')
    header.setAttribute('data-row-key', 'workspace:' + id)
    header.setAttribute('aria-expanded', String(expanded.get(id) !== false))
    header.draggable = true
    const folder = document.createElement('span')
    folder.setAttribute('aria-hidden', 'true')
    folder.textContent = '▾'
    const text = document.createElement('span')
    text.className = 'workspace-title'
    const title = document.createElement('span')
    title.textContent = item.title
    text.append(title)
    const actions = document.createElement('span')
    actions.className = 'project-row-actions'
    const menu = document.createElement('button')
    menu.type = 'button'
    menu.setAttribute('aria-label', english ? 'Workspace actions for ' + item.title : '工作区“' + item.title + '”的操作')
    menu.textContent = '⋯'
    menu.addEventListener('click', event => event.stopPropagation())
    const create = document.createElement('button')
    create.type = 'button'
    create.setAttribute('aria-label', english ? 'New session in ' + item.title : '在“' + item.title + '”中新建会话')
    create.textContent = '＋'
    create.addEventListener('click', event => { event.stopPropagation(); events.created.push(id) })
    actions.append(menu, create)
    header.append(folder, text, actions)
    section.append(header)
    header.addEventListener('click', () => {
      events.toggles.push(id)
      expanded.set(id, expanded.get(id) === false)
      redraw()
    })
    if (expanded.get(id) !== false) {
      if (treeMode && id === 'alpha') {
        const descendants = document.createElement('div')
        descendants.setAttribute('role', 'group')
        for (const child of items.filter(candidate => candidate.workspaceId === 'gamma')) descendants.append(makeRow(child, depth + 1))
        section.append(descendants)
      }
      const sessions = document.createElement('div')
      sessions.setAttribute('role', 'group')
      for (const sessionId of item.sessionIds) {
        const session = document.createElement('div')
        session.className = 'session-row'
        session.setAttribute('role', 'treeitem')
        session.setAttribute('tabindex', '0')
        session.setAttribute('data-row-key', 'session:' + sessionId)
        session.setAttribute('data-session', sessionId)
        session.textContent = english ? 'Session in ' + item.title : item.title + '的会话'
        sessions.append(session)
      }
      section.append(sessions)
    }
    return section
  }

  function redraw() {
    events.renders++
    const roots = treeMode && items.some(item => item.workspaceId === 'alpha')
      ? items.filter(item => item.workspaceId !== 'gamma')
      : items
    const fragment = document.createDocumentFragment()
    for (const item of roots) fragment.append(makeRow(item, 0))
    const ungrouped = document.createElement('div')
    ungrouped.className = 'workspace-group-section'
    ungrouped.innerHTML = '<div class="workspace-group" role="treeitem" data-row-key="workspace:__ungrouped__" aria-expanded="true"><span>'
      + (english ? 'Ungrouped' : '未分组') + '</span></div><div role="group"><div class="session-row" role="treeitem" data-row-key="session:stray" data-session="stray">'
      + (english ? 'Ungrouped session' : '未分组会话') + '</div></div>'
    fragment.append(ungrouped)
    treeElement.replaceChildren(fragment)
  }

  function publish({ save = false, render = true } = {}) {
    snapshot = { items: [...items], phase, state: phase === 'ready' ? 'idle' : 'loading', error: null, pinnedSessionIds: [], archivedSessionIds: [] }
    if (save) persist()
    if (render) redraw()
    for (const listener of [...listeners]) listener()
  }

  window.fakeWorkspaces = {
    list: {
      getSnapshot: () => snapshot,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    },
    async insertBefore(workspaceId, beforeWorkspaceId) {
      calls.push([workspaceId, beforeWorkspaceId ?? null])
      if (!items.some(item => item.workspaceId === workspaceId) || (beforeWorkspaceId !== undefined && !items.some(item => item.workspaceId === beforeWorkspaceId))) throw new Error('Unknown workspace')
      const previous = items
      const source = items.find(item => item.workspaceId === workspaceId)
      const next = items.filter(item => item.workspaceId !== workspaceId)
      const anchor = beforeWorkspaceId === undefined ? next.length : next.findIndex(item => item.workspaceId === beforeWorkspaceId)
      if (workspaceId !== beforeWorkspaceId) {
        next.splice(anchor, 0, source)
        items = next
        publish()
      }
      const fail = rejectNext
      rejectNext = false
      let accepted = !fail
      if (holdNext) {
        holdNext = false
        accepted = (await new Promise(resolve => { releaseHeld = resolve })) && !fail
        releaseHeld = undefined
      } else {
        await Promise.resolve()
      }
      if (!accepted) {
        items = previous
        publish()
        throw new Error('Fixture reorder rejected')
      }
      persist()
    },
  }
  window.workspaceFixture = {
    calls,
    events,
    snapshot: () => snapshot,
    redraw,
    listenerCount: () => listeners.size,
    add(item) {
      const id = item.workspaceId
      items = [{ title: id, path: 'F:/Projects/' + id, sessionIds: [id + '-session'], createdAt: '2026-10-17T08:00:00.000Z', updatedAt: '2026-10-17T08:00:00.000Z', ...item }, ...items.filter(candidate => candidate.workspaceId !== id)]
      publish({ save: true })
    },
    remove(id) { items = items.filter(item => item.workspaceId !== id); publish({ save: true }) },
    rename(id, title) { items = items.map(item => item.workspaceId === id ? { ...item, title } : item); publish({ save: true }) },
    reorder(ids) {
      const byId = new Map(items.map(item => [item.workspaceId, item]))
      items = ids.map(id => byId.get(id)).filter(Boolean)
      publish({ save: true })
    },
    setPhase(nextPhase) { phase = nextPhase; publish({ render: false }) },
    setTree(value) { treeMode = value; redraw() },
    rejectNext() { rejectNext = true },
    holdNext() { holdNext = true },
    releaseNext(ok = true) { if (!releaseHeld) throw new Error('No held API request'); releaseHeld(ok) },
  }
  window.installPins = () => window.foldingPlugin.installProjectPinning(document, window, window.fakeWorkspaces)
  new MutationObserver(records => {
    const removed = new Set()
    const owned = node => node.nodeType === 1 && (node.hasAttribute('data-row-key') || node.hasAttribute('data-fixture-project-id'))
    for (const record of records) {
      for (const node of record.removedNodes) if (owned(node)) removed.add(node)
      for (const node of record.addedNodes) {
        if (owned(node) && removed.has(node)) events.movedOwnedNodes.push(node.getAttribute('data-row-key') || node.getAttribute('data-fixture-project-id'))
      }
    }
  }).observe(treeElement, { childList: true, subtree: true })
  publish()
}

export async function startPreview({ port = 0 } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/client.js') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
        res.end(await readFile(resolve(projectRoot, 'lib/client.js')))
        return
      }
      if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(fixture({
        empty: url.searchParams.has('empty'),
        autoInstall: !url.searchParams.has('no-auto'),
        pins: url.searchParams.has('pins'),
        english: url.searchParams.has('english'),
        tree: url.searchParams.has('tree'),
        pending: url.searchParams.has('pending'),
        wrap: url.searchParams.has('wrap'),
      }))
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`Preview could not load the built client: ${error.message}`)
    }
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolveListen)
  })
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())),
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.argv[2] ?? 4173)
  const preview = await startPreview({ port })
  console.log(`DSH folding preview: ${preview.url}`)
  console.log('Press Ctrl+C to stop.')
}
