import type { SubtitleFormat } from './types.ts'

export interface CueRun {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
  color: string | null
}

export interface Cue {
  start: number
  end: number
  lines: CueRun[][]
  /** Numpad position: 1-3 bottom, 4-6 middle, 7-9 top. */
  align: number
  position: { x: number, y: number } | null
  font: string | null
  scale: number
  color: string | null
  outline: string | null
}

export function subtitleFormat (fileName: string): SubtitleFormat | null {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'srt') return 'srt'
  if (ext === 'vtt') return 'vtt'
  if (ext === 'ass' || ext === 'ssa') return 'ass'
  return null
}

/** Subtitle files are often not UTF-8, older Arabic releases especially. */
export function decodeSubtitle (bytes: Uint8Array) {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    let high = 0
    let letters = 0
    for (const byte of bytes) {
      if (byte > 0x40) letters++
      if (byte >= 0xC1 && byte <= 0xED) high++
    }
    return new TextDecoder(high / Math.max(1, letters) > 0.4 ? 'windows-1256' : 'windows-1252').decode(bytes)
  }
}

function clock (text: string) {
  const match = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,:](\d{1,3}))?$/)
  if (!match) return NaN
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction
}

function run (text: string, state: Omit<CueRun, 'text'>): CueRun {
  return { text, ...state }
}

function baseCue (start: number, end: number, lines: CueRun[][]): Cue {
  return { start, end, lines, align: 2, position: null, font: null, scale: 1, color: null, outline: null }
}

function entities (text: string) {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
}

/** Basic HTML-like tags used by SRT and WebVTT. Output is plain data, never markup. */
function htmlRuns (source: string) {
  const lines: CueRun[][] = []
  for (const line of source.split('\n')) {
    const runs: CueRun[] = []
    const state = { bold: false, italic: false, underline: false, color: null as string | null }
    let last = 0
    for (const tag of line.matchAll(/<\s*(\/?)\s*([a-z]+)([^>]*)>/gi)) {
      const text = entities(line.slice(last, tag.index))
      if (text) runs.push(run(text, state))
      last = tag.index + tag[0].length
      const open = !tag[1]
      const name = tag[2]?.toLowerCase()
      if (name === 'b') state.bold = open
      if (name === 'i') state.italic = open
      if (name === 'u') state.underline = open
      if (name === 'font') state.color = open ? tag[3]?.match(/color\s*=\s*["']?(#[0-9a-f]{3,8}|[a-z]+)/i)?.[1] ?? null : null
    }
    const rest = entities(line.slice(last))
    if (rest) runs.push(run(rest, state))
    if (runs.length) lines.push(runs)
  }
  return lines
}

export function parseSrt (text: string) {
  const cues: Cue[] = []
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.trim().split('\n')
    const index = lines.findIndex(line => line.includes('-->'))
    if (index < 0) continue
    const [from, to] = (lines[index] ?? '').split('-->')
    const start = clock(from ?? '')
    const end = clock((to ?? '').trim().split(/\s+/)[0] ?? '')
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    const body = htmlRuns(lines.slice(index + 1).join('\n'))
    if (body.length) cues.push(baseCue(start, end, body))
  }
  return cues.sort((a, b) => a.start - b.start)
}

export function parseVtt (text: string) {
  const cues: Cue[] = []
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.trim().split('\n')
    const index = lines.findIndex(line => line.includes('-->'))
    if (index < 0 || /^(?:NOTE|STYLE|REGION)\b/.test(lines[0] ?? '')) continue
    const [from, rest] = (lines[index] ?? '').split('-->')
    const parts = (rest ?? '').trim().split(/\s+/)
    const start = clock(from ?? '')
    const end = clock(parts[0] ?? '')
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    const body = htmlRuns(lines.slice(index + 1).join('\n').replace(/<\d[\d:.]*>/g, ''))
    if (!body.length) continue
    const cue = baseCue(start, end, body)
    if (parts.some(part => /^line:0(?:%|$)/.test(part))) cue.align = 8
    cues.push(cue)
  }
  return cues.sort((a, b) => a.start - b.start)
}

