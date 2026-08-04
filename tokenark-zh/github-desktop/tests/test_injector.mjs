import assert from 'node:assert/strict'
import test from 'node:test'
import injector from '../inject.js'
import dictionary from '../translations.json' with { type: 'json' }

test('translates exact text and preserves surrounding whitespace', () => {
  assert.equal(injector.translateString('  Settings…  ', dictionary.text), '  设置…  ')
  assert.equal(injector.translateString('my-repository', dictionary.text), 'my-repository')
  assert.equal(injector.translateString('Create a Tutorial Repository…', dictionary.text, dictionary.prefix), '创建教程仓库…')
  assert.equal(injector.translateString('Branches', dictionary.text), '分支')
  assert.equal(injector.translateString('Pull Requests', dictionary.text), '拉取请求')
  assert.equal(injector.translateString('Create a Branch', dictionary.text), '创建分支')
  assert.equal(injector.translateString('Bypass Commit Hooks', dictionary.text), '跳过提交钩子')
  assert.equal(injector.translateString('Add Signed-off-by Trailer', dictionary.text), '添加 Signed-off-by 尾注')
  assert.equal(injector.translateString('Allow Empty Commit', dictionary.text), '允许空提交')
})

test('normalizes prefix keys and prefers the longest matching prefix', () => {
  const prefixMap = {
    'Clone   ': '克隆 ',
    'Clone Repository ': '克隆仓库 ',
  }
  assert.equal(
    injector.translateString('  Clone   Repository\nowner/repo  ', {}, prefixMap),
    '  克隆仓库 owner/repo  ',
  )
  assert.equal(injector.translateString(' appears to be a subfolder of Git repository. ', {}, {
    ' appears to be a subfolder of Git repository. ': '似乎是 Git 仓库的子文件夹。',
  }), ' 似乎是 Git 仓库的子文件夹。 ')
  assert.equal(injector.translateString('6 minutes ago', {}, { 'minutes ago': '分钟前' }), '6分钟前')
  assert.equal(injector.translateString('2 hours ago', {}, { 'hours ago': '小时前' }), '2小时前')
  assert.equal(injector.translateString('hours ago', {}, { 'hours ago': '小时前' }), 'hours ago')
  assert.equal(injector.translateString('2hours ago', {}, { 'hours ago': '小时前' }), '2hours ago')
  assert.equal(injector.translateString('feature minutes ago', {}, { 'minutes ago': '分钟前' }), 'feature minutes ago')
  assert.equal(injector.translateString('6minutes ago', {}, { 'minutes ago': '分钟前' }), '6minutes ago')
  assert.equal(injector.translateString('myThe Git repository at ', {}, { 'The Git repository at ': 'Git 仓库位于 ' }), 'myThe Git repository at ')
  assert.equal(injector.translateString('CloneRepository', {}, { 'Clone   ': '克隆 ' }), 'CloneRepository')
  assert.equal(
    injector.translateString('No open pull requests in cndxf/desktop-tutorial', {}, dictionary.prefix),
    '仓库中没有未处理的拉取请求：cndxf/desktop-tutorial',
  )
  assert.equal(
    injector.translateString('Choose a branch to merge into 主要的', {}, dictionary.prefix),
    '选择要合并到的分支：主要的',
  )
  assert.equal(
    injector.translateString('Your new branch will be based on your currently checked out branch (主要的)', {}, dictionary.prefix),
    '新分支将基于当前检出的分支（主要的）',
  )
  assert.equal(injector.normalizePrefixKey('\n Clone\t'), 'Clone')
})

test('translates selected attributes only', () => {
  const attributes = new Map([
    ['aria-label', 'Search'],
    ['title', 'Search'],
    ['placeholder', 'Search'],
  ])
  const element = {
    nodeType: 1,
    tagName: 'button',
    childNodes: [],
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    setAttribute: (name, value) => attributes.set(name, value),
  }
  injector.translateAttributes(element, dictionary.attribute)
  assert.equal(attributes.get('aria-label'), '搜索')
  assert.equal(attributes.get('title'), '搜索')
  assert.equal(attributes.get('placeholder'), '搜索')
})

test('skips code and user-editable content', () => {
  assert.equal(injector.shouldSkipElement({ nodeType: 1, tagName: 'code', getAttribute: () => null }), true)
  assert.equal(injector.shouldSkipElement({ nodeType: 1, tagName: 'input', getAttribute: () => null }), true)
  assert.equal(injector.shouldSkipElement({ nodeType: 1, tagName: 'select', getAttribute: () => null }), true)
  assert.equal(injector.shouldSkipElement({ nodeType: 1, tagName: 'div', isContentEditable: true, getAttribute: () => null }), true)
})

test('translates a small DOM tree without touching repository text', () => {
  const repoText = { nodeType: 3, nodeValue: 'my-repository' }
  const settingsText = { nodeType: 3, nodeValue: 'Settings…' }
  const root = {
    nodeType: 1,
    tagName: 'main',
    childNodes: [settingsText, repoText],
    getAttribute: () => null,
    setAttribute: () => {},
  }
  injector.translateElement(root, dictionary)
  assert.equal(settingsText.nodeValue, '设置…')
  assert.equal(repoText.nodeValue, 'my-repository')
})

test('does not translate user-owned select options', () => {
  const optionText = { nodeType: 3, nodeValue: 'Settings…' }
  const option = { nodeType: 1, tagName: 'option', childNodes: [optionText], getAttribute: () => null, setAttribute: () => {} }
  const select = { nodeType: 1, tagName: 'select', childNodes: [option], getAttribute: () => null, setAttribute: () => {} }
  option.parentNode = select
  optionText.parentNode = option
  injector.translateElement(select, dictionary)
  assert.equal(optionText.nodeValue, 'Settings…')
  injector.translateElement(option, dictionary)
  assert.equal(optionText.nodeValue, 'Settings…')
  injector.translateElement(optionText, dictionary)
  assert.equal(optionText.nodeValue, 'Settings…')
})
