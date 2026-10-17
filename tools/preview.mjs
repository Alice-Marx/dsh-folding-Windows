import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A small offline replica of DSH's public sidebar markup and flex styles. */
export function fixture({ empty = false, autoInstall = true } = {}) {
  return `<!doctype html>
<html lang="zh-CN" data-platform="win32" data-windows-titlebar><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH 侧边栏折叠 · 预览</title>
<style>
:root{font:14px/1.5 system-ui,sans-serif;color:#202329;--dsw-specific-sidebar-fill:#f7f8fa;--dsw-alias-label-primary:#202329;--dsw-alias-label-secondary:#67717e;--dsw-alias-interactive-bg-hover:#e9edf1;--dsw-radius-md:12px;--dsw-focus-ring-width:2px;--dsw-focus-ring-color:#5075da}
*{box-sizing:border-box}body{margin:0;background:#fff}button{font:inherit;cursor:pointer;color:inherit}.frame{display:grid;min-height:100vh}.sidebar-column{background:#f7f8fa;border-right:1px solid #e6e8eb}.sidebar-root{width:280px;display:flex;flex-direction:column;height:100vh;padding:12px;gap:6px}.brand{display:flex;align-items:center;height:52px;font-size:20px;gap:8px;flex:none}.new-session{border:1px solid #dde1e7;background:white;border-radius:12px;padding:9px;margin-bottom:10px;flex:none}.panel-list{display:flex;flex-direction:column;gap:4px;flex:none;margin-bottom:8px}.panel-list button{display:flex;align-items:center;gap:10px;text-align:left;padding:8px;border:0;background:transparent;border-radius:12px;min-height:36px}.panel-list button:hover,.panel-list button[aria-current]{background:#e9edf1}.panel-list svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7}.region{flex:1;min-height:0;display:flex;flex-direction:column;margin-left:-4px;margin-right:-12px;padding-left:4px;overflow:hidden}.workspace-browser{flex:1;min-height:0;display:flex;flex-direction:column;padding-right:12px}.workspace-header{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:4px;height:36px;padding-left:4px;margin:2px -4px 4px 0;overflow:hidden;color:#67717e}.workspace-label{flex:none;max-width:45%;overflow:hidden;white-space:nowrap}.workspace-search{margin-left:auto;display:flex;align-items:center;max-width:28px;overflow:hidden}.workspace-search input{width:0;padding:0;border:0}.workspace-header button{height:28px;width:28px;flex:none;padding:0;border:0;border-radius:8px;background:transparent}.workspace-actions{display:flex}.workspace-list-area{flex:1;min-height:0;overflow:auto}.workspace-tree{display:flex;flex-direction:column;gap:4px}.workspace-group{margin:8px 0 4px;padding:0 8px;color:#78818d;font-size:12px}.session-row{padding:8px;border-radius:8px;cursor:pointer}.session-row:hover,.session-row[aria-selected=true]{background:#e9edf1}.session-row:focus-visible{outline:2px solid #5075da;outline-offset:-2px}.foot-area{flex:none;display:flex;flex-direction:column}.settings{border:0;padding:8px;background:transparent;text-align:left}main{padding:48px;max-width:900px}main h1{font-size:28px;font-weight:600;margin-top:0}main p{color:#67717e}main nav{display:flex;gap:20px;margin-top:28px}main a{color:#4868b5}.preview-hint{margin-top:40px;padding:20px;border:1px solid #e7eaf0;border-radius:16px;background:#fbfcfe}.frame[data-sidebar-collapsed]{grid-template-columns:56px minmax(0px,1fr) 0px!important}.frame[data-sidebar-collapsed] .sidebar-root{width:56px;padding:6px}.frame[data-sidebar-collapsed] .brand,.frame[data-sidebar-collapsed] .new-session,.frame[data-sidebar-collapsed] .panel-list,.frame[data-sidebar-collapsed] .region,.frame[data-sidebar-collapsed] .foot-area{display:none}
</style></head><body>
<div class="frame" id="frame" style="grid-template-columns:280px minmax(0px,1fr) 0px">
  <div class="sidebar-column"><div class="sidebar-root">
    <div class="brand" data-window-drag>◈ <span>DeepSeek Harness</span></div>
    <button class="new-session" type="button" aria-label="新建会话">＋ 新会话</button>
    ${empty ? '' : navigation()}
    ${workspace()}
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
<script>${autoInstall ? 'window.disposeFolding=window.installFolding();' : ''}</script>
</body></html>`
}

export function navigation() {
  const labels = ['插件', '自动化任务', '任务看板', '技能中心', '模型路由', 'SSH', 'MV 放映室']
  return `<nav class="panel-list" id="global-panels" aria-label="全局面板">${labels.map(label => `<button type="button" aria-label="${label}"><svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="M7 8l3 2-3 2m5 0h2"/></svg><span>${label}</span></button>`).join('')}</nav>`
}

/** SidebarRoot's regionArea seat containing WorkspaceBrowser's header and list. */
export function workspace({ english = false, flat = false } = {}) {
  const title = flat ? (english ? 'Sessions' : '会话') : (english ? 'Workspaces' : '工作区')
  const search = english ? 'Search sessions' : '搜索会话'
  const view = english ? 'View options' : '视图选项'
  const add = english ? 'Add workspace' : '添加工作区'
  return `<div class="region" id="workspace-region"><div class="workspace-browser">
      <div class="workspace-header"><span class="workspace-label">${title}</span>
        <div class="workspace-search"><button type="button" aria-label="${search}" aria-expanded="false">⌕</button><input type="text" placeholder="${search}" tabindex="-1"></div>
        <div class="workspace-actions"><button type="button" aria-label="${view}">☷</button><button type="button" aria-label="${add}">＋</button></div>
      </div>
      <div class="workspace-list-area"><div class="workspace-tree" role="tree" aria-label="${english ? 'Sessions' : '会话'}">
        ${flat ? '' : '<div class="workspace-group">DSH 插件开发</div>'}
        <div class="session-row" role="treeitem" tabindex="0" aria-selected="true" data-session="today">今天的会话</div>
        <div class="session-row" role="treeitem" tabindex="-1" aria-selected="false" data-session="local">本地项目</div>
      </div></div>
    </div></div>`
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
      res.end(fixture({ empty: url.searchParams.has('empty'), autoInstall: !url.searchParams.has('no-auto') }))
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
