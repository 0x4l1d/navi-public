import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseMediaName, showKey } from '../src/shared/parse.ts'
import { cycleTrack, formatTime, isFinished, isTextEntry, parseRange, resumePosition } from '../src/shared/playback.ts'
import { activeCues, decodeSubtitle, parseAss, parseSrt, parseVtt, sidecarLanguage } from '../src/shared/subtitles.ts'

test('file names give show, season and episode', () => {
  const cases: Array<[string, string, string, number, number | null]> = [
    ['[Group] Signal Garden - 05 [1080p][HEVC].mkv', '', 'Signal Garden', 1, 5],
    ['Signal.Garden.S02E07.The.Long.Night.1080p.WEB-DL.x265.mkv', '', 'Signal Garden', 2, 7],
    ['Signal Garden 3x04.mp4', '', 'Signal Garden', 3, 4],
    ['Signal Garden - Episode 12.mkv', '', 'Signal Garden', 1, 12],
    ['Signal Garden S2 - 03.mkv', '', 'Signal Garden', 2, 3],
    ['05.mkv', 'Signal Garden Season 2', 'Signal Garden', 2, 5],
    ['Blade Runner 2049.mkv', '', 'Blade Runner 2049', 1, null],
    ['Aurora Study (2024) 1080p BluRay.mp4', '', 'Aurora Study (2024)', 1, null]
  ]
  for (const [name, folder, show, season, episode] of cases) {
    const parsed = parseMediaName(name, folder)
    assert.deepEqual([parsed.show, parsed.season, parsed.episode], [show, season, episode], name)
  }
  assert.equal(parseMediaName('Signal.Garden.S02E07.The.Long.Night.1080p.mkv').title, 'The Long Night')
  assert.equal(showKey('Signal  Garden!'), 'signal-garden')
})

test('resume returns the exact saved second', () => {
  assert.equal(resumePosition(123.4, 1400), 123.4)
  assert.equal(resumePosition(0, 1400), 0)
  assert.equal(resumePosition(Number.NaN, 1400), 0)
  assert.equal(resumePosition(1399, 1400), 0, 'a finished episode starts over')
  assert.equal(isFinished(1371, 1400), true)
  assert.equal(isFinished(1300, 1400), false)
  assert.equal(isFinished(5, 0), false)
})

test('subtitle cycling passes through off in both directions', () => {
  const ids = ['a', 'b']
  assert.equal(cycleTrack(ids, null, 1), 'a')
  assert.equal(cycleTrack(ids, 'a', 1), 'b')
  assert.equal(cycleTrack(ids, 'b', 1), null)
  assert.equal(cycleTrack(ids, null, -1), 'b')
  assert.equal(cycleTrack(ids, 'a', -1), null)
  assert.equal(cycleTrack([], null, 1), null)
  assert.equal(cycleTrack(ids, 'gone', 1), 'a')
})

test('shortcuts leave text boxes alone', () => {
  assert.equal(isTextEntry({ tagName: 'INPUT', type: 'text' }), true)
  assert.equal(isTextEntry({ tagName: 'INPUT', type: 'search' }), true)
  assert.equal(isTextEntry({ tagName: 'TEXTAREA' }), true)
  assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(isTextEntry({ tagName: 'INPUT', type: 'range' }), false)
  assert.equal(isTextEntry({ tagName: 'BUTTON' }), false)
  assert.equal(isTextEntry(null), false)
})

test('byte ranges follow HTTP', () => {
  assert.deepEqual(parseRange('bytes=0-0', 100), { start: 0, end: 0 })
  assert.deepEqual(parseRange('bytes=10-', 100), { start: 10, end: 99 })
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 })
  assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 })
  assert.equal(parseRange('bytes=100-', 100), 'invalid')
  assert.equal(parseRange('bytes=5-2', 100), 'invalid')
  assert.equal(parseRange('items=0-1', 100), 'invalid')
  assert.equal(parseRange(null, 100), null)
})

test('time text', () => {
  assert.equal(formatTime(65), '1:05')
  assert.equal(formatTime(3725), '1:02:05')
  assert.equal(formatTime(Number.NaN), '0:00')
})

test('SRT keeps timing and simple styling as data', () => {
  const [cue] = parseSrt('1\r\n00:00:01,500 --> 00:00:03,000\r\n<i>Hello</i> <script>x</script>\r\nthere\r\n')
  assert.equal(cue?.start, 1.5)
  assert.equal(cue?.end, 3)
  assert.equal(cue?.lines.length, 2)
  assert.equal(cue?.lines[0]?.[0]?.italic, true)
  assert.equal(cue?.lines[0]?.map(part => part.text).join(''), 'Hello x')
})

test('WebVTT skips notes and reads top placement', () => {
  const cues = parseVtt('WEBVTT\n\nNOTE hidden\n\n00:01.000 --> 00:02.000 line:0\nTop\n')
  assert.equal(cues.length, 1)
  assert.equal(cues[0]?.align, 8)
})

test('ASS reads styles, overrides and skips drawings', () => {
  const cues = parseAss(`[Script Info]
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, Italic, Underline, Alignment
Style: Default,Outfit,40,&H0000FFFF,&H00000000,-1,0,0,2

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an8\\pos(640,72)}One, two\\NThree
Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 10 10{\\p0}
`)
  assert.equal(cues.length, 1)
  assert.equal(cues[0]?.align, 8)
  assert.deepEqual(cues[0]?.position, { x: 50, y: 10 })
  assert.equal(cues[0]?.lines[0]?.[0]?.text, 'One, two')
  assert.equal(cues[0]?.lines[1]?.[0]?.text, 'Three')
  assert.equal(cues[0]?.color, 'rgba(255,255,0,1)')
  assert.equal(cues[0]?.lines[0]?.[0]?.bold, true)
})

test('active cues overlap correctly', () => {
  const cues = parseSrt('1\n00:00:01,000 --> 00:00:05,000\nA\n\n2\n00:00:02,000 --> 00:00:03,000\nB\n')
  assert.equal(activeCues(cues, 2.5).length, 2)
  assert.equal(activeCues(cues, 5).length, 0)
})

test('subtitle text decoding', () => {
  assert.equal(decodeSubtitle(new Uint8Array([0xEF, 0xBB, 0xBF, 0x41])), 'A')
  assert.equal(decodeSubtitle(new Uint8Array([0xFF, 0xFE, 0x41, 0x00])), 'A')
  // "سلام" in Windows-1256
  assert.equal(decodeSubtitle(new Uint8Array([0xD3, 0xE1, 0xC7, 0xE3])), 'سلام')
  // "café" in Windows-1252
  assert.equal(decodeSubtitle(new Uint8Array([0x63, 0x61, 0x66, 0xE9, 0x20, 0x6E, 0x6F, 0x69, 0x72])), 'café noir')
})

test('sidecar language comes from the name', () => {
  assert.equal(sidecarLanguage('Show - 01.ar.srt', 'Show - 01'), 'Arabic')
  assert.equal(sidecarLanguage('Show - 01.eng.ass', 'Show - 01'), 'English')
  assert.equal(sidecarLanguage('Show - 01.srt', 'Show - 01'), '')
})
