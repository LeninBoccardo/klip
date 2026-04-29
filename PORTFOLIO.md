# Klip — Portfolio Overview

**Klip** is a local, offline-first desktop asset manager for video creators: a SQLite-indexed library that mirrors a folder of downloaded source videos (yt-dlp) and manually-authored cuts (e.g. CapCut exports), with in-app playback, global search, tag editing, and collections.

It's an Electron + React 19 + TypeScript single-developer project, designed end-to-end as a portfolio piece — the goal is to demonstrate how a non-trivial desktop app can be built with strict architectural separation, realistic threat modelling, and an audited path to release rather than just shipped fast.

---

## Highlights

- **~960 tests, 75/70/65/75 global coverage thresholds** with a stricter ≥90 lines / 80 branches floor enforced over `src/main/use-cases/**`.
- **Clean Architecture** in the main process: domain → use cases → interface adapters → framework drivers, with dependency inversion enforced lint-wise (use cases never import `better-sqlite3`, `chokidar`, `electron`, `path`, or `fs`).
- **Typed IPC contract** shared by main, preload, and renderer with zod-validated payloads at the controller boundary.
- **Crash-safe filesystem operations** via a persistent saga log (`operations` table) and a `RecoverOperations` use case that runs on every startup.
- **Six-pass self-audit** ([audits/](audits/)) covering dead code, weird logic, performance, conventions, coverage, and a threat-model-driven security review. Each finding is linked to the specific file, line, and severity.

---

## Architecture at a glance

```text
┌──────────────────────── Renderer (sandbox, contextIsolation) ────────────────────────┐
│  React 19 + TanStack Router + TanStack Query + zustand                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ /collections │  │ /videos/$id  │  │ /downloads   │  │ Command palette (cmdk) │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────────────┘   │
│  PersistentPlayer (one <video> portaled to <body>, survives route changes)            │
│                              │   window.api   ▲                                       │
└──────────────────────────────┼────────────────┼───────────────────────────────────────┘
                               ▼                │
                       ┌─────────────────────────────────┐
                       │  Preload bridge (typed)         │
                       │  IpcContract + IpcChannels      │
                       └─────────────────────────────────┘
                               │ ipcRenderer    │
                               ▼                │
┌────────────────────────── Main process ───────┴──────────────────────────────────────┐
│                                                                                       │
│   Interface adapters       │   Use cases                 │   Domain                  │
│   (controllers, repos,     │   (Reconcile, Download,     │   (entities, repository   │
│    file-system adapters,   │    EnrichMedia, Migrate,    │    interfaces, ports)     │
│    queues, audited         │    BulkUpdateTags, Search,  │                           │
│    decorators)             │    9× Collection*, …)       │                           │
│                                                                                       │
│   Framework drivers                                                                   │
│   ┌─────────────┐  ┌─────────────────┐  ┌────────────┐  ┌─────────────────────────┐ │
│   │ Drizzle ORM │  │ ChokidarWatcher │  │ yt-dlp +   │  │ KlipMediaProtocolHandler│ │
│   │ better-sql3 │  │ debouncer       │  │ ffprobe    │  │ (klip-media:// scheme)  │ │
│   └──────┬──────┘  └────────┬────────┘  └─────┬──────┘  └──────────┬──────────────┘ │
│          │                  │                 │                    │                 │
└──────────┼──────────────────┼─────────────────┼────────────────────┼─────────────────┘
           ▼                  ▼                 ▼                    ▼
        SQLite           Filesystem         Network              Local files
       (indexes,         (root path,         (YouTube)           (videos, cuts,
        saga log,         meta.json,                              thumbnails)
        audit log)        cut-data.json)
```

The **`db-updated` push loop** ties this together: when the watcher (or any use case) mutates the index, `INotifier.notify('db-updated', { scope })` reaches the renderer, which uses the scope to invalidate only the affected `queryKeys.<entity>.all` trees rather than the whole world.

---

## Engineering decisions worth calling out

1. **Audited repository decorators wrap every entity write.** `AuditedCreatorRepository`, `AuditedVideoRepository`, `AuditedCutRepository`, and `AuditedCollectionRepository` each delegate reads to the inner repo and intercept mutations to write to `audit_log`. Each mutation method wraps `inner.<op>` + `auditLog.append` in `transactionScope.run(...)` — so the index update and the audit row land atomically. External consumers always receive the audited wrapper; the raw `Sqlite*Repository` is only visible inside the composition root.

2. **`SqliteTransactionScope` uses raw `better-sqlite3.transaction()`, not Drizzle's wrapper.** They share the same connection, so transactions still apply to Drizzle queries inside the callback, but reaching for the raw API let the audited decorator pattern compose cleanly with the existing port interface. Better-sqlite3's nested `SAVEPOINT` semantics also let outer use cases (`MigrateRootFolder`, `ReconcileDirectory`) wrap inner-decorator transactions safely.

