// 通用兼容上下文 —— 只给 src/ 下的共享工具模块使用。
//
// 真正的双 Provider 装配在 index.mjs 与 src/workbuddy/runtime.mjs。
// 这里使用国服作为默认值，避免旧的通用模块出现 example 占位符；
// 任何地区差异必须以传入的站点适配器为准，不能从这个单例读取。

import { SITES, PLUGIN_ICON } from "./sites.mjs"

export const PROVIDER = "workbuddy"
export const PROVIDER_NAME = SITES.workbuddy.displayName
export const BASE = "https://copilot.tencent.com/v2"
export const SDK = "@ai-sdk/openai-compatible"
export const REFRESH_LEAD_MS = 5 * 60_000
export const ICON = PLUGIN_ICON

/** 国服静态模型元组；仅在通用工具需要兜底时使用。 */
export const MODELS = SITES.workbuddy.models

export function staticModels() {
  const out = {}
  for (const [id, name, context, efforts] of MODELS) {
    const image = !/^glm-5v/i.test(id)
    out[id] = {
      id,
      name,
      api: { id, url: BASE, npm: SDK },
      status: "active",
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context, output: 64_000 },
      modalities: { input: image ? ["text", "image"] : ["text"], output: ["text"] },
      capabilities: {
        temperature: true,
        reasoning: Array.isArray(efforts) && efforts.length > 0,
        toolcall: true,
        attachment: image,
        input: { text: true, image, audio: false, video: false, pdf: false },
        output: { text: true, image: false, audio: false, video: false, pdf: false },
      },
      ...(efforts?.length ? { variants: Object.fromEntries(efforts.map((e) => [e, {}])) } : {}),
    }
  }
  return out
}

export const ctx = { PROVIDER, PROVIDER_NAME, BASE, SDK, ICON, REFRESH_LEAD_MS, MODELS, staticModels }
