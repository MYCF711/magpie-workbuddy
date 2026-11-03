#!/usr/bin/env node
// 只跑 Node 内置 runner 的测试（tests/*.test.mjs），排除 tests/community
//（后者使用 bun:test，由 scripts/test-community.mjs 执行）。
import { readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const files = readdirSync(join(root, "tests"), { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".test.mjs"))
  .map((e) => join("tests", e.name))
  .sort()

if (!files.length) {
  console.error("没有找到 Node 测试文件")
  process.exit(1)
}
const out = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", cwd: root })
process.exit(out.status ?? 1)
