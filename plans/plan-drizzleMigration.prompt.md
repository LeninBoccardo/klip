# Plan: Migrate from Raw `better-sqlite3` to Drizzle ORM

## Motivation

The current data layer uses raw `better-sqlite3` with hand-written SQL strings throughout:

- **`framework-drivers/database/database.ts`** — manual `CREATE TABLE`, `ALTER TABLE` migrations via a `PRAGMA user_version` switch.
- **`interface-adapters/repositories/Sqlite*Repository.ts`** — hand-crafted SQL for every query (`SELECT`, `INSERT … ON CONFLICT`, `UPDATE`, `DELETE`), manual row↔entity mapping functions, and inline `Record<string, string>` sort-column allowlists.
- **`framework-drivers/database/SqliteTransactionScope.ts`** — thin wrapper around `db.transaction()`.

**Problems this migration solves:**

1. **Type-safety gap** — SQL strings are untyped; column renames or additions silently break at runtime. Drizzle's schema-first approach gives compile-time column/type checking.
2. **Boilerplate** — Every repository manually maps `snake_case` rows → `camelCase` entities. Drizzle eliminates this with its built-in column mapping.
3. **Migration fragility** — The hand-rolled `switch (fromVersion)` migration system is error-prone. Drizzle Kit provides a proper migration workflow with diffing, SQL generation, and version tracking.
4. **Query composition** — Dynamic `WHERE` / `ORDER BY` / `LIMIT` clauses are built via string concatenation. Drizzle's query builder composes these type-safely.

---

## Scope

| In Scope                                         | Out of Scope                                          |
| ------------------------------------------------ | ----------------------------------------------------- |
| Install `drizzle-orm` + `drizzle-kit`            | Changing domain entities or repository interfaces     |
| Define Drizzle schema tables                     | Changing use-case logic                               |
| Rewrite 3 Sqlite\*Repository implementations     | Changing the renderer or preload layers               |
| Replace manual migration system with Drizzle Kit | Changing the `ITransactionScope` port interface       |
| Update `SqliteTransactionScope` internals        | Removing `better-sqlite3` (Drizzle uses it as driver) |
| Update `composition-root.ts` wiring              | Adding new features or tables                         |
| Update test helper `createTestDb.ts`             | Changing `ChokidarWatcher` or notification system     |
| Update all repository tests                      | —                                                     |

---

## Architecture Constraints (from AGENTS.md)

These rules **must** remain intact after migration:

1. **Domain layer stays pure** — `src/main/domain/` must have zero imports of `drizzle-orm`. Entities, repository interfaces, and port interfaces remain unchanged.
2. **Dependency Inversion** — Use-cases depend only on `ICreatorRepository`, `IVideoRepository`, `ICutRepository` (and ports). They must never import Drizzle.
3. **`better-sqlite3` stays** — Drizzle ORM uses `better-sqlite3` as its underlying driver. The raw `Database` instance is still created in `framework-drivers` and passed into Drizzle.
4. **Sort-column allowlists** — Repositories must still validate `sortBy` params against an allowlist. Drizzle columns can serve as the allowlist (type-safe map from camelCase key → Drizzle column reference).
5. **Tags JSON serialization** — `Cut.tags` is `string[]` in domain but `TEXT` (JSON) in SQLite. Drizzle's custom column type or `.$type<string[]>()` with manual `mapFromDriverValue`/`mapToDriverValue` handles this.
6. **`ITransactionScope` port** — The interface stays in `domain/ports`. Only the `SqliteTransactionScope` implementation changes its internals to work with Drizzle's transaction API.
7. **Path aliases** — All new files must use `@main/*`, `@domain/*`, `@use-cases/*` aliases. No deep relative imports.

---

## Step-by-Step Implementation Plan

### Phase 1 — Install Dependencies & Configure Drizzle Kit

**Files touched:**

- `package.json`
- `drizzle.config.ts` _(new)_

**Tasks:**

1. Install packages:

   ```bash
   npm install drizzle-orm
   npm install -D drizzle-kit
   ```

   > `better-sqlite3` and `@types/better-sqlite3` are already installed — keep them.