/** &HAABBGGRR& to CSS. ASS alpha is inverted: 00 is opaque. */
function assColor (value: string | undefined) {
  const hex = value?.replace(/[&H]/gi, '').padStart(6, '0')
  if (!hex || !/^[0-9a-f]{6,8}$/i.test(hex)) return null
  const body = hex.slice(-6)
  const alpha = hex.length === 8 ? 1 - parseInt(hex.slice(0, 2), 16) / 255 : 1
  const [b, g, r] = [body.slice(0, 2), body.slice(2, 4), body.slice(4, 6)].map(part => parseInt(part, 16))
  return `rgba(${r},${g},${b},${Number(alpha.toFixed(2))})`
}

interface AssStyle { font: string, size: number, color: string | null, outline: string | null, bold: boolean, italic: boolean, underline: boolean, align: number }

const LEGACY_ALIGN: Record<number, number> = { 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 }

/** Dialogue text, styles, colours and placement. Animated typesetting is shown as plain positioned text. */
export function parseAss (text: string) {
  const cues: Cue[] = []
  const styles = new Map<string, AssStyle>()
  let section = ''
  let styleFormat: string[] = []
  let eventFormat: string[] = []
  let playResX = 384
  let playResY = 288
  let legacy = false

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (/^\[.*\]$/.test(line)) {
      section = line.toLowerCase()
      legacy ||= section === '[v4 styles]'
      continue
    }
    const colon = line.indexOf(':')
    if (colon < 0 || line.startsWith(';')) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (key === 'playresx') playResX = Number(value) || playResX
    if (key === 'playresy') playResY = Number(value) || playResY
    if (section.includes('styles')) {
      if (key === 'format') styleFormat = value.split(',').map(part => part.trim().toLowerCase())
      if (key === 'style') {
        const fields = value.split(',')
        const get = (name: string) => fields[styleFormat.indexOf(name)]?.trim()
        const align = Number(get('alignment')) || 2
        styles.set((get('name') ?? '').replace(/^\*/, ''), {
          font: get('fontname') ?? '',
          size: Number(get('fontsize')) || 20,
          color: assColor(get('primarycolour')),
          outline: assColor(get('outlinecolour')),
          bold: (get('bold') ?? '0') !== '0',
          italic: (get('italic') ?? '0') !== '0',
          underline: (get('underline') ?? '0') !== '0',
          align: legacy ? LEGACY_ALIGN[align] ?? 2 : align
        })
      }
    }
    if (section === '[events]') {
      if (key === 'format') eventFormat = value.split(',').map(part => part.trim().toLowerCase())
      if (key === 'dialogue') {
        const count = eventFormat.length
        const fields = value.split(',')
        const body = fields.slice(count - 1).join(',')
        const get = (name: string) => fields[eventFormat.indexOf(name)]?.trim()
        const start = clock(get('start') ?? '')
        const end = clock(get('end') ?? '')
        if (Number.isNaN(start) || Number.isNaN(end)) continue
        const style = styles.get((get('style') ?? '').replace(/^\*/, ''))
        const cue = assCue(start, end, body, style, playResX, playResY)
        if (cue) cues.push(cue)
      }
    }
  }
  return cues.sort((a, b) => a.start - b.start)
}

