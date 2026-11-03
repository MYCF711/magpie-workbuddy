// tests/growth.test.mjs —— 成长中心的执行语义
//
// 全部离线：client 是假的，时间与等待也压到 0。
// 这些断言锁的是「写错了不报错、只是领不到积分」的地方。

import test from "node:test"
import assert from "node:assert/strict"

import { createGrowth, GrowthError, calendarOf } from "../src/workbuddy/growth.mjs"

const site = { id: "workbuddy", name: "WorkBuddy", ai: false, app: "5.9.3", cli: "2.165.0", appName: "WorkBuddy" }
const account = { id: "acc", name: "张三", auth: { uid: "u1", access: "tok" } }
const fast = { settleMs: 0, mpChatGapMs: 0, mpJitterMs: 0, mpActionGapMs: 0, mpPollMs: 0, pollDelay: 0 }

// fakeClient answers by path; a handler may inspect body/headers.
function fakeClient(routes = {}) {
  const calls = []
  const client = {
    origin: "https://www.workbuddy.cn",
    headers: () => ({ "X-User-Id": "u1" }),
    request: async (path, opts = {}) => {
      calls.push({ path, body: opts.body, headers: opts.headers, billing: opts.billing })
      const handler = routes[path]
      if (!handler) throw new GrowthError(path, 404, { code: 404, msg: `no route ${path}` })
      return handler(opts)
    },
    // A real chat: the id in this stream is what expert/skill criteria join to.
    fetch: async () => new Response('data: {"id":"0123456789abcdef0123456789abcdef"}\n\n', { headers: { "content-type": "text/event-stream" } }),
    refresh: async () => false,
    calls,
  }
  return client
}

function growthOf(client, { state = {}, ai = false, log = [] } = {}) {
  return createGrowth({
    site: { ...site, ai },
    account,
    client,
    config: fast,
    state,
    log: (m) => log.push(m),
  })
}

test("签到：没签就签，签过就答 done", async () => {
  const signed = fakeClient({
    "/v2/billing/meter/checkin-activity-status": () => ({ active: true, today_checked_in: false }),
    "/v2/billing/meter/daily-checkin": () => ({ credit: 30, streak_days: 4 }),
  })
  const first = await growthOf(signed).checkin()
  assert.equal(first.outcome, "claimed")
  assert.equal(first.credit, 30)
  assert.equal(first.streak, 4)

  const held = fakeClient({
    "/v2/billing/meter/checkin-activity-status": () => ({ active: true, today_checked_in: true, today_credit: 20 }),
  })
  const second = await growthOf(held).checkin()
  assert.equal(second.outcome, "done")
  assert.equal(held.calls.some((c) => c.path.includes("daily-checkin")), false, "签过就不该再发签到请求")
})

test("签到：1001 是今天已签，不算失败", async () => {
  const client = fakeClient({
    "/v2/billing/meter/checkin-activity-status": () => {
      throw new GrowthError("x", 200, { code: 1001, msg: "今日已签到" })
    },
  })
  assert.equal((await growthOf(client).checkin()).outcome, "done")
})

test("任务：completed 的直接领，未完成的上报后回读再领", async () => {
  let progress = 0
  const client = fakeClient({
    "/v2/activity/growth/tasks": () => ({
      tasks: [
        { task_code: "chat_5", title: "完成一次对话", accept_status: "accepted", progress: { current: 0, target: 1 } },
      ],
    }),
    "/activity/growth/tasks": () => ({ tasks: [] }),
    "/v2/report": () => ({}),
    "/activity/growth/tasks/chat_5/claim": () => ({ credit: 100 }),
  })
  // The list is read again after reporting; the second read shows the unit.
  const original = client.request
  let tasksReads = 0
  client.request = async (path, opts) => {
    if (path === "/v2/activity/growth/tasks") {
      tasksReads += 1
      if (tasksReads > 1) progress = 1
      return {
        tasks: [{ task_code: "chat_5", title: "完成一次对话", accept_status: "accepted", progress: { current: progress, target: 1 } }],
      }
    }
    return original(path, opts)
  }
  const out = await growthOf(client).tasks()
  assert.equal(out.claimed, 1)
  assert.equal(client.calls.some((c) => c.path === "/v2/report"), true, "要上报事件才点亮判据")
  assert.equal(client.calls.some((c) => c.path === "/activity/growth/tasks/chat_5/claim"), true)
})

test("任务：同一天不重发已经上报过的次数", async () => {
  const state = {}
  let calls = 0
  const client = fakeClient({
    "/v2/activity/growth/tasks": () => ({
      tasks: [{ task_code: "chat_5", title: "对话", accept_status: "accepted", progress: { current: 0, target: 1 } }],
    }),
    "/activity/growth/tasks": () => ({ tasks: [] }),
    "/v2/report": () => {
      calls += 1
      return {}
    },
  })
  await growthOf(client, { state }).tasks()
  const snapshot = JSON.stringify(state.reports)
  assert.equal(Object.values(state.reports).every((r) => r.sent === 1), true, "第一次该把今天那一次报掉")
  await growthOf(client, { state }).tasks()
  assert.equal(JSON.stringify(state.reports), snapshot, "第二次跑不该改动已上报计数（重发只会加重风控）")
})

