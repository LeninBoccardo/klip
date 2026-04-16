import { createFileRoute } from '@tanstack/react-router'
import { PageContainer, PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@ui/card'
import { Clapperboard, FolderGit2Icon, Scale, User } from 'lucide-react'
import { Badge } from '@ui/badge'

export const Route = createFileRoute('/about')({
  component: AboutPage
})

function AboutPage() {
  return (
    <PageContainer>
      <PageHeader title="About" description="Application information" />

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <Clapperboard className="size-16 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Klip</h1>
          <Badge variant="secondary">v0.0.1</Badge>
          <p className="max-w-md text-center text-muted-foreground">
            A local, offline-first desktop asset manager designed to organize downloaded source
            videos and manually created video cuts. Built for video creators who need a fast,
            private way to manage their media library without cloud dependencies.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4" />
              Author
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Lenin Boccardo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4" />
              License
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">MIT License</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Built With</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            'Electron',
            'React 19',
            'TypeScript',
            'Drizzle ORM',
            'SQLite',
            'Tailwind CSS',
            'shadcn/ui',
            'electron-vite'
          ].map((tech) => (
            <Badge key={tech} variant="outline">
              {tech}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderGit2Icon className="size-4" />
            Source Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">github.com/leninboccardo/klip</p>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
