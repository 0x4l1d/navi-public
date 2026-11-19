// Fails when a tree contains personal data, secrets, or anything tied to fetching media from third parties.
// Usage: node tools/audit-source.mjs [folder]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'demo-media'])
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2', '.exe', '.dll', '.pak', '.bin', '.dat', '.mkv', '.mp4', '.asar'])
// the upstream credit is the one place these names belong
const CREDIT_FILES = new Set(['README.md', 'THIRD_PARTY_NOTICES.md'])

const RULES = [
  ['personal path', /[A-Za-z]:[\\/]+Users[\\/]+(?!<)[^\\/\s'"`]+/],
  ['home path', /\/(?:home|Users)\/[a-z0-9._-]+\//],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['API key', /\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/],
  ['magnet link', /magnet:\?/i],
  ['peer-to-peer code', /\b(?:web)?torrent|bittorrent|\bdht\b|\btracker(?:s|url)?\b|infohash|\.torrent\b/i],
  ['catalogue or source provider', /\b(?:nyaa|anilist|anidb|animetosho|seadex|kitsu|myanimelist|crunchyroll|gogoanime)\b/i],
  ['auto-update or telemetry', /electron-updater|autoUpdater|\bsentry\b|google-analytics|posthog|mixpanel/i]
]
const CREDIT_ONLY = [['private upstream name', /\bhayase\b/i]]
const REMOTE = /\bhttps?:\/\/(?!www\.w3\.org\/|localhost|127\.0\.0\.1)[^\s'"`<>)]+/g

function * walk (folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) { if (!SKIP_DIRS.has(name)) yield * walk(path) } else yield path
  }
}

const problems = []
let scanned = 0
for (const path of walk(root)) {
  const name = basename(path)
  if (BINARY.has(extname(name).toLowerCase()) || name === 'audit-source.mjs' || name === 'package-lock.json') continue
  if (/^\.env|\.(?:pem|pfx|p12|key|log)$/i.test(name)) { problems.push(`${relative(root, path)}: file type must not ship`); continue }
  scanned++
  const text = readFileSync(path, 'utf8')
  const licences = name === 'THIRD_PARTY_NOTICES.md' || /^LICEN[CS]E/i.test(name)
  for (const [label, pattern] of [...RULES, ...CREDIT_FILES.has(name) ? [] : CREDIT_ONLY]) {
    if (licences && label === 'auto-update or telemetry') continue
    const match = text.match(pattern)
    if (match) problems.push(`${relative(root, path)}: ${label}: ${match[0].slice(0, 60)}`)
  }
  const emails = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) ?? []
  for (const email of emails) {
    if (!licences && !email.endsWith('@users.noreply.github.com')) problems.push(`${relative(root, path)}: email address: ${email}`)
  }
  if (!licences && name !== 'README.md') {
    for (const url of text.match(REMOTE) ?? []) problems.push(`${relative(root, path)}: remote URL: ${url.slice(0, 70)}`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`\nAudit failed: ${problems.length} problem(s) in ${scanned} files.`)
  process.exit(1)
}
console.log(`Audit passed: ${scanned} files clean.`)
