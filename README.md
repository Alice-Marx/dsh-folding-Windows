# dsh-folding-Windows

让 DeepSeek Harness（DSH）侧边栏的功能入口可以整组收起，给项目和会话列表腾出空间。

![默认收起后的独立预览](https://raw.githubusercontent.com/Alice-Marx/dsh-folding-Windows/main/docs/folded.png)

[查看展开效果](https://raw.githubusercontent.com/Alice-Marx/dsh-folding-Windows/main/docs/expanded.png)

## 安装

在 DSH 的「插件」页面添加 npm 包：

```text
@ljwei-stak/dsh-folding-windows
```

也可以使用官方命令行：

```sh
dsh plugin add @ljwei-stak/dsh-folding-windows
```

安装并启用后刷新 DSH 界面。插件基于 DSH 0.2.0-rc.2 / 0.2.1-rc.2 的侧边栏结构实现，适用于 Windows 桌面端和相同界面的 Web 端。

## 使用

- 新增「功能区」按钮，点击即可展开或收起插件、自动化任务、任务看板、技能中心、模型路由、SSH、MV 放映室等入口。
- 首次使用默认收起；展开状态保存在当前浏览器配置中，刷新后保留。
- 新增或卸载其他插件时，功能入口数量自动更新。
- 支持 Tab 聚焦及 Enter / 空格操作；收起的入口不会进入 Tab 顺序。
- 收起整个侧边栏后，功能区开关随之隐藏；重新打开侧边栏时恢复原状态。
- 支持中文、英文以及 DSH 的深浅色主题。

禁用或卸载本插件并刷新后，原来的功能入口恢复显示。存储不可用时仍可折叠，但刷新后回到默认状态。

## 开发与验证

无需运行时依赖，不修改 DSH 本体文件，不发送网络请求。通过官方客户端插件入口加载，使用语义标签识别「全局面板 / Global panels」，保留 DSH 原有导航节点和点击行为。DSH 如果调整这些标签或结构，插件会停止增强，需适配后才能继续折叠。

```sh
npm ci
npx playwright install chromium
npm run build
npm run check
npm test
npm run preview
```

浏览器测试使用与官方侧边栏结构一致的夹具，覆盖折叠、展开、刷新记忆、动态入口、重挂、重复启用及卸载恢复。预览页面仅用于演示和测试，不是完整 DSH 应用。

源码位于 `src/client.js`。构建只将源码包装为 DSH 要求的 `window.__ModuleLoader__.load({ id, factory })` 模块，产物为 `lib/client.js`。

## 许可

MIT
