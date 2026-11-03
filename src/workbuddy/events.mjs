// Event shapes and task criteria. The growth center counts behavior events
// reported to /v2/report; the shapes below are the ones measured against the
// live service (see THIRD_PARTY_NOTICES for the public sources they follow).
// Desktop events carry a desktop fingerprint, Library_read and the mini
// program family carry their own fingerprints — mixing them up makes an event
// count for nothing.
import { createHash, randomUUID } from "node:crypto"

export const BUDDY_APP_ID = "cb_y5Dy46tPQGGWtueMxXbe"
export const LIGHTHOUSE_EXPERT = { id: "ex_2cvvUZQhDyeJ", name: "腾讯轻量云专家", title: "腾讯轻量云专家", version: "1.0.2", type: "agent" }
export const THEME_KEY = "theme-tkmw7j"
export const SKILL_ID = "skill_2097350077599879168"
export const SKILL_NAME = "润泽小馆·日报撰写"
export const LIBRARY_DOC_ID = "o0KWYeynteVv06UnAZqIFm"
export const FAST_MODEL = "fast-model"
export const GLM_MODEL = { id: "glm-5.2", name: "GLM-5.2" }
export const TEMPLATES = [["1", "深度研究"], ["2", "周报生成"], ["3", "竞品分析"], ["4", "活动策划"], ["5", "代码评审"]]
export const PLAYBOOK_CASE = { id: "pm-gtm-launch-plan", name: "新产品上市 GTM 发布计划一页纸" }

// 「体验「X」专家」activities bind one platform expert id each (taken from the
// task's own jump_url). The display name is the expert's nickname and
// expertTitle is the job title in the task text — both are checked upstream
// and are not interchangeable. Version falls back to the measured value when
// the market entry cannot be read.
export const FIXED_EXPERTS = {
  Expert_lighthouse: LIGHTHOUSE_EXPERT,
  WorkBuddy_Valorant: { id: "ex_xQHHD1u5Jkua", name: "无畏契约拼豆专家", title: "无畏契约拼豆专家", version: "1.2.1", type: "agent" },
  expert_use_maidehao: { id: "ex_GDl31WahyIH0", name: "卖得好", title: "中国电商运营专家", version: "1.0.1", type: "agent" },
  expert_use_douyinyin: { id: "ex_FbY5nlWTqDod", name: "斗音音", title: "抖音策略师", version: "1.0.2", type: "agent" },
  expert_use_shangjia_xuanchuan: { id: "ex_Weo3x2EZuSDm", name: "商家宣传设计师", title: "商家宣传页与海报设计师", version: "1.6.0", type: "agent" },
  expert_use_bowangwang: { id: "ex_WZY136wV5aMt", name: "播旺旺", title: "直播电商教练", version: "1.0.2", type: "agent" },
}

// Fallback pool for the "use N market experts" tasks when the market list
// cannot be read; the real list is preferred (expert ids must exist upstream).
export const FALLBACK_EXPERTS = [
  ["ex_PZw8Gu81HfN4", "运维工程师"], ["ex_ROsDtJbzADFV", "产品经理"],
  ["ex_SMUnl0nJbPix", "UI设计师"], ["ex_ZTR062oVBOCW", "数据分析师"], ["ex_a3sSSFBy8qaC", "后端架构师"],
]
export const FALLBACK_TEAMS = [["CloudOpsTeam", "运维专家团队"], ["CloudContentTeam", "内容专家团队"], ["CloudDevTeam", "研发专家团队"]]

