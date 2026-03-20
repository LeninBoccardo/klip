/** Summary returned after reconciliation completes */
export interface ReconcileResult {
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

/** Result returned to the caller when a download is enqueued */
export interface DownloadVideoResult {
  downloadId: string
}
