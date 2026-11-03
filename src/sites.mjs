// WorkBuddy 双区站点适配表。
//
// 这里只放两区确实不同的值：provider id、端点、客户端指纹、登录平台、
// 静态模型快照、协议开关与图标。共享协议实现一律在 workbuddy/ 中，
// 不得在这里复制请求逻辑，也不得在共享逻辑里按 host 写分支。

import { WORKBUDDY_ICON } from "./workbuddy-icon.mjs"

const CN_MODELS = [
  ["auto", "Auto", 168000],
  ["hy4-preview-f", "Hy4 preview", 1000000, ["high"]],
  ["hy3", "Hy3", 192000, ["low", "high"]],
  ["hy3-x", "Hy3-X", 192000, ["low", "high"]],
  ["deepseek-v4.1-flash", "Deepseek-V4.1-Flash", 1000000, ["none", "low", "high", "max"]],
  ["glm-5.3", "GLM-5.3", 1000000, ["low", "high", "max"]],
  ["glm-5.3-flash", "GLM-5.3-Flash", 1000000, ["low", "high", "max"]],
  ["glm-5.2", "GLM-5.2", 1000000, ["high", "xhigh"]],
  ["glm-5.1", "GLM-5.1", 200000],
  ["glm-5v-turbo", "GLM-5v-Turbo", 200000],
  ["minimax-m3", "MiniMax-M3", 512000],
  ["kimi-k3-1", "Kimi-K3", 1000000, ["low", "high", "xhigh"]],
  ["kimi-k2.7", "Kimi-K2.7-Code", 256000],
  ["kimi-k2.6", "Kimi-K2.6", 256000],
  ["deepseek-v4-pro", "Deepseek-V4-Pro", 1000000, ["none", "high", "xhigh"]],
]

const AI_MODELS = [
  ["default-model", "Default", 176000],
  ["fast-model", "Fast", 200000],
  ["balanced-model", "Balanced", 256000],
  ["primary-model", "Primary", 272000],
  ["deep-model", "Deep", 176000],
  ["gpt-5.5", "GPT-5.5", 1000000],
  ["gpt-5.4", "GPT-5.4", 272000],
  ["gpt-5.3-codex", "GPT-5.3-Codex", 272000],
  ["gemini-3.1-pro", "Gemini-3.1-Pro", 400000],
  ["gemini-3.5-flash", "Gemini-3.5-Flash", 1000000],
  ["glm-5.3", "GLM-5.3", 1000000, ["low", "high", "max"]],
  ["glm-5.2", "GLM-5.2", 1000000, ["high", "xhigh"]],
  ["hy3", "Hy3", 192000, ["low", "high"]],
  ["kimi-k3", "Kimi-K3", 1000000],
  ["kimi-k2.6", "Kimi-K2.6", 256000],
  ["minimax-m3", "MiniMax-M3", 512000],
]

// Both providers are the same WorkBuddy product; use the official green
// WorkBuddy logo rather than an invented letter mark.
export const PLUGIN_ICON = WORKBUDDY_ICON

export const SITES = Object.freeze({
  workbuddy: Object.freeze({
    id: "workbuddy",
    name: "WorkBuddy",
    displayName: "腾讯 WorkBuddy",
    endpoint: "https://copilot.tencent.com",
    webBase: "https://www.workbuddy.cn",
    authID: "workbuddy-desktop",
    platform: "workbuddy",
    // Jet Hub's domestic WorkBuddy build is the CodeBuddy product family;
    // the compensation user-centre endpoint keys on this code.
    productCode: "codebuddy",
    ai: false,
    app: "5.9.3",
    cli: "2.165.0",
    appName: "WorkBuddy",
    runtime: "local-agent",
    keys: "https://www.workbuddy.cn/profile/keys",
    models: CN_MODELS,
    messages: true,
    checkin: true,
    // WorkBuddy's console catalogue: ids that /v3/config's cli agent does
    // not always carry. Public console route (the same one the website uses).
    scopedPath: "/console/enterprises/personal/models",
    compensation: true,
    icon: WORKBUDDY_ICON,
  }),
  "workbuddy-ai": Object.freeze({
    id: "workbuddy-ai",
    name: "WorkBuddy AI",
    displayName: "国际版 WorkBuddy AI",
    endpoint: "https://www.workbuddy.ai",
    webBase: "https://www.workbuddy.ai",
    authID: "workbuddy-desktop-ai",
    platform: "workbuddy-ai",
    productCode: "workbuddy",
    ai: true,
    app: "5.9.3",
    cli: "2.165.0",
    appName: "workbuddy-ai",
    runtime: "local-agent",
    keys: "https://www.workbuddy.ai/profile/keys",
    models: AI_MODELS,
    noImages: /^glm-/,
    messages: false,
    checkin: false,
    scopedPath: "/console/enterprises/personal/models",
    compensation: false,
    icon: WORKBUDDY_ICON,
  }),
})
