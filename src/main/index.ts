import { mkdirSync, writeFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { BrowserWindow, app, dialog, ipcMain, protocol, session } from 'electron'

import { SUBTITLE_EXTENSIONS, VIDEO_EXTENSIONS, addFiles, addFolder, addPaths, removeFolder, removeShow, rescan } from './library.ts'
import { readEmbeddedSubtitles } from './mkv.ts'
import { serveFile } from './serve.ts'
import { DEFAULT_SETTINGS, Store } from './store.ts'
import { isFinished } from '../shared/playback.ts'
import { decodeSubtitle, subtitleFormat } from '../shared/subtitles.ts'

import type { LibraryData, LoadedSubtitle, ProgressUpdate, Settings } from '../shared/types.ts'

protocol.registerSchemesAsPrivileged([
  { scheme: 'navi-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
])

// multi-language files expose their audio tracks to the player through this Blink feature
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks')

if (!app.requestSingleInstanceLock()) app.quit()

let window: BrowserWindow | undefined
let store: Store

const thumbDir = () => join(app.getPath('userData'), 'thumbnails')
const MAX_SUBTITLE_BYTES = 32 * 1024 * 1024

function snapshot (): LibraryData {
  return { episodes: Object.values(store.data.episodes), folders: store.data.folders, settings: store.data.settings }
}

function applyProgress (update: ProgressUpdate) {
  const episode = store.data.episodes[update?.id]
  if (!episode || !Number.isFinite(update.position) || update.position < 0) return
  episode.position = update.position
  if (Number.isFinite(update.duration) && update.duration > 0) episode.duration = update.duration
  episode.lastPlayed = Date.now()
  if (isFinished(episode.position, episode.duration)) episode.watched = true
  store.save()
}

async function loadSubtitle (path: string, label: string): Promise<LoadedSubtitle | null> {
  const format = subtitleFormat(path)
  const info = await stat(path).catch(() => null)
  if (!format || !info?.isFile() || info.size > MAX_SUBTITLE_BYTES) return null
  return { label, format, text: decodeSubtitle(await readFile(path)) }
}

function registerIpc () {
  const owner = () => window as BrowserWindow

  ipcMain.handle('library', () => snapshot())
  ipcMain.handle('open-videos', async () => {
    const result = await dialog.showOpenDialog(owner(), { title: 'Open videos', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }] })
    return result.canceled ? [] : await addFiles(store, result.filePaths)
  })
  ipcMain.handle('import-folder', async () => {
    const result = await dialog.showOpenDialog(owner(), { title: 'Import a folder', properties: ['openDirectory'] })
    return result.canceled || !result.filePaths[0] ? [] : await addFolder(store, result.filePaths[0])
  })
  ipcMain.handle('import-dropped', (_event, paths: unknown) => addPaths(store, Array.isArray(paths) ? paths.filter(path => typeof path === 'string') : []))
  ipcMain.handle('rescan', async () => { await rescan(store); return snapshot() })
  ipcMain.handle('remove-folder', (_event, folder: string) => { removeFolder(store, String(folder)); return snapshot() })
  ipcMain.handle('remove-show', (_event, showId: string) => { removeShow(store, String(showId)); return snapshot() })
  ipcMain.handle('set-watched', (_event, ids: string[], watched: boolean) => {
    for (const id of Array.isArray(ids) ? ids : []) {
      const episode = store.data.episodes[id]
      if (!episode) continue
      episode.watched = !!watched
      episode.position = 0
    }
    store.save()
    return snapshot()
  })
  ipcMain.handle('set-subtitle-choice', (_event, id: string, choice: string | null) => {
    const episode = store.data.episodes[id]
    if (episode) { episode.subtitleChoice = typeof choice === 'string' ? choice : null; store.save() }
  })
  ipcMain.on('progress', (_event, update: ProgressUpdate) => applyProgress(update))
  ipcMain.on('progress-now', (event, update: ProgressUpdate) => {
    applyProgress(update)
    store.flush()
    event.returnValue = true
  })
  // only subtitles the library found beside the video can be read this way
  ipcMain.handle('read-sidecar', async (_event, episodeId: string, subtitleId: string) => {
    const sidecar = store.data.episodes[episodeId]?.sidecars.find(entry => entry.id === subtitleId)
    return sidecar ? await loadSubtitle(sidecar.path, sidecar.label) : null
  })
  ipcMain.handle('pick-subtitle', async () => {
    const result = await dialog.showOpenDialog(owner(), { title: 'Load a subtitle file', properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: SUBTITLE_EXTENSIONS }] })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : await loadSubtitle(path, path.split(/[\\/]/).pop() ?? 'Subtitle')
  })
  ipcMain.handle('embedded-subtitles', async (_event, id: string) => {
    const episode = store.data.episodes[id]
    if (!episode || !/\.(?:mkv|webm)$/i.test(episode.path)) return []
    return await readEmbeddedSubtitles(episode.path).catch(() => [])
  })
  ipcMain.handle('save-thumb', (_event, id: string, jpeg: ArrayBuffer, duration: number) => {
    const episode = store.data.episodes[id]
    if (!episode || !(jpeg instanceof ArrayBuffer) || jpeg.byteLength > 4 * 1024 * 1024) return
    mkdirSync(thumbDir(), { recursive: true })
    writeFileSync(join(thumbDir(), `${episode.id}.jpg`), Buffer.from(jpeg))
    episode.hasThumb = true
    if (Number.isFinite(duration) && duration > 0) episode.duration = duration
    store.save()
  })
  ipcMain.handle('thumb-failed', (_event, id: string) => {
    const episode = store.data.episodes[id]
    if (episode) { episode.thumbFailed = true; store.save() }
  })
  ipcMain.handle('set-settings', (_event, patch: Partial<Settings>) => {
    const next = { ...store.data.settings }
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      if (patch?.[key] !== undefined && typeof patch[key] === typeof DEFAULT_SETTINGS[key]) Object.assign(next, { [key]: patch[key] })
    }
    store.data.settings = next
    store.save()
    return next
  })
  ipcMain.on('minimize', () => window?.minimize())
  ipcMain.on('toggle-maximize', () => { if (window?.isMaximized()) window.unmaximize(); else window?.maximize() })
  ipcMain.on('close', () => window?.close())
}

