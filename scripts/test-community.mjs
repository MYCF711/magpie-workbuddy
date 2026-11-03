#!/usr/bin/env node
// 运行从 magpie-community/plugins 引入的 318 条兼容回归（bun:test）。
//
// 这些测试会读写 HOME 下的模拟 WorkBuddy 登录文件，必须在隔离 HOME 里跑。
// Bun 在 Windows 上读 USERPROFILE，故两个变量同时设置。
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

function findBun() {
  if (process.env.BUN && existsSync(process.env.BUN)) return process.env.BUN
  const cache = join(homedir(), ".cache", "magpie", "bun")
  if (existsSync(cache)) {
    for (const version of readdirSync(cache).sort().reverse()) {
      for (const name of ["magpie-bun.exe", "bun.exe", "bun"]) {
        const file = join(cache, version, name)
        if (existsSync(file)) return file
      }
    }
  }
  for (const name of process.platform === "win32" ? ["bun.exe"] : ["bun"]) {
    const found = spawnSync(name, ["--version"], { encoding: "utf8" })
    if (found.status === 0) return name
  }
  return null
}

const bun = findBun()
if (!bun) {
  console.error("✗ 找不到 Bun。magpie 自带的 Bun 通常在 ~/.cache/magpie/bun/<version>/magpie-bun.exe；也可用 BUN=<path> 指定。")
  process.exit(1)
}

const home = mkdtempSync(join(tmpdir(), "magpie-workbuddy-test-"))
try {
  const out = spawnSync(bun, ["test", "tests/community"], {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  process.exitCode = out.status ?? 1
} finally {
  rmSync(home, { recursive: true, force: true })
}