export const specs = {
  create_canvas: { kind: "canvas" },
  template_5: { kind: "template", target: 5 },
  expert_5: { kind: "expert", expertType: "agent" },
  Expert_team_use_3: { kind: "expert", expertType: "team" },
  skill_1: { kind: "skill" },
  automation_1: { kind: "automation" },
  playbook_prompt: { kind: "playbook" },
  Expert_lighthouse: { kind: "fixedExpert", expert: FIXED_EXPERTS.Expert_lighthouse },
  WorkBuddy_Valorant: { kind: "fixedExpert", expert: FIXED_EXPERTS.WorkBuddy_Valorant },
  expert_use_maidehao: { kind: "fixedExpert", expert: FIXED_EXPERTS.expert_use_maidehao },
  expert_use_douyinyin: { kind: "fixedExpert", expert: FIXED_EXPERTS.expert_use_douyinyin },
  expert_use_shangjia_xuanchuan: { kind: "fixedExpert", expert: FIXED_EXPERTS.expert_use_shangjia_xuanchuan },
  expert_use_bowangwang: { kind: "fixedExpert", expert: FIXED_EXPERTS.expert_use_bowangwang },
  Hp_Appearance: { kind: "skin" },
  chat_5: { kind: "chat" },
  "Model_chat_GLM5.2": { kind: "glmchat" },
  black_cat: { kind: "chat", night: true, model: GLM_MODEL.id },
  RichMeow_Chat: { kind: "chat", model: FAST_MODEL, modelName: FAST_MODEL },
  Buddy_App: { kind: "buddyapp", appName: "Buddy" },
  Buddy_App_QQ: { kind: "buddyapp", appName: "企鹅教师助手" },
  Library_read: { kind: "webClick" },
  first_buddy: { kind: "firstBuddy" },
  Sequential_Tasks_1: { kind: "mpChat" },
  Sequential_Tasks_2: { kind: "mpExpert" },
  Sequential_Tasks_3: { kind: "mpChat" },
  Sequential_Tasks_4: { kind: "mpEvent", variant: "automation" },
  Sequential_Tasks_5: { kind: "mpEvent", variant: "model" },
  Sequential_Tasks_6: { kind: "mpChat" },
  Sequential_Tasks_7: { kind: "mpEvent", variant: "playbook" },
  // 「养虾等级」family: the task list reports a status, not progress. Real
  // usage records it; events do not move it. Kept here so the board and the
  // sweep know them; the runner leaves them to the desktop client.
  first_chat: { kind: "level" },
  expert_summoned: { kind: "level" },
  template_used: { kind: "level" },
  skill_installed: { kind: "level" },
  wechat_linked: { kind: "level" },
}

export const manualTasks = {
  wb_wechat_oa_subscribe_task: "需要关注官方公众号满 24 小时",
  Expert_Philanthropy: "需要实际完成捐赠",
  first_chat: "等级任务：需要在客户端完成一次真实对话",
  template_used: "等级任务：需要在客户端使用一次模板",
  expert_summoned: "等级任务：需要在客户端召唤一次专家",
  skill_installed: "等级任务：需要在客户端安装并调用技能",
  wechat_linked: "等级任务：需要在客户端链接微信",
}

/** Mini-program task codes: list/accept/claim all need the miniprogram header. */
export const MP_TASK_CODES = new Set(["Sequential_Tasks_1", "Sequential_Tasks_2", "Sequential_Tasks_3", "Sequential_Tasks_4", "Sequential_Tasks_5", "Sequential_Tasks_6", "Sequential_Tasks_7"])
export const isMpCode = code => MP_TASK_CODES.has(code)

export const newConversationId = () => randomUUID()
export const newRequestId = () => randomUUID().replaceAll("-", "")
/** mp request ids are the senders' own: 12 hex of milliseconds then 20 random hex. */
export function mpMessageId() {
  return Date.now().toString(16).padStart(12, "0") + randomUUID().replaceAll("-", "").slice(0, 20)
}

const sha = text => createHash("sha256").update(String(text)).digest("hex")

const OS_VERSIONS = { darwin: "15.0", win32: "10.0.26220", linux: "6.8.0" }
const WEB_OS_NAMES = { darwin: "MacIntel", win32: "Win32", linux: "Linux x86_64" }
const WEB_ARCH_SUFFIX = { x64: "x86_64", arm64: "aarch64", ia32: "i686" }

/** Desktop (workbuddy-desktop) fingerprint: same machine, stable per login. */
export function desktopFingerprint(uid, nickname = "") {
  const now = Date.now()
  return {
    timezone: "Asia/Shanghai", reportDelay: 2000, userId: String(uid || ""), username: nickname, userNickname: nickname,
    product: "SaaS", releaseDate: 1789036585355, commit: "5f9692923c93033111c51ad7b003eb80204a9b75",
    ideName: "WorkBuddy", ideType: "WorkBuddy", ideVersion: "5.5.6",
    machineId: sha(`machine:${uid}`).slice(0, 36), sessionId: sha(`session:${uid}`).slice(0, 36),
    extName: "workbuddy-desktop", extVersion: "5.5.6",
    os: process.platform, arch: process.arch, osVersion: OS_VERSIONS[process.platform] ?? "0.0.0",
    cpuCores: 8, memorySize: 16, timestamp: now, presentAt: now, ideVersionCli: "2.137.1"
  }
}