function registerMedia () {
  protocol.handle('navi-media', async request => {
    const url = new URL(request.url)
    const id = url.pathname.replace(/^\//, '')
    const episode = store.data.episodes[id]
    if (!episode) return new Response(null, { status: 404 })
    if (url.hostname === 'video') return await serveFile(episode.path, request.headers.get('range'))
    if (url.hostname === 'thumb') return await serveFile(join(thumbDir(), `${episode.id}.jpg`), null)
    return new Response(null, { status: 404 })
  })
}

/** Navi Public works entirely offline, so anything leaving the machine is refused outright. */
function lockDown () {
  const dev = process.env.ELECTRON_RENDERER_URL
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const local = /^(?:file|navi-media|devtools|data|blob):/i.test(details.url) || (!!dev && details.url.startsWith(dev)) || (!!dev && details.url.startsWith(dev.replace('http', 'ws')))
    callback({ cancel: !local })
  })
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'fullscreen'))
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => { if (url !== contents.getURL()) event.preventDefault() })
    contents.on('will-attach-webview', event => event.preventDefault())
  })
}

function createWindow () {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#07070a',
    title: 'Navi Public',
    autoHideMenuBar: true,
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
  })
  window.once('ready-to-show', () => window?.show())
  // Windows is logging off or shutting down: there may be no later chance to write
  window.on('session-end', () => store.flush())
  window.on('closed', () => { window = undefined })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

app.on('second-instance', () => {
  if (window?.isMinimized()) window.restore()
  window?.focus()
})

app.whenReady().then(async () => {
  store = new Store(join(app.getPath('userData'), 'library.json'))
  lockDown()
  registerMedia()
  registerIpc()
  createWindow()
  await rescan(store).catch(() => undefined)
  window?.webContents.send('library-changed')
}).catch(error => {
  dialog.showErrorBox('Navi Public could not start', String(error))
  app.exit(1)
})

app.on('before-quit', () => store?.flush())
app.on('will-quit', () => store?.flush())
app.on('window-all-closed', () => app.quit())
