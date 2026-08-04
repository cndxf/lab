#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const appRoot = argument('--app-root')
const injectorPath = argument('--injector')
const translationsPath = argument('--translations')

if (!appRoot || !injectorPath || !translationsPath) {
  console.error('用法：apply_patch.mjs --app-root PATH --injector PATH --translations PATH')
  process.exit(2)
}

const resourcesRoot = path.join(appRoot, 'Contents', 'Resources', 'app')
const indexPath = path.join(resourcesRoot, 'index.html')
const mainPath = path.join(resourcesRoot, 'main.js')
const rendererPath = path.join(resourcesRoot, 'renderer.js')
const runtimePath = path.join(resourcesRoot, 'tokenark-ghd-zh.js')
const index = fs.readFileSync(indexPath, 'utf8')
const main = fs.readFileSync(mainPath, 'utf8')
const renderer = fs.readFileSync(rendererPath, 'utf8')
const injector = fs.readFileSync(injectorPath, 'utf8')
const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'))

if (index.includes('tokenark-ghd-zh.js') || fs.existsSync(runtimePath)) {
  throw new Error('应用已经存在 TokenArk 中文补丁标记，请先回滚或使用新的原始应用')
}

const runtime = `window.__TOKENARK_GHD_ZH__ = ${JSON.stringify(translations)};\n${injector}\n`

const rendererAnchor = '<script defer="defer" src="renderer.js"></script>'
if (index.split(rendererAnchor).length - 1 !== 1) {
  throw new Error('index.html 中 renderer.js 锚点数量不是 1')
}
const patchedIndex = index.replace(
  rendererAnchor,
  '<script src="tokenark-ghd-zh.js"></script>' + rendererAnchor
)

const menuReplacements = [
  ['label:"File"', 'label:"文件"'],
  ['label:"Edit"', 'label:"编辑"'],
  ['label:"View"', 'label:"视图"'],
  ['label:"Repository"', 'label:"仓库"'],
  ['label:"Branch"', 'label:"分支"'],
  ['label:"About GitHub Desktop"', 'label:"关于 GitHub Desktop"'],
  ['label:"Settings…"', 'label:"设置…"'],
  ['label:"Install Command Line Tool…"', 'label:"安装命令行工具…"'],
  ['label:"Undo"', 'label:"撤销"'],
  ['label:"Redo"', 'label:"重做"'],
  ['label:"Cut"', 'label:"剪切"'],
  ['label:"Copy"', 'label:"复制"'],
  ['label:"Paste"', 'label:"粘贴"'],
  ['label:"Select All"', 'label:"全选"'],
  ['label:"Find"', 'label:"查找"'],
  ['label:"New Repository…"', 'label:"新建仓库…"'],
  ['label:"Add Local Repository…"', 'label:"添加本地仓库…"'],
  ['label:"Clone Repository…"', 'label:"克隆仓库…"'],
  ['label:"Show Changes"', 'label:"显示更改"'],
  ['label:"Show History"', 'label:"显示历史记录"'],
  ['label:"Show Repository List"', 'label:"显示仓库列表"'],
  ['label:"Show Branches List"', 'label:"显示分支列表"'],
  ['label:"Show Worktrees List"', 'label:"显示工作树列表"'],
  ['label:"Go to Summary"', 'label:"转到摘要"'],
  ['label:"Toggle Full Screen"', 'label:"切换全屏"'],
  ['label:"Reset Zoom"', 'label:"重置缩放"'],
  ['label:"Zoom In"', 'label:"放大"'],
  ['label:"Zoom Out"', 'label:"缩小"'],
  ['label:"Toggle Developer Tools"', 'label:"切换开发者工具"'],
  ['label:"Pull"', 'label:"拉取"'],
  ['label:"Fetch"', 'label:"获取"'],
  ['label:"Remove"', 'label:"移除"'],
  ['label:"View on GitHub"', 'label:"在 GitHub 上查看"'],
  ['label:"Show in Finder"', 'label:"在 Finder 中显示"'],
  ['label:"Open With…"', 'label:"打开方式…"'],
  ['label:"Create Issue on GitHub"', 'label:"在 GitHub 上创建 Issue"'],
  ['label:"New Worktree…"', 'label:"新建工作树…"'],
  ['label:"Repository Settings…"', 'label:"仓库设置…"'],
  ['label:"New Branch…"', 'label:"新建分支…"'],
  ['label:"Rename…"', 'label:"重命名…"'],
  ['label:"Delete…"', 'label:"删除…"'],
  ['label:"Discard All Changes…"', 'label:"放弃所有更改…"'],
  ['label:"Stash All Changes"', 'label:"暂存所有更改"'],
  ['label:"Stash All Changes…"', 'label:"暂存所有更改…"'],
  ['label:"Compare to Branch"', 'label:"与分支比较"'],
  ['label:"Merge into Current Branch…"', 'label:"合并到当前分支…"'],
  ['label:"Squash and Merge into Current Branch…"', 'label:"压缩并合并到当前分支…"'],
  ['label:"Rebase Current Branch…"', 'label:"变基当前分支…"'],
  ['label:"Compare on GitHub"', 'label:"在 GitHub 上比较"'],
  ['label:"View Branch on GitHub"', 'label:"在 GitHub 上查看分支"'],
  ['label:"Preview Pull Request"', 'label:"预览 Pull Request"'],
  ['label:"Create Pull Request"', 'label:"创建 Pull Request"'],
  ['label:"View Pull Request on GitHub"', 'label:"在 GitHub 上查看 Pull Request"'],
  ['label:"Report Issue…"', 'label:"报告问题…"'],
  ['label:"Contact GitHub Support…"', 'label:"联系 GitHub 支持…"'],
  ['label:"Show User Guides"', 'label:"显示用户指南"'],
  ['label:"Show Keyboard Shortcuts"', 'label:"显示键盘快捷键"'],
  ['label:"Show Logs in Finder"', 'label:"在 Finder 中显示日志"'],
  ['label:"&Reload"', 'label:"重新加载"'],
  ['"Show Stashed Changes"', '"显示已暂存的更改"'],
  ['"Hide Stashed Changes"', '"隐藏已暂存的更改"'],
  ['"Expand Active Resizable"', '"展开当前可调整区域"'],
  ['"Contract Active Resizable"', '"收起当前可调整区域"'],
  ['role:"window",', 'label:"窗口",role:"window",'],
  ['role:"help",', 'label:"帮助",role:"help",'],
  ['role:"togglefullscreen",', 'label:"切换全屏",role:"togglefullscreen",'],
  ['role:"services",submenu:[]', 'label:"服务",role:"services",submenu:[]'],
  ['role:"hide"', 'label:"隐藏 GitHub Desktop",role:"hide"'],
  ['role:"hideOthers"', 'label:"隐藏其他应用",role:"hideOthers"'],
  ['role:"unhide"', 'label:"显示全部",role:"unhide"'],
  ['role:"quit"', 'label:"退出 GitHub Desktop",role:"quit"'],
  ['{role:"minimize"}', '{label:"最小化",role:"minimize"}'],
  ['{role:"zoom"}', '{label:"缩放",role:"zoom"}'],
  ['{role:"close"}', '{label:"关闭窗口",role:"close"}'],
  ['{role:"front"}', '{label:"将所有窗口置于最前",role:"front"}'],
]