2. Create `drizzle.config.ts` at project root:

   ```ts
   import { defineConfig } from 'drizzle-kit'

   export default defineConfig({
     dialect: 'sqlite',
     schema: './src/main/framework-drivers/database/schema.ts',
     out: './src/main/framework-drivers/database/migrations'
   })
   ```

3. Add npm scripts to `package.json`:
   ```jsonc
   "db:generate": "drizzle-kit generate",
   "db:migrate": "drizzle-kit migrate",
   "db:studio": "drizzle-kit studio"
   ```

---

### Phase 2 — Define Drizzle Schema

**Files created:**

- `src/main/framework-drivers/database/schema.ts` _(new)_

**Tasks:**

Define all three tables using Drizzle's `sqliteTable` API, matching the existing schema (migrations 0–2) exactly:

```ts
// src/main/framework-drivers/database/schema.ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const creators = sqliteTable(
  'creators',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    profileImagePath: text('profile_image_path'),
    status: text('status').notNull().default('active'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_creators_status').on(table.status)]
)

export const videos = sqliteTable(
  'videos',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    url: text('url'),
    duration: integer('duration'),
    resolution: text('resolution'),
    fileSize: integer('file_size'),
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    downloadDate: text('download_date'),
    status: text('status').notNull().default('active'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_videos_creator_id').on(table.creatorId),
    index('idx_videos_status').on(table.status),
    index('idx_videos_status_created').on(table.status, table.createdAt)
  ]
)

export const cuts = sqliteTable(
  'cuts',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    videoId: text('video_id').references(() => videos.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    tags: text('tags').notNull().default('[]'),
    startTimestamp: real('start_timestamp'),
    endTimestamp: real('end_timestamp'),
    duration: integer('duration'),
    resolution: text('resolution'),
    fileSize: integer('file_size'),
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    status: text('status').notNull().default('active'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_cuts_creator_id').on(table.creatorId),
    index('idx_cuts_video_id').on(table.videoId),
    index('idx_cuts_status').on(table.status),
    index('idx_cuts_status_created').on(table.status, table.createdAt)
  ]
)
```

> **Column naming:** Drizzle's schema keys are camelCase (matching our domain entities), while the SQL column names in `text('snake_case')` match the existing DB. This eliminates all manual `mapRowToEntity` functions.

---

### Phase 3 — Replace Manual Migration System with Drizzle

**Files touched:**

- `src/main/framework-drivers/database/database.ts` _(rewrite)_
- `src/main/framework-drivers/database/index.ts` _(update exports)_

**Tasks:**

1. **Rewrite `database.ts`** to:
   - Still create the raw `better-sqlite3` instance (WAL mode, foreign keys).
   - Wrap it with `drizzle()` from `drizzle-orm/better-sqlite3`.
   - Use Drizzle's `migrate()` function from `drizzle-orm/better-sqlite3/migrator` to apply migrations from the `migrations/` folder.
   - Export both the raw `BetterSqlite3.Database` (for backward compat if needed) and the Drizzle `BetterSQLite3Database` instance.
   - Remove the manual `PRAGMA user_version` switch-based migration entirely.

   ```ts
   // src/main/framework-drivers/database/database.ts
   import BetterSqlite3 from 'better-sqlite3'
   import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
   import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
   import * as schema from './schema'

   export interface DatabaseInstance {
     raw: BetterSqlite3.Database
     db: BetterSQLite3Database<typeof schema>
   }

   export function initializeDatabase(dbPath: string): DatabaseInstance {
     const raw = new BetterSqlite3(dbPath)
     raw.pragma('journal_mode = WAL')
     raw.pragma('foreign_keys = ON')

     const db = drizzle(raw, { schema })

     // Apply Drizzle-managed migrations (only for non-memory DBs)
     // For in-memory DBs used in tests, push schema directly
     if (dbPath !== ':memory:') {
       migrate(db, { migrationsFolder: './src/main/framework-drivers/database/migrations' })
     }

     return { raw, db }
   }
   ```

2. **Handle `:memory:` databases in tests:** Drizzle's `migrate()` reads migration files from disk, which works for the real app. For in-memory test DBs, use `db.run(sql\`...\`)`to push the schema directly, or use Drizzle Kit's`push` strategy. The recommended approach:
   - Create a `pushSchema()` helper that uses the Drizzle schema to create tables directly on an in-memory DB.
   - Or, use `drizzle-orm`'s ability to call `raw.exec()` on the underlying driver to run the migration SQL inline in tests.

