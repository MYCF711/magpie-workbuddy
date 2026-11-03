# 架构：共享核心 + 双区独立适配器

## 1. 一个包为什么不是两个包

magpie 的加载器把入口模块里的**每个函数导出**都当成一个插件工厂。于是：

```js
export const WorkBuddyAuthPlugin   = makePlugin(SITES.workbuddy)
export const WorkBuddyAIAuthPlugin = makePlugin(SITES["workbuddy-ai"])
```

产生两张供应商卡、两组 `auth`、两组账号与两份模型列表。把两个地区塞进一个 `auth` 会让登录态互相覆盖；拆成两个 npm 包则共享代码要么复制、要么多一个依赖链。一个包 + 两个显式导出是两者之间的正解。

入口本身只装配，不实现协议：

```
index.mjs
  └─ src/workbuddy/runtime.mjs   makePlugin(SITE) → 完整九钩
       ├─ src/workbuddy/bonus.mjs   限时补偿协议（纯函数 + 注入 fetch）
       └─ src/sites.mjs             两个站点的差异表
```

## 2. 能共享的

| 层 | 模块 | 为什么能共享 |
|---|---|---|
| 认证协议 | OAuth 轮询、刷新、401 重放、单飞锁 | 两区使用同一套 `plugin/auth/*` 与 token 结构 |
| 客户端指纹 | `WorkBuddy/<app> <appName>/<app> CLI/<cli>` | 同一桌面客户端家族，差异只在站点字段 |
| 会话语义 | 会话 / 轮次 / 消息 id、Claude Messages 判断 | 协议级逻辑，与地区无关 |
| 请求改写 | gzip、默认思考档、工具 schema、system prompt 迁移 | 两边都面对同一上游 schema 兼容问题 |
| 目录解析 | `/v3/config` 解析、促销、免费模型、模型命名 | 字段结构相同 |
| 额度 | 套餐、赠送、每日切片、免费窗口账本、企业 meter | 计量模型相同 |
| 错误 | `WBError`、11140 / 14018 / 11153 / 11159 分类 | 上游错误码相同 |
| 测试 | 目录、流式、额度、刷新、工具、消息的回归 | 对两边同时成立 |

共享模块只接收 `site` 参数；账号相关缓存都是模块级表，但键包含 `site.id` 与凭据身份，不会跨区、跨账号串用。每个 `makePlugin(site)` 调用内创建的会话补救 Set / Map 只属于一次插件实例。

## 3. 不能共享的

| 差异 | 国服 `workbuddy` | 国际服 `workbuddy-ai` | 落点 |
|---|---|---|---|
| API host | `copilot.tencent.com` | `www.workbuddy.ai` | `SITES` |
| 登录平台 / 产品码 | `workbuddy` | `workbuddy-ai` | `SITES` |
| UI 显示名 | 腾讯 WorkBuddy | 国际版 WorkBuddy AI | `displayName` |
| 图标 | WorkBuddy 官方应用图标（客户端安装包 256×256 圆角方形） | 同一官方图标（品牌相同） | `icon` |
| Messages 路由 | Claude 系可用 | 无该路由 | `messages` |
| 图片黑名单 | 无 | `glm-*` 不收图 | `noImages` |
| 每日签到 | 有 | 无 | `checkin` |
| 限时补偿 | 有 | 无 | `compensation` |
| 静态模型快照 | 国服 15 条 | 国际 16 条 | `models` |

**共享代码里没有 `if (host.includes(...))`**。新增站点只改 `src/sites.mjs` 与入口一行导出，不改协议核心。

## 4. 状态与隔离

- 账号凭据由 magpie 注入 `getAuth()`；插件不写 `plugin-auth.json`。
- 刷新锁的 key 包含 provider 与 refresh token；两区、两个账号不会共用一次刷新。
- 模型缓存键包含 `uid + enterpriseId + API key`；同一账号的国服与国际服缓存分开。
- system prompt / tool-result / signature 的会话级补救集合存在于 `makePlugin` 闭包内，不再跨站点共享。
- 额度账本只读 magpie 自己的 `usage.jsonl`，按 provider 名与账号过滤，不写它。

## 5. 单包双 Provider 的验收

1. `index.mjs` 只有两个函数导出，均以 `Plugin` 结尾。
2. 两个 `plugin.auth` 是不同对象，`provider` 与 `provider.id` 各自匹配。
3. `config()` 分别只写自己的 `cfg.provider[id]`。
4. 未登录 `config.models` 非空。
5. 两个 provider 都使用 WorkBuddy 官方应用图标（`data:image/png;base64,...`，256×256 圆角方形，取自官方客户端安装包），不是站点 favicon 的圆形 SVG，也不是自制占位图标。
6. `chat.headers` 只标记自己的 provider。
7. `registry-entry.json.providers` 同时列出两个 id。

这些都由 `tests/mount.test.mjs` 与 `tests/multi-provider.test.mjs` 离线锁定。