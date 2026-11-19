export interface ParsedName {
  show: string
  season: number
  episode: number | null
  title: string
}

const NOISE = /\b(?:2160p|1080p|720p|576p|480p|4k|uhd|hdr10?|dv|web[- .]?(?:dl|rip)?|blu[- .]?ray|bdrip|brrip|dvdrip|hdtv|remux|x26[45]|h\.?26[45]|hevc|avc|av1|10[- ]?bit|8[- ]?bit|aac(?:\d\.\d)?|flac|opus|ac3|e?ac-?3|dts(?:-hd)?|ddp?\d?\.?\d?|dual[- ]audio|multi[- ]subs?|proper|repack|uncensored|complete)\b.*$/i

function tidy (text: string) {
  return text
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '')
}

function stripTags (name: string) {
  return name
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:[^)]*(?:\d{3,4}p|x26\d|hevc|bluray|web)[^)]*)\)/gi, ' ')
    .replace(/\{[^}]*\}/g, ' ')
}

const PATTERNS: Array<{ rx: RegExp, season?: number }> = [
  { rx: /^(.*?)[\s._-]*\bS(\d{1,2})[\s._-]*E(\d{1,4})(?:[-–]E?\d{1,4})?\b(.*)$/i },
  { rx: /^(.*?)[\s._-]+(\d{1,2})x(\d{1,4})\b(.*)$/i },
  { rx: /^(.*?)[\s._-]+Season[\s._-]*(\d{1,2})[\s._-]+(?:Episode|Ep)[\s._-]*(\d{1,4})\b(.*)$/i }
]

const SINGLE: RegExp[] = [
  /^(.*?)[\s._]+[-–—][\s._]+(?:E|EP|Ep)?(\d{1,4})(?:v\d)?(?:[\s._]+[-–—][\s._]+(.*)|[\s._]*$|[\s._]+(.*))$/,
  /^(.*?)[\s._-]+(?:Episode|Ep|E)[\s._-]*(\d{1,4})(?:v\d)?\b(.*)$/i,
  /^(.*?)[\s._]+(\d{1,3})(?:v\d)?[\s._]*$/
]

/** Reads show, season and episode from a file name. `folder` names the show when the file itself does not. */
export function parseMediaName (fileName: string, folder = ''): ParsedName {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const clean = stripTags(stem).trim()

  for (const { rx } of PATTERNS) {
    const match = clean.match(rx)
    if (!match) continue
    return {
      show: tidy(match[1] ?? '') || showFromFolder(folder) || tidy(clean),
      season: Number(match[2]),
      episode: Number(match[3]),
      title: tidy((match[4] ?? '').replace(NOISE, ''))
    }
  }

  for (const rx of SINGLE) {
    const match = clean.match(rx)
    if (!match) continue
    const show = tidy(match[1] ?? '')
    const number = Number(match[2])
    // "Blade Runner 2049" is a title, not episode 2049 of Blade Runner
    if (!show || number >= 1900) continue
    const seasonInName = show.match(/^(.*?)[\s._-]+(?:S|Season[\s._-]*)(\d{1,2})$/i)
    return {
      show: seasonInName ? tidy(seasonInName[1] ?? '') : show,
      season: seasonInName ? Number(seasonInName[2]) : seasonFromFolder(folder),
      episode: number,
      title: tidy((match[3] ?? match[4] ?? '').replace(NOISE, ''))
    }
  }

  const bare = clean.match(/^(?:E|EP|Episode)?[\s._-]*(\d{1,4})(?:v\d)?$/i)
  if (bare && showFromFolder(folder)) {
    return { show: showFromFolder(folder), season: seasonFromFolder(folder), episode: Number(bare[1]), title: '' }
  }

  const title = tidy(clean.replace(NOISE, '').replace(/\(\s*\)/g, '')) || tidy(stem)
  return { show: title, season: 1, episode: null, title: '' }
}

function seasonFromFolder (folder: string) {
  const match = folder.match(/\b(?:Season|S)[\s._-]*(\d{1,2})\b/i)
  return match ? Number(match[1]) : 1
}

function showFromFolder (folder: string) {
  return tidy(stripTags(folder).replace(/\b(?:Season|S)[\s._-]*\d{1,2}\b/i, '').replace(NOISE, ''))
}

export function showKey (show: string) {
  return show.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'untitled'
}