3. **One-time migration bridge for existing users:**
   - Since existing databases already have tables created by the manual migration system, the first Drizzle migration must be a **baseline** — a "custom" migration that Drizzle tracks but doesn't re-run DDL (the tables already exist).
   - Generate the initial migration with `drizzle-kit generate`, then mark it as applied in the Drizzle `__drizzle_migrations` journal for existing databases.
   - Alternatively, use Drizzle Kit's `push` command for development and only switch to `generate`/`migrate` for production builds.

---

### Phase 4 — Rewrite Repository Implementations

**Files touched:**

- `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts` _(rewrite)_
- `src/main/interface-adapters/repositories/SqliteVideoRepository.ts` _(rewrite)_
- `src/main/interface-adapters/repositories/SqliteCutRepository.ts` _(rewrite)_

**Key changes per repository:**

#### 4a. `SqliteCreatorRepository`

| Before (raw SQL)                                     | After (Drizzle)                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `this.db.prepare('SELECT … FROM creators').all()`    | `this.db.select().from(creators)`                                              |
| `this.db.prepare('INSERT … ON CONFLICT …').run({…})` | `this.db.insert(creators).values({…}).onConflictDoUpdate({…})`                 |
| `RawCreatorRow` interface + `mapRowToCreator()`      | **Deleted** — Drizzle returns camelCase-keyed objects matching `Creator`       |
| `CREATOR_SORT_COLUMNS` string map                    | Type-safe column map: `Record<string, SQLiteColumn>` using Drizzle column refs |
| String-concatenated `WHERE` / `ORDER BY`             | Drizzle's `where(and(…))`, `orderBy(asc(col))`                                 |

**Constructor change:** Accept `BetterSQLite3Database<typeof schema>` instead of raw `BetterSqlite3.Database`.

**Example — `findAllActive()`:**

```ts
// Before
const rows = this.db
  .prepare(`SELECT ${ALL_COLUMNS} FROM creators WHERE status = 'active' ORDER BY name ASC`)
  .all() as RawCreatorRow[]
return rows.map(mapRowToCreator)

// After
return this.db
  .select()
  .from(creators)
  .where(eq(creators.status, 'active'))
  .orderBy(asc(creators.name))
```

**Example — `upsert()`:**

```ts
// Before — hand-written ON CONFLICT
this.db.prepare(`INSERT INTO creators (...) VALUES (...) ON CONFLICT(id) DO UPDATE SET ...`).run({...})

// After
this.db.insert(creators).values({
  id: creator.id,
  name: creator.name,
  profileImagePath: creator.profileImagePath,
  status: creator.status,
  deletedAt: creator.deletedAt,
  createdAt: creator.createdAt,
  updatedAt: creator.updatedAt,
}).onConflictDoUpdate({
  target: creators.id,
  set: {
    name: sql`excluded.name`,
    profileImagePath: sql`excluded.profile_image_path`,
    status: sql`excluded.status`,
    deletedAt: sql`excluded.deleted_at`,
    updatedAt: sql`excluded.updated_at`,
  },
})
```

**Example — `findPaginated()` with dynamic sort:**

```ts
const SORT_COLUMNS: Record<string, SQLiteColumn> = {
  name: creators.name,
  status: creators.status,
  createdAt: creators.createdAt,
  updatedAt: creators.updatedAt
}

const sortColumn = SORT_COLUMNS[params.sortBy ?? ''] ?? creators.name
const direction = params.sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn)

const conditions = [inArray(creators.status, statuses)]
if (params.search) conditions.push(like(creators.name, `%${params.search}%`))

const [{ count }] = this.db
  .select({ count: sql<number>`count(*)` })
  .from(creators)
  .where(and(...conditions))

const rows = this.db
  .select()
  .from(creators)
  .where(and(...conditions))
  .orderBy(direction)
  .limit(params.pageSize)
  .offset(offset)
```

#### 4b. `SqliteVideoRepository`

Same pattern as Creator. Replace all raw SQL with Drizzle query builder. Drop `RawVideoRow` and `mapRowToVideo()`. Constructor takes Drizzle DB instance.

