# 更新记录

> 每个版本一节，**一条一行**，说用户能感知的变化。
> 格式与规矩见 [UPDATING.md](./UPDATING.md)。

## 0.1.0 — 2026-11-03

**首个完整版本：一个插件，两张供应商卡**

- 新增 `workbuddy`（腾讯 WorkBuddy 国服，`copilot.tencent.com`）与 `workbuddy-ai`（WorkBuddy AI 国际服，`www.workbuddy.ai`），登录态、模型、额度完全隔离。
- 三种登录：WorkBuddy 浏览器登录页轮询、读取桌面客户端登录态、站点 API Key；企业/团队账号自动带企业头。
- 完整兼容 `magpie-community/plugins` 的 WorkBuddy 0.2.20 行为：动态 `/v3/config`、Claude 走 Anthropic Messages、流式 reasoning/tool calls、图片与工具 schema 兼容、细粒度错误、免费模型过滤、免费额度账本、签到与额度卡片。
- 从 Jet Hub 接入增强模型目录：可选合并 `/v2/plugin/model_scoped`，补上 config 尚未收录的模型；config 仍是计费价格的权威来源。
- 国服新增可选的「签到后自动领取限时补偿」，默认关闭；一次性奖励不会在用户不知情时被消耗。
- 双区各自独立图标；新增单包双 Provider 挂载测试、补偿协议测试，并原样引入社区 318 条回归测试。
