#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const [appRoot = '/Applications/Claude.app', output = path.resolve('reports/claude-remote-locale.json')] = process.argv.slice(2)
const root = path.join(appRoot, 'Contents', 'Resources', 'ion-dist', 'i18n')
const files = ['en-US.json', 'dynamic/en-US.json'].map(name => path.join(root, name)).filter(fs.existsSync)
const entries = []
for (const file of files) {
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(locale)) {
    if (typeof value === 'string' && /[A-Za-z]/.test(value)) entries.push({ file: path.relative(root, file), key, english: value })
  }
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), appRoot, files, entries }, null, 2) + '\n')
console.log(JSON.stringify({ output, files: files.length, entries: entries.length }))
