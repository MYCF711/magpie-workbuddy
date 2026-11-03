import test from "node:test"
import assert from "node:assert/strict"

import {
  BonusError,
  compensationOf,
  fetchCompensation,
  claimCompensation,
  COMPENSATION_STATUS_PATH,
  COMPENSATION_CLAIM_PATH,
  describeCompensationFailure,
} from "../src/workbuddy/bonus.mjs"
import { WorkBuddyAuthPlugin } from "../index.mjs"
import { _internal } from "../src/workbuddy/runtime.mjs"

const BASE = "https://www.workbuddy.cn"

test("compensationOf 保留金额、领取状态并把北京时间转 ISO", () => {
  const out = compensationOf({
    active: true,
    claimed: false,
    credit_num: 500,
    validity_period: 1,
    end_time: "2026-11-05 23:59:59",
  })
  assert.equal(out.active, true)
  assert.equal(out.claimable, true)
  assert.equal(out.claimed, false)
  assert.equal(out.amount, 500)
  assert.equal(out.validityDays, 1)
  assert.equal(out.endAt, "2026-11-05T15:59:59.000Z")
})

test("已领取或活动结束都不可领取", () => {
  assert.equal(compensationOf({ active: true, claimed: true }).claimable, false)
  assert.equal(compensationOf({ active: false, claimed: false }).claimable, false)
})

test("查询状态打正确端点、带鉴权并解析 data", async () => {
  const seen = []
  const out = await fetchCompensation({
    base: BASE + "/",
    headers: { authorization: "Bearer t" },
    fetcher: async (url, init) => {
      seen.push({ url, init })
      return Response.json({ code: 0, msg: "OK", data: { active: true, claimed: false, credit_num: 500 } })
    },
  })
  assert.equal(out.claimable, true)
  assert.equal(seen[0].url, BASE + COMPENSATION_STATUS_PATH)
  assert.equal(seen[0].init.method, "POST")
  assert.equal(seen[0].init.body, "{}")
  assert.equal(seen[0].init.headers.authorization, "Bearer t")
})

test("业务码非 0 是上游拒绝，不伪装成功", async () => {
  await assert.rejects(
    fetchCompensation({
      base: BASE,
      headers: {},
      fetcher: async () => Response.json({ code: 14018, msg: "credits exhausted" }),
    }),
    (e) => e instanceof BonusError && e.kind === "upstream" && e.code === "14018" && /credits exhausted/.test(e.message),
  )
})

test("查询成功但缺 data 是格式错误", async () => {
  await assert.rejects(
    fetchCompensation({
      base: BASE,
      headers: {},
      fetcher: async () => Response.json({ code: 0, msg: "OK" }),
    }),
    (e) => e instanceof BonusError && e.kind === "shape",
  )
})

test("领取只认 code，成功响应没有 data 也算成功", async () => {
  const seen = []
  const ok = await claimCompensation({
    base: BASE,
    headers: {},
    fetcher: async (url) => {
      seen.push(url)
      return Response.json({ code: 0, msg: "OK", requestId: "r1" })
    },
  })
  assert.equal(ok, true)
  assert.equal(seen[0], BASE + COMPENSATION_CLAIM_PATH)
})

test("网络异常变成可读的 network 错误", async () => {
  await assert.rejects(
    fetchCompensation({
      base: BASE,
      headers: {},
      fetcher: async () => {
        throw new Error("ECONNRESET")
      },
    }),
    (e) => e instanceof BonusError && e.kind === "network" && /ECONNRESET/.test(e.message),
  )
})

test("失败说明保留上游原文", () => {
  const e = new BonusError("账号异常", { kind: "upstream", code: "11140" })
  assert.match(describeCompensationFailure(e), /11140/)
  assert.match(describeCompensationFailure(e), /账号异常/)
})

