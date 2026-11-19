import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

import { parseRange } from '../shared/playback.ts'

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t', '.m2ts': 'video/mp2t',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
}

/** The page canvas reads video frames for thumbnails, which needs this one header. */
const COMMON = { 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

function body (path: string, start: number, end: number) {
  return Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream<Uint8Array>
}

export async function serveFile (path: string, rangeHeader: string | null) {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return new Response(null, { status: 404 })

  const type = TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(rangeHeader, info.size)
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { ...COMMON, 'Content-Range': `bytes */${info.size}` } })
  }
  if (range) {
    return new Response(body(path, range.start, range.end), {
      status: 206,
      headers: {
        ...COMMON,
        'Content-Type': type,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${info.size}`
      }
    })
  }
  const whole = info.size ? body(path, 0, info.size - 1) : null
  return new Response(whole, { status: 200, headers: { ...COMMON, 'Content-Type': type, 'Content-Length': String(info.size) } })
}
