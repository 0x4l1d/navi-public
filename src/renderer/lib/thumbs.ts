import { videoUrl } from './state.svelte.ts'

import type { Episode } from '../../shared/types.ts'

const queued = new Set<string>()
let running = false

function capture (episode: Episode) {
  return new Promise<void>(resolve => {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    const finish = () => {
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      resolve()
    }
    const fail = () => { void window.navi.thumbFailed(episode.id); finish() }
    const timer = setTimeout(fail, 20_000)
    video.onerror = fail
    video.onloadedmetadata = () => { video.currentTime = Math.min(video.duration * 0.18, 150) }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 960
      canvas.height = Math.round(960 * (video.videoHeight / video.videoWidth)) || 540
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (!blob) { fail(); return }
        void blob.arrayBuffer().then(jpeg => window.navi.saveThumb(episode.id, jpeg, video.duration)).then(finish, fail)
      }, 'image/jpeg', 0.82)
    }
    video.src = videoUrl(episode.id)
  })
}

/** Makes missing artwork one file at a time so playback never competes with it. */
export function queueThumbs (episodes: Episode[], done: () => void) {
  const pending = episodes.filter(entry => !entry.hasThumb && !entry.thumbFailed && !entry.missing && !queued.has(entry.id))
  for (const entry of pending) queued.add(entry.id)
  if (running || !pending.length) return
  running = true
  void (async () => {
    for (const entry of pending) {
      await capture(entry)
      done()
    }
    running = false
  })()
}
