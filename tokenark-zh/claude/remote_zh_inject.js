(function (root, factory) {
  const api = factory()
  // Keep CommonJS exports for Node tests, but never replace the host preload's
  // exports when this file is appended to Claude's browser preload bundle.
  if ((!root || !root.document) && typeof module === 'object' && module.exports) module.exports = api
  if (!root || !root.document || !root.location) return

  const attempt = () => api.install(root.document, root.location)
  attempt()
  root.addEventListener?.('DOMContentLoaded', attempt, { once: false })
  root.addEventListener?.('load', attempt, { once: false })
  if (typeof root.setInterval === 'function') {
    let attempts = 0
    const timer = root.setInterval(() => {
      attempts += 1
      if (attempt() || attempts >= 120 || root.document.__tokenarkClaudeRemoteZhInstalled) {
        root.clearInterval?.(timer)
      }
    }, 250)
  }
})(typeof window === 'object' && window ? window : typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'

  const text = Object.freeze({
    Home: '主页',
    Code: '代码',
    New: '新建',
    Projects: '项目',
    Artifacts: '工件',
    Customize: '自定义',
    Search: '搜索',
    'Collapse sidebar': '收起侧栏',
    Language: '语言',
    'Get help': '获取帮助',
    'Upgrade plan': '升级套餐',
    'Get apps and extensions': '获取应用和扩展',
    'Learn more': '了解更多',
    'Log out': '退出登录',
    General: '通用',
    Account: '账户',
    Privacy: '隐私',
    Billing: '账单',
    Capabilities: '功能',
    Reflect: '反思',
    'Time and focus': '时间与专注',
    'Claude Code': 'Claude Code',
    'Desktop app': '桌面应用',
    Extensions: '扩展',
    Developer: '开发者',
    Skills: '技能',
    Connectors: '连接器',
    Plugins: '插件',
    Memory: '记忆',
    Close: '关闭',
    Cancel: '取消',
    Copy: '复制',
    'Copy prompt': '复制提示词',
    'Add to memory': '添加到记忆',
    'Search settings': '搜索设置',
    'Import memory to Claude': '将记忆导入 Claude',
    'Copy this prompt into a chat with your other AI provider': '将此提示词复制到其他 AI 服务商的聊天中',
    'Paste results below to add to Claude’s memory': '将结果粘贴到下方以添加到 Claude 的记忆',
    'Resize sidebar': '调整侧栏宽度',
    'Search settings': '搜索设置',
    'Write your prompt to Claude': '向 Claude 输入提示词',
    'Good morning, ': '早上好，',
    Free: '免费',
    'Filter and group recents': '筛选并分组最近项目',
    Recents: '最近使用',
    'View all': '查看全部',
    'Import memory': '导入记忆',
    Try: '试用',
    'Dismiss this suggestion': '关闭此建议',
    'Customize Claude for you': '为你自定义 Claude',
    'Get apps and extensions': '获取应用和扩展',
    'Use incognito': '使用隐身模式',
    'How can I help you today?': '今天我可以如何帮助你？',
    'Add files, connectors, and more': '添加文件、连接器及更多',
    Chat: '聊天',
    Cowork: '协作',
    Settings: '设置',
    'Prompt categories': '提示词分类',
    Strategize: '策略规划',
    Write: '写作',
    Learn: '学习',
    'Life stuff': '生活事务',
    'Press and hold to record': '按住以录音',
    'Use voice mode': '使用语音模式',
    'English (United States)': '英语（美国）',
    'Français (France)': '法语（法国）',
    'Deutsch (Deutschland)': '德语（德国）',
    'हिन्दी (भारत)': '印地语（印度）',
    'Indonesia (Indonesia)': '印度尼西亚语（印度尼西亚）',
    'Italiano (Italia)': '意大利语（意大利）',
    '日本語 (日本)': '日语（日本）',
    '한국어(대한민국)': '韩语（韩国）',
    'Português (Brasil)': '葡萄牙语（巴西）',
    'Español (Latinoamérica)': '西班牙语（拉丁美洲）',
    'Español (España)': '西班牙语（西班牙）',
    Français: '法语',
    France: '法国',
    Italiano: '意大利语',
    Italia: '意大利',
    Português: '葡萄牙语',
    Brasil: '巴西',
    Español: '西班牙语',
    Latinoamérica: '拉丁美洲',
    España: '西班牙',
    'Delete account': '删除账户',
    'Log out of all devices': '退出所有设备登录',
    'Delete your account': '删除你的账户',
    'Organization ID': '组织 ID',
    'Copy organization ID': '复制组织 ID',
    'Trusted devices': '受信任的设备',
    'Devices that can control your local machine through remote sessions.': '可通过远程会话控制本机的设备。',
    Device: '设备',
    Added: '添加时间',
    'No trusted devices.': '没有受信任的设备。',
    'Active sessions': '活动会话',
    Location: '位置',
    Created: '创建时间',
    Updated: '更新时间',
    Current: '当前',
    'Session actions for ': '会话操作：',
    Preferences: '偏好设置',
    Appearance: '外观',
    System: '系统',
    Light: '浅色',
    Dark: '深色',
    'Chat font': '聊天字体',
    Motion: '动效',
    'Reduce animation in streaming responses and other interface elements.': '减少流式响应和其他界面元素中的动画。',
    Reduced: '减少',
    Voice: '语音',
    'Chinese (Simplified)': '简体中文',
    Style: '风格',
    Speed: '速度',
    Normal: '正常',
    Notifications: '通知',
    'Response completions': '响应完成',
    'Get notified when Claude has finished a response. Useful for long-running tasks.': 'Claude 完成响应后通知你，适用于运行时间较长的任务。',
    'Anthropic believes in transparent data practices': 'Anthropic 致力于透明的数据实践',
    'Privacy Center': '隐私中心',
    'Privacy Policy': '隐私政策',
    'for more details.': '了解更多详情。',
    'How we protect your data': '我们如何保护你的数据',
    'How we use your data': '我们如何使用你的数据',
    'Location metadata': '位置元数据',
    'Allow Claude to use coarse location metadata (city/region) to improve product experiences.': '允许 Claude 使用大致位置元数据（城市/地区）来改善产品体验。',
    'Help improve our AI models': '帮助改进我们的 AI 模型',
    'Allow the use of your chats and coding sessions to train and improve Anthropic AI models.': '允许使用你的聊天和编程会话来训练和改进 Anthropic AI 模型。',
    'Your data': '你的数据',
    'Export data': '导出数据',
    'Shared chats': '共享聊天',
    'Shared artifacts': '共享工件',
    'Memory preferences': '记忆偏好',
    'Free plan': '免费套餐',
    'Try Claude': '试用 Claude',
    'Chat on web, iOS, Android, and on your desktop': '在 Web、iOS、Android 和桌面端使用聊天',
    'Generate code and visualize data': '生成代码并可视化数据',
    'Write, edit, and create content': '编写、编辑和创建内容',
    'Ability to search the web': '搜索 Web 的能力',
    'Memory across conversations': '跨对话记忆',
    'Create files and execute code': '创建文件并执行代码',
    'Unlock more from Claude with desktop extensions': '通过桌面扩展解锁 Claude 的更多能力',
    'Connect Slack and Google Workspace services': '连接 Slack 和 Google Workspace 服务',
    'Integrate any context or tool through connectors with remote MCP': '通过连接器和远程 MCP 集成任意上下文或工具',
    'Extended thinking for complex work': '为复杂工作启用扩展思考',
    'Tool access mode': '工具访问模式',
    'Controls how connector tools are loaded in new conversations.': '控制新对话中连接器工具的加载方式。',
    'Load tools when needed': '需要时加载工具',
    'Connector search': '连接器搜索',
    'Let Claude search the connector directory and surface ones relevant to your conversation.': '允许 Claude 搜索连接器目录，并显示与你的对话相关的连接器。',
    'Switch models when a message is flagged': '消息被标记时切换模型',
    'When safety measures flag a message, automatically switch to a different model to keep chatting. When off, your chat will pause instead.': '安全措施标记消息时，自动切换到其他模型以继续聊天；关闭后聊天会暂停。',
    Visuals: '视觉效果',
    'AI-powered artifacts': 'AI 驱动的工件',
    'Inline visualizations': '内嵌可视化',
    'Code execution and file creation': '代码执行和文件创建',
    'Allow network egress': '允许网络访问',
    Skills: '技能',
    'Skills have moved to': '技能已移至',
    'Based on your conversations in Claude chat.': '基于你在 Claude 聊天中的对话。',
    'Time range': '时间范围',
    'Past month': '过去一个月',
    'Regenerate reflection': '重新生成反思',
    'A quiet month.': '平静的一个月。',
    'YOUR TIME WITH CLAUDE': '你与 Claude 共度的时间',
    Conversations: '对话数',
    'Time spent': '使用时长',
    'Decide when Claude is off': '决定 Claude 何时休息',
    'Schedule quiet hours and get a nudge when a session runs long.': '安排安静时段，会话时间过长时提醒你。',
    'WHAT YOU SPENT TIME ON': '你花时间做的事',
    'EXPANDING YOUR SKILLS': '拓展你的技能',
    'Your Claude activity measured as AI fluency skills': '以 AI 素养技能衡量你的 Claude 活动',
    DELEGATION: '委派',
    DESCRIPTION: '描述',
    DISCERNMENT: '判断力',
    DILIGENCE: '勤勉',
    'Nothing to build on yet': '目前没有可供总结的内容',
    'There wasn’t enough this month to reflect on this skill.': '本月关于这项技能的内容还不足以生成反思。',
    'Helpful': '有帮助',
    'Not helpful': '没有帮助',
    'Explore more hard questions': '探索更多难题',
    'Break reminders': '休息提醒',
    'Get a nudge to take a break from Claude. You can snooze or adjust anytime.': '提醒你暂时离开 Claude 休息；你可以随时暂停或调整。',
    'Quiet hours': '安静时段',
    'Set time limits for Claude. You can dismiss or adjust anytime.': '为 Claude 设置时间限制；你可以随时忽略或调整。',
    'Hours: None': '小时：无',
    'Minutes: None': '分钟：无',
    'Classify session states': '分类会话状态',
    'Allow Claude to automatically classify sessions as blocked, ready for review, or done. Classifying sessions counts towards your plan usage. Applies to new sessions.': '允许 Claude 自动将会话分类为受阻、待审核或已完成。会话分类会计入套餐用量，仅适用于新会话。',
    'Code appearance': '代码外观',
    'Light code theme': '浅色代码主题',
    'Dark code theme': '深色代码主题',
    'Claude Light': 'Claude 浅色',
    'Claude Dark': 'Claude 深色',
    'Code font': '代码字体',
    'Set a custom monospace font for code and terminal.': '为代码和终端设置自定义等宽字体。',
    'High-contrast dark theme': '高对比度深色主题',
    'Use a darker, near-black background when dark mode is on.': '启用深色模式时使用更深的近黑色背景。',
    'Interface font': '界面字体',
    'Font for the Claude Code interface — menus, sidebar, and chat.': 'Claude Code 界面的字体，包括菜单、侧栏和聊天。',
    'Transcript text size': '对话记录文字大小',
    'Size of the conversation transcript text.': '对话记录文字的大小。',
    Small: '小',
    Medium: '中',
    Large: '大',
    'Transcript width': '对话记录宽度',
    'Maximum width of the transcript and composer columns.': '对话记录和编辑器列的最大宽度。',
    Narrow: '窄',
    Wide: '宽',
    'Mobile simulators': '移动模拟器',
    'iOS Simulator': 'iOS 模拟器',
    'Pull requests': '拉取请求',
    'Branch prefix': '分支前缀',
    'Prefix added to branch names for both local and cloud sessions': '添加到本地和云端会话分支名称的前缀',
    'Create pull requests automatically': '自动创建拉取请求',
    'Autofix pull requests': '自动修复拉取请求',
    'Auto-archive after PR merge or close': 'PR 合并或关闭后自动归档',
    'Authorization tokens': '授权令牌',
    Application: '应用',
    Scopes: '权限范围',
    'No connected Claude Code instances': '没有已连接的 Claude Code 实例',
    'When you sign in to Claude Code, your authorization tokens will appear here.': '登录 Claude Code 后，你的授权令牌会显示在这里。',
    'Delete sessions stored by Anthropic': '删除 Anthropic 存储的会话',
    'General desktop settings': '桌面应用通用设置',
    'Run on startup': '启动时运行',
    'Automatically start Claude when you log in to your computer': '登录电脑时自动启动 Claude',
    'Quick access shortcut': '快速访问快捷键',
    'Message Claude from anywhere on your desktop': '在桌面任意位置向 Claude 发消息',
    'Tap Option twice': '连续按两次 Option',
    'Voice shortcut': '语音快捷键',
    'Speak to Claude from anywhere on your desktop': '在桌面任意位置向 Claude 说话',
    'No shortcut': '无快捷键',
    'Menu bar': '菜单栏',
    'Show Claude in the menu bar': '在菜单栏显示 Claude',
    'Keep computer awake': '保持电脑唤醒',
    'Prevent your computer from idle-sleeping while Claude is open so scheduled tasks can run. Your display can still turn off. Closing the laptop lid will still put it to sleep.': 'Claude 打开时防止电脑因闲置而睡眠，以便运行计划任务。显示器仍可关闭，合上笔记本盖仍会睡眠。',
    'Allow Claude to directly interact with apps, data, and tools on your computer.': '允许 Claude 直接与你电脑上的应用、数据和工具交互。',
    'Browse extensions': '浏览扩展',
    'Advanced settings': '高级设置',
    'Local MCP servers': '本地 MCP 服务器',
    'Add and manage MCP servers that you’re working on.': '添加和管理你正在使用的 MCP 服务器。',
    'No servers added': '尚未添加服务器',
    'Edit Config': '编辑配置',
    'Developer docs': '开发者文档',
    'Search skills': '搜索技能',
    Browse: '浏览',
    'Add skill': '添加技能',
    Skill: '技能',
    'Last updated': '最后更新',
    Author: '作者',
    'Search connectors': '搜索连接器',
    'Add connector': '添加连接器',
    'Filter by status': '按状态筛选',
    All: '全部',
    Connected: '已连接',
    'Not connected': '未连接',
    Connector: '连接器',
    Type: '类型',
    Status: '状态',
    Connect: '连接',
    Web: 'Web',
    'Search plugins': '搜索插件',
    'Add plugin': '添加插件',
    'Give Claude role-level expertise with plugins': '使用插件赋予 Claude 专业级能力',
    'Browse plugins': '浏览插件',
    'Generate memory from chats': '从聊天生成记忆',
    'Allow Claude to generate memory from your chats.': '允许 Claude 从你的聊天中生成记忆。',
    'Import memory from other AI providers': '从其他 AI 服务商导入记忆',
    'Bring relevant context and data from another AI provider to Claude. We’ll provide a prompt you can use to fetch the memory from your other account.': '将其他 AI 服务商中的相关上下文和数据带到 Claude。我们会提供提示词，帮助你从其他账户获取记忆。',
    'Start import': '开始导入',
    'Tell Claude what to change or remove': '告诉 Claude 要更改或删除什么',
    Message: '消息',
    'Start a new chat': '开始新聊天',
    'No recent chats': '没有最近的聊天',
    'Search chats': '搜索聊天',
    'Search conversations': '搜索对话',
    'Open menu': '打开菜单',
    'New chat': '新聊天',
    'New chat - Claude': '新聊天 - Claude',
    'Settings - Claude': '设置 - Claude',
    'Get started': '开始使用',
  })

  const prefixes = Object.freeze({
    'Model: ': '模型：',
    'More options for ': '更多选项：',
    'Loading ': '正在加载 ',
    'Search ': '搜索',
    'Good morning, ': '早上好，',
  })

  const protectedMarker = /(?:conversation|session|message|transcript|markdown|prose|chat[-_ ]?(?:item|row)|recent[-_ ]?(?:item|row)|history[-_ ]?(?:item|row)|user[-_ ]?content)/i
  const protectedTags = new Set(['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'CODE', 'PRE'])

  function normalize(value) {
    return String(value).trim().replace(/\s+/g, ' ')
  }

  function preserveWhitespace(original, translated) {
    const match = String(original).match(/^(\s*)([\s\S]*?)(\s*)$/)
    return `${match[1]}${translated}${match[3]}`
  }

  function translateString(value) {
    if (typeof value !== 'string') return value
    const normalized = normalize(value)
    if (!normalized) return value
    if (Object.prototype.hasOwnProperty.call(text, normalized)) {
      return preserveWhitespace(value, text[normalized])
    }
    const match = Object.entries(prefixes)
      .map(([key, translated]) => [normalize(key), translated])
      .sort(([a], [b]) => b.length - a.length)
      .find(([key]) => normalized.startsWith(key))
    if (!match) return value
    const [key, translated] = match
    return preserveWhitespace(value, `${translated}${normalized.slice(key.length)}`)
  }

  function markerFor(element) {
    if (!element || element.nodeType !== 1) return ''
    return [
      element.id,
      element.className,
      element.getAttribute?.('data-testid'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('role'),
    ].filter(Boolean).join(' ')
  }

  function isProtected(element) {
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      if (protectedTags.has(String(current.tagName || '').toUpperCase())) return true
      if (current.isContentEditable === true || current.getAttribute?.('contenteditable') === 'true') return true
      const accessibleName = current.getAttribute?.('aria-label') || current.getAttribute?.('title') || ''
      const visibleName = normalize(current.textContent || '')
      if (/^(?:Model:|模型：)\s*(?:Sonnet|Claude|Opus|Haiku)\b/i.test(accessibleName)) return true
      if (/^(?:Sonnet|Claude|Opus|Haiku)\b/i.test(visibleName) && visibleName.length < 120) return true
      if (protectedMarker.test(markerFor(current))) return true
    }
    return false
  }

  function isModelElement(element) {
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      const accessibleName = current.getAttribute?.('aria-label') || current.getAttribute?.('title') || ''
      const visibleName = normalize(current.textContent || '')
      if (/^(?:Model:|模型：)\s*(?:Sonnet|Claude|Opus|Haiku)\b/i.test(accessibleName)) return true
      if (/^(?:Sonnet|Claude|Opus|Haiku)\b/i.test(visibleName) && visibleName.length < 120) return true
    }
    return false
  }

  function translateAttributes(element) {
    if (!element || element.nodeType !== 1) return
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute?.(attribute)
      if (value === null) continue
      const translated = translateString(value)
      if (translated !== value) element.setAttribute(attribute, translated)
    }
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return
    const translated = translateString(node.nodeValue)
    if (translated === node.nodeValue) return
    if (isModelElement(node.parentElement)) return
    if (isProtected(node.parentElement)) {
      const normalized = normalize(node.nodeValue)
      const exactUiString = Object.prototype.hasOwnProperty.call(text, normalized)
      const prefixedUiString = Object.keys(prefixes).some((prefix) => normalized.startsWith(normalize(prefix)))
      if (!exactUiString && !prefixedUiString) return
    }
    if (translated !== node.nodeValue) node.nodeValue = translated
  }

  function scan(root) {
    if (!root) return
    if (root.nodeType === 3) {
      translateTextNode(root)
      return
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return
    translateAttributes(root)
    for (const element of Array.from(root.querySelectorAll?.('*') || [])) translateAttributes(element)
    const walker = root.ownerDocument?.createTreeWalker(root, 4)
    if (!walker) return
    let node
    while ((node = walker.nextNode())) translateTextNode(node)
  }

  function addChineseLanguageOption(document) {
    if (!document || document.querySelector('[data-tokenark-zh-cn-option="1"]')) return
    const candidates = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [role="menuitemradio"]'))
    const languageNode = candidates.find((element) => /English \(United States\)|英语（美国）/.test(element.textContent || ''))
    if (!languageNode) return
    const parent = languageNode.getAttribute('role') === 'menuitemradio' ? languageNode.parentElement : languageNode
    if (!parent || parent.querySelector?.('[data-tokenark-zh-cn-option="1"]')) return
    const template = parent.querySelector('[role="menuitemradio"], [role="option"], button, [data-radix-collection-item]')
    const languageLabels = {
      'Français (France)': '法语（法国）',
      'Italiano (Italia)': '意大利语（意大利）',
      'Português (Brasil)': '葡萄牙语（巴西）',
      'Español (Latinoamérica)': '西班牙语（拉丁美洲）',
      'Español (España)': '西班牙语（西班牙）',
    }
    for (const item of Array.from(parent.querySelectorAll('[role="menuitemradio"], [role="option"], [data-radix-collection-item]'))) {
      const label = normalize(item.textContent || '')
      const translated = languageLabels[label]
      if (translated && item.textContent !== translated) item.textContent = translated
    }
    const option = template ? template.cloneNode(true) : document.createElement('div')
    option.setAttribute('data-tokenark-zh-cn-option', '1')
    option.setAttribute('role', template?.getAttribute('role') || 'menuitemradio')
    let selected = false
    try { selected = localStorage.getItem('tokenarkClaudeLocale') === 'zh-CN' } catch {}
    option.setAttribute('aria-checked', selected ? 'true' : 'false')
    option.removeAttribute('data-state')
    option.textContent = '简体中文（中国）'
    option.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      try { localStorage.setItem('tokenarkClaudeLocale', 'zh-CN') } catch {}
      document.documentElement.lang = 'zh-CN'
      option.setAttribute('aria-checked', 'true')
      scan(document.body || document)
    }, true)
    parent.appendChild(option)
  }

  function isAllowedLocation(location) {
    const hostname = String(location?.hostname || '').toLowerCase()
    return hostname === 'claude.ai' || hostname === 'claude.com' || hostname === 'preview.claude.ai' || hostname === 'preview.claude.com' || hostname.endsWith('.ant.dev')
  }

  function install(document, location) {
    if (!document || document.__tokenarkClaudeRemoteZhInstalled || !isAllowedLocation(location)) return false
    document.__tokenarkClaudeRemoteZhInstalled = true
    const boot = () => {
      scan(document.body || document)
      addChineseLanguageOption(document)
      if (typeof document.title === 'string') {
        const translatedTitle = translateString(document.title)
        if (translatedTitle !== document.title) document.title = translatedTitle
      }
      if (typeof MutationObserver !== 'function' || !document.body) return
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') translateAttributes(record.target)
          if (record.type === 'characterData') translateTextNode(record.target)
          for (const node of Array.from(record.addedNodes || [])) scan(node)
        }
        addChineseLanguageOption(document)
      })
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'placeholder'],
        childList: true,
        subtree: true,
        characterData: true,
      })
      document.__tokenarkClaudeRemoteZhObserver = observer
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
    else boot()
    return true
  }

  return { install, isAllowedLocation, isProtected, scan, translateString }
})
