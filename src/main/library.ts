import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'

import { parseMediaName, showKey } from '../shared/parse.ts'
import { sidecarLanguage, subtitleFormat } from '../shared/subtitles.ts'

import type { Episode, SidecarSubtitle } from '../shared/types.ts'
import type { Store } from './store.ts'

export const VIDEO_EXTENSIONS = ['mkv', 'mp4', 'm4v', 'webm', 'mov', 'avi', 'ts', 'm2ts', 'ogv']
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa']

const MAX_DEPTH = 8

export function isVideo (path: string) {
  return VIDEO_EXTENSIONS.includes(extname(path).slice(1).toLowerCase())
}

export function mediaId (path: string) {
  return createHash('sha1').update(resolve(path).toLowerCase()).digest('hex').slice(0, 20)
}

async function walk (folder: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return []
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '$RECYCLE.BIN' || entry.name === 'System Volume Information') continue
    const path = join(folder, entry.name)
    if (entry.isDirectory()) found.push(...await walk(path, depth + 1))
    else if (entry.isFile() && isVideo(path)) found.push(path)
  }
  return found
}

async function findSidecars (path: string): Promise<SidecarSubtitle[]> {
  const folder = dirname(path)
  const stem = basename(path, extname(path))
  const lowered = stem.toLowerCase()
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return []
  }
  const sidecars: SidecarSubtitle[] = []
  for (const name of names.sort()) {
    const format = subtitleFormat(name)
    if (!format || !name.toLowerCase().startsWith(lowered)) continue
    const language = sidecarLanguage(name, stem)
    const file = join(folder, name)
    sidecars.push({ id: `file:${mediaId(file)}`, path: file, label: language || name.slice(stem.length + 1).replace(/\.[^.]+$/, '') || extname(name).slice(1).toUpperCase(), language, format })
  }
  return sidecars
}

async function toEpisode (path: string, previous: Episode | undefined): Promise<Episode | null> {
  let info
  try {
    info = await stat(path)
  } catch {
    return null
  }
  const parsed = parseMediaName(basename(path), basename(dirname(path)))
  return {
    id: mediaId(path),
    path: resolve(path),
    fileName: basename(path),
    showId: showKey(parsed.show),
    show: parsed.show,
    season: parsed.season,
    episode: parsed.episode,
    title: parsed.title,
    size: info.size,
    duration: previous?.duration ?? 0,
    position: previous?.position ?? 0,
    watched: previous?.watched ?? false,
    lastPlayed: previous?.lastPlayed ?? 0,
    addedAt: previous?.addedAt ?? Date.now(),
    missing: false,
    hasThumb: previous?.hasThumb ?? false,
    thumbFailed: previous?.thumbFailed ?? false,
    subtitleChoice: previous?.subtitleChoice ?? null,
    sidecars: await findSidecars(path)
  }
}

export async function addFiles (store: Store, paths: string[]) {
  const added: Episode[] = []
  for (const path of paths) {
    if (!isVideo(path)) continue
    const episode = await toEpisode(path, store.data.episodes[mediaId(path)])
    if (!episode) continue
    store.data.episodes[episode.id] = episode
    added.push(episode)
  }
  store.save()
  return added
}

export async function addFolder (store: Store, folder: string) {
  const root = resolve(folder)
  if (!store.data.folders.includes(root)) store.data.folders.push(root)
  return await addFiles(store, await walk(root))
}

/** Dropped items may be files or folders. */
export async function addPaths (store: Store, paths: string[]) {
  const added: Episode[] = []
  for (const path of paths) {
    const info = await stat(path).catch(() => null)
    if (info?.isDirectory()) added.push(...await addFolder(store, path))
    else if (info?.isFile()) added.push(...await addFiles(store, [path]))
  }
  return added
}

/** Picks up new files and marks moved ones. Progress is kept in case the drive comes back. */
export async function rescan (store: Store) {
  for (const folder of store.data.folders) await addFiles(store, await walk(folder))
  for (const episode of Object.values(store.data.episodes)) {
    const present = await stat(episode.path).then(info => info.isFile(), () => false)
    if (episode.missing === present) episode.missing = !present
    if (present) episode.sidecars = await findSidecars(episode.path)
  }
  store.save()
}

function inside (path: string, folder: string) {
  const prefix = folder.toLowerCase().replace(/[\\/]+$/, '')
  const target = path.toLowerCase()
  return target === prefix || target.startsWith(`${prefix}\\`) || target.startsWith(`${prefix}/`)
}

/** Forgets a folder. The files on disk are never touched. */
export function removeFolder (store: Store, folder: string) {
  store.data.folders = store.data.folders.filter(entry => entry !== folder)
  for (const episode of Object.values(store.data.episodes)) {
    if (inside(episode.path, folder)) Reflect.deleteProperty(store.data.episodes, episode.id)
  }
  store.save()
}

export function removeShow (store: Store, showId: string) {
  for (const episode of Object.values(store.data.episodes)) {
    if (episode.showId === showId) Reflect.deleteProperty(store.data.episodes, episode.id)
  }
  store.save()
}
