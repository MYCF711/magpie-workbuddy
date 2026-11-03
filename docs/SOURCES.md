# 协议来源与版本

## 1. magpie-community/plugins · packages/workbuddy

- 仓库：<https://github.com/magpie-community/plugins/tree/main/packages/workbuddy>
- 版本：`0.2.20`，commit `add66fc9543d5e18732b0c8ba3a295e754c3bddd`（2026-11-03 读取）
- 许可：MIT，Copyright (c) 2026 magpie-community contributors

本项目的 `src/workbuddy/runtime.mjs` 以该包的 `index.mjs` 为兼容基线，保留其双 provider、登录、目录、协议、额度、签到与错误处理实现；`tests/community/` 原样导入其 29 个测试文件（318 条）。

关键结构（以导入时文件为准）：

| 能力 | 原文件位置 |
|---|---|
| 站点常量 / 静态模型 | `index.mjs` 顶部 `SITES`、`CN_MODELS`、`AI_MODELS` |
| API 调用与错误 | `index.mjs` `call` / `WBError` / `explained` |
| 登录与刷新 | `index.mjs` `browserSignIn` / `fresh` / `refreshed` |
| 客户端头 | `index.mjs` `sign` / `chatHeaders` / `cliAgent` |
| Messages 分流 | `index.mjs` `nativeOf` / `modelOf` |
| 动态目录 | `index.mjs` `liveModels` / `priceOf` |
| 额度与免费窗口 | `index.mjs` `usageOf` / `freeWindowLedger` |
| 签到 | `index.mjs` `checkinOf` |
| 错误码与提示 | `index.mjs` `REFUSED` / `RESTRICTED_CODE` / `EXHAUSTED` |

## 2. Betsy20/magpie-Jet-Hub

- 仓库：<https://github.com/Betsy20/magpie-Jet-Hub>
- 许可：MIT，Copyright (c) 2026 dsh-codearts-auth contributors
- 读取版本：`main`，2026-11-03

本项目使用了其中的**协议结论与产品头**，并独立实现为 magpie 钩子：

| 来源文件 | 用途 |
|---|---|
| `vendor/lib/buddy.js` | 认证路径、产品头、登录超时、配置解析 |
| `vendor/lib/buddy-oauth.js` | external-link-v2 轮询登录、refresh、scoped/config 双目录并集结论 |
| `vendor/lib/buddy-compensation.js` | `/billing/meter/compensation-status` 与 `/billing/meter/claim-compensation` 的端点、成功判据、活动字段 |
| `vendor/lib/buddy-growth.js` | 签到 / 任务生态参考（本插件只接安全的每日签到；一次性奖励默认不自动执行） |

Jet Hub 是 DSH / Cordis 侧插件，依赖其服务与凭据层；本项目没有复制其服务框架，也没有接入其余额选号、盲盒、抽奖或成长任务。客户端请求头沿用社区 WorkBuddy 的 `WorkBuddy/<app> <appName>/<app> CLI/<cli>` 指纹，Jet Hub 的 `CodeBuddyIDE/4.12.2` 未被采用。

## 3. MYCF711/magpie-plugin-scaffold

- 仓库：<https://github.com/MYCF711/magpie-plugin-scaffold>
- 版本：`0.3.7`，commit `ab66e8f74b5954df8b598b07246f963bd1121d27`
- 用途：目录结构、九钩契约、合规检查、错误码规范、测试与打包脚本

## 4. 官方来源

- magpie 插件文档：<https://usemagpie.ai/docs/zh/plugins>
- WorkBuddy 登录页与桌面客户端协议：通过 WorkBuddy / CodeBuddy 客户端与站点公开接口观测；具体端点见 `src/workbuddy/runtime.mjs` 常量与注释。
- WorkBuddy API 前缀：国服 `https://copilot.tencent.com/v2`，国际服 `https://www.workbuddy.ai/v2`。
- WorkBuddy 官方图标：官方 Windows 客户端安装包 `https://download.codebuddy.cn/workbuddy/saas/win32-x64-user/WorkBuddy-win32-x64-user-5.9.3.42398134-d4692421.exe` 里 `.rsrc` 的 RT_ICON 组最大一档（256×256 PNG，sha256 `f101c1e7…85758`）；内嵌为 `src/workbuddy-icon.mjs`，商标归腾讯所有。站点 favicon（`assets/logo.svg`）是 `rx="20"` 的正圆，不适合 magpie 的圆角方框容器，只作对照记录。

## 5. 版本基线

| 项 | 值 |
|---|---|
| 本插件 | `0.1.0` |
| 脚手架 | `0.3.7` |
| 社区 WorkBuddy | `0.2.20` |
| Node | `^22.19.0 || >=24.0.0` |
| 运行时 | magpie 自带 Bun；测试 Node 24 / Bun 1.4.4 |

---

以上第三方代码与协议结论均按 MIT 使用；归属全文见 [NOTICE.md](../NOTICE.md)。