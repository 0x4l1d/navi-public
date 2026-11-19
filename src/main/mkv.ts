import { open, type FileHandle } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

import { languageName } from '../shared/subtitles.ts'

import type { EmbeddedSubtitle, SubtitleFormat } from '../shared/types.ts'

const ID = {
  Segment: 0x18538067, Tracks: 0x1654AE6B, TrackEntry: 0xAE, TrackNumber: 0xD7, TrackType: 0x83,
  CodecID: 0x86, CodecPrivate: 0x63A2, Name: 0x536E, Language: 0x22B59C, LanguageBCP47: 0x22B59D,
  ContentEncodings: 0x6D80, ContentEncoding: 0x6240, ContentCompression: 0x5034,
  ContentCompAlgo: 0x4254, ContentCompSettings: 0x4255,
  Cluster: 0x1F43B675, Timestamp: 0xE7, SimpleBlock: 0xA3, BlockGroup: 0xA0, Block: 0xA1, BlockDuration: 0x9B,
  Info: 0x1549A966, TimestampScale: 0x2AD7B1
}

const CODECS: Record<string, SubtitleFormat> = { 'S_TEXT/UTF8': 'srt', 'S_TEXT/ASCII': 'srt', 'S_TEXT/ASS': 'ass', 'S_TEXT/SSA': 'ass', 'S_ASS': 'ass', 'S_SSA': 'ass', 'S_TEXT/WEBVTT': 'vtt' }
const CHUNK = 64 * 1024
/** Refuses absurd element sizes from damaged files instead of allocating them. */
const MAX_ELEMENT = 32 * 1024 * 1024

class Reader {
  private buffer = Buffer.alloc(0)
  private start = 0
  private readonly file: FileHandle
  readonly size: number

  constructor (file: FileHandle, size: number) {
    this.file = file
    this.size = size
  }

  async bytes (position: number, length: number) {
    if (position < this.start || position + length > this.start + this.buffer.length) {
      const wanted = Math.min(Math.max(length, CHUNK), this.size - position)
      const buffer = Buffer.alloc(Math.max(0, wanted))
      const { bytesRead } = await this.file.read(buffer, 0, buffer.length, position)
      this.buffer = buffer.subarray(0, bytesRead)
      this.start = position
    }
    return this.buffer.subarray(position - this.start, position - this.start + length)
  }
}

interface Element { id: number, size: number, data: number, unknown: boolean }

async function element (reader: Reader, position: number): Promise<Element | null> {
  const head = await reader.bytes(position, 12)
  if (head.length < 2 || !head[0]) return null
  const idLength = Math.clz32(head[0]) - 23
  if (idLength > 4 || head.length < idLength + 1) return null
  let id = 0
  for (let i = 0; i < idLength; i++) id = id * 256 + head[i]!
  const first = head[idLength]!
  if (!first) return null
  const sizeLength = Math.clz32(first) - 23
  if (head.length < idLength + sizeLength) return null
  let size = first & (0xFF >> sizeLength)
  let allOnes = size === (0xFF >> sizeLength)
  for (let i = 1; i < sizeLength; i++) {
    const byte = head[idLength + i]!
    size = size * 256 + byte
    allOnes &&= byte === 0xFF
  }
  return { id, size, data: position + idLength + sizeLength, unknown: allOnes }
}

function uint (data: Buffer) {
  let value = 0
  for (const byte of data) value = value * 256 + byte
  return value
}

async function* children (reader: Reader, start: number, end: number) {
  let position = start
  while (position < end) {
    const child = await element(reader, position)
    if (!child) return
    yield child
    if (child.unknown) return
    position = child.data + child.size
  }
}

interface Track {
  number: number
  format: SubtitleFormat
  label: string
  language: string
  header: string
  compression: number | null
  stripped: Buffer
  events: Array<{ start: number, end: number, text: string }>
}

async function small (reader: Reader, child: Element) {
  if (child.size > MAX_ELEMENT) return Buffer.alloc(0)
  return Buffer.from(await reader.bytes(child.data, child.size))
}

async function readCompression (reader: Reader, parent: Element, track: Track) {
  for await (const encoding of children(reader, parent.data, parent.data + parent.size)) {
    if (encoding.id !== ID.ContentEncoding) continue
    for await (const part of children(reader, encoding.data, encoding.data + encoding.size)) {
      if (part.id !== ID.ContentCompression) continue
      track.compression = 0
      for await (const field of children(reader, part.data, part.data + part.size)) {
        if (field.id === ID.ContentCompAlgo) track.compression = uint(await small(reader, field))
        if (field.id === ID.ContentCompSettings) track.stripped = await small(reader, field)
      }
    }
  }
}

function unpack (track: Track, data: Buffer) {
  if (track.compression === 0) return inflateSync(data)
  if (track.compression === 3) return Buffer.concat([track.stripped, data])
  return data
}

