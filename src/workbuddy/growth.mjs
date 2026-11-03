// src/workbuddy/growth.mjs —— 成长中心的全自动执行
//
// 这一块是从 MAGPIE 社区里跑通的那套实测结论搬来的：成长中心的任务不是「点一下领奖」，
// 每一类都有各自的判据，判据靠客户端行为事件上报到 /v2/report 来点亮。照抄它的
// 事件形状、节奏与回读规则，比自己猜要省一个月的试错 —— 尤其是：
//
//   • 小程序族的事件连发会被上游回滚，必须按 45 秒 + 0~10 秒抖动发；
//   • 上报成功不等于进度入账，要回读任务列表直到 reached；
//   • 一天里已经上报过的次数不再重发（重发只会加重风控）；
//   • 领奖失败若是「已领取 / 限领一次」，那是一次性权益，不能再试。
//
// 本模块只管「跑一轮」，不注册定时器、不读文件、不认识 magpie —— 调用方注入 client
// 与 state 即可。这样 checkin 钩子里能跑，测试里也能离线跑。

import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import {
  specs,
  manualTasks,
  isMpCode,
  FALLBACK_EXPERTS,
  FALLBACK_TEAMS,
  TEMPLATES,
  PLAYBOOK_CASE,
  FAST_MODEL,
  GLM_MODEL,
  THEME_KEY,
  BUDDY_APP_ID,
  newConversationId,
  newRequestId,
  chatEvents,
  chatRequestEvent,
  templateEvents,
  playbookEvents,
  automationEvents,
  buddyAppEvents,
  expertSummonEvents,
  expertChatEvents,
  skillEvents,
  canvasEvents,
  appearanceEvents,
  webClickEvents,
  miniChatEvent,
  miniChatModelEvent,
  miniExpertUseEvent,
  miniPlaybookEvents,
  withDesktopFingerprint,
  withMpFingerprint,
  withWebFingerprint,
} from "./events.mjs"

export const GROWTH_ACTIONS = ["checkin", "activity", "tasks", "travel", "bonus", "night"]

/** Mini-program list/accept/claim header. Event reports use their own set below. */
const MP = { "X-Client-Platform": "miniprogram" }
/** Mini-program mining-SDK headers: mp-weixin/wechatmp, not `miniprogram`. */
const MP_EVENT = {
  "X-Client-Platform": "mp-weixin",
  "X-Platform": "wechatmp",
  "X-Client-Product": "workbuddy-mp",
  "X-Client-Version": "2.4.0",
}
/** Fast bursts of mini-program chat events are rolled back upstream: pace them like a person. */
export const MP_CHAT_GAP_MS = 45_000
export const MP_CHAT_JITTER_MS = 10_000
export const MP_ACTION_GAP_MS = 2_000
export const MP_POLL_MS = 3_000
export const SETTLE_MS = 4_000
export const LOTTERY_CAP = 20
const PENDING_BENEFIT = /已领取|限领一次|无.*活动|活动.*结束|未开启|已过期|不符合|未满足/

// UpstreamError / RateLimited 与 provider 的聊天路径共用一套语义：状态码 + code + 可重试。
// growth 只关心「是不是业务拒绝」「是不是限流」「是不是没登录」，别的都算失败。
export class GrowthError extends Error {
  constructor(path, status, payload) {
    super(`${path}: HTTP ${status}，${payload?.msg || payload?.message || `code=${payload?.code}`}`)
    this.code = payload?.code
    this.status = status
  }
}
export class RateLimited extends GrowthError {
  constructor(path, payload) {
    super(path, 429, payload)
    this.message = `${path}: 上游限流（HTTP 429），稍后会自动重试`
    this.limited = true
  }
}

// A round whose every failure was a rate limit is deferred, not failed.
function roundError(message, errors) {
  const e = new Error(message)
  e.limited = errors.length > 0 && errors.every((x) => x.limited)
  return e
}

const isBusiness = (e, pattern) => e instanceof GrowthError && pattern.test(e.message)

// calendarOf is the vendor's own day clock: everything the growth centre counts is
// a Beijing day, not the host's local day.
export function calendarOf(now, timezone = "Asia/Shanghai") {
  const d = new Date(now)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "00"
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) }
}

/**
 * createGrowth 造一个「这台账号的成长中心」。client 需要四个方法（与上游插件一致）：
 *   request(path, { body?, headers?, billing? })  → 解包后的 data
 *   fetch(url, init)                              → 原始 Response（真实对话用）
 *   headers(extra)                                → 请求头对象
 *   origin                                        → 站点域（国内 www.workbuddy.cn）
 */
