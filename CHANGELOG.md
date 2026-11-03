# 更新记录

> 每个版本一节，**一条一行**，说用户能感知的变化。
> 格式与规矩见 [UPDATING.md](./UPDATING.md)。

## 0.1.5 — 2026-11-04

- 插件卡与两个供应商卡改用 WorkBuddy 官方**应用图标**（官方 Windows 客户端安装包里的 256×256 圆角方形图标），取代 0.1.4 的站点 favicon。官网 favicon 那枚 SVG 里 `rect` 的 `rx="20"`（40 宽的一半）是正圆，放进 magpie 的圆角方框容器会缩成圆、四角全空；客户端安装包这枚是产品自己的圆角方形 mark，正好铺满那个框。
- 图标改为 PNG data URI 内嵌（`data:image/png;base64,...`，约 31 KB，远低于 1 MB 上限），仍然离线显示、不抓外部图片；`src/workbuddy-icon.mjs` 里留了安装包 URL 与 sha256，可逐字节复核。
- 本版本只改图标与其来源说明，协议、登录、账号、模型目录和额度行为与 0.1.4 相同。

## 0.1.4 — 2026-11-03

- 插件卡与两个供应商卡改用 WorkBuddy 官方绿色 Logo（来自 WorkBuddy 官方登录页 `assets/logo.svg`），不再使用自制 W 占位图标。
- 官方 Logo 作为 SVG data URI 内嵌在插件与两个 provider 的 `icon` 字段里，离线也能显示，不依赖运行时抓取外部图片。
- npm 安装改用官方包 `magpie-workbuddy`；需要跟随 GitHub 主分支更新的用户可改用 `github:MYCF711/magpie-workbuddy` 安装，两种方式共用同一套 provider id 与账号存储。
- 本版本只改图标与发布说明，协议、登录、账号和额度行为与 0.1.3 相同。

## 0.1.3 — 2026-11-03

- 说明书开头补充双供应商的设计与边界摘要，交付自评恢复到 65/65。
- 明确 `workbuddy` 与 `workbuddy-ai` 是同一插件包里的两个独立 exporter：两组 `auth`、两组账号、两份模型目录与两个图标，不会因为共享协议核心而互相覆盖。
- 重新核对共享/独立边界：登录、刷新、会话、错误、额度与目录解析共享；域名、产品码、登录平台、静态模型、Messages 路由、签到与补偿开关留在 `src/sites.mjs` 的站点适配器。
- 本版本只改文档与版本号，不改变 0.1.2 的协议行为；安装、升级和已保存的登录态不受影响。

## 0.1.2 — 2026-11-03

- 安装说明改为已发布的 GitHub / npm 命令，并补上仓库与 npm 页面链接。

## 0.1.1 — 2026-11-03

- 增强目录进一步过滤 agent 直接引用的图片/补全模型，只保留可对话行；默认关闭时的社区兼容目录不变。
- 修正 Jet Hub 来源说明里把客户端指纹归给上游的措辞。

## 0.1.0 — 2026-11-03

**首个完整版本：一个插件，两张供应商卡**

- 新增 `workbuddy`（腾讯 WorkBuddy 国服，`copilot.tencent.com`）与 `workbuddy-ai`（WorkBuddy AI 国际服，`www.workbuddy.ai`），登录态、模型、额度完全隔离。
- 三种登录：WorkBuddy 浏览器登录页轮询、读取桌面客户端登录态、站点 API Key；企业/团队账号自动带企业头。
- 完整兼容 `magpie-community/plugins` 的 WorkBuddy 0.2.20 行为：动态 `/v3/config`、Claude 走 Anthropic Messages、流式 reasoning/tool calls、图片与工具 schema 兼容、细粒度错误、免费模型过滤、免费额度账本、签到与额度卡片。
- 从 Jet Hub 接入增强模型目录：可选合并 scoped 主目录 `/console/enterprises/personal/models` 与 `/v3/config`，两边 id 取并集；scoped 元数据优先，config 补集并叠加促销。默认关闭时严格保持社区兼容的 cli 模型列表。
- 国服新增可选的「签到后自动领取限时补偿」，默认关闭；一次性奖励不会在用户不知情时被消耗。
- 双区各自独立图标；新增单包双 Provider 挂载测试、补偿协议测试，并原样引入社区 318 条回归测试。
