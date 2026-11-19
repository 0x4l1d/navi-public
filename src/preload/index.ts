import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type { NaviApi } from '../shared/types.ts'

const api: NaviApi = {
  library: () => ipcRenderer.invoke('library'),
  openVideos: () => ipcRenderer.invoke('open-videos'),
  importFolder: () => ipcRenderer.invoke('import-folder'),
  importDropped: files => ipcRenderer.invoke('import-dropped', files.map(file => webUtils.getPathForFile(file))),
  rescan: () => ipcRenderer.invoke('rescan'),
  removeFolder: folder => ipcRenderer.invoke('remove-folder', folder),
  removeShow: showId => ipcRenderer.invoke('remove-show', showId),
  setWatched: (ids, watched) => ipcRenderer.invoke('set-watched', ids, watched),
  setSubtitleChoice: (id, choice) => ipcRenderer.invoke('set-subtitle-choice', id, choice),
  sendProgress: update => ipcRenderer.send('progress', update),
  // synchronous on purpose: the page may be gone a moment later
  saveProgressNow: update => { ipcRenderer.sendSync('progress-now', update) },
  readSidecar: (episodeId, subtitleId) => ipcRenderer.invoke('read-sidecar', episodeId, subtitleId),
  pickSubtitle: () => ipcRenderer.invoke('pick-subtitle'),
  embeddedSubtitles: episodeId => ipcRenderer.invoke('embedded-subtitles', episodeId),
  saveThumb: (id, jpeg, duration) => ipcRenderer.invoke('save-thumb', id, jpeg, duration),
  thumbFailed: id => ipcRenderer.invoke('thumb-failed', id),
  setSettings: patch => ipcRenderer.invoke('set-settings', patch),
  minimize: () => ipcRenderer.send('minimize'),
  toggleMaximize: () => ipcRenderer.send('toggle-maximize'),
  close: () => ipcRenderer.send('close')
}

contextBridge.exposeInMainWorld('navi', api)
contextBridge.exposeInMainWorld('naviEvents', {
  onLibraryChanged: (callback: () => void) => { ipcRenderer.on('library-changed', () => callback()) }
})