export function createGrowth({ site, account, config = {}, client, log = () => {}, state = {}, now = Date.now, onRestricted }) {
  const auth = account.auth ?? account
  const uid = auth.uid ?? ""
  const nickname = account.name || ""
  const enterpriseId = auth.enterpriseId || ""
  const timezone = config.timezone || "Asia/Shanghai"
  const day = (at = now()) => calendarOf(at, timezone).day
  const hour = (at = now()) => calendarOf(at, timezone).hour
  const reportKey = (code) => `${account.id}:${code}:${day()}`
  const sleep = (ms) => delay(ms, undefined, {})
  const settle = () => sleep(config.settleMs ?? SETTLE_MS)
  const mpChatGap = config.mpChatGapMs ?? MP_CHAT_GAP_MS
  const mpJitter = config.mpJitterMs ?? MP_CHAT_JITTER_MS
  const mpActionGap = config.mpActionGapMs ?? MP_ACTION_GAP_MS
  const mpPoll = config.mpPollMs ?? MP_POLL_MS
  const pollGap = () => sleep(config.pollDelay ?? 1500)
  state.daily ??= {}
  state.reports ??= {}
  state.makeups ??= {}
  const save = () => config.save?.()

  const daily = async (name, run) => {
    const key = `${account.id}:${name}`
    if (state.daily[key] === day()) {
      log(`${name}：今天已完成`)
      return { skipped: true }
    }
    const result = await run()
    state.daily[key] = day()
    save()
    return result
  }

  // ---- reporting ---------------------------------------------------------
  const WEB = { "X-Client-Platform": "web" }
  const report = (bodies, headers) => client.request("/v2/report", { body: bodies, ...(headers ? { headers } : {}) })
  const reportDesktop = (events, conv, req) => report(withDesktopFingerprint(uid, nickname, events, conv, req), WEB)
  const reportMp = (events) => report(withMpFingerprint(uid, nickname, events), MP_EVENT)

  /** One real chat completion; its server request id is what expert/skill criteria JOIN to. */
  const openChat = async (expertId) => {
    const conv = newConversationId()
    const req = newRequestId()
    const headers = {
      ...client.headers(),
      Accept: "text/event-stream",
      "X-Conversation-ID": req,
      "X-Conversation-Request-ID": req,
      "X-Conversation-Message-ID": req,
      "X-Request-ID": String(now()),
      "X-Agent-Intent": "craft",
      "X-Agent-Type": "main",
      ...(expertId ? { "X-Expert-Id": expertId } : {}),
    }
    const response = await client.fetch(`${client.origin}/v2/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: FAST_MODEL,
        messages: [
          { role: "system", content: "当前处于中文环境，请使用简体中文回答。" },
          { role: "user", content: "1+1等于几？直接回答。" },
        ],
        agent: "cli",
        temperature: 1,
        stream: true,
        stream_options: { include_usage: true },
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      if (response.status === 403 && /11140|账号存在异常行为|restricted due to unusual activity/i.test(body)) {
        // A restriction met mid-round is a verdict now: the next round must see it.
        onRestricted?.({ health: "restricted", code: 11140, message: "账号存在异常行为，已被限制使用" })
        const error = new Error("账号存在异常行为，已被限制使用")
        error.code = 11140
        error.status = 403
        throw error
      }
      throw new Error(`真实对话失败：HTTP ${response.status}`)
    }
    const text = await response.text()
    const id = text.match(/"id"\s*:\s*"((?:cmb-)?[0-9a-f]{32})"/)?.[1]
    if (!id) throw new Error("真实对话未返回可用 requestId")
    return { conv, req: id }
  }

  // ---- task list / accept / claim ---------------------------------------
  const fetchTasks = async (path, headers) => {
    try {
      const got = await client.request(path, headers ? { headers } : {})
      return Array.isArray(got?.tasks) ? got.tasks : []
    } catch (e) {
      // Only "this family has nothing / no permission" is an empty list. A 5xx
      // or a reset is a failed read: reporting it as "0 tasks" would hide the
      // failure and disagree with what the account sees in its own client.
      if (e instanceof GrowthError && [403, 404].includes(e.status)) return []
      throw e
    }
  }
  const v2 = () => fetchTasks("/v2/activity/growth/tasks", undefined)
  const v1 = () => fetchTasks("/activity/growth/tasks")
  const mpList = () => fetchTasks("/v2/activity/growth/tasks", MP)
  /** Merged list: growth family (v2), level family (v1), mini program superset (mp header). */
  const list = async () => {
    const rows = new Map()
    // The international build has one family (the level list at the v1 path);
    // the growth list and the mini-program list are the China build's.
    const batches = site.ai ? [await v1()] : [await v2(), await v1(), await mpList()]
    for (const batch of batches) {
      for (const task of batch) {
        const code = task.task_code || task.code
        if (code && !rows.has(code)) rows.set(code, { ...task, task_code: code })
      }
    }
    return [...rows.values()]
  }
  /** Only the family that actually carries this code, so one poll is one request. */
  const findTask = async (code) => {
    const batch = isMpCode(code) ? await mpList() : specs[code]?.kind === "level" ? await v1() : await v2()
    return batch.find((t) => (t.task_code || t.code) === code)
  }
  const progressOf = (task) => {
    const p = task?.progress
    if (p && (p.current !== undefined || p.target !== undefined)) {
      return { current: Number(p.current) || 0, target: Number(p.target) || 0 }
    }
    return { current: Number(task?.current) || 0, target: Number(task?.target) || 0 }
  }
  const completed = (task) => {
    if (!task) return false
    const { current, target } = progressOf(task)
    return task.accept_status === "completed" || (target > 0 && current >= target)
  }

  const accept = async (task) => {
    const code = task.task_code
    if (isMpCode(code)) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await client.request("/activity/growth/tasks/accept", { body: { task_codes: [code] }, headers: MP })
        } catch (e) {
          if (e instanceof GrowthError) {
            log(`${code} 接取失败：${e.message}`)
            continue
          }
          throw e
        }
        await sleep(mpActionGap)
        const updated = await findTask(code)
        if (updated && updated.accept_status && updated.accept_status !== "not_accepted") return
      }
      throw new Error(`${code} 接取未登记生效，任务可能处于每日锁定窗口`)
    }
    const accepted = await client.request("/activity/growth/tasks/accept", { body: { task_codes: [code] } })
    const result = accepted?.results?.find((r) => r.task_code === code)
    if (Array.isArray(accepted?.results) && !["accepted", "already_accepted"].includes(result?.status)) {
      throw new Error(`${code} 接取失败：${result?.message || result?.status || "响应缺少任务回执"}`)
    }
  }

  const claimTask = async (task) => {
    const code = task.task_code
    // Both claim variants carry a platform header; mp first, web after a
    // "task not found" (口径不认) answer.
    const attempt = (headers) => client.request(`/activity/growth/tasks/${encodeURIComponent(code)}/claim`, { body: {}, headers })
    let got
    try {
      got = await attempt(isMpCode(code) ? MP : WEB)
    } catch (e) {
      const notFound = isBusiness(e, /task not found/i) || (!(e instanceof GrowthError) && /HTTP 400/.test(e.message))
      if (isMpCode(code) && notFound) got = await attempt(WEB)
      else if (isBusiness(e, /已领取|限领一次|already/i)) {
        log(`${task.title || code}：此前已领取`)
        return { claimed: false, credit: 0 }
      } else if (isBusiness(e, /no unclaimed travel|insufficient energy|adoption agreement/i)) {
        log(`${task.title || code}：${e.message}`)
        return { claimed: false, credit: 0 }
      } else throw e
    }
    if (got?.already_claimed === true) {
      log(`${task.title || code}：此前已领取（幂等）`)
      return { claimed: false, credit: 0 }
    }
    log(`${task.title || code}：已领奖，${got?.credit ?? 0} 积分 / ${got?.energy ?? 0} 能量`)
    return { claimed: true, credit: Number(got?.credit) || 0 }
  }

  // ---- daily check-in ----------------------------------------------------
  // Daily check-in, the one credit path both builds have. Magpie's own switch
  // may also run it; this path is idempotent and answers "done" for a day
  // already in, so the two never double-claim.
  const checkin = async () => {
    let status
    try {
      status = await client.request("/v2/billing/meter/checkin-activity-status", { body: {} })
    } catch (e) {
      if (e instanceof GrowthError && e.code === 1001) {
        log("签到：今天已签到")
        return { outcome: "done" }
      }
      throw e
    }
    if (status?.active === false) {
      log("签到：当前没有签到活动")
      return { outcome: "inactive" }
    }
    if (status?.today_checked_in ?? status?.todayCheckedIn) {
      const credit = Number(status.today_credit ?? status.daily_credit) || 0
      log(`签到：今天已签到${credit ? `（+${credit}）` : ""}`)
      return { outcome: "done", credit }
    }
    try {
      const got = await client.request("/v2/billing/meter/daily-checkin", { body: {} })
      const credit = Number(got?.credit) || 0
      const streak = Number(got?.streak_days) || 0
      log(`签到：已领取${credit ? ` +${credit} 积分` : ""}${streak ? `，连续 ${streak} 天` : ""}`)
      return { outcome: "claimed", credit, streak }
    } catch (e) {
      if (e instanceof GrowthError && e.code === 1001) {
        log("签到：今天已签到")
        return { outcome: "done" }
      }
      if (e instanceof GrowthError && e.code === 1002) {
        log(`签到：${e.message}`)
        return { outcome: "ineligible", message: e.message }
      }
      if (e instanceof GrowthError && e.code === 1003) {
        log(`签到：${e.message}`)
        return { outcome: "inactive", message: e.message }
      }
      throw e
    }
  }

  if (site.ai) {
    // The international build has no growth centre at all. What its task list
    // shows ("养虾等级" levels) is recorded by the desktop client's own use and
    // no reported event moves it; it also has no daily check-in, no streak, no
    // Buddy and no meter benefits. So this build only reads the list — and never
    // sends this account's token to a China-only endpoint.
    return {
      checkin: async () => ({ outcome: "inactive", message: "国际版没有签到活动" }),
      tasks: async () => ({ skipped: true, reason: "ai" }),
      activity: async () => ({ skipped: true, reason: "ai" }),
      travel: async () => ({ skipped: true, reason: "ai" }),
      bonus: async () => ({ skipped: true, reason: "ai" }),
      night: async () => ({ skipped: true, reason: "ai" }),
      list,
    }
  }

  // ---- first Buddy -------------------------------------------------------
  const adoptBuddy = async (task) => {
    // The adoption threshold is today's activity; report one chat activity first.
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop([chatRequestEvent(FAST_MODEL, FAST_MODEL, conv)], conv, req)
    try {
      await client.request("/activity/growth/buddy/agreement", { body: { agree: true } })
    } catch (e) {
      if (!(e instanceof GrowthError)) throw e
      log(`Buddy 协议：${e.message}`)
    }
    try {
      await client.request("/activity/growth/buddy/first", { body: {} })
    } catch (e) {
      if (isBusiness(e, /first_buddy task not completed yet|not completed/i)) {
        log("首只 Buddy：领养门槛未过（当日活跃不足），下次再试")
        return "open"
      }
      if (!isBusiness(e, /已领养|already|已领取/i)) throw e
      log("首只 Buddy：已经领养过")
    }
    log("首只 Buddy：已领养")
    await settle()
    const updated = await findTask(task.task_code)
    if (updated && completed(updated) && updated.accept_status !== "claimed") {
      await claimTask(updated)
      return "claimed"
    }
    return "open"
  }

  // ---- experts -----------------------------------------------------------
  const marketCache = new Map()
  const marketList = async (type) => {
    if (marketCache.has(type)) return marketCache.get(type)
    let rows = []
    try {
      const got = await client.request("/portal/operation-platform/market/expert/list", {
        body: { page: 1, page_size: 20, sort_by: "reco_rank", sort_order: "desc", expert_type: type },
      })
      const data = got?.experts ?? got?.list ?? []
      rows = (Array.isArray(data) ? data : [])
        .map((e) => ({
          id: String(e.expert_id ?? e.id ?? ""),
          name: String(e.display_name_zh ?? e.display_name ?? e.name ?? ""),
          title: String(e.profession_zh ?? ""),
          type: String(e.expert_type ?? type),
          version: String(e.version ?? ""),
          industryId: String(e.industry_id ?? ""),
        }))
        .filter((e) => e.id)
    } catch (e) {
      if (!(e instanceof GrowthError)) throw e
    }
    if (!rows.length) rows = (type === "team" ? FALLBACK_TEAMS : FALLBACK_EXPERTS).map(([id, name]) => ({ id, name, title: name, type, version: "" }))
    if (marketCache.size > 8) marketCache.clear()
    marketCache.set(type, rows)
    return rows
  }
  /** Prefer the market entry (version/name are server-held); the spec's static values are the fallback. */
  const enrichExpert = async (expert) => (await marketList("agent")).find((r) => r.id === expert.id) ?? expert

  // ---- mini-program family ----------------------------------------------
  const mpTarget = (code, reported) =>
    reported > 0 ? reported : code === "Sequential_Tasks_3" ? 5 : code === "Sequential_Tasks_6" ? 10 : 1
  const pollMp = async (code, rounds = 2) => {
    let last
    for (let i = 0; i < rounds; i++) {
      await sleep(mpPoll)
      last = await findTask(code)
      if (last && (last.accept_status === "claimed" || last.accept_status === "completed" || progressOf(last).current >= mpTarget(code, progressOf(last).target))) return last
    }
    return last
  }
  const mpReached = (task, code) =>
    !!task && (task.accept_status === "claimed" || task.accept_status === "completed" || progressOf(task).current >= mpTarget(code, progressOf(task).target))
  const readyMp = async (task) => {
    if (!task.accept_status || task.accept_status === "not_accepted") await accept(task)
    return task
  }
  const paceMpChat = async () => {
    await sleep(mpChatGap + (mpJitter > 0 ? Math.floor(Math.random() * mpJitter) : 0))
    await reportMp([miniChatEvent()])
  }
  const runMpChat = async (task) => {
    if (task.accept_status === "claimed") return "done"
    if (completed(task)) {
      await claimTask(task)
      return "claimed"
    }
    if (task.locked === true) {
      log("任务尚未解锁（每日解锁一环），本轮跳过")
      return "open"
    }
    await readyMp(task)
    const after = await findTask(task.task_code)
    const { current, target } = progressOf(after ?? task)
    const need = Math.max(0, mpTarget(task.task_code, target) - current)
    const key = reportKey(task.task_code)
    // Same rule as the desktop units: already-reported mini-program events are
    // not resent within the day (pacing makes bursts worse, not better).
    const reporting = state.reports[key] || { sent: 0, total: need, base: current }
    for (let i = reporting.sent; i < reporting.total; i++) {
      await paceMpChat()
      reporting.sent = i + 1
      state.reports[key] = reporting
      save()
    }
    const updated = await pollMp(task.task_code)
    if (!updated) {
      log("任务在回读中消失")
      return "open"
    }
    if (updated.accept_status === "claimed") return "done"
    if (mpReached(updated, task.task_code)) {
      await claimTask(updated)
      return "claimed"
    }
    log(`上游进度 ${progressOf(updated).current}/${mpTarget(task.task_code, progressOf(updated).target)}，尚未达成，下次重试`)
    return "open"
  }
  const runMpExpert = async (task) => {
    if (task.accept_status === "claimed") return "done"
    if (completed(task)) {
      await claimTask(task)
      return "claimed"
    }
    if (task.locked === true) {
      log("任务尚未解锁，本轮跳过")
      return "open"
    }
    const [expert] = await marketList("agent")
    await readyMp(task)
    await reportMp([miniExpertUseEvent(expert.id, expert.name || expert.title, expert.type)])
    const updated = await pollMp(task.task_code)
    if (!updated) {
      log("任务在回读中消失")
      return "open"
    }
    if (updated.accept_status === "claimed") return "done"
    if (mpReached(updated, task.task_code)) {
      await claimTask(updated)
      return "claimed"
    }
    log("已上报专家对话，进度未归账（异步计分，下次重试）")
    return "open"
  }
  const runMpEvent = async (task, spec) => {
    if (task.accept_status === "claimed") return "done"
    if (completed(task)) {
      await claimTask(task)
      return "claimed"
    }
    if (task.locked === true) {
      log("任务尚未解锁（每日零点解锁一环），本轮跳过")
      return "open"
    }
    await readyMp(task)
    const primary = async () => {
      if (spec.variant === "automation") {
        const conv = newConversationId()
        const req = newRequestId()
        await reportDesktop(automationEvents("自动化"), conv, req)
      } else if (spec.variant === "model") {
        await reportMp([miniChatModelEvent(GLM_MODEL.id, GLM_MODEL.name)])
      } else {
        const conv = newConversationId()
        const req = newRequestId()
        await reportDesktop(playbookEvents(conv, req), conv, req)
      }
    }
    const fallback = async () => {
      if (spec.variant === "model") {
        const conv = newConversationId()
        await reportDesktop([chatRequestEvent(GLM_MODEL.id, GLM_MODEL.name, conv)], conv, conv)
      } else {
        await reportMp(miniPlaybookEvents(PLAYBOOK_CASE))
      }
    }
    await primary()
    let updated = await pollMp(task.task_code)
    if (!mpReached(updated, task.task_code) && spec.variant !== "automation") {
      await fallback()
      updated = await pollMp(task.task_code)
    }
    if (!updated) {
      log("任务在回读中消失")
      return "open"
    }
    if (updated.accept_status === "claimed") return "done"
    if (mpReached(updated, task.task_code)) {
      await claimTask(updated)
      return "claimed"
    }
    log("已上报但进度未点亮（判据待解锁后校正，下次重试）")
    return "open"
  }

  // ---- desktop / web kinds ---------------------------------------------
  const runCanvas = async () => {
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop(canvasEvents(conv, req), conv, req)
  }
  const runChat = async (task, spec, round) => {
    if (spec.kind === "glmchat") {
      const conv = newConversationId()
      await reportDesktop([chatRequestEvent(GLM_MODEL.id, GLM_MODEL.name, conv)], conv, conv)
      return
    }
    const model = spec.model || FAST_MODEL
    const modelName = spec.modelName || model
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop(chatEvents(model, conv, req, modelName), conv, req)
  }
  const runTemplate = async (task, round) => {
    const [id, name] = TEMPLATES[round % TEMPLATES.length]
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop(templateEvents(id, name, conv, req), conv, req)
  }
  const runPlaybook = async () => {
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop(playbookEvents(conv, req), conv, req)
  }
  const runAutomation = async () => {
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop(automationEvents(), conv, req)
  }
  const runBuddyApp = async (task, spec) => {
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop(buddyAppEvents(BUDDY_APP_ID, spec.appName), conv, req)
  }
  const runSkin = async () => {
    await client.request("/v2/user-asset/appearance/set", { body: { kind: "theme", resource_key: THEME_KEY } })
    await settle()
    const conv = newConversationId()
    const req = newRequestId()
    await reportDesktop(appearanceEvents(), conv, req)
  }
  const runSkill = async () => {
    const session = await openChat("")
    await reportDesktop(skillEvents(session.conv, session.req), session.conv, session.req)
  }
  const runWebClick = async () => {
    await report(withWebFingerprint(uid, nickname, enterpriseId, webClickEvents(uid, nickname, enterpriseId)), WEB)
  }
  const runExpert = async (task, spec, round) => {
    const rows = await marketList(spec.expertType || "agent")
    const expert = rows[round % rows.length]
    const session = await openChat(expert.id)
    const events = [...expertSummonEvents(expert), ...expertChatEvents(expert, session.conv, session.req, "craft", { hasExpert: false })]
    await reportDesktop(events, session.conv, session.req)
  }
  const runFixedExpert = async (task, spec) => {
    const expert = await enrichExpert(spec.expert)
    const session = await openChat(expert.id)
    const events = [...expertSummonEvents(expert), ...expertChatEvents(expert, session.conv, session.req, "LOCAL")]
    await reportDesktop(events, session.conv, session.req)
  }

  const makeUnit = async (task, spec, round) => {
    switch (spec.kind) {
      case "canvas":
        return runCanvas(task)
      case "template":
        return runTemplate(task, round)
      case "playbook":
        return runPlaybook(task)
      case "automation":
        return runAutomation(task)
      case "buddyapp":
        return runBuddyApp(task, spec)
      case "skin":
        return runSkin(task)
      case "skill":
        return runSkill(task)
      case "webClick":
        return runWebClick(task)
      case "fixedExpert":
        return runFixedExpert(task, spec)
      case "expert":
        return runExpert(task, spec, round)
      default:
        return runChat(task, spec, round)
    }
  }
  const runUnits = async (task, spec) => {
    const { current, target } = progressOf(task)
    const amount = spec.night ? 1 : Math.max(0, target - current)
    if (!(amount > 0)) throw new Error(`${task.task_code} 缺少有效进度信息`)
    const key = reportKey(task.task_code)
    // The day's sent count is immutable (baseline contract: a second run does
    // not resend units it already reported).
    const reporting = state.reports[key] || { sent: 0, total: amount, base: current }
    if (reporting.sent) log(`${task.title || task.task_code}：今天已上报 ${reporting.sent} 次，核对上游进度`)
    for (let i = reporting.sent; i < reporting.total; i++) {
      await makeUnit(task, spec, reporting.base + i)
      reporting.sent = i + 1
      state.reports[key] = reporting
      save()
    }
    log(`${task.title || task.task_code}：累计已上报 ${reporting.sent} 次`)
  }

  const pollUntil = async (code, attempts = 3) => {
    let last
    for (let attempt = 0; attempt < attempts; attempt++) {
      last = await findTask(code)
      if (!last) throw new Error(`${code} 在进度查询中消失`)
      if (last.accept_status === "claimed") return { task: last, state: "done" }
      if (completed(last)) return { task: last, state: "claim" }
      if (attempt < attempts - 1) await pollGap()
    }
    return { task: last, state: "open" }
  }
  /** One real-conversation retry for chat criteria that did not move on synthetic events. */
  const retryWithRealChat = async (task, spec) => {
    const session = await openChat("")
    const { current, target } = progressOf((await findTask(task.task_code)) ?? task)
    const needed = Math.max(1, target - current)
    for (let i = 0; i < needed; i++) {
      if (spec.kind === "glmchat") {
        await reportDesktop([chatRequestEvent(GLM_MODEL.id, GLM_MODEL.name, session.conv)], session.conv, session.req)
      } else {
        const conv = `${session.conv}-${i}`
        await reportDesktop(chatEvents(spec.model || FAST_MODEL, conv, session.req, spec.modelName || spec.model || FAST_MODEL), conv, session.req)
      }
    }
    await settle()
    return pollUntil(task.task_code)
  }

  const progress = async (task) => {
    const code = task.task_code
    const spec = specs[code]
    if (task.accept_status === "claimed") return "done"
    if (completed(task)) {
      await claimTask(task)
      return "claimed"
    }
    if (!spec) {
      log(`${task.title || code}：${manualTasks[code] || "尚未适配此任务"}${task.jump_url ? `（${task.jump_url}）` : ""}`)
      return "manual"
    }
    if (spec.kind === "level") {
      log(`${task.title || code}：${manualTasks[code] || "等级任务判据由服务端活动记录"}${task.jump_url ? `（${task.jump_url}）` : ""}`)
      return "manual"
    }
    if (spec.night) {
      const h = hour()
      if (h >= 8 && h < 23) {
        log("夜猫子任务：等待 23:00–08:00 时段")
        return "open"
      }
    }
    if (spec.kind === "firstBuddy") return adoptBuddy(task)
    if (spec.kind === "mpChat") return runMpChat(task)
    if (spec.kind === "mpExpert") return runMpExpert(task)
    if (spec.kind === "mpEvent") return runMpEvent(task, spec)
    if (task.accept_status === "not_accepted" && task.task_type !== "auto") await accept(task)

    await runUnits(task, spec)
    await settle()
    let polled = await pollUntil(code)
    if (polled.state === "done") return "done"
    if (polled.state === "claim") {
      await claimTask(polled.task)
      return "claimed"
    }
    // black_cat is capped at one report per account per night (see its spec),
    // so it must not enter the retry path that fills the whole target.
    if (["chat", "glmchat"].includes(spec.kind) && !spec.night) {
      try {
        polled = await retryWithRealChat(task, spec)
        if (polled.state === "done") return "done"
        if (polled.state === "claim") {
          await claimTask(polled.task)
          return "claimed"
        }
      } catch (e) {
        if (e?.limited) throw e
        log(`真实会话重试失败：${e.message}`)
      }
    }
    log(`${task.title || code}：上游进度 ${progressOf(polled.task).current}/${progressOf(polled.task).target}，尚未达成，未领奖`)
    return "open"
  }

  const runTasks = async (onlyNight) => {
    const failures = []
    const errors = []
    const all = await list()
    if (onlyNight && !all.some((t) => t.task_code === "black_cat")) {
      log("当前任务中心没有夜猫子任务")
      return { checked: 0, inactive: true }
    }
    // first_buddy unlocks acceptance of the other tasks and supplies the pet.
    all.sort((a, b) => Number(b.task_code === "first_buddy") - Number(a.task_code === "first_buddy"))
    const outcome = { claimed: 0, open: 0, manual: [] }
    const claimed = new Set()
    for (const task of all) {
      if (onlyNight && task.task_code !== "black_cat") continue
      try {
        const got = await progress(task)
        if (got === "manual") outcome.manual.push(task.title || task.task_code)
        else if (got === "claimed") {
          outcome.claimed++
          claimed.add(task.task_code)
        } else if (got in outcome) outcome[got]++
      } catch (e) {
        failures.push(`${task.task_code}：${e.message}`)
        errors.push(e)
        log(failures.at(-1))
      }
    }
    // Sweep: rewards already earned but never claimed are collected even for
    // codes this build does not know yet, so new tasks keep paying out.
    for (const task of all) {
      if (onlyNight && task.task_code !== "black_cat") continue
      if (task.accept_status === "claimed" || claimed.has(task.task_code) || !completed(task)) continue
      try {
        const result = await claimTask(task)
        if (result.claimed) {
          claimed.add(task.task_code)
          outcome.claimed++
        }
      } catch (e) {
        if (!(e instanceof GrowthError)) throw e
        log(`补领 ${task.task_code} 未成：${e.message}`)
      }
    }
    if (failures.length) throw roundError(`部分任务失败：${failures.join("；")}`, errors)
    if (!onlyNight) {
      log(
        [`本次领奖 ${outcome.claimed} 项`, outcome.open && `${outcome.open} 项未达成`, outcome.manual.length && `${outcome.manual.length} 项需要你手动完成：${outcome.manual.join("、")}`]
          .filter(Boolean)
          .join("；"),
      )
    }
    return { checked: all.length, claimed: outcome.claimed }
  }

  const activity = () =>
    daily("activity", async () => {
      // A real short chat is what the activity ledger records; the synthetic
      // event is the fallback when the chat endpoint refuses.
      try {
        await openChat("")
      } catch (e) {
        if (e?.limited) throw e
        log(`真实对话未成（${e.message}），改用事件上报`)
        const conv = newConversationId()
        const req = newRequestId()
        await reportDesktop([chatRequestEvent(FAST_MODEL, FAST_MODEL, conv)], conv, req)
      }
      // streak.days counts days up to the last active one, so it stays > 0 on a
      // day with no activity at all; only the heatmap's own "today" says today.
      const got = await client.request("/activity/growth/streak")
      const heatmap = await client.request("/activity/growth/heatmap")
      if (heatmap?.today?.is_active !== true) {
        throw new Error(`活跃已上报，但上游今天仍未点亮（连登 ${got?.streak?.days ?? 0} 天），尚未确认生效`)
      }
      log(`国内活跃已生效，连续 ${got.streak.days} 天`)
      return got.streak
    })

  const travel = async () => {
    const base = "/activity/growth/buddy/travel"
    let status = await client.request(base + "/status")
    if (status.state === "arrived") {
      let reward
      try {
        reward = await client.request(base + "/claim", { body: {} })
      } catch (e) {
        // Newer builds require the arrived record id; older ones accept {}.
        if (isBusiness(e, /record/i) && status.record_id !== undefined) reward = await client.request(base + "/claim", { body: { record_id: status.record_id } })
        else throw e
      }
      log(`猫猫归来：已领取 ${reward?.reward_credit ?? 0} 积分`)
      status = await client.request(base + "/status")
    }
    if (status.state === "traveling") {
      log("猫猫正在旅行")
      return status
    }
    if (status.state !== "idle") throw new Error(`未知猫猫状态：${status.state}`)
    if (status.daily_limit_reached) {
      log("猫猫今日旅行已完成")
      return status
    }
    // Some builds expose a destination list; the client has also shipped a
    // fixed destination id 4. Fall back to it when the config route is absent.
    let location = { id: 4, name: "默认目的地" }
    try {
      const configuration = await client.request(base + "/config")
      const first = configuration?.locations?.[0]
      if (first?.id !== undefined) location = first
    } catch (e) {
      if (!(e instanceof GrowthError)) throw e
    }
    const first = (await list()).find((t) => t.task_code === "first_buddy")
    if (first && first.accept_status !== "claimed") {
      try {
        await progress(first)
      } catch (e) {
        if (!(e instanceof GrowthError)) throw e
        log(`首只 Buddy 先行失败：${e.message}`)
      }
    }
    const departed = await client.request(base + "/depart", { body: { location_id: location.id } })
    log(`猫猫已出发：${location.name || location.id}`)
    return departed
  }

  const settleBenefit = async (title, statusPath, claimPath, pending) => {
    const key = `${account.id}:${claimPath}`
    if (state.daily[key] === "settled") return
    const requestBenefit = async (path, body) => {
      try {
        return await client.request(`/billing/meter/${path}`, { billing: true, body })
      } catch (e) {
        // Builds differ on which host serves these meter endpoints (codebuddy.cn
        // vs workbuddy.cn); a missing route falls back to the other host once.
        if (e instanceof GrowthError && [403, 404].includes(e.status)) return client.request(`/billing/meter/${path}`, { body })
        throw e
      }
    }
    try {
      const status = await requestBenefit(statusPath, {})
      if (!pending(status)) {
        // "settled" is permanent — only a definite claim may set it. A closed
        // activity or an empty quota must be checked again on the next run.
        if (status?.claimed === true) state.daily[key] = "settled"
        log(`${title}：无可领取额度`)
        save()
        return
      }
    } catch (e) {
      if (e?.limited) throw e
      if (!(e instanceof GrowthError)) throw e
      // Status endpoints differ across builds; a direct claim below is the fallback.
    }
    try {
      const got = await requestBenefit(claimPath, {})
      log(`${title}：已领取 ${got?.credit ?? 0} 积分`)
      state.daily[key] = "settled"
    } catch (e) {
      if (!(e instanceof GrowthError) || !PENDING_BENEFIT.test(e.message)) throw e
      log(`${title}：${e.message}`)
      if (/已领取|限领一次/.test(e.message)) state.daily[key] = "settled"
    }
    save()
  }

  const bonus = async () => {
    const heatmap = await client.request("/activity/growth/heatmap")
    let streak = await client.request("/activity/growth/streak")
    const cards = Number(streak?.makeup_cards?.balance) || 0
    const todayDate = String(heatmap?.today?.date || day()).slice(0, 10)
    const monthStart = `${todayDate.slice(0, 8)}01`
    const broken = (heatmap?.cells || [])
      .map((c) => ({ date: String(c.date || "").slice(0, 10), score: Number(c.score) || 0 }))
      .filter((c) => c.date.length === 10 && c.score === 0 && c.date >= monthStart && c.date < todayDate)
      .map((c) => c.date)
      .sort()
    // A makeup that succeeded must never be spent again: the heatmap's score is
    // activity, which a makeup may not change, so the same broken day would be
    // picked again on the next run while cards last.
    const usedBefore = new Set(Object.keys(state.makeups))
    let used = 0
    for (const target of broken.reverse()) {
      if (used >= cards || usedBefore.has(target)) continue
      try {
        await client.request("/activity/growth/makeup-cards/use", { body: { target_date: target } })
        used++
        state.makeups[target] = todayDate
        save()
      } catch (e) {
        if (e?.limited) throw e
        if (e instanceof GrowthError) {
          log(`补签 ${target} 未成：${e.message}`)
          break
        }
        throw e
      }
    }
    if (used) {
      streak = await client.request("/activity/growth/streak")
      log(`已用 ${used} 张补签卡补签（连续 ${streak.streak?.days ?? 0} 天）`)
    }
    const redemption = streak.redemption_status
    for (const tier of redemption?.tiers || []) {
      const status = redemption[`tier_${tier.tier}_status`]
      if (["locked", "claimed"].includes(status)) continue
      try {
        await client.request("/activity/growth/redeem", { body: { tier: tier.tier, client_token: randomUUID() } })
        log(`已兑换连登 ${tier.tier} 档位（+${tier.credit ?? 0} 积分${tier.chances ? `，+${tier.chances} 抽奖次数` : ""}）`)
      } catch (e) {
        if (e?.limited) throw e
        if (isBusiness(e, /天数不足|locked|not unlocked/i)) continue
        if (e instanceof GrowthError) {
          log(`兑换 ${tier.tier} 未成：${e.message}`)
          continue
        }
        throw e
      }
    }
    const lottery = await client.request("/activity/growth/lottery/summary")
    const chances = lottery?.module?.enabled === false ? 0 : Math.min(Number(lottery.chances) || 0, LOTTERY_CAP)
    for (let i = 0; i < chances; i++) {
      const result = await client.request("/activity/growth/lottery/draw", { body: { client_token: randomUUID() } })
      log(`成长抽奖 ${i + 1}/${chances}：${JSON.stringify(result)}`)
    }
    await settleBenefit("新手礼包", "check-gift-claimed", "claim-gift", (s) => s?.active === true && s?.claimed !== true && Number(s?.credit_num ?? s?.creditNum) > 0)
    await settleBenefit("活动补偿", "compensation-status", "claim-compensation", (s) => s?.active === true && s?.claimed !== true && Number(s?.creditNum ?? s?.credit_num) > 0)
    log("连登兑换、补签与抽奖检查完毕")
    return { days: streak.streak?.days, draws: chances }
  }

  const night = () => runTasks(true)

  /**
   * run 是「一轮」：checkin → activity → tasks → travel → bonus。
   * 每一项各自 try：一项失败不该把别的项也停掉，但被限流要整体停手
   * （再打只会让风控更重）。
   */
  const run = async ({ actions = ["checkin", "activity", "tasks", "travel", "bonus"] } = {}) => {
    const handlers = { checkin, activity, tasks: () => runTasks(false), travel, bonus, night }
    const results = {}
    const failures = []
    const errors = []
    for (const name of actions) {
      const handler = handlers[name]
      if (!handler) continue
      try {
        results[name] = await handler()
      } catch (e) {
        results[name] = { error: e.message }
        failures.push(name)
        errors.push(e)
        log(`${name} ${e.limited ? "被限流" : "失败"}：${e.message}`)
        if (e?.limited) break
      }
    }
    if (failures.length) {
      const e = roundError(`本轮有${errors.every((x) => x.limited) ? "被限流的" : "失败"}项目：${failures.join("、")}`, errors)
      e.results = results
      throw e
    }
    return results
  }

  return { run, checkin, activity, tasks: () => runTasks(false), travel, bonus, night, list }
}
