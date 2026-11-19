// Generates original demo videos and subtitles with FFmpeg, so tests and screenshots need no third-party media.
// Usage: node tools/make-demo-media.mjs [output folder]
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const out = resolve(process.argv[2] ?? 'demo-media')
const SECONDS = 90

const LINES = [
  'The garden only wakes when the signal fades.',
  'Follow the lilac line until it turns.',
  'Every light here was planted by hand.',
  'Listen. The hum changes near the water.',
  'We keep walking until the map runs out.',
  'Mark this place. We will need it later.'
]
const ARABIC = [
  'تستيقظ الحديقة فقط عندما تخفت الإشارة.',
  'اتبع الخط البنفسجي حتى ينعطف.',
  'كل ضوء هنا زُرع باليد.',
  'أنصت. يتغير الطنين قرب الماء.',
  'سنواصل السير حتى تنتهي الخريطة.',
  'علّم هذا المكان. سنحتاجه لاحقا.'
]

const stamp = (value, comma) => {
  const pad = (number, size = 2) => String(number).padStart(size, '0')
  return `${pad(Math.floor(value / 3600))}:${pad(Math.floor(value / 60) % 60)}:${pad(Math.floor(value) % 60)}${comma}000`
}
const cueTimes = index => [2 + index * 14, 11 + index * 14]

const srt = lines => lines.map((line, index) => {
  const [start, end] = cueTimes(index)
  return `${index + 1}\n${stamp(start, ',')} --> ${stamp(end, ',')}\n${line}\n`
}).join('\n')

const assTime = value => `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(Math.floor(value) % 60).padStart(2, '0')}.00`
const ass = lines => `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,44,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.map((line, index) => {
    const [start, end] = cueTimes(index)
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${line}`
  }).join('\n')}
`

function video (path, colors, { dualAudio = false, subtitle = null } = {}) {
  const [a, b, c] = colors
  const args = ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `gradients=s=1280x720:r=24:d=${SECONDS}:c0=${a}:c1=${b}:c2=${c}:c3=0x07070a:n=4:speed=0.012:seed=${colors.join('').length * 7}`,
    '-f', 'lavfi', '-i', `sine=f=196:d=${SECONDS}`]
  if (dualAudio) args.push('-f', 'lavfi', '-i', `sine=f=262:d=${SECONDS}`)
  if (subtitle) args.push('-i', subtitle)
  args.push('-map', '0:v', '-map', '1:a')
  if (dualAudio) args.push('-map', '2:a')
  if (subtitle) args.push('-map', `${dualAudio ? 3 : 2}:s`, '-c:s', 'ass', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English')
  args.push('-af', 'volume=0.04', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-g', '24', '-c:a', 'aac', '-b:a', '96k',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English')
  if (dualAudio) args.push('-metadata:s:a:1', 'language=jpn', '-metadata:s:a:1', 'title=Japanese')
  execFileSync('ffmpeg', [...args, path], { stdio: 'inherit' })
}

rmSync(out, { recursive: true, force: true })
const series = join(out, 'Signal Garden')
mkdirSync(series, { recursive: true })
const assPath = join(out, 'embedded.ass')
writeFileSync(assPath, ass(LINES))

video(join(series, 'Signal Garden - 01.mkv'), ['0x3b2a8c', '0xc4b5ff', '0x12335c'], { dualAudio: true, subtitle: assPath })
video(join(series, 'Signal Garden - 02.mkv'), ['0x143f4f', '0x7fd6c2', '0x2a1a5e'], { subtitle: assPath })
video(join(series, 'Signal Garden - 03.mp4'), ['0x4f1f3f', '0xf0a6ca', '0x1a1a4a'])
writeFileSync(join(series, 'Signal Garden - 01.ar.srt'), srt(ARABIC))
writeFileSync(join(series, 'Signal Garden - 02.ar.srt'), srt(ARABIC))
writeFileSync(join(series, 'Signal Garden - 03.en.srt'), srt(LINES))
video(join(out, 'Tidal Lines (2026).mp4'), ['0x10375c', '0x8fb8ff', '0x0b1e33'])
writeFileSync(join(out, 'Tidal Lines (2026).en.srt'), srt(LINES))
rmSync(assPath)
console.log(`Demo media written to ${out}`)