/** Web (browser) fingerprint for the Library_read criterion. */
export function webFingerprint(uid, nickname = "", enterpriseId = "") {
  const os = process.platform
  const suffix = os === "linux" ? ` ${WEB_ARCH_SUFFIX[process.arch] ?? "x86_64"}` : "";
  return {
    timestamp: Date.now(), reportDelay: 0,
    os: `${WEB_OS_NAMES[os] ?? os}${suffix}`, arch: process.arch, osVersion: OS_VERSIONS[os] ?? "0.0.0",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    machineId: sha(`webmachine:${uid}`).slice(0, 36), userId: String(uid || ""), userNickname: nickname, enterpriseId: String(enterpriseId || "")
  }
}

/** Mini-program runtime fingerprint (the sender is the WeChat mini program). */
export function mpFingerprint(uid, nickname = "") {
  return {
    timestamp: Date.now(), ideType: "WorkBuddy_MP", ideVersion: "2.4.0", extName: "workbuddy-mp", extVersion: "2.4.0",
    product: "SaaS", ideName: "wx_app_cloud", platform: "mini_program", os: "windows", osVersion: "11", arch: "x64",
    machineId: "0655736a-607f-4d9d-b430-58176ee9a090", timezone: "Asia/Shanghai",
    userId: String(uid || ""), userNickname: nickname
  }
}

const DESKTOP_ORDER = ["agent_task_created", "chat_message_send", "chat_request_send", "chat_message_response", "chat_message_status", "chat_request_response"]

function common(conv, req) {
  return {
    traceId: req, rootRequestId: req, parentConversationId: conv, agentName: "cli", agentType: "main",
    "codebuddy.session_id": conv, "codebuddy.conversation_request_id": req
  }
}

/** Six desktop chat events, JOINed to one conversation (the general chain). */
export function chatEvents(model = FAST_MODEL, conv = newConversationId(), req = newRequestId(), modelName = model) {
  const messageId = `${conv}-m`, base = common(conv, req);
  return [
    { eventCode: DESKTOP_ORDER[0], source: "LOCAL", name: "working", task_target: "local", mode: "craft",
      requestModelId: model, requestModelName: modelName, has_repo: false, repo_type: "none",
      workspace_type: "empty", has_connector: false, connector_types: [], has_mention: false,
      mention_types: [], has_template: false, action: "", template_name: "", has_expert: false,
      expert_id: "", expert_name: "", expert_industry_id: "", has_skill: false, skill_names: [],
      conversationId: conv, messageId, buddyId: "", buddyName: "" },
    { eventCode: DESKTOP_ORDER[1], messageId: `${messageId}-assistant`, historyCount: 0, isContextTruncated: false,
      currentStepCount: 1, ...base },
    { eventCode: DESKTOP_ORDER[2], inputLength: 24, isPlan: false, isAutoExecuteTerminal: false, isAutoModify: false,
      codebaseEnable: false, maxToken: 0, maxSteps: 500, temperature: 0, maxRetries: 0,
      mentionContexts: [], knowledgeId: [], knowledgeName: [], codebaseId: "",
      mentionContextCount: 0, command: "", recommendId: "", skillId: "", skillCount: 0,
      totalCount: 0, ...base },
    { eventCode: DESKTOP_ORDER[3], messageId: `${messageId}-assistant`, responseModelId: model, inputToken: 120,
      outputToken: 80, totalToken: 200, cachedTokens: 0, cachedWriteTokens: 0, cachedMissTokens: 0,
      isSuccessful: true, messageErrorCode: "", finishReason: "stop", firstTokenAt: Date.now(), conversationId: conv, ...base },
    { eventCode: DESKTOP_ORDER[4], messageId: `${messageId}-assistant`, messageErrorCode: "0", ...base },
    { eventCode: DESKTOP_ORDER[5], mode: "craft", toolCallCount: 0, inputToken: 120, outputToken: 80, totalToken: 200,
      cachedTokens: 0, cachedWriteTokens: 0, cachedMissTokens: 0, isSuccessful: true, messageErrorCode: "",
      finishReason: "stop", ...base }
  ]
}

/** One chat_request_send with a model name (the "try this model" criterion). */
export function chatRequestEvent(modelId, modelName, conv = newConversationId()) {
  const requestId = conv
  return {
    eventCode: DESKTOP_ORDER[2], mode: "craft", conversationId: conv, requestId, inputLength: 12,
    requestModelId: modelId, requestModelName: modelName, isPlan: false, isAutoExecuteTerminal: false,
    isAutoModify: false, codebaseEnable: false, maxToken: 0, maxSteps: 0, temperature: 0, maxRetries: 0,
    mentionContexts: [], knowledgeId: [], knowledgeName: [], codebaseId: "", mentionContextCount: 0,
    command: "", expertId: "", recommendId: "", skillId: "", skillCount: 0, totalCount: 0, fileUri: "",
    presentAt: Date.now(), traceId: requestId, rootRequestId: requestId, parentConversationId: conv,
    agentName: "cli", agentType: "main"
  }
}

