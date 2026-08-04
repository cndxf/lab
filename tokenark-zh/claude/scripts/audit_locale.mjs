#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = process.argv[2] || '/Applications/Claude.app'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = process.argv[3] || path.resolve(scriptDir, '../en-US.source.json')
const targetPath = process.argv[4] || path.resolve(scriptDir, '../zh-CN.json')
const output = process.argv[5] || path.resolve(scriptDir, '../../../reports/claude-untranslated.json')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const source = read(sourcePath)
const target = read(targetPath)
const candidates = []
for (const [key, value] of Object.entries(source)) {
  if (typeof value !== 'string' || !/[A-Za-z]/.test(value)) continue
  const translated = target[key]
  if (translated === value || translated == null || !/[\u4e00-\u9fff]/.test(String(translated))) {
    candidates.push({ key, english: value, translated: translated ?? null })
  }
}
let remote = null
let remoteTranslated = null
const remotePath = path.join(appRoot, 'Contents', 'Resources', 'ion-dist', 'i18n', 'en-US.json')
if (fs.existsSync(remotePath)) {
  const remoteSource = read(remotePath)
  const remoteTargetPath = path.join(appRoot, 'Contents', 'Resources', 'ion-dist', 'i18n', 'zh-CN.json')
  const remoteTarget = fs.existsSync(remoteTargetPath) ? read(remoteTargetPath) : {}
  remote = Object.entries(remoteSource).filter(([, value]) => typeof value === 'string' && /[A-Za-z]/.test(value)).map(([key, value]) => ({ key, english: value }))
  remoteTranslated = remote.filter(({ key, english }) => typeof remoteTarget[key] === 'string' && remoteTarget[key] !== english && /[\u4e00-\u9fff]/.test(remoteTarget[key])).map(({ key, english }) => ({ key, english, translated: remoteTarget[key] }))
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), sourcePath, targetPath, candidates, remoteEnglish: remote, remoteTranslated: remoteTranslated }, null, 2) + '\n')
console.log(JSON.stringify({ output, localeCandidates: candidates.length, remoteEnglish: remote?.length ?? 0, remoteTranslated: remoteTranslated?.length ?? 0 }))
