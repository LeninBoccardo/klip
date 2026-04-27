# Audit 01 — Dead Code

**Method:** ran `npx knip --no-progress`, manually filtered the report against grep + the project's runtime entry points (electron-vite loads `src/main/index.ts`, `src/preload/index.ts`, and `src/renderer/src/routes/main.tsx` at runtime, none via static imports — knip flags all three as unused). Cross-referenced with `npm run lint` for residual `no-unused-vars` errors.

**Severity bar:** impactful only — bundle weight, real product gaps (e.g. dependencies declared but feature never wired), feature components built and forgotten. Pure micro-noise (one-character unused destructure, etc.) noted at the end but not pushed.

**Out of scope (per plan):** `src/renderer/components/ui/**` (shadcn-generated primitives kept on the shelf for future features), Drizzle migration files.

---

## HIGH — `electron-updater` declared but never wired

**Location:** [package.json](package.json) declares `electron-updater` as a runtime dep; AGENTS.md describes it as present and references a publish URL in [electron-builder.yml](electron-builder.yml).

**Evidence:** `grep electron-updater src/` returns zero matches. No `autoUpdater.checkForUpdatesAndNotify()` call anywhere in [src/main/index.ts](src/main/index.ts) or any framework-driver. Users of any shipped build will never receive updates.

**Recommendation:** decide product intent before deleting.

- **If we want auto-update:** wire `electron-updater` in [src/main/index.ts](src/main/index.ts) (`autoUpdater.checkForUpdatesAndNotify()` after `app.whenReady`, plus event listeners). This is a real feature gap, not just dead code.
- **If we don't want auto-update:** remove `electron-updater` from `dependencies`, drop the `publish:` block from [electron-builder.yml](electron-builder.yml), and remove the auto-update line from AGENTS.md. ~12 MB saved on install.

This is the only "dead code" finding with a real product blast radius — every other finding below is just bloat.

---

## MEDIUM — Unused renderer feature & shared components (truly dead, never imported)

| File                                                                                                                   | Status                                                                                                                                                          | Notes                                            |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [src/renderer/components/features/creators/CreatorGrid.tsx](src/renderer/components/features/creators/CreatorGrid.tsx) | Defined, exported, never imported. Likely superseded by `ResponsiveGrid` from `@/components/shared`.                                                            | Delete the file.                                 |
| [src/renderer/components/shared/MediaGrid.tsx](src/renderer/components/shared/MediaGrid.tsx)                           | Defined, exported, never imported anywhere except its barrel re-export at [src/renderer/components/shared/index.ts:4](src/renderer/components/shared/index.ts). | Delete the file _and_ the barrel re-export line. |

**Recommendation:** delete both files plus the orphaned `export { MediaGrid }` line in `shared/index.ts`. No runtime risk — confirmed no callers via `grep CreatorGrid \| MediaGrid src/`.

---

## MEDIUM — Unused renderer hooks (5 functions)

| Hook                  | File                                                                          | Status                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `useSettings`         | [src/renderer/hooks/use-settings.ts:4](src/renderer/hooks/use-settings.ts)    | Never called. Settings page uses `useGetSetting`/`useSetSettingMutation` instead — these two were left over. |
| `useSetSetting`       | [src/renderer/hooks/use-settings.ts:18](src/renderer/hooks/use-settings.ts)   | Never called.                                                                                                |
| `useAuditLogByEntity` | [src/renderer/hooks/use-audit-log.ts:11](src/renderer/hooks/use-audit-log.ts) | Never called. The settings page uses `useAuditLogRecent` only.                                               |
| `useCutById`          | [src/renderer/hooks/use-cuts.ts:12](src/renderer/hooks/use-cuts.ts)           | Never called. No cut-detail route exists yet.                                                                |
| `useCutsByTags`       | [src/renderer/hooks/use-cuts.ts:20](src/renderer/hooks/use-cuts.ts)           | Never called. No tag-based browsing UI yet.                                                                  |

**Recommendation:** delete all 5 hooks. Each is a thin `useQuery`/`useMutation` wrapper — easy to re-add when the corresponding feature lands. Keeping them now is "we might need it" speculative API surface, which AGENTS.md ([line "Don't add features ... beyond what the task requires"](AGENTS.md)) explicitly warns against.

