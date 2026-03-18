# Plan: Testing Infrastructure

## Context
Set up Vitest as the single test runner for both main (Node) and renderer (jsdom) processes in the Klip Electron app.

## Decisions Made
- **Vitest 4.x** — native Vite integration, reuses same TS transforms, supports multi-project via `test.projects` in `vitest.config.ts`
- **@testing-library/react** + **jsdom** — renderer component tests
- **@vitest/coverage-v8** — coverage with 80% global / 90% use-cases thresholds
- **GitHub Actions CI** — lint → typecheck → test:coverage on push/PR to `main`

## Implemented

### 1. Dependencies installed
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@vitest/coverage-v8`

### 2. Config: `vitest.config.ts`
Single root config with two inline projects:
- **main** — `environment: 'node'`, includes `tests/main/**/*.test.ts`
- **renderer** — `environment: 'jsdom'`, includes `tests/renderer/**/*.test.{ts,tsx}`

Coverage: v8 provider, 80% global thresholds (statements, branches, functions, lines).
Excludes: barrel `index.ts`, entity types, repository interfaces, shadcn UI, `env.d.ts`.

### 3. Test folder structure
```
tests/
├── main/
│   ├── domain/types/pagination.test.ts              # 4 tests
│   ├── framework-drivers/database.test.ts           # 6 tests
│   ├── interface-adapters/repositories/
│   │   ├── SqliteCreatorRepository.test.ts          # 14 tests
│   │   ├── SqliteVideoRepository.test.ts            # 13 tests
│   │   └── SqliteCutRepository.test.ts              # 20 tests
│   └── helpers/createTestDb.ts                      # In-memory DB factory
├── renderer/components/                             # (ready for future tests)
└── setup/
    ├── main.setup.ts
    └── renderer.setup.ts
```

### 4. Test helper: `createTestDb()`
Calls `initializeDatabase(':memory:')` — returns a fresh in-memory SQLite instance with all migrations applied. Each test calls `db.close()` in `afterEach`.

### 5. Package scripts added
- `npm run test` — `vitest run`
- `npm run test:watch` — `vitest`
- `npm run test:main` — `vitest run --project main`
- `npm run test:renderer` — `vitest run --project renderer`
- `npm run test:coverage` — `vitest run --coverage`

### 6. CI: `.github/workflows/ci.yml`
Runs on push/PR to `main`: lint → typecheck → test:coverage. Coverage artifacts uploaded (14-day retention).

### 7. AGENTS.md updated
Added Testing section, CI section, and all new key commands.

## Test inventory (57 total)
| Suite | Count | What's covered |
|-------|-------|----------------|
| `paginatedResult` | 4 | Pure helper: totalPages calc, zero-total edge, param mirroring |
| `initializeDatabase` | 6 | WAL pragma, FK pragma, schema version, tables, indexes, idempotency |
| `SqliteCreatorRepository` | 14 | CRUD + pagination: empty, sorted, search, sort-column allowlist, SQL-injection guard |
| `SqliteVideoRepository` | 13 | CRUD + pagination: creatorId filter, search, sort, unknown-column fallback |
| `SqliteCutRepository` | 20 | CRUD + pagination: tags (EXISTS subquery), combined filters, sort, injection guard |

## Notes
- In-memory SQLite does NOT support WAL journal mode (falls back to `memory`). The `database.test.ts` test accounts for this.
- `better-sqlite3` native module must be rebuilt (`npm rebuild better-sqlite3`) if the Node.js version changes.
- The `--project` filter requires `name` inside the `test` block (Vitest 4.x API).

