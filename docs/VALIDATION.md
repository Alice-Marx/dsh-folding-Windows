# 0.1.0 验证记录

验证日期：2026-10-17。

`npm run build`、`npm run check`、`node --check src/client.js` 通过。

`npm test` 使用 Playwright 与 Chromium 运行 11 项浏览器测试，全部通过，零失败、零跳过、零浏览器未捕获异常。

覆盖真实 `display:flex` 导航的隐藏效果、原入口点击、键盘操作、刷新记忆、入口动态增减与重挂、同名无关导航隔离、整列侧边栏收起、重复安装、卸载恢复、存储不可用、DSH `ctx.effect` 生命周期、中英文及跨标签页焦点转移。

测试夹具依据 DSH 0.2.0-rc.2 / 0.2.1-rc.2 的 `SidebarRoot` 与 `AppFrame` 结构构建，并非完整 DSH 桌面应用的端到端测试。插件未安装到用户正在使用的配置中。

已查看 `folded.png` 与 `expanded.png` 两张浏览器截图。