#### 4c. `SqliteCutRepository`

Same pattern, with one notable difference:

**Tags handling:**

- `Cut.tags` is `string[]` in domain but stored as JSON `TEXT`.
- On **write**: `JSON.stringify(cut.tags)` when passing to `.values()` / `.set()`.
- On **read**: Post-process the result to parse `tags` with `JSON.parse()`. Drizzle doesn't auto-parse custom column types with the `select()` API, so either:
  - Use a thin `.map()` after the query: `rows.map(r => ({ ...r, tags: JSON.parse(r.tags as string) }))`.
  - Or define a custom Drizzle column type with `customType()` that handles serialization.

**`findByTags()` with `json_each()`:**

```ts
// Drizzle supports raw SQL fragments for advanced queries
const tagTable = sql`json_each(${cuts.tags})`

this.db
  .selectDistinct()
  .from(cuts)
  .innerJoin(tagTable, sql`1=1`) // json_each is a table-valued function
  .where(and(eq(cuts.status, 'active'), inArray(sql`${tagTable}.value`, tags)))
  .orderBy(desc(cuts.createdAt))
```

> **Note:** `json_each()` as a table-valued function requires Drizzle's `sql` template for the join. This is a valid pattern in `drizzle-orm`. If the DX is poor, fall back to a raw `db.all(sql\`...\`)` query for just this method.

---

### Phase 5 — Update `SqliteTransactionScope`

**File touched:**

- `src/main/framework-drivers/database/SqliteTransactionScope.ts`

**Change:** The constructor can accept either the Drizzle DB instance or continue using the raw `better-sqlite3` instance, since Drizzle exposes `.transaction()` as well:

```ts
// Option A: Use Drizzle's transaction API
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

export class SqliteTransactionScope implements ITransactionScope {
  constructor(private db: BetterSQLite3Database) {}

  run<T>(fn: () => T): T {
    // Drizzle's .transaction() expects a callback that receives `tx`
    // but our port interface is synchronous and doesn't expose `tx`.
    // Keep using the raw driver's transaction for simplicity:
    return this.db.transaction((_tx) => fn())
  }
}
```

```ts
// Option B (recommended): Keep using raw better-sqlite3 transaction
// No changes needed — the raw DB instance is still available in the container.
// SqliteTransactionScope already works perfectly. Leave as-is.
```

**Recommendation:** Option B — leave `SqliteTransactionScope` unchanged. It already uses the raw `better-sqlite3` `db.transaction()`, which is the same underlying connection Drizzle uses. Transactions are connection-level in SQLite, so both Drizzle queries and raw queries share the same transaction boundary.

---

### Phase 6 — Update Composition Root

**File touched:**

- `src/main/composition-root.ts`

**Changes:**

1. `initializeDatabase()` now returns `{ raw, db }` instead of just a `BetterSqlite3.Database`.
2. Pass `db` (Drizzle instance) to repositories instead of `raw`.
3. Pass `raw` to `SqliteTransactionScope` (unchanged behavior).
4. `shutdown()` calls `raw.close()` as before.

```ts
// Before
const db = initializeDatabase(config.dbPath)
const creatorRepo = new SqliteCreatorRepository(db)
const transactionScope = new SqliteTransactionScope(db)

// After
const { raw, db } = initializeDatabase(config.dbPath)
const creatorRepo = new SqliteCreatorRepository(db)
const transactionScope = new SqliteTransactionScope(raw) // raw driver for transactions
```

5. Update `AppContainer` interface: store `raw` for shutdown and the Drizzle `db` for typing purposes. Alternatively, only expose what's needed — the rest is an implementation detail.

---

### Phase 7 — Update Test Infrastructure

**Files touched:**

- `tests/main/helpers/createTestDb.ts` _(rewrite)_
- `tests/main/interface-adapters/repositories/SqliteCreatorRepository.test.ts` _(update)_
- `tests/main/interface-adapters/repositories/SqliteVideoRepository.test.ts` _(update)_
- `tests/main/interface-adapters/repositories/SqliteCutRepository.test.ts` _(update)_
- `tests/main/framework-drivers/database.test.ts` _(update)_
- `tests/main/framework-drivers/SqliteTransactionScope.test.ts` _(update)_

**Tasks:**

