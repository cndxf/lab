#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const [remotePath, sourcePath, targetPath, manualPath, outputPath] = process.argv.slice(2)
if (![remotePath, sourcePath, targetPath, manualPath, outputPath].every(Boolean)) {
  console.error('用法：generate_remote_overlay.mjs REMOTE_EN_JSON LOCAL_EN_JSON LOCAL_ZH_JSON MANUAL_JSON OUTPUT_JSON')
  process.exit(2)
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const remote = read(remotePath)
const source = read(sourcePath)
const target = read(targetPath)
const manual = read(manualPath)
const byEnglish = new Map()
for (const [key, value] of Object.entries(source)) {
  const translated = target[key]
  if (typeof value !== 'string' || typeof translated !== 'string' || value === translated) continue
  if (!byEnglish.has(value)) byEnglish.set(value, translated)
}
const overlay = { ...manual }
let automaticMatches = 0
for (const [key, value] of Object.entries(remote)) {
  if (Object.prototype.hasOwnProperty.call(overlay, key)) continue
  const translated = byEnglish.get(value)
  if (!translated || !/[\u4e00-\u9fff]/.test(translated)) continue
  overlay[key] = translated
  automaticMatches += 1
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(overlay, null, 2) + '\n')
console.log(JSON.stringify({ outputPath, manualMatches: Object.keys(manual).length, automaticMatches, total: Object.keys(overlay).length }))