---

## MEDIUM — Unused dependencies (true unused, distinct from transitively-unused)

These are top-level `dependencies` / `devDependencies` declared in [package.json](package.json) with **zero references in `src/`** and **not transitively used by anything we ship**:

| Package                   | Type   | Notes                                                                                                                                                                                               |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-router`            | dep    | True unused. The app uses `@tanstack/react-router` (separate package). Likely a leftover scaffold artifact.                                                                                         |
| `@base-ui/react`          | dep    | Zero references. Possibly evaluated as a radix alternative and abandoned.                                                                                                                           |
| `@dnd-kit/react`          | dep    | Zero references. No drag-and-drop in the app.                                                                                                                                                       |
| `@marshallofsound/ipc`    | dep    | Zero references. Unknown why it was added — `IpcContract` does the typing job.                                                                                                                      |
| `@tanstack/react-table`   | dep    | Zero references. We render lists with `ResponsiveGrid` + `MediaCard`, not tables.                                                                                                                   |
| `@tanstack/react-virtual` | dep    | Zero references. We considered it for `CommentsTab` and rejected (default-collapsed makes virtualization unnecessary).                                                                              |
| `react-hotkeys-hook`      | dep    | Zero references. No keyboard shortcut system wired.                                                                                                                                                 |
| `shadcn`                  | dep    | This is the **CLI**, not a runtime library. We invoke it via `npx shadcn@latest add ...`. Should be removed from `dependencies` entirely; a fresh `npx` resolution works without it being declared. |
| `@hookform/devtools`      | devDep | Zero references. The forms (download URL, settings) don't reach for devtools.                                                                                                                       |

**Transitively-unused (used only by unused UI primitives, listed for awareness):**

`cmdk`, `react-day-picker`, `react-resizable-panels` are imported by `command.tsx`, `calendar.tsx`, and `resizable.tsx` respectively — all three are unused shadcn primitives. **Do not remove the deps until those primitives are deleted**, otherwise the shadcn CLI will re-fetch them when those components are eventually added back.

**Knip false-positives that should NOT be removed:** `@electron-toolkit/preload`, `@electron-toolkit/utils`, `@tailwindcss/vite`, `@tanstack/router-plugin`, `tailwindcss`, `tw-animate-css`. All are used by build tooling (vite config) or CSS pipelines that knip can't trace.

**Recommendation:** remove the 9 packages in the first table. Estimated install-time and bundle savings: **non-trivial** (`react-router`, `@base-ui/react`, `@tanstack/react-table` alone are ~3 MB combined of dead packages on the user's disk). Run `npm install` after removal to update `package-lock.json`.

---

## LOW — Unused exports inside live files

These are exports in files that are otherwise used; the export itself is dead but doesn't bloat the bundle (TS strips unreferenced types; JS tree-shakes unreferenced functions in production builds). Still noise.

| Export                                  | File                                                                                                                                                                       | Recommendation                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groupThreads`, `buildClipboardText`    | [src/renderer/components/features/videos/CommentsTab.tsx:302](src/renderer/components/features/videos/CommentsTab.tsx)                                                     | Just-shipped helpers exported "for tests if needed". No tests exist or are planned. Drop the `export { ... }` line; helpers stay file-local.                                                                                                                                                          |
| `useTheme`                              | [src/renderer/components/theme-provider.tsx:65](src/renderer/components/theme-provider.tsx)                                                                                | Custom hook around the local `ThemeProviderContext`. Never called — `sonner.tsx` uses `useTheme` from `next-themes`, not this one. Either delete this hook (and `ThemeProviderContext` if it becomes orphaned), or wire it into a header toggle if dark/light mode is supposed to be user-selectable. |
| `DEBOUNCE_MS`                           | [src/main/use-cases/ProcessFileNotifications.ts:9](src/main/use-cases/ProcessFileNotifications.ts)                                                                         | Used internally as the default `FlushConfig.debounceMs`. Export not needed externally. Drop the `export` keyword.                                                                                                                                                                                     |
| `FlushConfig`                           | [src/main/use-cases/ProcessFileNotifications.ts:11](src/main/use-cases/ProcessFileNotifications.ts)                                                                        | Same — used as default-param type, not externally. composition-root passes `undefined` ([composition-root.ts:179](src/main/composition-root.ts)). Drop `export`.                                                                                                                                      |
| `AppConfig`                             | [src/main/composition-root.ts:120](src/main/composition-root.ts)                                                                                                           | Used only inside the same file as `createAppContainer`'s parameter type. Drop `export`. (`AppContainer` IS used externally — keep it exported.)                                                                                                                                                       |
| `OperationType`                         | [src/main/domain/entities/Operation.ts:5](src/main/domain/entities/Operation.ts) and re-export at [src/main/domain/entities/index.ts:4](src/main/domain/entities/index.ts) | Defined, but no code imports it — `Operation.type` is the field, and string literals are used at the few call sites. Either start importing this type at those call sites, or drop the export. Low impact; recommendation: keep — it's documentation of the valid set.                                |
| `PushChannel`, `IpcResult`, `IpcParams` | [src/shared/ipc-contract.ts:107,110,113](src/shared/ipc-contract.ts)                                                                                                       | Helper types declared "for safety" but no code imports them. The active typed wiring uses `IpcContract` directly. Low impact; safe to delete.                                                                                                                                                         |

