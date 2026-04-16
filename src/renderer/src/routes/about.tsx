import { createFileRoute } from '@tanstack/react-router'
import { PageContainer } from '@/components/shared'
import { Card, CardContent } from '@ui/card'
import { Clapperboard } from 'lucide-react'

export const Route = createFileRoute('/about')({
  component: AboutPage
})

function AboutPage() {
  return (
    <PageContainer>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
          <Clapperboard className="size-16 text-primary" />
          <h1 className="text-3xl font-bold">Klip</h1>
          <p className="text-muted-foreground">
            Local, offline-first desktop asset manager for video creators.
          </p>
          <p className="text-sm text-muted-foreground">v0.0.1</p>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
