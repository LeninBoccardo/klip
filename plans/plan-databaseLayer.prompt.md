## Plan: Database Layer Implementation (Domain → Drivers → Adapters)

Implement the full SQLite database stack following Clean Architecture: domain entities & repository interfaces, `better-sqlite3` initialization driver, and concrete SQLite repository implementations. `better-sqlite3` and its types are already installed. The main process folder structure is scaffolded but empty.

### Steps

1. **Add main-process path aliases** to `electron.vite.config.ts` (`main.resolve.alias` with `@domain` and `@use-cases`) and `tsconfig.node.json` (add `baseUrl: "."` and matching `paths`) so `@domain/*` and `@use-cases/*` resolve in the main process too.

2. **Create domain entities** — three interface files plus a barrel export:
   - `src/main/domain/entities/Creator.ts` — `id`, `name`, `profileImagePath`, `createdAt`, `updatedAt`
   - `src/main/domain/entities/Video.ts` — `id`, `creatorId`, `title`, `url`, `duration`, `resolution`, `fileSize`, `filePath`, `thumbnailPath`, `downloadDate`, `createdAt`, `updatedAt`
   - `src/main/domain/entities/Cut.ts` — `id`, `creatorId`, `videoId`, `title`, `tags: string[]`, `startTimestamp`, `endTimestamp`, `duration`, `resolution`, `fileSize`, `filePath`, `thumbnailPath`, `createdAt`, `updatedAt`
   - `src/main/domain/entities/index.ts` — re-exports all three

3. **Create repository interfaces** — one per entity plus barrel:
   - `src/main/domain/repositories/ICreatorRepository.ts` — `findAll()`, `findById(id)`, `upsert(creator)`, `delete(id)`
   - `src/main/domain/repositories/IVideoRepository.ts` — same CRUD + `findByCreatorId(creatorId)`
   - `src/main/domain/repositories/ICutRepository.ts` — same CRUD + `findByCreatorId(creatorId)`, `findByVideoId(videoId)`, `findByTags(tags)`
   - `src/main/domain/repositories/index.ts` — re-exports all three

4. **Create database driver** in `src/main/framework-drivers/database/database.ts`:
   - Export `initializeDatabase(dbPath: string): BetterSqlite3.Database` that opens the file, enables `WAL` mode and `foreign_keys`, then runs `CREATE TABLE IF NOT EXISTS` for `creators`, `videos`, and `cuts` (with proper FKs and ISO-date defaults). Tags stored as JSON text. Return the `Database` instance.
   - Export barrel `index.ts`

5. **Create SQLite repository implementations** in `src/main/interface-adapters/repositories/`:
   - `SqliteCreatorRepository.ts` — constructor receives `BetterSqlite3.Database`, implements `ICreatorRepository` using prepared statements. `upsert` uses `INSERT ... ON CONFLICT(id) DO UPDATE`.
   - `SqliteVideoRepository.ts` — same pattern, implements `IVideoRepository`. Joins on `creator_id`.
   - `SqliteCutRepository.ts` — same pattern, implements `ICutRepository`. `tags` serialized/deserialized with `JSON.parse`/`JSON.stringify`. `findByTags` uses `json_each()` for tag matching.
   - `index.ts` barrel export

6. **Wire up in `src/main/index.ts`** — replace the empty `createDb()` stub: compute `dbPath` via `app.getPath('userData') + '/klip.db'`, call `initializeDatabase(dbPath)`, instantiate the three `Sqlite*Repository` classes with the db instance, and store references for later use by IPC handlers and use cases.

### Further Considerations

- **`upsert` vs separate `create`/`update`**: The file watcher sync pattern benefits from `upsert` (INSERT OR REPLACE). Expose both `upsert` for the sync flow and `delete` for removals.
- Answer: use both upsert and remove
- **Timestamps format**: Use ISO 8601 strings (`datetime('now')` in SQLite) for `createdAt`/`updatedAt` — consistent with JSON serialization over IPC and avoids Date object issues across processes.
- Answer: ISO 8601 strings
- **Database migration strategy**: For now, `CREATE TABLE IF NOT EXISTS` in `initializeDatabase` is sufficient. If schema evolves later, consider a simple version-based migration table (`schema_version`).
- Answer: prefer a simple version-based migration table (schema_version)

