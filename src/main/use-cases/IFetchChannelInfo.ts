import type { FetchChannelInfoResult } from '@domain/types'

export interface IFetchChannelInfo {
  execute(url: string): Promise<FetchChannelInfoResult>
}
