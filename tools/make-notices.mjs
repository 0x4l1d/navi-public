// Rebuilds THIRD_PARTY_NOTICES.md from the licence files of everything the app ships.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGES = [
  ['electron', 'Application runtime (includes Chromium, Node.js and an LGPL build of FFmpeg; their licences are installed as LICENSES.chromium.html)'],
  ['svelte', 'Interface framework'],
  ['esm-env', 'Svelte runtime dependency'],
  ['@fontsource-variable/outfit', 'Outfit typeface'],
  ['@fontsource-variable/geist', 'Geist typeface'],
  ['@fontsource-variable/geist-mono', 'Geist Mono typeface']
]

let text = '# Third-party notices\n\nNavi Public is released under the MIT License. It ships the following components under their own licences.\n'
for (const [name, role] of PACKAGES) {
  const folder = join('node_modules', name)
  const { version, license } = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map(entry => join(folder, entry)).find(existsSync)
  if (!file) throw new Error(`No licence file found for ${name}`)
  text += `\n## ${name} ${version}\n\n${role}. Licence: ${license}.\n\n\`\`\`text\n${readFileSync(file, 'utf8').trim()}\n\`\`\`\n`
}
writeFileSync('THIRD_PARTY_NOTICES.md', text)
console.log(`Wrote notices for ${PACKAGES.length} packages`)
