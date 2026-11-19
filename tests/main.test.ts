import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { addFolder, mediaId, removeFolder, rescan } from '../src/main/library.ts'
import { readEmbeddedSubtitles } from '../src/main/mkv.ts'
import { serveFile } from '../src/main/serve.ts'
import { Store } from '../src/main/store.ts'

const root = mkdtempSync(join(tmpdir(), 'navi-public-test-'))
after(() => rmSync(root, { recursive: true, force: true }))

test('store survives a damaged file by using the last good copy', () => {
  const path = join(root, 'store', 'library.json')
  const first = new Store(path)
  first.data.settings.seekStep = 5
  first.save()
  first.flush()
  first.data.settings.seekStep = 30
  first.save()
  first.flush()
  writeFileSync(path, '{"version":1,"epis')
  assert.equal(new Store(path).data.settings.seekStep, 5)
})

test('folder import finds videos and their subtitles, and keeps progress on rescan', async () => {
  const media = join(root, 'media', 'Signal Garden')
  mkdirSync(join(media, 'extras'), { recursive: true })
  writeFileSync(join(media, 'Signal Garden - 01.mkv'), 'x')
  writeFileSync(join(media, 'Signal Garden - 01.ar.srt'), 'x')
  writeFileSync(join(media, 'Signal Garden - 02.mp4'), 'x')
  writeFileSync(join(media, 'notes.txt'), 'x')
  const store = new Store(join(root, 'lib.json'))
  const added = await addFolder(store, join(root, 'media'))
  assert.equal(added.length, 2)
  const id = mediaId(join(media, 'Signal Garden - 01.mkv'))
  const episode = store.data.episodes[id]!
  assert.equal(episode.show, 'Signal Garden')
  assert.equal(episode.sidecars[0]?.language, 'Arabic')

  episode.position = 321.5
  rmSync(join(media, 'Signal Garden - 01.mkv'))
  await rescan(store)
  assert.equal(store.data.episodes[id]?.missing, true)
  assert.equal(store.data.episodes[id]?.position, 321.5)

  removeFolder(store, join(root, 'media'))
  assert.equal(Object.keys(store.data.episodes).length, 0)
  assert.equal(readFileSync(join(media, 'notes.txt'), 'utf8'), 'x', 'files on disk stay')
  store.flush()
})

test('file serving honours ranges exactly', async () => {
  const path = join(root, 'range.mp4')
  writeFileSync(path, '0123456789')
  const one = await serveFile(path, 'bytes=0-0')
  assert.equal(one.status, 206)
  assert.equal(one.headers.get('content-range'), 'bytes 0-0/10')
  assert.equal(await one.text(), '0')
  const tail = await serveFile(path, 'bytes=8-')
  assert.equal(await tail.text(), '89')
  const past = await serveFile(path, 'bytes=10-')
  assert.equal(past.status, 416)
  assert.equal(past.headers.get('content-range'), 'bytes */10')
  assert.equal(await (await serveFile(path, null)).text(), '0123456789')
  assert.equal((await serveFile(join(root, 'nope.mp4'), null)).status, 404)
})

function vint (size: number) {
  const out = Buffer.alloc(8)
  out.writeBigUInt64BE(BigInt(size) | (1n << 56n))
  return out
}
function el (id: number[], ...parts: Buffer[]) {
  const body = Buffer.concat(parts)
  return Buffer.concat([Buffer.from(id), vint(body.length), body])
}
const u = (...bytes: number[]) => Buffer.from(bytes)

test('embedded text subtitles are read from Matroska', async () => {
  const entry = el([0xAE], el([0xD7], u(3)), el([0x83], u(17)), el([0x86], Buffer.from('S_TEXT/UTF8')), el([0x22, 0xB5, 0x9C], Buffer.from('ara')))
  const video = el([0xAE], el([0xD7], u(1)), el([0x83], u(1)), el([0x86], Buffer.from('V_VP9')))
  const tracks = el([0x16, 0x54, 0xAE, 0x6B], video, entry)
  const block = Buffer.concat([u(0x83, 0x00, 0x64, 0x80), Buffer.from('مرحبا')])
  const skipped = Buffer.concat([u(0x81, 0x00, 0x00, 0x80), Buffer.alloc(32)])
  const group = el([0xA0], el([0xA1], block), el([0x9B], u(0x07, 0xD0)))
  const cluster = el([0x1F, 0x43, 0xB6, 0x75], el([0xE7], u(0x03, 0xE8)), el([0xA3], skipped), group)
  const file = Buffer.concat([el([0x1A, 0x45, 0xDF, 0xA3], el([0x42, 0x82], Buffer.from('matroska'))), el([0x18, 0x53, 0x80, 0x67], tracks, cluster)])
  const path = join(root, 'subs.mkv')
  writeFileSync(path, file)

  const subtitles = await readEmbeddedSubtitles(path)
  assert.equal(subtitles.length, 1)
  assert.equal(subtitles[0]?.language, 'Arabic')
  assert.match(subtitles[0]?.text ?? '', /00:00:01,100 --> 00:00:03,100\nمرحبا/)
})

test('a file that is not Matroska yields no subtitles', async () => {
  const path = join(root, 'plain.mkv')
  writeFileSync(path, 'not a matroska file at all')
  assert.deepEqual(await readEmbeddedSubtitles(path), [])
})
