# NOTICE

本项目的部分**协议原语、兼容实现与工程模式**来自以下以 MIT 许可发布的项目。完整 MIT 正文见 `LICENSE`。

## magpie-community/plugins

- 仓库：https://github.com/magpie-community/plugins
- 许可：MIT
- 版权：Copyright (c) 2026 magpie-community contributors
- 吸收内容：
  - `packages/workbuddy/index.mjs`（0.2.20，commit `add66fc9543d5e18732b0c8ba3a295e754c3bddd`）：
    WorkBuddy 双 provider 的登录、刷新、会话、模型目录、流式、额度、签到、错误分类实现；
    该包的 29 个测试文件（318 条）原样作为兼容回归导入 `tests/community/`。
  - `packages/codearts`：SSE 折叠与 tool_calls 合并思路（`src/openai-sse.mjs`）。
  - `packages/zen-free`：Chat accumulator、SSE 帧解析与上限（`src/openai-sse.mjs`）。
  - `packages/raccoon`：OAuth loopback 校验、refresh 单飞与短回放（`src/oauth-pkce.mjs`、`src/refresh-lock.mjs`）。

## Betsy20/magpie-Jet-Hub

- 仓库：https://github.com/Betsy20/magpie-Jet-Hub
- 许可：MIT
- 版权：Copyright (c) 2026 dsh-codearts-auth contributors
- 吸收内容：
  - `vendor/lib/buddy.js` / `buddy-oauth.js`：WorkBuddy 认证端点、产品头、登录超时与 scoped/config 双目录并集结论。
  - `vendor/lib/buddy-compensation.js`：限时补偿状态 / 领取端点与「成功响应没有 data」判据。
  - `vendor/lib/buddy-growth.js`：签到 / 成长任务端点参考（未接入盲盒、抽奖、旅行等一次性任务）。
  - 独立改写为 magpie 钩子；没有复制其 Cordis / DSH 服务框架，没有采用其 `CodeBuddyIDE/4.12.2` 客户端指纹，也没有接入其余额选号逻辑。

## WorkBuddy official app icon

- 来源：WorkBuddy 官方 Windows 客户端安装包 `https://download.codebuddy.cn/workbuddy/saas/win32-x64-user/WorkBuddy-win32-x64-user-5.9.3.42398134-d4692421.exe`（2026-11-03 读取），`.rsrc` 里 RT_ICON 组的 256×256 一档，sha256 `f101c1e777dac49e31359f97130d1d34267c175f0e6dda0ee89c057926785758`。
- 用途：仅用于在 magpie 中标识 WorkBuddy 服务，内嵌为 PNG data URI，不修改图形。
- 对照：官网 / 文档站 / 国际站三处 favicon 是同一份 `assets/logo.svg`，其 `rect` 的 `rx="20"`（40 宽的一半）为正圆，放进 magpie 的圆角方框容器会四角留空，故不采用。
- WorkBuddy 名称与图标归腾讯及其关联方所有；本项目不以 MIT 许可再授权该商标素材。

## MYCF711 自有 MIT 插件 / 脚手架

- `magpie-plugin-scaffold` — https://github.com/MYCF711/magpie-plugin-scaffold
  - 目录结构、九钩契约、检查 / 打分 / 发布脚本、错误码规范、测试结构。
- `magpie-magicrew-auth` — https://github.com/MYCF711/magpie-magicrew-auth
  - `src/model-context.mjs` 的递归索引与 TTL 缓存模式。
  - 工具 schema 兼容改写思路与边界（`src/tool-schema.mjs`）。
  - `renewOnce` 按 siteId + account 去重（`src/refresh-lock.mjs`）。
- `magpie-officeace` — 刷新单飞的键控思路（`src/refresh-lock.mjs`）。
- `magpie-trustoken-auth` — PKCE S256 / loopback 回调（`src/oauth-pkce.mjs`）。
- `magpie-loomy-auth` — 挂载测试结构（`tests/mount.test.mjs`）。

以上项目的版权归各自作者所有，按 MIT 许可使用。本项目自身同样以 MIT 许可发布。