test("猫猫：arrived 先领奖再出发", async () => {
  const seen = []
  const client = fakeClient({
    "/activity/growth/buddy/travel/status": () => ({ state: seen.includes("claim") ? "idle" : "arrived", record_id: 7 }),
    "/activity/growth/buddy/travel/claim": () => {
      seen.push("claim")
      return { reward_credit: 50 }
    },
    "/activity/growth/buddy/travel/config": () => ({ locations: [{ id: 9, name: "杭州" }] }),
    "/activity/growth/buddy/travel/depart": () => ({
      state: "traveling",
    }),
    "/v2/activity/growth/tasks": () => ({ tasks: [] }),
    "/activity/growth/tasks": () => ({ tasks: [] }),
  })
  const log = []
  await growthOf(client, { log }).travel()
  assert.equal(seen.includes("claim"), true)
  assert.equal(log.some((m) => m.includes("猫猫已出发：杭州")), true, "配置里有目的地就用它，没有才退回 id 4")
})

test("猫猫：traveling 时不重复出发", async () => {
  const client = fakeClient({
    "/activity/growth/buddy/travel/status": () => ({ state: "traveling" }),
  })
  const log = []
  await growthOf(client, { log }).travel()
  assert.equal(log.some((m) => m.includes("猫猫正在旅行")), true)
  assert.equal(client.calls.some((c) => c.path.endsWith("/depart")), false)
})

test("连登：补签卡只花一次，兑换与抽奖各按状态走", async () => {
  const drawn = []
  const redeemed = []
  const used = []
  let tier1 = "unlocked"
  const today = calendarOf(Date.now()).day
  const client = fakeClient({
    "/activity/growth/heatmap": () => ({
      today: { date: today, is_active: true },
      cells: [{ date: `${today.slice(0, 8)}01`, score: 0 }],
    }),
    "/activity/growth/streak": () => ({
      streak: { days: 5 },
      makeup_cards: { balance: 2 },
      redemption_status: {
        tiers: [
          { tier: 1, credit: 50 },
          { tier: 2, credit: 100 },
        ],
        tier_1_status: tier1,
        tier_2_status: "claimed",
      },
    }),
    "/activity/growth/makeup-cards/use": (opts) => {
      used.push(opts.body.target_date)
      return {}
    },
    "/activity/growth/redeem": (opts) => {
      redeemed.push(opts.body.tier)
      // 上游兑换成功后把这一档改成 claimed —— 第二次读到的就是 claimed
      tier1 = "claimed"
      return {}
    },
    "/activity/growth/lottery/summary": () => ({ chances: 2, module: { enabled: true } }),
    "/activity/growth/lottery/draw": () => {
      drawn.push(1)
      return { credit: 10 }
    },
    "/billing/meter/check-gift-claimed": () => ({ active: true, claimed: false, credit_num: 100 }),
    "/billing/meter/claim-gift": () => ({ credit: 100 }),
    "/billing/meter/compensation-status": () => ({ active: false }),
  })
  const state = {}
  await growthOf(client, { state }).bonus()

  assert.deepEqual(used, [`${today.slice(0, 8)}01`], "只补一个断掉的日期")
  assert.deepEqual(redeemed, [1], "已领的档位不再兑换")
  assert.equal(drawn.length, 2, "抽奖次数按上游给的来")
  assert.equal(state.daily["acc:claim-gift"], "settled", "领过的礼包记成永久完成")

  // Second run: the same broken day must not be made up twice.
  used.length = 0
  await growthOf(client, { state }).bonus()
  assert.deepEqual(used, [], "补签过的日期不再花第二张卡")
  assert.equal(redeemed.length, 1, "已兑换的档位也不会第二次兑换")
})

test("限流：整体停手，不再往下打", async () => {
  const client = fakeClient({
    "/v2/billing/meter/checkin-activity-status": () => ({ active: true, today_checked_in: false }),
    "/v2/billing/meter/daily-checkin": () => {
      throw new GrowthError("x", 429, { code: 429, msg: "限流" })
    },
  })
  // a 429 must carry `limited` for the round to defer on it
  const original = client.request
  client.request = async (path, opts) => {
    try {
      return await original(path, opts)
    } catch (e) {
      if (e.status === 429) e.limited = true
      throw e
    }
  }
  const log = []
  await assert.rejects(() => growthOf(client, { log }).run({ actions: ["checkin", "tasks"] }), /被限流/)
})

test("国际版：没有成长中心，全部跳过且不写任何东西", async () => {
  const client = fakeClient({
    "/activity/growth/tasks": () => ({ tasks: [{ code: "first_chat", accept_status: "open" }] }),
  })
  const g = growthOf(client, { ai: true })
  assert.equal((await g.checkin()).outcome, "inactive")
  assert.equal((await g.tasks()).reason, "ai")
  assert.equal(client.calls.length, 0, "国际版不该向只在国内存在的端点发一个请求")
})

test("calendarOf 用厂商时区算日，不用宿主本地时区", () => {
  // 2026-11-03T16:30:00Z is 2026-11-04 00:30 in Beijing
  const at = Date.parse("2026-11-03T16:30:00Z")
  assert.equal(calendarOf(at).day, "2026-11-04")
  assert.equal(calendarOf(at).hour, 0)
})
