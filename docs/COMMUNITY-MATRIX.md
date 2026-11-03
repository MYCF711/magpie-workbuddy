# 与 magpie-community/plugins 的功能对照

比较基线：`@magpie-community/opencode-workbuddy-auth` **0.2.20**（仓库 commit `add66fc9543d5e18732b0c8ba3a295e754c3bddd`）。

判据只有三条：

- **兼容**：社区已有的行为在本插件中保留，并由原测试锁住。
- **超越**：本插件有、社区 0.2.20 没有，且能指出实现与测试。
- **未接入**：明确没有做的，不写成已支持。

## 1. 兼容矩阵

| 能力 | 社区 0.2.20 | 本插件 | 证据 |
|---|---|---|---|
| 国服 / 国际服双 provider | ✅ | ✅ | 两个入口导出 + 独立 `auth` |
| 浏览器登录（轮询 token/account） | ✅ | ✅ | `runtime.mjs` 登录流程 |
| 桌面客户端登录（只读） | ✅ | ✅ | `desktopHeld` / 桌面文件路径 |
| API Key 登录 | ✅ | ✅ | `keyAccount`、`remoteConfig` |
| 企业 / 团队账号头 | ✅ | ✅ | `enterpriseHeaders` / `enterpriseOf` |
| token 单飞刷新 + 401 重放 + 合并返回 | ✅ | ✅ | `refreshed` / `fresh` / 原刷新测试 |
| `/v3/config` 动态模型目录 | ✅ | ✅ | `liveModels` |
| Claude 走 Anthropic Messages | ✅（仅国服） | ✅（仅国服） | `nativeOf` / `modelOf` |
| 流式 reasoning / tool calls | ✅ | ✅ | SSE / chat 测试 |
| 图片与工具 schema 兼容 | ✅ | ✅ | `fitTools` / `unzip` 测试 |
| `content_filter` 与异常流处理 | ✅ | ✅ | filtered 测试 |
| 免费模型过滤（仅免费模型开关） | ✅ | ✅ | `FREE_ONLY` + 价格 |
| 套餐 / 赠送 / 每日切片额度 | ✅ | ✅ | `usageOf` / `packagesOf` |
| 免费额度账本 | ✅ | ✅ | `freeWindowLedger` |
| 国服每日签到 | ✅ | ✅ | `checkinOf` |
| 国服无签到、国际服无 Messages | ✅ | ✅ | 站点能力开关 |
| 错误分类（11140 / 14018 / 11153 / 11159） | ✅ | ✅ | `explained` / 错误测试 |
| 多语言选项文案 | ✅ | ✅ | `labels` / `descriptions` |

**兼容结论：社区 0.2.20 的全部 318 条测试原样导入并通过。** 运行方式见 `npm run test:community`。

## 2. 超越项

| # | 能力 | 社区 0.2.20 | 本插件 | 判据 |
|---|---|---|---|---|
| 1 | 增强模型目录 | 只读 `/v3/config` | 可选合并 scoped 主目录 `/console/enterprises/personal/models`，兼容 console 数组与嵌套 model；scoped 元数据优先，config 补 id 集合与促销表；config 空列表时自动回退 | `tests/multi-provider.test.mjs` 的 scoped 合并测试 |
| 2 | 国服限时补偿 | 无 | 查询状态 + 可选签到后自动领取；默认关闭，失败不影响签到 | `tests/bonus.test.mjs` + checkin 接线 |
| 3 | 双区图标 | 无独立图标 | 每个 provider 独立内嵌 SVG | mount 测试断言不同且为 `data:image/` |
| 4 | 双区架构隔离 | 单文件闭包 | 显式 `SITES` 适配器 + 共享 core；无 host 分支 | `tests/multi-provider.test.mjs` 静态断言 |
| 5 | 目录双端点 | config 即权威 | scoped 为模型元数据主目录，config 补齐 id 并叠加促销；同 id 不再丢 scoped 的倍率 | scoped 合并测试断言 scoped 的 `rate=0.1`、config-only 的 `a` 保留 |
| 6 | 测试总面 | 318 条 | 318 条兼容回归 + 171 条 Node 契约 / 单元测试 | `npm test` 与 `npm run test:community` |
| 7 | 注册信息完整性 | 单包双 provider | `registry-entry.json.providers` 同时登记两个 id，可直接进市场 | `scripts/check.mjs` registry 校验 |

## 3. 未接入，且有意不接

| 能力 | 原因 |
|---|---|
| 自动领取一次性盲盒 / 抽奖 | 一次性、带不确定性；Jet Hub 同样明确默认不自动执行。本插件只把限时补偿做成显式开关。 |
| 自动领取限时补偿（默认开） | 会消耗用户可能想保留的一次性权益，因此默认关。 |
| 桌面 5.6+ 加密登录态解密 | 加密只能由 WorkBuddy 客户端解开；强行解密不可维护，插件改为明确提示浏览器登录。 |
| API Key 查额度 | WorkBuddy 自身客户端用 key 时也读不到积分；不伪造 0。 |
| 国际服签到 | 上游没有该活动，不是插件遗漏。 |

## 4. 没有夸口的验证边界

- 本环境**没有**真实 WorkBuddy 账号，因此没有声称在线 E2E 通过；验证是离线协议测试、导入的社区真机回归、打包与合规模块。
- 上游接口随时可能变。`README` 的已知限制与错误提示是给排障的，不是保证。