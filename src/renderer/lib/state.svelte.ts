import type { Episode, LibraryData } from '../../shared/types.ts'

export type View = { name: 'home' } | { name: 'show', showId: string } | { name: 'player', id: string } | { name: 'settings' }

export const ui = $state({
  library: null as LibraryData | null,
  view: { name: 'home' } as View,
  history: [] as View[],
  palette: false,
  help: false,
  toast: ''
})

let toastTimer: ReturnType<typeof setTimeout> | undefined

export function toast (message: string) {
  ui.toast = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { ui.toast = '' }, 3600)
}

export function go (view: View) {
  if (ui.view.name !== 'player') ui.history.push($state.snapshot(ui.view) as View)
  ui.view = view
}

export function back () {
  ui.view = ui.history.pop() ?? { name: 'home' }
}

export async function refresh () {
  ui.library = await window.navi.library()
}

export interface Show {
  id: string
  name: string
  episodes: Episode[]
  seasons: number[]
  next: Episode
  watched: number
  lastPlayed: number
  addedAt: number
  isSeries: boolean
}

export function orderEpisodes (a: Episode, b: Episode) {
  return a.season - b.season || (a.episode ?? 0) - (b.episode ?? 0) || a.fileName.localeCompare(b.fileName, undefined, { numeric: true })
}

export function buildShows (episodes: Episode[]) {
  const groups = new Map<string, Episode[]>()
  for (const episode of episodes) groups.set(episode.showId, [...groups.get(episode.showId) ?? [], episode])
  const shows: Show[] = []
  for (const [id, list] of groups) {
    const sorted = [...list].sort(orderEpisodes)
    const playing = sorted.filter(entry => entry.position > 0 && !entry.watched).sort((a, b) => b.lastPlayed - a.lastPlayed)[0]
    const lastWatched = sorted.findLastIndex(entry => entry.watched)
    shows.push({
      id,
      name: sorted[0]!.show,
      episodes: sorted,
      seasons: [...new Set(sorted.map(entry => entry.season))],
      next: playing ?? sorted[lastWatched + 1] ?? sorted[0]!,
      watched: sorted.filter(entry => entry.watched).length,
      lastPlayed: Math.max(...sorted.map(entry => entry.lastPlayed)),
      addedAt: Math.max(...sorted.map(entry => entry.addedAt)),
      isSeries: sorted.length > 1 || sorted[0]!.episode !== null
    })
  }
  return shows.sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name))
}

export const videoUrl = (id: string) => `navi-media://video/${id}`
export const thumbUrl = (episode: Episode) => episode.hasThumb ? `navi-media://thumb/${episode.id}` : ''

export function episodeLabel (episode: Episode) {
  if (episode.episode === null) return 'Film'
  return `${episode.season > 1 ? `S${episode.season} · ` : ''}EP ${String(episode.episode).padStart(2, '0')}`
}

export function episodeName (episode: Episode) {
  return episode.title || (episode.episode === null ? episode.show : `Episode ${episode.episode}`)
}

/** Opens what was just added: one video plays, several go to their show. */
export async function afterImport (added: Episode[]) {
  await refresh()
  if (!added.length) return
  if (added.length === 1) { go({ name: 'player', id: added[0]!.id }); return }
  const shows = new Set(added.map(entry => entry.showId))
  toast(`Added ${added.length} videos to your library`)
  if (shows.size === 1) go({ name: 'show', showId: added[0]!.showId })
  else go({ name: 'home' })
}