1. **Rewrite `createTestDb()`:**

   ```ts
   import BetterSqlite3 from 'better-sqlite3'
   import { drizzle } from 'drizzle-orm/better-sqlite3'
   import { sql } from 'drizzle-orm'
   import * as schema from '@main/framework-drivers/database/schema'
   // Import the CREATE TABLE SQL or use drizzle-kit push for tests

   export function createTestDb() {
     const raw = new BetterSqlite3(':memory:')
     raw.pragma('journal_mode = WAL')
     raw.pragma('foreign_keys = ON')

     const db = drizzle(raw, { schema })

     // Push schema to in-memory DB (create all tables + indexes)
     // Option: Execute raw DDL that matches the Drizzle schema
     // Or use `migrate()` with an in-memory migrations folder
     raw.exec(`/* full CREATE TABLE statements */`)

     return { raw, db }
   }
   ```

   > For in-memory test DBs, the simplest approach is to generate the DDL once from Drizzle Kit and execute it inline as raw SQL, or to use a helper that reads the generated migration files from disk.

2. **Update repository tests:**
   - Replace `db = createTestDb()` → `const { raw, db } = createTestDb()`.
   - Replace `new SqliteCreatorRepository(db)` → `new SqliteCreatorRepository(db)` (now `db` is the Drizzle instance).
   - Replace `db.close()` → `raw.close()`.
   - All assertion logic stays the same — the repository interface hasn't changed.

3. **Update `database.test.ts`:**
   - Test that `initializeDatabase()` returns `{ raw, db }`.
   - Test that tables exist by querying the Drizzle schema.
   - Test WAL mode and foreign keys via `raw.pragma(...)`.

4. **Update `SqliteTransactionScope.test.ts`:**
   - If unchanged (Option B), tests need minimal updates — just extract `raw` from `createTestDb()`.

---

### Phase 8 — Generate Baseline Migration & Validate

**Tasks:**

1. Run `npx drizzle-kit generate` to produce the initial migration SQL from the schema definition.
2. Verify the generated SQL matches the existing database structure (tables, columns, indexes, defaults, foreign keys).
3. For **existing users** (already have a `klip.db`): The generated migration will try to `CREATE TABLE` on already-existing tables. Handle this with one of:
   - **Option A (recommended):** Check if tables exist in the migration and skip DDL if they do. Add a custom journal entry marking migration 0000 as applied.
   - **Option B:** Drop the old `PRAGMA user_version` tracking and rely on Drizzle's `__drizzle_migrations` journal table exclusively. In `initializeDatabase()`, detect legacy DBs (has `user_version >= 3` but no `__drizzle_migrations` table) and seed the Drizzle journal with the baseline migration.
4. Run full test suite to verify: `npm run test:coverage`.
5. Run typechecks: `npm run typecheck`.

---

### Phase 9 — Clean Up

**Tasks:**

1. **Delete dead code:**
   - Remove `RawCreatorRow`, `RawVideoRow`, `RawCutRow` interfaces from repositories.
   - Remove `mapRowToCreator()`, `mapRowToVideo()`, `mapRowToCut()`, `parseCutTags()` functions.
   - Remove old `ALL_COLUMNS` string constants.
   - Remove old `migrate()` function and `CURRENT_SCHEMA_VERSION` from `database.ts`.

2. **Update `AGENTS.md`:**
   - Section "Database Migrations": Replace the `PRAGMA user_version` switch documentation with Drizzle Kit workflow (`drizzle-kit generate`, migration files in `src/main/framework-drivers/database/migrations/`).
   - Section "Coding Conventions" → "Tags JSON Serialization": Note the Drizzle custom column type or post-query `.map()` pattern.
   - Section "Key Commands": Add `db:generate`, `db:migrate`, `db:studio` commands.

3. **Update coverage exclusions** in `vitest.config.ts`:
   - Add `src/main/framework-drivers/database/schema.ts` to exclusions (pure declarative schema, no logic to test).
   - Add `src/main/framework-drivers/database/migrations/**` to exclusions.

---

## File Change Summary