/** Template use: chat chain plus the template events (the criterion is template_used). */
export function templateEvents(templateId, templateName, conv = newConversationId(), req = newRequestId()) {
  return [
    ...chatEvents(FAST_MODEL, conv, req),
    { eventCode: "agent_task_created_with_template", mode: "working", isCustomModel: false, id: templateId, name: templateName, requestId: req },
    { eventCode: "template_used", template_id: templateId, task_mode: "working" }
  ]
}

/** Inspiration "use this prompt": chat chain plus the playbook click/send events. */
export function playbookEvents(conv = newConversationId(), req = newRequestId(), item = PLAYBOOK_CASE) {
  const payload = { id: item.id, name: item.name, type: "document", categoryId: "", categoryName: "" }
  return [
    ...chatEvents(FAST_MODEL, conv, req),
    { eventCode: "web_element_click", pageName: "playbook_detail", elementId: "playbook_ctaClick", elementName: item.name, source: "discover" },
    { eventCode: "playbook_cta_click", source: "discover", position: 0, ...payload },
    { eventCode: "playbook_prompt_send", conversationId: conv, requestId: req, ...payload }
  ]
}

export function automationEvents(name = "自动化") {
  return [{ eventCode: "automated_task_create_suc", name, source: "manually", modelId: FAST_MODEL, modelIsThinking: true,
    connectorCount: 0, skills: "", skillCount: 0, scheduleType: "once", mode: "LOCAL" }]
}

export function buddyAppEvents(buddyId = BUDDY_APP_ID, buddyName = "Buddy") {
  const base = { mode: "LOCAL", buddyId, buddyName, elementId: buddyId, elementName: buddyName }
  return [
    { eventCode: "buddyapp_discover_click", ...base },
    { eventCode: "buddyapp_show", ...base, position: 2 },
    { eventCode: "buddyapp_enter_click", ...base, position: 2, isFirstPage: "1" },
    { eventCode: "buddyapp_auth_confirm_click", ...base },
    { eventCode: "buddyapp_bindaccount_skip_click", ...base }
  ]
}

/** Summon chain: what the client reports before opening an expert. */
export function expertSummonEvents(expert) {
  const cat = "expert-all", version = expert.version || "1.0.0"
  return [
    { eventCode: "web_element_click", source: expert.id, type: cat, version, elementId: "expert_summon_click", elementName: "立即召唤",
      pageURL: "/C:/Program%20Files/WorkBuddy/resources/app.asar/renderer/index.html" },
    { eventCode: "expert_summon_click", id: expert.id, name: expert.name, expertTitle: expert.title, type: cat, position: 0,
      expertType: expert.type || "agent", version, mode: "LOCAL" },
    { eventCode: "expert_summoned", id: expert.id, name: expert.name, expertTitle: expert.title, type: cat }
  ]
}

/** One expert_actual_use event JOINed to a real chat request. mode: "craft" | "LOCAL". */
export function expertUseEvent(expert, mode, conv, req, { local = false } = {}) {
  return {
    eventCode: "expert_actual_use", id: expert.id, name: expert.name, expertTitle: expert.title, type: "expert-all",
    expertType: expert.type || "agent", source: "builtin", version: expert.version || "1.0.0",
    cost: local ? 0 : 9000, characterCount: 14, conversationId: conv, requestId: req,
    messageId: `msg-${String(req).slice(-8)}`, requestModelId: FAST_MODEL, requestModelName: FAST_MODEL,
    inputToken: 120, outputToken: 80, totalToken: 200, isSuccessful: true,
    mode, ...(local ? { type: "", cost: 0 } : {})
  }
}

/**
 * Chat chain plus the expert use event. Fixed-expert tasks set has_expert on
 * the first event (their criterion binds the expert); market experts
 * (expert_5 / Expert_team_use_3) use a plain chat chain, matching the client.
 */
export function expertChatEvents(expert, conv, req, mode, { hasExpert = true } = {}) {
  const events = chatEvents(FAST_MODEL, conv, req).map(e => e.eventCode === DESKTOP_ORDER[0] && hasExpert
    ? { ...e, has_expert: true, expert_id: expert.id, expert_name: expert.name, expert_industry_id: expert.industryId || "" } : e)
  events.push(expertUseEvent(expert, mode, conv, req, { local: mode === "LOCAL" }))
  return events
}

