// Community regression tests were written against a single index.mjs that
// exported both plugins and _internal. Keep that surface as a test-only
// adapter so the imported upstream tests stay byte-for-byte meaningful.
export { WorkBuddyAuthPlugin, WorkBuddyAIAuthPlugin } from "../../index.mjs"
export { _internal } from "../../src/workbuddy/runtime.mjs"
