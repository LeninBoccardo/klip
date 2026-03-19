import { ElectronAPI } from '@electron-toolkit/preload'
import { ReconcileResult } from '@use-cases/IReconcileDirectory'

interface KlipAPI {
  reconcile(): Promise<ReconcileResult>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KlipAPI
  }
}
