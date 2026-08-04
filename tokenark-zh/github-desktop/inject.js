(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) {
    module.exports = api
  }
  root.TokenArkGitHubDesktopZh = api
  if (root.document && root.__TOKENARK_GHD_ZH__) {
    const boot = () => api.install(root.document, root.__TOKENARK_GHD_ZH__)
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot, { once: true })
    } else {
      boot()
    }
  }
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'

  function preserveWhitespace(original, translated) {
    const match = String(original).match(/^(\s*)([\s\S]*?)(\s*)$/)
    return `${match[1]}${translated}${match[3]}`
  }

  function normalizePrefixKey(value) {
    return String(value).replace(/\s+/g, ' ').trim()
  }

  function prefixEntries(prefixMap) {
    return Object.entries(prefixMap)
      .map(([rawKey, translated]) => {
        const raw = String(rawKey)
        return {
          key: normalizePrefixKey(raw),
          translated,
          hasLeadingSeparator: /^\s/.test(raw),
          hasTrailingSeparator: /\s$/.test(raw),
          numericRelativeTime: /^(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago$/.test(normalizePrefixKey(raw)),
        }
      })
      .filter(({ key }) => key.length > 0)
      .sort((a, b) => b.key.length - a.key.length)
  }

  function joinPrefixTranslation(translated, suffix) {
    const prefix = String(translated)
    const rest = String(suffix)
    if (!rest) return prefix.replace(/\s+$/, '')
    // Chinese punctuation attaches directly to the following dynamic value.
    if (/[：：（]$/.test(prefix)) {
      const attached = rest.replace(/^\s+/, '')
      return `${prefix}${prefix.endsWith('（') ? attached.replace(/\)$/g, '）') : attached}`
    }
    if (/\s$/.test(prefix) && /^\s/.test(rest)) return `${prefix}${rest.replace(/^\s+/, '')}`
    return `${prefix}${rest}`
  }

  function translateString(value, map, prefixMap) {
    if (typeof value !== 'string' || !map) return value
    const trimmed = value.trim()
    const normalized = trimmed.replace(/\s+/g, ' ')
    if (!normalized) return value
    if (Object.prototype.hasOwnProperty.call(map, normalized)) {
      return preserveWhitespace(value, map[normalized])
    }
    if (prefixMap) {
      const entries = prefixEntries(prefixMap)
      const prefix = entries.find(({ key, hasLeadingSeparator, hasTrailingSeparator, numericRelativeTime }) => {
        if (!normalized.startsWith(key)) return false
        if (numericRelativeTime) return false
        if (!hasTrailingSeparator) return true
        const next = normalized.slice(key.length)
        return next.length > 0 ? /^\s/.test(next) : hasLeadingSeparator
      })
      if (prefix) {
        return preserveWhitespace(value, joinPrefixTranslation(prefix.translated, normalized.slice(prefix.key.length)))
      }
      const suffix = entries.find(({ key, hasLeadingSeparator, numericRelativeTime }) => {
        if (!normalized.endsWith(key) || normalized.length <= key.length) return false
        if (!numericRelativeTime) return false
        const before = normalized.slice(0, -key.length)
        const previous = before.replace(/\s+$/, '')
        if (!hasLeadingSeparator && before.length === previous.length) return false
        // Suffix translations are reserved for numeric relative-time labels.
        return /^\d+(?:\.\d+)?$/.test(previous)
      })
      if (suffix) {
        const left = normalized.slice(0, -suffix.key.length).replace(/\s+$/, '')
        return preserveWhitespace(value, `${left}${suffix.translated}`)
      }
    }
    return value
  }

  function shouldSkipElement(element) {
    if (!element || element.nodeType !== 1) return false
    const tag = String(element.tagName || '').toLowerCase()
    return (
      element.getAttribute?.('data-tokenark-no-translate') !== null ||
      ['code', 'pre', 'textarea', 'script', 'style', 'input'].includes(tag) ||
      isSelectControl(element) ||
      element.isContentEditable === true
    )
  }

  function isSelectControl(element) {
    const tag = String(element?.tagName || '').toLowerCase()
    return ['select', 'option', 'optgroup'].includes(tag)
  }

  function hasSkippedAncestor(element) {
    let current = element
    while (current) {
      if (shouldSkipElement(current)) return true
      current = current.parentNode
    }
    return false
  }

  function translateAttributes(element, map) {
    if (
      !element ||
      !map ||
      isSelectControl(element) ||
      element.getAttribute?.('data-tokenark-no-translate') !== null ||
      element.isContentEditable === true
    ) return
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      const value = element.getAttribute?.(attribute)
      if (value !== null) {
        const translated = translateString(value, map)
        if (translated !== value) element.setAttribute(attribute, translated)
      }
    }
  }

  function translateElement(element, dictionary) {
    if (!element) return
    const textMap = dictionary?.text || {}
    const attributeMap = dictionary?.attribute || {}
    if (element.nodeType === 3) {
      if (hasSkippedAncestor(element.parentNode)) return
      const translated = translateString(element.nodeValue, textMap, dictionary?.prefix || {})
      if (translated !== element.nodeValue) element.nodeValue = translated
      return
    }
    translateAttributes(element, attributeMap)
    if (shouldSkipElement(element)) return
    for (const child of Array.from(element.childNodes || [])) {
      translateElement(child, dictionary)
    }
  }

  function scan(document, dictionary) {
    if (document?.body) translateElement(document.body, dictionary)
  }

  function install(document, dictionary) {
    if (!document || !dictionary || document.__tokenarkGhdZhInstalled) return
    document.__tokenarkGhdZhInstalled = true
    scan(document, dictionary)
    if (typeof MutationObserver === 'function' && document.body) {
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of Array.from(record.addedNodes || [])) {
            translateElement(node, dictionary)
          }
          if (record.type === 'characterData') translateElement(record.target, dictionary)
          if (record.type === 'attributes') translateAttributes(record.target, dictionary.attribute || {})
        }
      })
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['title', 'aria-label', 'placeholder'],
        childList: true,
        subtree: true,
        characterData: true,
      })
      document.__tokenarkGhdZhObserver = observer
    }
  }

  return {
    install,
    scan,
    shouldSkipElement,
    translateAttributes,
    translateElement,
    normalizePrefixKey,
    translateString,
  }
})
