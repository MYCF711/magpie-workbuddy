import test from "node:test"
import assert from "node:assert/strict"

import * as entry from "../index.mjs"
import { SITES } from "../src/sites.mjs"
import { _internal } from "../src/workbuddy/runtime.mjs"

test("入口只导出两个插件工厂和测试对象", () => {
  const functions = Object.entries(entry)
    .filter(([, value]) => typeof value === "function")
    .map(([key]) => key)
    .sort()
  assert.deepEqual(functions, ["WorkBuddyAIAuthPlugin", "WorkBuddyAuthPlugin"])
  assert.equal(typeof entry._internal, "object")
  assert.deepEqual(entry._internal.providers, ["workbuddy", "workbuddy-ai"])
})

test("两个插件各自只注册自己的 provider、图标和模型", async () => {
  const cn = await entry.WorkBuddyAuthPlugin({ client: {} })
  const ai = await entry.WorkBuddyAIAuthPlugin({ client: {} })
  assert.equal(cn.auth.provider, "workbuddy")
  assert.equal(ai.auth.provider, "workbuddy-ai")
  assert.notEqual(cn.auth, ai.auth)
  assert.notEqual(cn.auth.icon, ai.auth.icon)
  assert.match(cn.auth.icon, /^data:image\//)
  assert.match(ai.auth.icon, /^data:image\//)

  const cfg = { provider: {} }
  await cn.config(cfg)
  await ai.config(cfg)
  assert.deepEqual(Object.keys(cfg.provider).sort(), ["workbuddy", "workbuddy-ai"])
  assert.ok(Object.keys(cfg.provider.workbuddy.models).length > 10)
  assert.ok(Object.keys(cfg.provider["workbuddy-ai"].models).length > 10)
  assert.equal(cfg.provider.workbuddy.api, "https://copilot.tencent.com/v2")
  assert.equal(cfg.provider["workbuddy-ai"].api, "https://www.workbuddy.ai/v2")
})

test("两区共享协议，只把差异留在站点适配器", async () => {
  assert.equal(typeof _internal.makePlugin, "function")
  assert.equal(typeof _internal.liveModels, "function")
  assert.equal(SITES.workbuddy.messages, true)
  assert.equal(SITES["workbuddy-ai"].messages, false)
  assert.equal(SITES.workbuddy.compensation, true)
  assert.equal(SITES["workbuddy-ai"].compensation, false)
  // No hostname branching inside the shared runtime.
  const fs = await import("node:fs/promises")
  const runtime = await fs.readFile(new URL("../src/workbuddy/runtime.mjs", import.meta.url), "utf8")
  assert.doesNotMatch(runtime, /host(?:name)?\.includes\(|endpoint\.includes\(/)
})

test("国服声明自动补偿选项，国际服不声明", async () => {
  const cn = await entry.WorkBuddyAuthPlugin({ client: {} })
  const ai = await entry.WorkBuddyAIAuthPlugin({ client: {} })
  const keys = (p) => p.auth.options.map((o) => o.key)
  assert.ok(keys(cn).includes(_internal.AUTO_COMPENSATION))
  assert.ok(!keys(ai).includes(_internal.AUTO_COMPENSATION))
  assert.ok(keys(cn).includes(_internal.EXTENDED_CATALOG))
  assert.ok(keys(ai).includes(_internal.EXTENDED_CATALOG))
})

test("chat.headers 只标记自己的 provider", async () => {
  const cn = await entry.WorkBuddyAuthPlugin({ client: {} })
  const ai = await entry.WorkBuddyAIAuthPlugin({ client: {} })
  const mine = { headers: {} }
  await cn["chat.headers"]({ model: { providerID: "workbuddy" }, sessionID: "s1" }, mine)
  assert.equal(mine.headers[_internal.SESSION], "s1")
  const other = { headers: {} }
  await ai["chat.headers"]({ model: { providerID: "workbuddy" }, sessionID: "s1" }, other)
  assert.deepEqual(other.headers, {})
})

test("增强目录以 scoped 为主目录、config 补集并供促销", async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).endsWith("/v3/config")) {
      return Response.json({
        code: 0,
        data: {
          agents: [{ name: "cli", models: ["a", "shared"] }],
          models: [
            { id: "a", name: "A", maxInputTokens: 1000, credits: "2" },
            { id: "shared", name: "Shared old", maxInputTokens: 2000, credits: "1.5" },
          ],
          modelPromotions: [],
        },
      })
    }
    if (String(url).endsWith(SITES.workbuddy.scopedPath)) {
      // Console shape: data is an array, entries may nest the model.
      return Response.json({
        code: 0,
        data: [
          { model: { id: "shared", name: "Shared new", maxInputTokens: 3000, credits: "0.1" } },
          { model: { id: "b", name: "B", maxInputTokens: 4000, credits: "0" } },
        ],
      })
    }
    return new Response("unexpected", { status: 500 })
  }
  try {
    const list = await _internal.liveModels(
      SITES.workbuddy,
      { access: "tok", uid: "u1", domain: "www.workbuddy.cn", source: "oauth" },
      { scoped: true },
    )
    // Scoped is primary: its order first, then config-only ids.
    assert.deepEqual(list.map((m) => m.id), ["shared", "b", "a"])
    const shared = list.find((m) => m.id === "shared")
    assert.equal(shared.name, "Shared new")
    assert.equal(shared.context, 3000)
    assert.equal(shared.rate, 0.1, "scoped 是该端点的主目录，其元数据优先")
    assert.equal(list.find((m) => m.id === "b").free, true)
    assert.equal(calls.some((u) => u.endsWith(SITES.workbuddy.scopedPath)), true)
  } finally {
    globalThis.fetch = original
  }
})

