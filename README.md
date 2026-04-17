# Klip

A local, offline-first desktop asset manager for organizing downloaded source videos and manually created video cuts. Built with Electron, React 19, and TypeScript.

> [!WARNING]
> This project is in a pre-release state. Features are still missing, the UI is incomplete, and intensive tests were not done. Please consider this before opening an issue.

## Features

- **Offline-first** — SQLite index as the single source of truth, file system as storage layer
- **Automatic sync** — File watcher detects changes and keeps the database in sync
- **Video downloads** — Integrated yt-dlp for downloading YouTube videos
- **Media metadata** — Automatic extraction via ffprobe (duration, resolution, file size)
- **Organized library** — Creator-based folder structure with downloads and cuts
- **Soft-delete workflow** — Entities are marked as missing/deleted, never hard-deleted by the system

## Tech Stack

- **Electron** + **electron-vite** — Desktop shell and build tooling
- **React 19** + **TanStack Router** — Renderer UI and routing
- **TypeScript** — End-to-end type safety
- **Drizzle ORM** + **better-sqlite3** — Type-safe database layer
- **shadcn/ui** + **Tailwind CSS v4** — UI components and styling
- **Chokidar** — File system watching
- **yt-dlp** / **ffprobe** — Bundled binaries for downloads and media probing

## Requirements

- Node.js 22+
- npm 11+

## Project Setup

### Setup (One-time)

```bash
npm run setup
```

This single command installs all dependencies, downloads bundled binaries (yt-dlp, ffprobe), and rebuilds native modules.

### Development

```bash
npm run dev
```

### Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

### Testing

```bash
npm run test            # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

### Database

```bash
npm run db:generate     # Generate migration from schema changes
npm run db:migrate      # Apply pending migrations
npm run db:studio       # Open Drizzle Studio visual browser
```

## Architecture

The main process follows Clean Architecture with strict layered separation:

| Layer     | Folder                        | Responsibility                                     |
| --------- | ----------------------------- | -------------------------------------------------- |
| Domain    | `src/main/domain`             | Entities, repository interfaces, port interfaces   |
| Use Cases | `src/main/use-cases`          | Application business rules                         |
| Adapters  | `src/main/interface-adapters` | IPC controllers, Drizzle repositories, FS adapters |
| Drivers   | `src/main/framework-drivers`  | Database, file watcher, yt-dlp, ffprobe, Electron  |

The renderer communicates with the main process exclusively through typed IPC via `window.api`.

## License

MIT