function assCue (start: number, end: number, body: string, style: AssStyle | undefined, resX: number, resY: number) {
  const cue = baseCue(start, end, [])
  cue.align = style?.align ?? 2
  cue.font = style?.font ?? null
  cue.scale = style ? style.size / resY * 18 : 1
  cue.color = style?.color ?? null
  cue.outline = style?.outline ?? null
  const state = { bold: style?.bold ?? false, italic: style?.italic ?? false, underline: style?.underline ?? false, color: null as string | null }
  let lines: CueRun[][] = [[]]
  let last = 0
  const push = (text: string) => {
    const parts = text.replace(/\\h/g, ' ').split(/\\[Nn]/)
    parts.forEach((part, index) => {
      if (index) lines.push([])
      if (part) lines[lines.length - 1]?.push(run(part, state))
    })
  }
  for (const block of body.matchAll(/\{([^}]*)\}/g)) {
    push(body.slice(last, block.index))
    last = block.index + block[0].length
    const tags = block[1] ?? ''
    for (const tag of tags.matchAll(/\\(an|a|pos|move|b|i|u|1?c|fn|fs|p)(?![a-z])(\([^)]*\)|[^\\]*)/gi)) {
      const name = tag[1]?.toLowerCase()
      const value = tag[2] ?? ''
      if (name === 'an') cue.align = Number(value) || cue.align
      if (name === 'a') cue.align = LEGACY_ALIGN[Number(value)] ?? cue.align
      if (name === 'b') state.bold = value !== '0' && value !== ''
      if (name === 'i') state.italic = value === '1'
      if (name === 'u') state.underline = value === '1'
      if (name === 'c' || name === '1c') state.color = assColor(value)
      if (name === 'fn' && value) cue.font = value
      if (name === 'fs' && Number(value)) cue.scale = Number(value) / resY * 18
      if (name === 'pos' || name === 'move') {
        const [x, y] = value.replace(/[()]/g, '').split(',').map(Number)
        if (Number.isFinite(x) && Number.isFinite(y)) cue.position = { x: x! / resX * 100, y: y! / resY * 100 }
      }
      // \p1 means the event draws vector shapes, which cannot be shown as text
      if (name === 'p' && Number(value) > 0) return null
    }
  }
  push(body.slice(last))
  lines = lines.filter(line => line.length)
  if (!lines.length) return null
  cue.lines = lines
  return cue
}

export function parseSubtitle (text: string, format: SubtitleFormat) {
  if (format === 'ass') return parseAss(text)
  return format === 'vtt' ? parseVtt(text) : parseSrt(text)
}

/** Cues showing at `time`. Cues are sorted by start, so the scan stops at the first future cue. */
export function activeCues (cues: Cue[], time: number) {
  const active: Cue[] = []
  for (const cue of cues) {
    if (cue.start > time) break
    if (cue.end > time) active.push(cue)
  }
  return active
}

const LANGUAGE_TOKENS: Record<string, string> = {
  en: 'English', eng: 'English', english: 'English',
  ar: 'Arabic', ara: 'Arabic', arabic: 'Arabic',
  ja: 'Japanese', jp: 'Japanese', jpn: 'Japanese', japanese: 'Japanese',
  es: 'Spanish', spa: 'Spanish', spanish: 'Spanish',
  fr: 'French', fre: 'French', fra: 'French', french: 'French',
  de: 'German', ger: 'German', deu: 'German', german: 'German',
  pt: 'Portuguese', por: 'Portuguese', portuguese: 'Portuguese',
  it: 'Italian', ita: 'Italian', italian: 'Italian',
  ru: 'Russian', rus: 'Russian', russian: 'Russian',
  ko: 'Korean', kor: 'Korean', korean: 'Korean',
  zh: 'Chinese', chi: 'Chinese', zho: 'Chinese', chinese: 'Chinese'
}

export function languageName (token: string | undefined) {
  return token ? LANGUAGE_TOKENS[token.toLowerCase()] ?? '' : ''
}

/** "Show - 01.ar.srt" next to "Show - 01.mkv" gives Arabic. */
export function sidecarLanguage (subtitleName: string, videoStem: string) {
  const stem = subtitleName.replace(/\.[^.]+$/, '')
  const extra = stem.slice(videoStem.length).split(/[._\-\s]+/).filter(Boolean)
  for (const token of extra.reverse()) {
    const name = languageName(token)
    if (name) return name
  }
  return ''
}
