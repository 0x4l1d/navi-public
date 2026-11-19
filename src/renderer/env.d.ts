import type { NaviApi } from '../shared/types.ts'

declare global {
  interface Window {
    navi: NaviApi
    naviEvents: { onLibraryChanged: (callback: () => void) => void }
  }
  interface AudioTrackLike { id: string, label: string, language: string, enabled: boolean }
  interface AudioTrackListLike { length: number, [index: number]: AudioTrackLike | undefined }
  interface HTMLVideoElement { audioTracks?: AudioTrackListLike }
}