| File                                                                  | Action                                        | Layer       |
| --------------------------------------------------------------------- | --------------------------------------------- | ----------- |
| `package.json`                                                        | Add `drizzle-orm`, `drizzle-kit`, new scripts | Config      |
| `drizzle.config.ts`                                                   | Create                                        | Config      |
| `src/main/framework-drivers/database/schema.ts`                       | Create                                        | Drivers     |
| `src/main/framework-drivers/database/migrations/`                     | Generated by Drizzle Kit                      | Drivers     |
| `src/main/framework-drivers/database/database.ts`                     | Rewrite                                       | Drivers     |
| `src/main/framework-drivers/database/index.ts`                        | Update exports                                | Drivers     |
| `src/main/framework-drivers/database/SqliteTransactionScope.ts`       | No change (Option B) or minor update          | Drivers     |
| `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts` | Rewrite                                       | Adapters    |
| `src/main/interface-adapters/repositories/SqliteVideoRepository.ts`   | Rewrite                                       | Adapters    |
| `src/main/interface-adapters/repositories/SqliteCutRepository.ts`     | Rewrite                                       | Adapters    |
| `src/main/composition-root.ts`                                        | Update wiring                                 | Composition |
| `tests/main/helpers/createTestDb.ts`                                  | Rewrite                                       | Tests       |
| `tests/main/interface-adapters/repositories/*.test.ts`                | Update (DB instance type)                     | Tests       |
| `tests/main/framework-drivers/database.test.ts`                       | Update                                        | Tests       |
| `tests/main/framework-drivers/SqliteTransactionScope.test.ts`         | Minor update                                  | Tests       |
| `vitest.config.ts`                                                    | Add coverage exclusions                       | Config      |
| `AGENTS.md`                                                           | Update docs                                   | Docs        |

**Files NOT touched (confirming boundary respect):**

- `src/main/domain/**` — No changes to entities, repository interfaces, port interfaces, or types.
- `src/main/use-cases/**` — No changes. Use-cases depend only on interfaces.
- `src/main/interface-adapters/controllers/**` — No changes.
- `src/main/interface-adapters/file-system/**` — No changes.
- `src/main/interface-adapters/queue/**` — No changes.
- `src/main/framework-drivers/electron/**` — No changes.
- `src/main/framework-drivers/file-system/**` — No changes.
- `src/main/framework-drivers/timers/**` — No changes.
- `src/preload/**` — No changes.
- `src/renderer/**` — No changes.

---

## Risks & Mitigations

| Risk                                                                                | Mitigation                                                                                                 |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Existing user databases break** after migration                                   | Phase 8 baseline bridge: detect legacy `user_version` DBs and seed Drizzle journal                         |
| **`json_each()` in Drizzle** is awkward                                             | Fall back to `db.all(sql\`...\`)`for`findByTags()`only — raw SQL is still available via Drizzle's`sql` tag |
| **In-memory test DBs** can't use file-based migrations                              | Push schema directly via raw `exec()` or Drizzle's programmatic schema push                                |
| **Bundle size increase** from `drizzle-orm`                                         | Minimal — `drizzle-orm` is ~50KB gzipped, runs in main process only (not shipped to renderer)              |
| **`drizzle-kit`** is dev-only                                                       | Already in `devDependencies` — not bundled in production                                                   |
| **Drizzle's `select()` returns different shape** than domain entity for `cuts.tags` | Post-query `.map()` to parse JSON tags, or custom Drizzle column type                                      |

---

## Implementation Order (Recommended)

Execute phases sequentially. Each phase should pass `npm run typecheck && npm run test` before moving to the next:

1. **Phase 1** — Install & configure (zero risk, additive only)
2. **Phase 2** — Define schema (additive, no existing code changes)
3. **Phase 3** — Replace migration system (first breaking change to `database.ts`)
4. **Phase 6** — Update composition root (connects new DB initialization to existing repos)
5. **Phase 7** — Update test infra (`createTestDb` must work before repo rewrites)
6. **Phase 4** — Rewrite repositories one at a time (Creator → Video → Cut), running tests after each
7. **Phase 5** — Update transaction scope if needed
8. **Phase 8** — Baseline migration & full validation
9. **Phase 9** — Clean up dead code & update docs

> **Tip:** Phase 4 can be done incrementally — migrate one repository at a time and run its tests. The other repositories continue using the raw DB instance temporarily (Drizzle and raw `better-sqlite3` share the same connection).
