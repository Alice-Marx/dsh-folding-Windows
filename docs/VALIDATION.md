# 验证记录

## 0.3.0

验证日期：2026-10-17。

`npm run build`、`npm run check`、`node --check` 通过。47 项测试全部通过（12 项排序控制器单元测试、15 项项目置顶浏览器测试、20 项侧边栏折叠浏览器测试），零失败、零跳过、零未捕获异常。

新增工作区项目置顶：项目行出现图钉按钮，置顶项目按最近置顶在前排列并始终位于普通项目之前，取消置顶恢复记录的普通顺序。排序通过 DSH 原生 `workspaces.insertBefore(id, beforeId)` 完成，偏好保存在当前浏览器，并与两个区域的折叠状态分别持久化。

对照本机 DSH 0.2.1-rc.2 随包代码核对接口：`workspaces.list.getSnapshot()` / `subscribe()`、`workspaces.insertBefore(id, beforeId)`、项目行的 `data-row-key="workspace:<workspaceId>"` 与会话树 `aria-label="会话"/"Sessions"`，无需改动 DSH 本体。

本轮修复三处排序控制器缺陷：等待中的原生调用期间到达的外部排序被误当成本次操作的结果而覆盖；另一标签页清空偏好时只丢弃图钉、保留并回写已知普通顺序；`dispose` 未能真正解绑 `storage` 监听器（`addEventListener` 返回 undefined）。

已生成并查看 `docs/pinned.png`。测试使用系统 Chrome（`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`）运行官方侧边栏结构夹具，并非完整 DSH 桌面应用的端到端测试。

## 0.2.0

验证日期：2026-10-17。

`npm run build`、`npm run check`、源码语法检查通过。Playwright 与 Chromium 运行 19 项浏览器测试，全部通过，零失败、零跳过。

新增工作区完整区域折叠、两个区域独立持久化、无全局面板时使用工作区开关、工作区延迟出现与重挂、属性及空 ID 恢复、真实窄栏的独立搜索布局、英文和扁平会话视图、跨标签页折叠时的焦点转移。原 11 项功能区检查保留。

已生成并查看功能区展开、收起及工作区收起三张独立预览。测试仍使用与官方结构一致的浏览器夹具，并非完整 DSH 桌面应用的端到端测试。

## 0.1.0

验证日期：2026-10-17。

`npm run build`、`npm run check`、`node --check src/client.js` 通过。

`npm test` 使用 Playwright 与 Chromium 运行 11 项浏览器测试，全部通过，零失败、零跳过、零浏览器未捕获异常。

覆盖真实 `display:flex` 导航的隐藏效果、原入口点击、键盘操作、刷新记忆、入口动态增减与重挂、同名无关导航隔离、整列侧边栏收起、重复安装、卸载恢复、存储不可用、DSH `ctx.effect` 生命周期、中英文及跨标签页焦点转移。

测试夹具依据 DSH 0.2.0-rc.2 / 0.2.1-rc.2 的 `SidebarRoot` 与 `AppFrame` 结构构建，并非完整 DSH 桌面应用的端到端测试。插件未安装到用户正在使用的配置中。

已查看 `folded.png` 与 `expanded.png` 两张浏览器截图。