let patchedMain = main
const applied = []
for (const [from, to] of menuReplacements) {
  const count = patchedMain.split(from).length - 1
  if (count === 0) continue
  if (count !== 1) throw new Error(`main.js 锚点数量异常：${from} (${count})`)
  patchedMain = patchedMain.replace(from, to)
  applied.push({ from, to })
}
if (applied.length < 10) throw new Error(`main.js 只应用了 ${applied.length} 个菜单替换，拒绝继续`)

const dynamicMenuReplacements = [
  ['const d=o?"Remove…":"Remove"', 'const d=o?"移除…":"移除"'],
  ['f=s?"View Pull Request on GitHub":"Create Pull Request"', 'f=s?"在 GitHub 上查看 Pull Request":"创建 Pull Request"'],
  ['label:(h?"Hide":"Show")+" Changes Filter"', 'label:h?"隐藏更改筛选器":"显示更改筛选器"'],
  ['e?t?"Force Push…":"Force Push":"Push"', 'e?t?"强制推送…":"强制推送":"推送"'],
  ['label:`Open in ${t??"Shell"}`', 'label:`在 ${t??"Shell"} 中打开`'],
  ['label:`Open in ${e??"External Editor"}`', 'label:`在 ${e??"External Editor"} 中打开`'],
  ['label:u?"Stash All Changes…":"Stash All Changes"', 'label:u?"暂存所有更改…":"暂存所有更改"'],
  ['label:`Update from ${a}`', 'label:`从 ${a} 更新`'],
]
for (const [from, to] of dynamicMenuReplacements) {
  const count = patchedMain.split(from).length - 1
  if (count !== 1) throw new Error(`main.js 动态菜单锚点数量异常：${from} (${count})`)
  patchedMain = patchedMain.replace(from, to)
  applied.push({ from, to })
}

const nativeEditMenuAnchor = 'return(e&&e.submenu?e.submenu.items:[]).filter(e=>!st(e.role,"pasteandmatchstyle"))}'
const nativeEditMenuReplacement = 'return(e&&e.submenu?e.submenu.items:[]).filter(e=>!st(e.role,"pasteandmatchstyle")).map(e=>{const t={undo:"撤销",redo:"重做",cut:"剪切",copy:"复制",paste:"粘贴",selectall:"全选",find:"查找"}[String(e.role||"").toLowerCase()];return t?new r.MenuItem({label:t,role:e.role,accelerator:e.accelerator,enabled:e.enabled}):e})}'
if (!patchedMain.includes(nativeEditMenuAnchor)) {
  throw new Error('未找到原生编辑菜单锚点，拒绝继续')
}
patchedMain = patchedMain.replace(nativeEditMenuAnchor, nativeEditMenuReplacement)
applied.push({ from: nativeEditMenuAnchor, to: nativeEditMenuReplacement })

