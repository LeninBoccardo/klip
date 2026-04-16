/**
 * YouTube channel metadata returned by on-demand channel info fetching.
 * Returned when the user provides a channel URL (e.g., youtube.com/@handle).
 */
export interface ChannelInfo {
  channelId: string
  channelName: string
  channelUrl: string | null
  uploaderUrl: string | null
  subscriberCount: number | null
  avatarUrl: string | null
}
