import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const generatorPath = path.resolve(testDir, '../scripts/generate_remote_overlay.mjs')

test('generates remote overlay by matching translated English values and keeps manual entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-overlay-'))
  const files = Object.fromEntries(['remote', 'source', 'target', 'manual', 'output'].map(name => [name, path.join(root, `${name}.json`)]))
  fs.writeFileSync(files.remote, JSON.stringify({ a: 'Settings', b: 'New remote text', c: '{name} connected' }))
  fs.writeFileSync(files.source, JSON.stringify({ localA: 'Settings', localC: '{name} connected' }))
  fs.writeFileSync(files.target, JSON.stringify({ localA: '设置', localC: '{name} 已连接' }))
  fs.writeFileSync(files.manual, JSON.stringify({ b: '新的远端文本' }))
  execFileSync(process.execPath, [generatorPath, files.remote, files.source, files.target, files.manual, files.output], { stdio: 'pipe' })
  const output = JSON.parse(fs.readFileSync(files.output, 'utf8'))
  assert.deepEqual(output, { b: '新的远端文本', a: '设置', c: '{name} 已连接' })
})
