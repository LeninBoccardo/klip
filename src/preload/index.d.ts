import { ElectronAPI } from '@electron-toolkit/preload'

interface ReconcileResult {
  creatorsAdded: number
  creatorsMarkedMissing: number
  creatorsRecovered: number
  videosAdded: number
  videosMarkedMissing: number
  videosRecovered: number
  cutsAdded: number
  cutsMarkedMissing: number
  cutsRecovered: number
}

interface KlipAPI {
  reconcile(): Promise<ReconcileResult>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KlipAPI
  }
}
