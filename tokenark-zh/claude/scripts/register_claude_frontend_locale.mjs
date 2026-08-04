#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const appRoot = process.argv[2]
const overlayPath = process.argv[3]
const fallbackLocalePath = process.argv[4]

if (!appRoot || !overlayPath || !fallbackLocalePath) {
  console.error('用法：register_claude_frontend_locale.mjs APP_ROOT OVERLAY_JSON FALLBACK_LOCALE_JSON')
  process.exit(2)
}

const resourcesRoot = path.join(appRoot, 'Contents', 'Resources')
const i18nRoot = path.join(resourcesRoot, 'ion-dist', 'i18n')
const assetsRoot = path.join(resourcesRoot, 'ion-dist', 'assets', 'v1')
const sourcePath = path.join(i18nRoot, 'en-US.json')
const targetPath = path.join(i18nRoot, 'zh-CN.json')
const overridesPath = path.join(i18nRoot, 'zh-CN.overrides.json')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(tempPath, content, 'utf8')
  fs.renameSync(tempPath, filePath)
}

const source = fs.existsSync(sourcePath) ? readJson(sourcePath) : readJson(fallbackLocalePath)
const overlay = readJson(overlayPath)
const locale = { ...source }
let overlayMatches = 0
for (const [key, value] of Object.entries(overlay)) {
  if (!Object.prototype.hasOwnProperty.call(locale, key)) continue
  locale[key] = value
  overlayMatches += 1
}
writeAtomic(targetPath, JSON.stringify(locale, null, 2) + '\n')
writeAtomic(overridesPath, JSON.stringify(overlay, null, 2) + '\n')

if (!fs.existsSync(assetsRoot)) throw new Error(`找不到 Claude 前端 assets：${assetsRoot}`)
const oldWhitelist = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]'
const newWhitelist = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID","zh-CN"]'
const broadWhitelist = /((?:[A-Za-z_$][\w$]*)=\["en-US"(?:,"[^"]+")+)\]/g
let patchedFiles = 0
let registeredFiles = 0
let patchedMenuFiles = 0
for (const fileName of fs.readdirSync(assetsRoot).filter((name) => name.endsWith('.js'))) {
  const filePath = path.join(assetsRoot, fileName)
  const original = fs.readFileSync(filePath, 'utf8')
  let patched = original
  if (!original.includes(newWhitelist) && !original.includes('"zh-CN"')) {
    patched = patched.replace(oldWhitelist, newWhitelist)
    if (patched === original) patched = patched.replace(broadWhitelist, '$1,"zh-CN"]')
  }

  // The account menu has its own locale list in the settings bundle. It is
  // separate from the shared locale resolver, so register zh-CN there too.
  const menuPattern = 'return fn.map(t=>'
  const menuReplacement = 'return Array.from(new Set([...fn,"zh-CN"])).map(t=>'
  if (patched.includes(menuPattern) && !patched.includes(menuReplacement)) {
    patched = patched.replace(menuPattern, menuReplacement)
    patchedMenuFiles += 1
  }

  if (patched === original) {
    if (original.includes(newWhitelist) || original.includes('"zh-CN"')) registeredFiles += 1
    continue
  }
  if (patched !== original) {
    writeAtomic(filePath, patched)
    patchedFiles += 1
  }
}
if (patchedFiles === 0 && registeredFiles === 0) {
  throw new Error('未找到 Claude 前端语言白名单，当前版本可能已改变')
}

console.log(JSON.stringify({ targetPath, overridesPath, overlayMatches, patchedFiles, patchedMenuFiles, registeredFiles, localeKeys: Object.keys(locale).length }))