test("scopedModelsOf 兼容 config、console 数组与嵌套 model，并拒绝无 id 项", () => {
  assert.deepEqual(_internal.scopedModelsOf({ models: [{ id: "a" }, { name: "no id" }] }).map((m) => m.id), ["a"])
  assert.deepEqual(
    _internal.scopedModelsOf({ data: [{ model: { id: "b" } }, { id: "c" }, null] }).map((m) => m.id),
    ["b", "c"],
  )
  assert.deepEqual(_internal.scopedModelsOf([{ id: "d" }]).map((m) => m.id), ["d"])
  assert.deepEqual(_internal.scopedModelsOf({ unexpected: true }), [])
})

test("增强目录的过滤规则：别名、补全、生成图、过小输出都不入聊天列表", () => {
  const ok = { id: "glm-5.3", maxOutputTokens: 32_000 }
  assert.equal(_internal.isChatLike(ok), true)
  assert.equal(_internal.isChatLike({ id: "auto" }), false)
  assert.equal(_internal.isChatLike({ id: "default" }), false)
  assert.equal(_internal.isChatLike({ id: "nes-fim" }), false)
  assert.equal(_internal.isChatLike({ id: "completion-x" }), false)
  assert.equal(_internal.isChatLike({ id: "codewise-rewrite" }), false)
  assert.equal(_internal.isChatLike({ id: "tiny", maxOutputTokens: 256 }), false)
  assert.equal(_internal.isChatLike({ id: "img", tags: ["text-to-image"] }), false)
  assert.equal(_internal.isChatLike({ id: "extra", supportsExtra: true }), false)
})

test("scoped 开关关闭时只列 cli 模型，不并 craft/图片等非对话行", async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).endsWith("/v3/config")) {
      return Response.json({
        code: 0,
        data: {
          agents: [
            { name: "cli", models: ["a"] },
            { name: "craft", models: ["x", "img"] },
          ],
          models: [
            { id: "a", name: "A", credits: "0" },
            { id: "x", name: "Craft only", credits: "1" },
            { id: "img", name: "Image only", credits: "1" },
          ],
        },
      })
    }
    return new Response("must not be asked", { status: 500 })
  }
  try {
    const list = await _internal.liveModels(SITES.workbuddy, { access: "t", uid: "u", source: "oauth" })
    assert.deepEqual(list.map((m) => m.id), ["a"])
    assert.equal(calls.length, 1)
  } finally {
    globalThis.fetch = original
  }
})