async function readTrack (reader: Reader, entry: Element) {
  const track: Track = { number: 0, format: 'srt', label: '', language: '', header: '', compression: null, stripped: Buffer.alloc(0), events: [] }
  let type = 0
  let codec = ''
  let priv: Buffer | undefined
  for await (const field of children(reader, entry.data, entry.data + entry.size)) {
    if (field.id === ID.TrackNumber) track.number = uint(await small(reader, field))
    if (field.id === ID.TrackType) type = uint(await small(reader, field))
    if (field.id === ID.CodecID) codec = (await small(reader, field)).toString('latin1').replace(/\0+$/, '')
    if (field.id === ID.CodecPrivate) priv = await small(reader, field)
    if (field.id === ID.Name) track.label = (await small(reader, field)).toString('utf8').replace(/\0+$/, '')
    if (field.id === ID.Language || field.id === ID.LanguageBCP47) track.language = (await small(reader, field)).toString('latin1').replace(/\0+$/, '')
    if (field.id === ID.ContentEncodings) await readCompression(reader, field, track)
  }
  const format = CODECS[codec]
  if (type !== 17 || !format) return null
  track.format = format
  if (priv) track.header = unpack(track, priv).toString('utf8')
  return track
}

function clock (seconds: number, ass: boolean) {
  const total = Math.max(0, seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = Math.floor(total % 60)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  if (ass) return `${h}:${pad(m)}:${pad(s)}.${pad(Math.floor(total % 1 * 100))}`
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(Math.floor(total % 1 * 1000), 3)}`
}

function assemble (track: Track) {
  const events = track.events.sort((a, b) => a.start - b.start)
  if (track.format === 'ass') {
    const body = events.map(({ start, end, text }) => {
      // Matroska stores: ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      const parts = text.split(',')
      return `Dialogue: ${parts[1] ?? 0},${clock(start, true)},${clock(end, true)},${parts.slice(2).join(',')}`
    })
    const header = track.header.includes('[Events]') ? track.header.trimEnd() : `${track.header.trimEnd()}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`
    return `${header}\n${body.join('\n')}\n`
  }
  return events.map(({ start, end, text }, index) => `${index + 1}\n${clock(start, false)} --> ${clock(end, false)}\n${text}\n`).join('\n')
}

/** Reads the text subtitle tracks of a Matroska file without loading the video data. */
export async function readEmbeddedSubtitles (path: string): Promise<EmbeddedSubtitle[]> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const reader = new Reader(file, size)
    const header = await element(reader, 0)
    if (header?.id !== 0x1A45DFA3) return []
    const segment = await element(reader, header.data + header.size)
    if (segment?.id !== ID.Segment) return []
    const end = segment.unknown ? size : Math.min(size, segment.data + segment.size)

    const tracks = new Map<number, Track>()
    let scale = 1_000_000
    for await (const child of children(reader, segment.data, end)) {
      if (child.id === ID.Info) {
        for await (const field of children(reader, child.data, child.data + child.size)) {
          if (field.id === ID.TimestampScale) scale = uint(await small(reader, field)) || scale
        }
      }
      if (child.id === ID.Tracks) {
        for await (const entry of children(reader, child.data, child.data + child.size)) {
          if (entry.id !== ID.TrackEntry) continue
          const track = await readTrack(reader, entry)
          if (track) tracks.set(track.number, track)
        }
        if (!tracks.size) return []
      }
      if (child.id === ID.Cluster) await readClusters(reader, child, end, tracks, scale)
      if (child.id === ID.Cluster && child.unknown) break
    }

    return [...tracks.values()].filter(track => track.events.length).map(track => ({
      track: track.number,
      label: track.label || languageName(track.language.split('-')[0]) || track.language.toUpperCase() || `Track ${track.number}`,
      language: languageName(track.language.split('-')[0]),
      format: track.format,
      text: assemble(track)
    }))
  } finally {
    await file.close()
  }
}

async function readBlock (reader: Reader, child: Element, base: number, duration: number, tracks: Map<number, Track>, scale: number) {
  const head = await reader.bytes(child.data, 4)
  if (!head.length || !head[0]) return
  const length = Math.clz32(head[0]) - 23
  let number = head[0] & (0xFF >> length)
  for (let i = 1; i < length; i++) number = number * 256 + (head[i] ?? 0)
  const track = tracks.get(number)
  if (!track || child.size > MAX_ELEMENT) return
  const offset = length + 3
  const block = await small(reader, child)
  const relative = block.readInt16BE(length)
  const text = unpack(track, block.subarray(offset)).toString('utf8').replace(/\0+$/, '')
  const unit = scale / 1e9
  track.events.push({ start: (base + relative) * unit, end: (base + relative + duration) * unit, text })
}

async function readClusters (reader: Reader, cluster: Element, segmentEnd: number, tracks: Map<number, Track>, scale: number) {
  // live-muxed files may leave the cluster size unknown: its children then run until the next cluster
  const end = cluster.unknown ? segmentEnd : cluster.data + cluster.size
  let position = cluster.data
  let base = 0
  while (position < end) {
    const child = await element(reader, position)
    if (!child) return
    if (cluster.unknown && child.id === ID.Cluster) {
      await readClusters(reader, child, segmentEnd, tracks, scale)
      return
    }
    if (child.id === ID.Timestamp) base = uint(await small(reader, child))
    if (child.id === ID.SimpleBlock) await readBlock(reader, child, base, 5000 / (scale / 1e6), tracks, scale)
    if (child.id === ID.BlockGroup) {
      let block: Element | undefined
      let duration = 0
      for await (const part of children(reader, child.data, child.data + child.size)) {
        if (part.id === ID.Block) block = part
        if (part.id === ID.BlockDuration) duration = uint(await small(reader, part))
      }
      if (block) await readBlock(reader, block, base, duration, tracks, scale)
    }
    position = child.data + child.size
  }
}