3. **Persistent saga log for multi-step filesystem operations.** Folder renames and root migrations both touch disk and the index. They're tracked in the `operations` table with a JSON `payload` (including `movedSoFar` checkpoints for migrations). On startup, `RecoverOperations` finds any in-progress entries, parses the payload with zod, and best-effort rolls them back. The watcher is intentionally **not started** until recovery completes, which is the simplest safety guarantee: zero events flow during recovery.

4. **Entity-keyed `klip-media://` protocol — paths stripped from DTOs.** Local media is served via `klip-media://<kind>/<id>/<asset>` (e.g. `klip-media://video/abc123/thumbnail`). The renderer never holds a raw filesystem path. A poisoned comment or video-description field cannot construct a working `<img src="klip-media:///etc/passwd">` URL because the parser rejects anything outside `(kind, id, asset)`. The handler still does a realpath/prefix containment check against the active root as defence-in-depth.

5. **Soft-delete tri-state with reconciliation tombstones.** Every indexed entity uses `status: 'active' | 'missing' | 'deleted'`. Reconciliation marks disappeared entities `missing` (never hard-deletes); only explicit user action sets `deleted`; `deleted` rows are never touched again. Collections preserve "missing" rows visually (saved title + a Missing badge) so a temporarily-unmounted external drive doesn't silently corrupt user-curated playlists.

6. **Single persistent `<video>` element via React portal.** The carry-over mini-player needs to keep buffer, currentTime, decoder state, and audio context across route changes. That only works if the same DOM node lives across modes. The element is portaled to `document.body` and positioned imperatively (ResizeObserver-tracked slot in detail mode, fixed corner in mini mode) so the React tree above it can re-render freely without disturbing playback.

---

## The audits

The [audits/](audits/) folder contains a six-pass self-review that ran _before_ shipping:

| Audit                                         | Focus                                                     |
| --------------------------------------------- | --------------------------------------------------------- |
| [01-dead-code.md](audits/01-dead-code.md)     | Unused exports, unreachable branches, ghost types         |
| [02-weird-logic.md](audits/02-weird-logic.md) | Atomicity bugs, forgotten transactions, race windows      |
| [03-performance.md](audits/03-performance.md) | Hot-path queries, N+1 reads, watcher debounce sizing      |
| [04-conventions.md](audits/04-conventions.md) | Lint-baseline drift, mixed-export files, return-type gaps |
| [05-coverage.md](audits/05-coverage.md)       | Test coverage gaps and threshold drift                    |
| [06-security.md](audits/06-security.md)       | Threat-model-driven Electron security review              |

Each audit numbers findings (`F1`, `F2`, …) with severity, file/line citation, and a remediation. The findings then become the opening backlog of the shippable plan — every CRITICAL/HIGH must close before release. Treating audits as a planning artifact (and committing them to the repo) is the differentiator I'd want a reviewer to focus on.

---

## Tech stack (and why)

- **Electron 41 + electron-vite** — the right shell for a local-first app that needs filesystem and child-process access. `sandbox: true` + `contextIsolation: true` keep the renderer XSS-bounded.
- **React 19 + TanStack Router (file-based) + TanStack Query** — file-based routing matches the small route surface, and Query gives the cache that targeted invalidation needs.
- **Drizzle ORM + better-sqlite3** — type-safe schema and migrations, but with synchronous I/O so transactions stay simple and predictable.
- **shadcn/ui + Tailwind v4** — composition-first primitives over a heavyweight component library; everything skinable via OKLCH variables.
- **cmdk** — the right primitive for a Spotlight/VS Code-style command palette.
- **zustand** — small, no-ceremony stores for ephemeral UI state (player mode, queue, multi-select).
- **Vitest + @testing-library/react** — single runner across main and renderer, with coverage thresholds enforced per-glob.

---

## Limitations / what's not in the box yet

- **Codec coverage.** Chromium's `<video>` decodes MP4 (H.264/H.265/AV1) and WebM (VP9). AVI/MKV/FLV are detected and indexed but only playable via "Open in external player". A future ffmpeg-as-transcoder shim would close this without forcing external apps.
- **Code-signing.** Builds are unsigned; first-run SmartScreen / Gatekeeper warnings are expected. This is procurement, not engineering.
- **Single-user, single-machine.** No cloud sync, no multi-user, no remote library.
- **Drag-and-drop reorder for collections** — currently up/down chevrons; `@dnd-kit/react` integration is a follow-up.
- **No `/cuts/$cutId` route yet** — cuts attach via the mini-player on their parent creator's page.

---

## Repo entry points

- [README.md](README.md) — install, dev, build, test
- [AGENTS.md](AGENTS.md) — full architectural reference (schema, ports, conventions, testing strategy)
- [audits/](audits/) — the six-pass review
- `src/main/composition-root.ts` — the only place concrete dependencies are wired
- `src/main/use-cases/` — the application's vocabulary in one folder
