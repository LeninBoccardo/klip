import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemMedia, ItemContent, ItemDescription } from '@/components/ui/item'
import { formatDuration } from '@/lib/format'
import { Clock, User, FileText } from 'lucide-react'
import type { VideoInfo } from '@shared/types'

interface VideoInfoPreviewProps {
  info: VideoInfo
}

export function VideoInfoPreview({ info }: VideoInfoPreviewProps): React.ReactElement {
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{info.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-4">
          {info.channel && (
            <Item size="xs" className="w-auto border-0 p-0">
              <ItemMedia variant="icon">
                <User />
              </ItemMedia>
              <ItemContent>
                <ItemDescription>{info.channel}</ItemDescription>
              </ItemContent>
            </Item>
          )}
          {info.duration != null && (
            <Item size="xs" className="w-auto border-0 p-0">
              <ItemMedia variant="icon">
                <Clock />
              </ItemMedia>
              <ItemContent>
                <ItemDescription>{formatDuration(info.duration)}</ItemDescription>
              </ItemContent>
            </Item>
          )}
        </div>
        {info.description && (
          <Item size="xs" className="border-0 p-0">
            <ItemMedia variant="icon">
              <FileText />
            </ItemMedia>
            <ItemContent>
              <ItemDescription className="line-clamp-3">{info.description}</ItemDescription>
            </ItemContent>
          </Item>
        )}
      </CardContent>
    </Card>
  )
}
