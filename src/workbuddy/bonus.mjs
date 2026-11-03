// 限时补偿积分 —— 纯协议模块，不读凭据、不写缓存、不自己调度。
//
// 端点来自 WorkBuddy / CodeBuddy 用户中心前端：
//   POST /billing/meter/compensation-status
//   POST /billing/meter/claim-compensation
// 两者都在 webBase 上，没有 /v2 前缀。鉴权由调用方注入，便于测试与复用。
//
// 一次性活动默认不自动领取；运行时只有用户显式打开插件选项才调用 claim。

export const COMPENSATION_STATUS_PATH = "/billing/meter/compensation-status"
export const COMPENSATION_CLAIM_PATH = "/billing/meter/claim-compensation"

export class BonusError extends Error {
  constructor(message, { kind = "upstream", status = 0, code = "", url = "" } = {}) {
    super(message)
    this.name = "BonusError"
    this.kind = kind
    this.status = status
    this.code = code
    this.url = url
  }
}

function parse(text) {
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new BonusError(`返回的不是 JSON：${text.slice(0, 200)}`, { kind: "shape" })
  }
}

function envelope(body, { requireData = true } = {}) {
  if (!body || typeof body !== "object") {
    throw new BonusError("响应不是对象", { kind: "shape" })
  }
  const code = Number(body.code ?? 0)
  if (!Number.isFinite(code) || code !== 0) {
    throw new BonusError(String(body.msg || body.message || `业务码 ${body.code}`), {
      kind: "upstream",
      code: String(body.code ?? ""),
    })
  }
  if (!requireData) return null
  if (!body.data || typeof body.data !== "object") {
    throw new BonusError("响应缺少 data 对象", { kind: "shape" })
  }
  return body.data
}

function timeOf(value) {
  if (typeof value !== "string" || !value.trim()) return undefined
  const text = value.trim()
  // WorkBuddy 用北京时间且不带时区，例如 2026-10-22 23:59:59。
  const ms = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? Date.parse(text.replace(" ", "T") + "+08:00")
    : Date.parse(text)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

/** 把状态响应整理成卡片/签到摘要能直接使用的形状。 */
export function compensationOf(data) {
  const amount = Number(data?.credit_num ?? data?.creditNum ?? 0)
  return {
    active: data?.active === true,
    claimed: data?.claimed === true,
    claimable: data?.active === true && data?.claimed !== true,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    endAt: timeOf(data?.end_time ?? data?.endTime),
    validityDays: Number(data?.validity_period ?? data?.validityPeriod ?? 0) || 0,
  }
}

async function post(base, path, headers, { fetcher = fetch, timeoutMs = 15_000 } = {}) {
  const url = String(base).replace(/\/+$/, "") + path
  const res = await fetcher(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", accept: "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  return { res, url, body: parse(text) }
}

/** 查询当前账号的限时补偿状态。 */
export async function fetchCompensation({ base, headers, fetcher = fetch, timeoutMs } = {}) {
  if (!base) throw new BonusError("缺少补偿接口 base", { kind: "shape" })
  let out
  try {
    out = await post(base, COMPENSATION_STATUS_PATH, headers, { fetcher, timeoutMs })
  } catch (e) {
    if (e instanceof BonusError) throw e
    throw new BonusError(`请求补偿状态失败：${e?.message ?? String(e)}`, { kind: "network" })
  }
  if (!out.res.ok) {
    throw new BonusError(`补偿状态 HTTP ${out.res.status}`, { status: out.res.status, url: out.url })
  }
  const data = envelope(out.body)
  return compensationOf(data)
}

/** 领取限时补偿；成功判据只看 code，因为成功响应没有 data。 */
export async function claimCompensation({ base, headers, fetcher = fetch, timeoutMs } = {}) {
  if (!base) throw new BonusError("缺少补偿接口 base", { kind: "shape" })
  let out
  try {
    out = await post(base, COMPENSATION_CLAIM_PATH, headers, { fetcher, timeoutMs })
  } catch (e) {
    if (e instanceof BonusError) throw e
    throw new BonusError(`领取补偿失败：${e?.message ?? String(e)}`, { kind: "network" })
  }
  if (!out.res.ok) {
    throw new BonusError(`领取补偿 HTTP ${out.res.status}`, { status: out.res.status, url: out.url })
  }
  envelope(out.body, { requireData: false })
  return true
}

export function describeCompensationFailure(error) {
  if (!(error instanceof BonusError)) return String(error?.message ?? error)
  if (error.kind === "network") return `请求失败：${error.message}`
  if (error.kind === "shape") return `响应格式不认识：${error.message}`
  return `上游拒绝${error.code ? `（业务码 ${error.code}）` : ""}：${error.message}`
}
