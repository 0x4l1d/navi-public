export type SubtitleFormat = 'srt' | 'vtt' | 'ass'

export interface SidecarSubtitle {
  id: string
  path: string
  label: string
  language: string
  format: SubtitleFormat
}

export interface Episode {
  id: string
  path: string
  fileName: string
  showId: string
  show: string
  season: number
  episode: number | null
  title: string
  size: number
  duration: number
  position: number
  watched: boolean
  lastPlayed: number
  addedAt: number
  missing: boolean
  hasThumb: boolean
  thumbFailed: boolean
  subtitleChoice: string | null
  sidecars: SidecarSubtitle[]
}

export interface Settings {
  autoplayNext: boolean
  subtitleLanguage: string
  subtitleScale: number
  seekStep: number
  volume: number
}

export interface LibraryData {
  episodes: Episode[]
  folders: string[]
  settings: Settings
}

export interface EmbeddedSubtitle {
  track: number
  label: string
  language: string
  format: SubtitleFormat
  text: string
}

export interface ProgressUpdate {
  id: string
  position: number
  duration: number
}

export interface LoadedSubtitle {
  label: string
  format: SubtitleFormat
  text: string
}

export interface NaviApi {
  library: () => Promise<LibraryData>
  openVideos: () => Promise<Episode[]>
  importFolder: () => Promise<Episode[]>
  importDropped: (files: File[]) => Promise<Episode[]>
  rescan: () => Promise<LibraryData>
  removeFolder: (folder: string) => Promise<LibraryData>
  removeShow: (showId: string) => Promise<LibraryData>
  setWatched: (ids: string[], watched: boolean) => Promise<LibraryData>
  setSubtitleChoice: (id: string, choice: string | null) => Promise<void>
  sendProgress: (update: ProgressUpdate) => void
  saveProgressNow: (update: ProgressUpdate) => void
  readSidecar: (episodeId: string, subtitleId: string) => Promise<LoadedSubtitle | null>
  pickSubtitle: () => Promise<LoadedSubtitle | null>
  embeddedSubtitles: (episodeId: string) => Promise<EmbeddedSubtitle[]>
  saveThumb: (id: string, jpeg: ArrayBuffer, duration: number) => Promise<void>
  thumbFailed: (id: string) => Promise<void>
  setSettings: (patch: Partial<Settings>) => Promise<Settings>
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
}
