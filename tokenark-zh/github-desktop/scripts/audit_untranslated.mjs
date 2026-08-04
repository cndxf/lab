#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = process.argv[2] || '/Applications/GitHub Desktop.app'
const roots = [
  path.join(appRoot, 'Contents', 'Resources', 'app'),
  path.join(appRoot, 'Contents', 'Resources'),
]
const output = process.argv[3] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../reports/github-desktop-untranslated.json')
const ignored = /^(https?:\/\/|file:\/\/|[A-Za-z_$][\w$.-]*$|[./~_-]|[A-Z0-9_ -]{2,}$)/
const uiWords = /\b(the|your|you|repository|branch|commit|pull|request|create|choose|open|close|cancel|save|settings|account|no|all|add|clone|new|allow|bypass|based|default)\b/i
const files = []
const seen = new Set()
function walk(dir) {
  if (!fs.existsSync(dir) || seen.has(dir)) return
  seen.add(dir)
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', 'copilot', 'schema', 'schemas'].includes(entry.name)) walk(file)
    } else if (/\.(?:js|html)$/.test(entry.name) && !/\.map$/.test(entry.name) && entry.name !== 'tokenark-ghd-zh.js' && fs.statSync(file).size < 20 * 1024 * 1024) files.push(file)
  }
}
roots.forEach(walk)
const counts = new Map()
const literal = /(['"`])((?:\\.|(?!\1)[^\\\n]){3,240})\1/g
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(literal)) {
    const value = match[2].replace(/\\(['"`\\])/g, '$1').trim()
    if (!/[A-Za-z]/.test(value) || !uiWords.test(value) || ignored.test(value) || /[{};$=<>]/.test(value) || /(?:new RegExp|\breturn\b|=>|^,)/.test(value)) continue
    const item = counts.get(value) || { text: value, count: 0, files: [] }
    item.count += 1
    if (item.files.length < 5 && !item.files.includes(file)) item.files.push(file)
    counts.set(value, item)
  }
}
const candidates = [...counts.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, 2000)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), appRoot, scannedFiles: files.length, candidates }, null, 2) + '\n')
console.log(JSON.stringify({ output, scannedFiles: files.length, candidates: candidates.length }))
