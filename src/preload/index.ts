import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  reconcile: (): Promise<unknown> => ipcRenderer.invoke('reconcile'),
  fetchVideoInfo: (url: string): Promise<unknown> => ipcRenderer.invoke('fetch-video-info', url),
  downloadVideo: (url: string, creatorName: string): Promise<unknown> =>
    ipcRenderer.invoke('download-video', url, creatorName),
  cancelDownload: (downloadId: string): Promise<void> =>
    ipcRenderer.invoke('cancel-download', downloadId),
  probeMediaFile: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke('probe-media-file', filePath),
  onDownloadProgress: (callback: (_event: unknown, data: unknown) => void): (() => void) => {
    ipcRenderer.on('download-progress', callback)
    return (): void => {
      ipcRenderer.removeListener('download-progress', callback)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