/** Real chat + skill_info (the skill criterion is skill_info JOINed to a real request). */
export function skillEvents(conv, req) {
  const events = chatEvents(FAST_MODEL, conv, req)
  const response = events.find(e => e.eventCode === DESKTOP_ORDER[3])
  if (response) response.finishReason = "tool_calls"
  events.push({
    eventCode: "skill_info", id: SKILL_NAME, skillId: SKILL_ID, skillVersion: "1.0.0", toolStatus: "success",
    fileCount: 56, source: "workbuddy-desktop", conversationId: conv, requestId: req,
    messageId: `${conv}-m`, requestModelId: FAST_MODEL, requestModelName: FAST_MODEL, traceId: req
  })
  return events
}

/** Design canvas criterion: chat chain plus the canvas telemetry events. */
export function canvasEvents(conv, req) {
  return [
    ...chatEvents(FAST_MODEL, conv, req),
    { eventCode: "wbx_design_canvas_task_create", conversationId: conv, requestId: req, source: "summon_keyword",
      cost: 12000, isSuccessful: true },
    { eventCode: "wbx_design_canvas_open", conversationId: conv, requestId: req,
      id: `ardot-file-${String(req).slice(-8)}`, source: "summon_keyword", type: "page", cost: 13000, isSuccessful: true }
  ]
}

/** Theme applied (the client reports this when leaving settings with the theme on). */
export function appearanceEvents() {
  return [{ eventCode: "appearance_skin_apply", action: "apply", source: "settings_close", id: THEME_KEY, vipLevel: 0, series: "", type: "unknown" }]
}

/** The web-domain Library_read criterion: one element click on the intro page. */
export function webClickEvents(uid, nickname = "", enterpriseId = "") {
  const pageURL = `https://www.workbuddy.cn/space/d/${LIBRARY_DOC_ID}`;
  return [{ eventCode: "web_element_click", pageURL, elementId: "library_doc_intro_click", elementName: "WorkBuddy资料库介绍" }]
}

/** Mini-program chat_request_send (the Sequential_Tasks_1/3/6 counter). */
export function miniChatEvent(conv = randomUUID()) {
  const rid = mpMessageId()
  return {
    eventCode: "chat_request_send", inputLength: 14, isPlan: false, isAutoExecuteTerminal: false, isAutoModify: false,
    codebaseEnable: false, maxToken: 0, maxSteps: 500, temperature: 0, maxRetries: 0,
    mentionContexts: [], knowledgeId: [], knowledgeName: [], codebaseId: "", mentionContextCount: 0,
    command: "", recommendId: "", skillId: "", skillCount: 0, totalCount: 0,
    traceId: rid, rootRequestId: rid, parentConversationId: conv, conversationId: conv,
    messageId: `msg-${rid.slice(-8)}`, agentName: "mp", agentType: "main",
    "codebuddy.session_id": conv, "codebuddy.conversation_request_id": rid
  }
}

export function miniChatModelEvent(modelId, modelName, conv = randomUUID()) {
  return { ...miniChatEvent(conv), requestModelId: modelId, requestModelName: modelName }
}

/** Mini-program expert use: id and name are the expert id, expertTitle is its name. */
export function miniExpertUseEvent(expertId, expertName, expertType = "agent") {
  return {
    eventCode: "expert_actual_use", reportDelay: 0, extVersion: "2.2.8", source: "mini_program",
    id: expertId, name: expertId, expertTitle: expertName || expertId, type: "send_message",
    characterCount: 12, expertType: expertType || "agent"
  }
}

export function miniPlaybookEvents(item = PLAYBOOK_CASE) {
  const base = { id: item.id, name: item.name, type: "document", categoryId: "", categoryName: "", skills: "", skillNames: "" }
  return [
    { eventCode: "playbook_cta_click", source: "discover", position: 1, extVersion: "2.2.8", ...base },
    { eventCode: "playbook_prompt_send", source: "discover", promptLength: 96, isOfficial: 1,
      conversationId: randomUUID(), extVersion: "2.2.8", ...base }
  ]
}

/** Stamp desktop events with the fingerprint and the conversation ids. */
export function withDesktopFingerprint(uid, nickname, events, conv, req) {
  const base = desktopFingerprint(uid, nickname)
  return events.map(event => ({ ...base, ...event, conversationId: event.conversationId ?? conv, requestId: event.requestId ?? req,
    timestamp: Date.now(), presentAt: Date.now() }))
}

export function withMpFingerprint(uid, nickname, events) {
  const base = mpFingerprint(uid, nickname)
  return events.map(event => ({ ...base, ...event }))
}

export function withWebFingerprint(uid, nickname, enterpriseId, events) {
  const base = webFingerprint(uid, nickname, enterpriseId)
  return events.map(event => ({ ...base, ...event }))
}