const nativeRoleMenuOpenAnchor = 'function Re(e){return r.Menu.buildFromTemplate('
const nativeRoleMenuOpenReplacement = 'function Re(e){const t=r.Menu.buildFromTemplate('
if (patchedMain.split(nativeRoleMenuOpenAnchor).length - 1 !== 1) {
  throw new Error('未找到原生 role 菜单构建锚点，拒绝继续')
}
patchedMain = patchedMain.replace(nativeRoleMenuOpenAnchor, nativeRoleMenuOpenReplacement)

const nativeRoleMenuCloseAnchor = 'p}(e))}function Me(e)'
const nativeRoleMenuCloseReplacement = 'p}(e));const n={services:"服务",hide:"隐藏 GitHub Desktop",hideOthers:"隐藏其他应用",unhide:"显示全部",quit:"退出 GitHub Desktop"},o=t.items.find(e=>e.label==="GitHub Desktop");if(o?.submenu)for(const e of o.submenu.items){const r=n[e.role];r&&(e.label=r)}return t}function Me(e)'
if (patchedMain.split(nativeRoleMenuCloseAnchor).length - 1 !== 1) {
  throw new Error('未找到原生 role 菜单返回锚点，拒绝继续')
}
patchedMain = patchedMain.replace(nativeRoleMenuCloseAnchor, nativeRoleMenuCloseReplacement)
applied.push({ from: nativeRoleMenuOpenAnchor, to: nativeRoleMenuOpenReplacement })
applied.push({ from: nativeRoleMenuCloseAnchor, to: nativeRoleMenuCloseReplacement })

const rendererReplacements = [
  ['Create a Tutorial Repository…', '创建教程仓库…'],
  ['Clone a Repository from the Internet…', '从互联网克隆仓库…'],
  ['Create a New Repository on your Local Drive…', '在本地磁盘创建新仓库…'],
  ['Add an Existing Repository from your Local Drive…', '添加本地磁盘上的现有仓库…'],
  ['Filter your repositories', '筛选仓库'],
  ['Prefer absolute dates over relative', '优先显示绝对日期，而不是相对日期'],
  ['About GitHub Desktop', '关于 GitHub Desktop'],
  ['id:s},"About ",e', 'id:s},"关于 ",e'],
  ['r=`Version ${t}`', 'r=`版本 ${t}`'],
  ['className:"version"},"Version ",t', 'className:"version"},"版本 ",t'],
  ['n=ke.createElement("p",null,"You have the latest version (last checked"', 'n=ke.createElement("p",null,"你已使用最新版本（上次检查时间"'],
  ['message:`You have the latest version (last checked ${r})`', 'message:`你已使用最新版本（上次检查时间 ${r}）`'],
  ['Looking for the latest features? Check out the', '想体验最新功能？请查看'],
  ['"Looking for the latest features?"', '"想体验最新功能？"'],
  ['"Check out the"', '"请查看"'],
  ['"Check out"," "', '"请查看"," "'],
  ['onShowTermsAndConditions},"Terms and Conditions"', 'onShowTermsAndConditions},"条款与条件"'],
  ['onShowAcknowledgements},"License and Open Source Notices"', 'onShowAcknowledgements},"许可证和开源声明"'],
]
let patchedRenderer = renderer
const appliedRenderer = []
for (const [from, to] of rendererReplacements) {
  const count = patchedRenderer.split(from).length - 1
  if (count === 0) continue
  if (count !== 1) throw new Error(`renderer.js 锚点数量异常：${from} (${count})`)
  patchedRenderer = patchedRenderer.replace(from, to)
  appliedRenderer.push({ from, to })
}
if (appliedRenderer.length < 5) throw new Error(`renderer.js 只应用了 ${appliedRenderer.length} 个固定文案替换，拒绝继续`)
const manifest = {
  version: 1,
  appVersion: '3.6.3',
  runtimeFile: 'Contents/Resources/app/tokenark-ghd-zh.js',
  modifiedFiles: ['Contents/Resources/app/index.html', 'Contents/Resources/app/main.js', 'Contents/Resources/app/renderer.js'],
  appliedMenuReplacements: applied,
  appliedRendererReplacements: appliedRenderer,
}
const manifestPath = path.join(appRoot, 'Contents', 'Resources', 'tokenark-ghd-zh-manifest.json')

function writeAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(tempPath, content, 'utf8')
  fs.renameSync(tempPath, filePath)
}

const pendingWrites = [
  [runtimePath, runtime],
  [indexPath, patchedIndex],
  [mainPath, patchedMain],
  [rendererPath, patchedRenderer],
  [manifestPath, JSON.stringify(manifest, null, 2) + '\n'],
]
const originals = new Map(pendingWrites.map(([filePath]) => [
  filePath,
  fs.existsSync(filePath) ? fs.readFileSync(filePath) : null,
]))
try {
  for (const [filePath, content] of pendingWrites) writeAtomic(filePath, content)
} catch (error) {
  for (const [filePath, content] of originals) {
    if (content === null) fs.rmSync(filePath, { force: true })
    else writeAtomic(filePath, content)
  }
  throw error
}
console.log(JSON.stringify({ runtimePath, appliedMenuReplacements: applied.length }))
