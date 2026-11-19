import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync, copyFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { Episode, Settings } from '../shared/types.ts'

export interface StoreData {
  version: 1
  episodes: Record<string, Episode>
  folders: string[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  autoplayNext: true,
  subtitleLanguage: '',
  subtitleScale: 1,
  seekStep: 10,
  volume: 1
}

function empty (): StoreData {
  return { version: 1, episodes: {}, folders: [], settings: { ...DEFAULT_SETTINGS } }
}

function read (path: string): StoreData | null {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoreData>
    if (data?.version !== 1 || typeof data.episodes !== 'object' || !data.episodes || !Array.isArray(data.folders)) return null
    return { version: 1, episodes: data.episodes, folders: data.folders, settings: { ...DEFAULT_SETTINGS, ...data.settings } }
  } catch {
    return null
  }
}

/** One JSON file, replaced atomically, with the previous good copy kept beside it. */
export class Store {
  data: StoreData
  private timer: NodeJS.Timeout | undefined
  private dirty = false
  private readonly path: string
  private readonly delay: number

  constructor (path: string, delay = 1500) {
    this.path = path
    this.delay = delay
    mkdirSync(dirname(path), { recursive: true })
    this.data = read(path) ?? read(`${path}.bak`) ?? empty()
  }

  /** Writes soon. Progress lands on disk within `delay` even if the process is killed afterwards. */
  save () {
    this.dirty = true
    this.timer ??= setTimeout(() => this.flush(), this.delay)
  }

  /** Writes now, synchronously, so it is safe during shutdown. */
  flush () {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.dirty) return
    this.dirty = false
    const temp = `${this.path}.tmp`
    const fd = openSync(temp, 'w')
    try {
      writeSync(fd, JSON.stringify(this.data))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    if (existsSync(this.path)) copyFileSync(this.path, `${this.path}.bak`)
    renameSync(temp, this.path)
  }
}
