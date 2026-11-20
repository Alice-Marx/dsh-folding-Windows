# 验证记录

## 0.3.2

验证日期：2026-11-20。

修复升级到 DSH `0.2.2-rc.5` 后插件完全失效的问题。根因是侧边栏结构变化：0.2.2 把「新建会话」行、功能区导航和工作区浏览器拆进不同层级，根节点是 `节点 > 滚动区网格 > (nav[全局面板], 工作区座位 > 浏览器)`，并且整栏折叠状态改由 AppFrame 的 `data-sidebar-collapsed` 表达。旧实现要求「nav 的直接父节点同时含新建会话按钮与工作区座位」，于是功能区折叠、工作区折叠和项目置顶三处定位同时落空，界面表现为插件毫无作用。

现在新增 `src/sidebar-anchors.js` 作为唯一的侧边栏 DOM 契约：只用 DSH 自己的语义（`data-sidebar-toggle`、`data-sidebar-collapsed`、`全局面板/新建会话/搜索会话/会话` 标签）定位根节点、功能区导航、工作区座位与浏览器，并用「祖辈不能再含第二个同类种子」排除页面其他位置的同名导航或浏览器。功能区开关成为功能区列表首行，工作区开关成为工作区浏览器前一行；折叠改为隐藏导航其余子节点、隐藏浏览器本身，不再隐藏容器。

验证：`npm run build`、`npm run check`、`npm test` 通过；48 项测试全绿（12 项排序控制器单元测试、16 项项目置顶浏览器测试、20 项侧边栏折叠浏览器测试），零失败、零跳过、零未捕获异常。浏览器夹具改为 0.2.2-rc.5 结构（logo 行 + `data-sidebar-toggle`、新建会话行、`scroll-area` 网格、`region-area` 座位、`panel-entry` 行），并保留 `?wrap=1` 槽位包裹层与 `?empty=1` 无功能区的回归场景。

对照本机 DSH `0.2.2-rc.5` 随包源码核对：`SidebarRoot.tsx`（nav 与 `regionArea` 分列滚动网格两行、面板行包在 `panelEntry` 内）、`AppFrame.tsx`（`data-sidebar-collapsed` 只在折叠时出现）、`WorkspaceBrowser.tsx` / `Rows.tsx`（会话树 `aria-label` 为「会话」、项目行 `data-row-key="workspace:<id>"` 不变）、`api-workspace-controller`（`list.getSnapshot()` / `subscribe()` 与 `insertBefore(id, beforeId?)` 签名不变）；并在随包客户端产物中确认上述标记确实被打包。已重新生成 `docs/folded.png`、`docs/expanded.png`、`docs/workspaces-folded.png`、`docs/pinned.png` 并逐一查看：折叠后功能区只剩标题行、工作区只剩标题行、设置仍在底部。

仍未覆盖：本轮未在真实 DSH 窗口中做端到端点击（桌面应用 Web 端口需要鉴权，无法自动驱动），行为验证来自与随包源码逐处对照的结构夹具。

## 0.3.1

验证日期：2026-10-17。

修复工作区折叠在真实 DSH 里根本不出现的问题。DSH 把 WorkspaceBrowser 挂在槽位包裹层内（`regionArea` → 包裹层 → 浏览器根节点），原实现要求"浏览器直接子节点里同时有搜索头和列表"，于是真实界面里一个座位都匹配不到；功能区折叠和项目置顶走的是别的路径，所以症状只是"没有工作区开关"。

现在改用结构证据判定座位：座位内同时有搜索按钮和会话树即可，浏览器自身的层级不再参与判断。

验证：`npm run build`、`npm run check` 通过；48 项测试全绿（新增 1 项槽位包裹层回归测试，预览夹具新增 `?wrap=1` 复现真实层级）。另用隔离的 DSH_HOME 启动独立 web 实例并装入本版本，用 Chrome 实测真实 DOM：`工作区▾` 开关出现，点击后 `regionArea` 计算样式为 `none` 且写入 `dsh-folding-windows:workspaces-collapsed:v1`，再次点击恢复，零未捕获异常，功能区开关与新建会话按钮不受影响。

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