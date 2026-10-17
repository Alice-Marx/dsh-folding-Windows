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
<title>DSH 功能区折叠 · 预览</title>
<style>
:root{font:14px/1.5 system-ui,sans-serif;color:#202329;--dsw-specific-sidebar-fill:#f7f8fa;--dsw-alias-label-primary:#202329;--dsw-alias-label-secondary:#67717e;--dsw-alias-interactive-bg-hover:#e9edf1;--dsw-radius-md:12px;--dsw-focus-ring-width:2px;--dsw-focus-ring-color:#5075da}
*{box-sizing:border-box}body{margin:0;background:#fff}button{font:inherit;cursor:pointer;color:inherit}.frame{display:grid;min-height:100vh}.sidebar-column{background:#f7f8fa;border-right:1px solid #e6e8eb}.sidebar-root{width:280px;display:flex;flex-direction:column;height:100vh;padding:12px;gap:6px}.brand{display:flex;align-items:center;height:52px;font-size:20px;gap:8px}.new-session{border:1px solid #dde1e7;background:white;border-radius:12px;padding:9px;margin-bottom:10px}.panel-list{display:flex;flex-direction:column;gap:4px;flex:none;margin-bottom:8px}.panel-list button{display:flex;align-items:center;gap:10px;text-align:left;padding:8px;border:0;background:transparent;border-radius:12px;min-height:36px}.panel-list button:hover,.panel-list button[aria-current]{background:#e9edf1}.panel-list svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7}.region{flex:1;min-height:180px;border-top:1px solid #eceef1;padding:16px 8px}.region p{margin:12px 0;color:#78818d}.settings{border:0;padding:8px;background:transparent;text-align:left}main{padding:48px;max-width:900px}main h1{font-size:28px;font-weight:600;margin-top:0}main p{color:#67717e}main nav{display:flex;gap:20px;margin-top:28px}main a{color:#4868b5}.preview-hint{margin-top:40px;padding:20px;border:1px solid #e7eaf0;border-radius:16px;background:#fbfcfe}.frame[data-sidebar-collapsed]{grid-template-columns:56px minmax(0px,1fr) 0px!important}.frame[data-sidebar-collapsed] .sidebar-root{width:56px;padding:6px}.frame[data-sidebar-collapsed] .brand,.frame[data-sidebar-collapsed] .new-session,.frame[data-sidebar-collapsed] .panel-list,.frame[data-sidebar-collapsed] .region,.frame[data-sidebar-collapsed] .settings{display:none}
</style></head><body>
<div class="frame" id="frame" style="grid-template-columns:280px minmax(0px,1fr) 0px">
  <div class="sidebar-column"><div class="sidebar-root">
    <div class="brand" data-window-drag>◈ <span>DeepSeek Harness</span></div>
    <button class="new-session" type="button" aria-label="新建会话">＋ 新会话</button>
    ${empty ? '' : navigation()}
    <div class="region"><strong>工作区</strong><p>DSH 插件开发</p><p>今天的会话</p><p>本地项目</p></div>
    <button class="settings" type="button" aria-label="设置">⚙ 设置</button>
  </div></div>
  <main><h1>功能区折叠</h1><p>点击左侧功能区标题，可以收起或展开插件、自动化任务、SSH 等入口。</p>
    <div class="preview-hint"><strong>独立预览</strong><p>此页面在本地运行，使用与 DSH 相同的导航语义和 flex 布局。</p><p>当前入口：<span id="opened-panel">尚未选择</span></p></div>
    <nav aria-label="页面目录"><a href="#preview">预览说明</a><a href="#install">安装说明</a></nav>
  </main>
</div>
<script>
window.__ModuleLoader__={load:function(registration){window.foldingPlugin=registration.factory(function(name){throw new Error('Unexpected browser dependency: '+name)})}};
window.clickedPanels=[];
document.addEventListener('click',function(event){const button=event.target.closest('nav[aria-label="全局面板"] button');if(button){window.clickedPanels.push(button.getAttribute('aria-label'));document.getElementById('opened-panel').textContent=button.getAttribute('aria-label')}});
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
