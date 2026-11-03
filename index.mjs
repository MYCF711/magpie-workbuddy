// WorkBuddy 国服 / 国际服 —— 一个 magpie 插件包，两个独立供应商。
//
// magpie 把入口里的每个具名函数导出当成一个插件实例：
//   WorkBuddyAuthPlugin   → workbuddy     (copilot.tencent.com)
//   WorkBuddyAIAuthPlugin → workbuddy-ai  (www.workbuddy.ai)
//
// 两区共享协议、解析、额度、缓存与错误分类；端点、客户端指纹、登录平台、
// 模型快照、Messages 路由与签到能力由 src/sites.mjs 的独立适配器提供。

import { makePlugin, SITES } from "./src/workbuddy/runtime.mjs"

export const WorkBuddyAuthPlugin = makePlugin(SITES.workbuddy)
export const WorkBuddyAIAuthPlugin = makePlugin(SITES["workbuddy-ai"])

export const _internal = Object.freeze({
  SITES,
  makePlugin,
  providers: Object.freeze(Object.keys(SITES)),
})
