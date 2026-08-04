#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(packageRoot, '..', '..')
const appRoot = '/Applications/Claude.app'
const resourcesRoot = path.join(appRoot, 'Contents', 'Resources')
const appSourcePath = path.join(resourcesRoot, 'en-US.json')
const backupRoot = path.join(projectRoot, 'backups', 'claude')
const frozenSourcePath = path.join(packageRoot, 'en-US.source.json')
const outputPath = path.join(packageRoot, 'zh-CN.json')
const overridesPath = path.join(packageRoot, 'overrides.json')
const fetchMissing = process.argv.includes('--fetch-missing')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function looksLikeEnglishLocale(locale) {
  if (!locale || typeof locale !== 'object' || Array.isArray(locale)) return false
  const values = Object.values(locale).filter((value) => typeof value === 'string' && value.length > 0)
  if (values.length < 400) return false
  const sample = values.join('\n')
  const cjk = (sample.match(/[\u3400-\u9fff]/g) || []).length
  const latin = (sample.match(/[A-Za-z]/g) || []).length
  return cjk === 0 || cjk / Math.max(latin, 1) < 0.02
}

function backupSourceCandidates() {
  if (!fs.existsSync(backupRoot)) return []
  return fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /-Claude\.app$/.test(entry.name))
    .map((entry) => path.join(backupRoot, entry.name, 'Contents', 'Resources', 'en-US.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort((left, right) => right.localeCompare(left))
}

function resolveSourcePath() {
  const explicit = argValue('--source', '')
  if (explicit) {
    const explicitPath = path.resolve(explicit)
    if (!fs.existsSync(explicitPath)) throw new Error(`--source 文件不存在：${explicitPath}`)
    if (!looksLikeEnglishLocale(readJson(explicitPath))) throw new Error(`--source 不是可用的英文 locale：${explicitPath}`)
    return explicitPath
  }

  for (const candidate of backupSourceCandidates()) {
    if (looksLikeEnglishLocale(readJson(candidate))) return candidate
  }
  if (looksLikeEnglishLocale(readJson(appSourcePath))) return appSourcePath
  if (looksLikeEnglishLocale(readJson(frozenSourcePath))) return frozenSourcePath
  throw new Error(`未找到原始英文 Claude locale；请使用 --source <原始英文 en-US.json>。已检查当前 App 与 ${backupRoot} 下的最近备份。`)
}

const requestedSourcePath = resolveSourcePath()
const source = readJson(requestedSourcePath)
if (!source) throw new Error(`无法读取 Claude locale：${requestedSourcePath}`)
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {}
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {}
const output = {}
const missing = []

const tokenPattern = /\{[^}]+\}|%[@0-9]+|`[^`]+`/g
const keepPattern = /^(https?:\/\/|[A-Za-z0-9_./-]+\.[A-Za-z]{2,}|[A-Z0-9_./:-]{3,})$/

function tokens(value) {
  return [...String(value).matchAll(tokenPattern)].map((match) => match[0]).sort()
}

function sameTokens(left, right) {
  return JSON.stringify(tokens(left)) === JSON.stringify(tokens(right))
}

function normalizeTranslation(value, sourceValue) {
  let result = String(value).trim()
  result = result.replaceAll('克劳德', 'Claude')
  result = result.replaceAll('克劳德桌面', 'Claude Desktop')
  result = result.replaceAll('应用程序', '应用')
  return sameTokens(result, sourceValue) ? result : sourceValue
}

async function translateRemote(value) {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', 'en')
  url.searchParams.set('tl', 'zh-CN')
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', value)
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`translation request failed: HTTP ${response.status}`)
  const payload = await response.json()
  return payload?.[0]?.map((part) => part?.[0] || '').join('') || value
}

for (const [key, english] of Object.entries(source)) {
  if (typeof english !== 'string' || english.length === 0) {
    output[key] = english
    continue
  }
  if (Object.hasOwn(overrides, key)) {
    output[key] = overrides[key]
    continue
  }
  if (Object.hasOwn(existing, key) && existing[key] !== english) {
    output[key] = existing[key]
    continue
  }
  if (!/[A-Za-z]/.test(english) || keepPattern.test(english)) {
    output[key] = english
    continue
  }
  if (!fetchMissing) {
    output[key] = english
    missing.push({ key, value: english })
    continue
  }
  try {
    output[key] = normalizeTranslation(await translateRemote(english), english)
    process.stderr.write(`translated ${key}\n`)
  } catch (error) {
    output[key] = english
    missing.push({ key, value: english, error: String(error) })
  }
  await new Promise((resolve) => setTimeout(resolve, 80))
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const reportPath = path.join(packageRoot, 'untranslated.json')
const report = {
  generatedAt: new Date().toISOString(),
  source: requestedSourcePath,
  missing,
}
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(JSON.stringify({ source: requestedSourcePath, sourceKeys: Object.keys(source).length, outputKeys: Object.keys(output).length, missing: missing.length, outputPath, reportPath }) + '\n')
