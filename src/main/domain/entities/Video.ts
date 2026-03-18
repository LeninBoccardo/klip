export interface Video {
  id: string
  creatorId: string
  title: string
  url: string | null
  duration: number | null
  resolution: string | null
  fileSize: number | null
  filePath: string
  thumbnailPath: string | null
  downloadDate: string | null
  createdAt: string
  updatedAt: string
}