**Type re-exports flagged by knip but actually correct:**

`SortDirection`, `DownloadStatus`, `ProbeStatus`, `ChannelInfo`, `PathClassification` re-exported from [src/main/domain/types/index.ts](src/main/domain/types/index.ts) appear "unused" because no domain code happens to import them through the domain barrel today (everyone goes via `@shared/types`). Per AGENTS.md ([line 351](AGENTS.md)) — _"Domain type files re-export from `@shared/types` rather than defining types inline"_ — this re-export pattern is intentional and the barrel must stay aligned. **Leave as is.**

---

## LOW — Pre-existing ESLint `no-unused-vars` errors in `src/`

After all the above, the linter reports exactly **one** real `no-unused-vars` error in production source:

- [src/renderer/hooks/use-app-store.ts:43](src/renderer/hooks/use-app-store.ts) — `const { [downloadId]: _, ...rest } = state.activeDownloads`. The `_` is intentionally an "ignore me" binding for the destructure — but the project's ESLint config flags it anyway. Fix by renaming to `_unused` and prefixing with `_` per ESLint's conventional ignore (or by adding `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` to the config — the latter is the right long-term fix).

The other lint errors are about `explicit-function-return-type` and `no-explicit-any` — those are convention issues (Step 4), not dead code.

---

## Out-of-scope but acknowledged: shadcn primitives

`knip` lists 15 unused shadcn UI primitives in `src/renderer/components/ui/`: `alert.tsx`, `button-group.tsx`, `calendar.tsx`, `checkbox.tsx`, `combobox.tsx`, `command.tsx`, `dropdown-menu.tsx`, `hover-card.tsx`, `kbd.tsx`, `menubar.tsx`, `popover.tsx`, `radio-group.tsx`, `resizable.tsx`, `slider.tsx`, `switch.tsx`. Plus several unused exports inside otherwise-used primitives (e.g. `SidebarMenuSub`, `DialogClose`, etc.).

Per the audit plan these are out of scope — shadcn primitives are intentionally kept on the shelf so that when a feature needs them, they're already there with the project's styling tokens applied. **No action.**

If we ever decide to be strict about this, the right time is at a "shrink the bundle" sprint, not now.

---

## Summary

| Severity | Count                             | Net effect of fixing                                                |
| -------- | --------------------------------- | ------------------------------------------------------------------- |
| HIGH     | 1 (`electron-updater` not wired)  | Either ships auto-update or shrinks deps by ~12 MB                  |
| MEDIUM   | 16 (2 files, 5 hooks, 9 deps)     | Removes ~3 MB of dead packages + speculative API surface            |
| LOW      | ~10 unused exports + 1 lint error | Cleans up exports + makes lint clean in `src/` for `no-unused-vars` |

**Total runtime risk of fixes:** very low. All `MEDIUM` items are confirmed unreferenced via grep. The one `HIGH` item is a product decision, not a code change.

**Next step:** triage with the user. For each finding, mark `fix / defer / reject`. Once green-lit, the fix pass is straightforward (delete files + edit `package.json` + drop a few `export` keywords), then re-run `npx knip` to confirm clean.