function fakeWorkBuddy({ claimStatus = { active: true, claimed: false, credit_num: 500 }, claim = { code: 0, msg: "OK" }, seen = [] } = {}) {
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url))
    seen.push(u.pathname)
    if (u.pathname === "/v2/billing/meter/checkin-activity-status") {
      return Response.json({ code: 0, msg: "OK", data: { active: true, todayCheckedIn: false } })
    }
    if (u.pathname === "/v2/billing/meter/daily-checkin") {
      return Response.json({ code: 0, msg: "OK", data: { credit: 30 } })
    }
    if (u.pathname === COMPENSATION_STATUS_PATH) return Response.json({ code: 0, msg: "OK", data: claimStatus })
    if (u.pathname === COMPENSATION_CLAIM_PATH) return Response.json(claim)
    return new Response("not found", { status: 404 })
  }
  return () => (globalThis.fetch = original)
}

test("自动补偿默认关闭：签到只打签到接口", async () => {
  const seen = []
  const restore = fakeWorkBuddy({ seen })
  try {
    const plugin = await WorkBuddyAuthPlugin({ client: {} })
    const auth = { type: "oauth", access: "at", refresh: "r", expires: Date.now() + 3_600_000, uid: "u", domain: "" }
    const out = await plugin.auth.checkin(async () => auth)
    assert.equal(out.outcome, "claimed")
    assert.deepEqual(seen, ["/v2/billing/meter/checkin-activity-status", "/v2/billing/meter/daily-checkin"])
  } finally {
    restore()
  }
})

test("打开开关后，签到成功再领取一次补偿，并写进结果", async () => {
  const seen = []
  const restore = fakeWorkBuddy({ seen })
  try {
    const plugin = await WorkBuddyAuthPlugin({
      client: {},
      magpie: { option: (_id, key) => key === _internal.AUTO_COMPENSATION },
    })
    const auth = { type: "oauth", access: "at", refresh: "r", expires: Date.now() + 3_600_000, uid: "u", domain: "" }
    const out = await plugin.auth.checkin(async () => auth)
    assert.equal(out.outcome, "claimed")
    assert.match(out.message, /限时补偿已领取 \+500 积分/)
    assert.deepEqual(seen, [
      "/v2/billing/meter/checkin-activity-status",
      "/v2/billing/meter/daily-checkin",
      COMPENSATION_STATUS_PATH,
      COMPENSATION_CLAIM_PATH,
    ])
  } finally {
    restore()
  }
})

test("补偿已领取或活动结束时不再调用领取接口", async () => {
  for (const [status, words] of [
    [{ active: true, claimed: true, credit_num: 500 }, /限时补偿已领取/],
    [{ active: false, claimed: false, credit_num: 500 }, /未开始或已结束/],
  ]) {
    const seen = []
    const restore = fakeWorkBuddy({ seen, claimStatus: status })
    try {
      const plugin = await WorkBuddyAuthPlugin({
        client: {},
        magpie: { option: (_id, key) => key === _internal.AUTO_COMPENSATION },
      })
      const auth = { type: "oauth", access: "at", refresh: "r", expires: Date.now() + 3_600_000, uid: "u", domain: "" }
      const out = await plugin.auth.checkin(async () => auth)
      assert.match(out.message, words)
      assert.equal(seen.includes(COMPENSATION_CLAIM_PATH), false)
    } finally {
      restore()
    }
  }
})

test("补偿领取失败不把签到改成失败", async () => {
  const restore = fakeWorkBuddy({ claim: { code: 14018, msg: "credits exhausted" } })
  try {
    const plugin = await WorkBuddyAuthPlugin({
      client: {},
      magpie: { option: (_id, key) => key === _internal.AUTO_COMPENSATION },
    })
    const auth = { type: "oauth", access: "at", refresh: "r", expires: Date.now() + 3_600_000, uid: "u", domain: "" }
    const out = await plugin.auth.checkin(async () => auth)
    assert.equal(out.outcome, "claimed")
    assert.match(out.message, /限时补偿领取失败/)
    assert.match(out.message, /credits exhausted/)
  } finally {
    restore()
  }
})
