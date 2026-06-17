# Plan: Dependency Update + TanStack Supply-Chain Verification

**Created:** 2026-06-17 · **Branch:** `staging` · **Status:** ✅ EXECUTED 2026-06-17 — Tier 0 + Tier 1 applied, **all deps hard-pinned** (no `^`); Tier 2 majors + Electron 42 + Tier 3 removals deliberately held. See the **Execution Log** at the end of this file.

---

## 1. Security verdict — CLEAN (no poisoned packages)

### The incident
**"Mini Shai-Hulud"** (threat actor *TeamPCP*), **2026-05-11**. A self-propagating npm worm published **84 malicious versions across 42 `@tanstack/*` packages** in a ~6-minute window (**19:20–19:26 UTC**). Payload: credential stealer (AWS IMDS, GitHub/npm tokens, SSH keys), self-republishes to other packages the victim maintains, exfiltrates over the Session/Oxen network, and can wipe `$HOME` if an npm token is revoked before the host is imaged. **Only the Router family was targeted** — Query, Table, Virtual, Store, Form were *not* compromised. Every currently-published TanStack version is safe (malicious ones pulled within ~25 min).

### Why klip is unaffected (5 independent checks, all green)
1. **Installed router versions are all *below* the malicious ones** (we're on pre-attack releases):

   | Package | Compromised (IOC) | Installed | 
   |---|---|---|
   | react-router / router-core | 1.169.5, 1.169.8 | **1.169.2** |
   | router-plugin | 1.167.38, 1.167.41 | **1.167.35** |
   | router-generator | 1.166.45, 1.166.48 | **1.166.42** |
   | router-utils | 1.161.11, 1.161.14 | **1.161.8** |
   | react-router-devtools | 1.166.16, 1.166.19 | **1.166.13** |
   | router-devtools-core | 1.167.6, 1.167.9 | **1.167.3** |
   | history | 1.161.9, 1.161.12 | **1.161.6** |
   | virtual-file-routes | 1.161.10, 1.161.13 | **1.161.7** |

2. **Registry publish timestamps** of every installed `@tanstack/*` version fall **before** the 05-11 19:20 UTC window (range 2026-03-15 → 2026-05-06). Query/react-query `5.100.10` was published 05-11 **14:11 UTC** (~5h before the attack, and Query wasn't a target family).
3. **No install scripts** in any `@tanstack/*` package. The only 12 packages with install scripts repo-wide are all legitimate native/build tooling (esbuild, electron, electron-winstaller, better-sqlite3, fsevents, msw, vite).
4. **All 1,490 packages resolve from `registry.npmjs.org`** with valid sha512 integrity; nothing deprecated.
5. **No malware artifacts** found (repo + `$HOME`): no `@tanstack/setup` dep, no `router_init.js`, no `.claude/router_runtime.js`, no `.claude/setup.mjs`, no `.vscode/setup.mjs`, no `gh-token-monitor` scheduled task.

**Structural protection:** `@tanstack/react-router`, `react-router-devtools`, and `router-plugin` are **pinned to exact versions** (not `^`), and `package-lock.json` (v3) pins the entire transitive router tree — so `npm install` could never float into a compromised build. **No credential rotation required** (that's only for hosts that installed an affected version on 05-11; we didn't).

### Re-verify after ANY future `npm install`
~~~bash
# 1. confirm no @tanstack package gained an install script / rogue registry
node -e 'const l=require("./package-lock.json");for(const[k,v]of Object.entries(l.packages||{}))if(k.includes("@tanstack")&&(v.hasInstallScript||!String(v.resolved||"").includes("registry.npmjs.org")))console.log("INVESTIGATE",k,v.version)'
# 2. malware artifact sweep (expect no output)
node -e 'const fs=require("fs");["@tanstack/setup"].forEach(p=>{if(fs.existsSync("node_modules/"+p))console.log("FOUND",p)})'
ls .claude/router_runtime.js .claude/setup.mjs .vscode/setup.mjs 2>/dev/null
# 3. cross-check installed router versions are NOT in the IOC list above
~~~

> Sources: [TanStack postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem) · [TanStack hardening follow-up](https://tanstack.com/blog/incident-followup) · [StepSecurity IOC list](https://www.stepsecurity.io/blog/mini-shai-hulud-is-back-a-self-spreading-supply-chain-attack-hits-the-npm-ecosystem) · [Snyk](https://snyk.io/blog/tanstack-npm-packages-compromised/) · [heise](https://www.heise.de/en/news/Supply-chain-attack-on-TanStack-42-packages-compromised-11291014.html) · [Orca](https://orca.security/resources/blog/tanstack-npm-supply-chain-worm/)

---

## 2. Update plan (from `ncu`, 2026-06-17) — execute tier by tier

No security urgency. Recommended sequencing: **Tier 0+1 as one "dependency refresh" commit** (run `npm run check` + `npm run smoke` after) → **Tier 2 majors individually** later → fold **Tier 3 removals** into the audit's dead-code fix. After each install, run the re-verify snippet above and review the `package-lock.json` diff.

### Tier 0 — TanStack refresh (post-incident hardened, low risk)
| Package | From → To |
|---|---|
| @tanstack/react-query | ^5.100.10 → ^5.101.0 |
| @tanstack/react-router | 1.169.2 → 1.170.16 (pinned exact) |
| @tanstack/react-router-devtools | 1.166.13 → 1.167.0 (pinned exact) |
| @tanstack/router-plugin | 1.167.35 → 1.168.18 (pinned exact) |
| @tanstack/react-virtual | ^3.13.24 → ^3.14.3 |

Keep the router packages pinned to **exact** versions (current convention — it's what protected us). Verify the routeTree codegen still matches after bumping `router-plugin`.

### Tier 1 — safe patch/minor (batch, low risk)
radix-ui `^1.4.3→^1.6.0` · lucide-react `^1.14.0→^1.20.0` · date-fns `^4.1.0→^4.4.0` · react `^19.2.6→^19.2.7` · react-dom `^19.2.6→^19.2.7` · react-hook-form `^7.75.0→^7.79.0` · @hookform/resolvers `^5.2.2→^5.4.0` · i18next `^26.1.0→^26.3.1` · react-i18next `^17.0.7→^17.0.8` · electron-builder `^26.8.1→^26.15.3` · electron-updater `^6.8.3→^6.8.9` · electron-log `^5.4.3→^5.4.4` · knip `^6.12.2→^6.17.1` · prettier `^3.8.3→^3.8.4` · tsx `^4.21.0→^4.22.4` · zustand `^5.0.13→^5.0.14` · p-queue `^9.2.0→^9.3.0` · vitest `^4.1.6→^4.1.9` · @vitest/coverage-v8 `^4.1.6→^4.1.9` · @playwright/test `^1.60.0→^1.61.0` · tailwindcss + @tailwindcss/vite `^4.3.0→^4.3.1` · @types/react `^19.2.14→^19.2.17` · @fontsource-variable/geist `^5.2.8→^5.2.9` · react-day-picker `^10.0.0→^10.0.1` · react-resizable-panels `^4.11.0→^4.11.2` · eslint-plugin-react-refresh `^0.5.2→^0.5.3` · shadcn `^4.7.0→^4.11.0` (CLI).

### Tier 2 — majors (test individually, separate commits)
| Package | From → To | Watch for |
|---|---|---|
| eslint | ^9.39.1 → ^10.5.0 | flat-config / plugin-peer changes; run `npm run lint` |
| vite | ^7.3.3 → ^8.0.16 | electron-vite peer compat |
| @vitejs/plugin-react | ^5.1.1 → ^6.0.2 | pairs with vite 8 |
| @types/node | ^24.12.3 → ^25.9.3 | keep aligned with the Node/Electron runtime |
| @atlaskit/pragmatic-drag-and-drop | ^1.8.1 → ^2.0.0 | **used by mini-player drag** (PersistentPlayer) — test drag-to-corner |
| @base-ui/react | ^1.4.1 → ^1.5.0 | minor, but verify any base-ui components |

### Tier 2-coupled — Electron 42 (gated, investigate together)
`electron ^41.5.0 → ^42.4.1` was previously **blocked by better-sqlite3** (12.9.0 fails to compile against V8 14.8 / Node 24 — upstream issue #1376; see memory `project_electron_42_blocked_by_better_sqlite3`). `better-sqlite3 12.9.0 → 12.11.1` is now available and **may** unblock it. Procedure: bump `better-sqlite3` to 12.11.1 first → `npm run rebuild` (electron-rebuild against Electron 42 ABI) → if the native build succeeds and tests pass, take Electron 42; otherwise stay on 41 and recheck issue #1376. **Do not bump Electron 42 blind.**

### Tier 3 — REMOVE, do not update (per audit 07 F-dead-code, grep-verified unused)
- `react-router` (^7.15.0; ncu offers 7.18 — ignore, app uses `@tanstack/react-router`)
- `@tanstack/react-table`
- `react-hotkeys-hook`
- `@dnd-kit/react` (ncu offers 0.5 — ignore)
- `@marshallofsound/ipc`

Fold into the audit dead-code cleanup. ~bundle/install weight saved; re-run `npm run check` after removal.

---

## 3. Execution checklist (when approved)
1. Branch off `staging` (e.g. `chore/deps-refresh`).
2. Tier 0+1: edit `package.json` ranges → `npm install` → re-verify snippet (§1) → `npm run check` (`format:check` + `lint` + `typecheck` + `test`) → `npm run smoke` → commit.
3. Tier 3 removals: separate commit (or with audit dead-code fix).
4. Tier 2 majors: one package per commit, full `check` + `smoke` (+ `e2e` for vite/electron/dnd changes) each.
5. Electron 42: only after the better-sqlite3 rebuild gate passes.
6. Each step: review `package-lock.json` diff; abort if any `@tanstack/*` resolves to an IOC-listed version or gains an install script.

---

## 4. Execution Log — 2026-06-17

### What was applied
- **`package.json` hard-pinned**: every dependency + devDependency converted from `^range` to an **exact** version (no silent minor/patch float).
- **Tier 0 (TanStack)** bumped to verified-clean post-incident releases: `react-query 5.101.0`, `react-router 1.170.16`, `react-router-devtools 1.167.0`, `router-plugin 1.168.18`, `react-virtual 3.14.3`. Each target was confirmed published **after** 2026-05-11, not deprecated, **zero install scripts**, valid integrity, and **not** in the IOC list before pinning.
- **Tier 1** bumped to exact latest (radix-ui 1.6.0, lucide-react 1.20.0, date-fns 4.4.0, react/react-dom 19.2.7, react-hook-form 7.79.0, @hookform/resolvers 5.4.0, i18next 26.3.1, react-i18next 17.0.8, electron-builder 26.15.3, electron-updater 6.8.9, electron-log 5.4.4, knip 6.17.1, prettier 3.8.4, tsx 4.22.4, zustand 5.0.14, p-queue 9.3.0, vitest + coverage 4.1.9, @playwright/test 1.61.0, tailwindcss + @tailwindcss/vite 4.3.1, @types/react 19.2.17, @fontsource-variable/geist 5.2.9, react-day-picker 10.0.1, react-resizable-panels 4.11.2, eslint-plugin-react-refresh 0.5.3, shadcn 4.11.0).
- **Held at installed version** (pinned, NOT bumped): Tier 2 majors `electron 41.5.0`, `vite 7.3.3`, `@vitejs/plugin-react 5.2.0`, `@types/node 24.12.3`, `@base-ui/react 1.4.1`, `@atlaskit/pragmatic-drag-and-drop 1.8.1`, `eslint 9.39.4`; coupled `better-sqlite3 12.9.0`; and Tier 3 unused deps `@tanstack/react-table 8.21.3`, `react-hotkeys-hook 5.3.2`, `@dnd-kit/react 0.4.0`, `@marshallofsound/ipc 2.7.0`, `react-router 7.15.0` (removal deferred to the audit dead-code fix).
- **Install method:** `npm install --ignore-scripts` (no lifecycle scripts run during resolution — correct mitigation during a supply-chain incident), then native rebuild only via the trusted `pretest`/`rebuild` scripts.

### Verification results — PASS
- **TanStack IOC re-verify on the new lockfile:** 0 IOC matches, 0 TanStack install scripts, 100% `registry.npmjs.org`, no malware artifacts. Transitive router deps resolved to new safe versions (router-core 1.171.13, history 1.162.0, router-generator 1.167.17, router-utils 1.162.2, virtual-core 3.17.1, etc. — all above the IOC patches).
- **`typecheck`** (node + web): ✅ green.
- **`build`** (`electron-vite build`): ✅ green — all bumped renderer libs bundle cleanly.
- **`test`:** 1917 pass / **13 pre-existing failures** (see below) — proven unrelated to the bumps.

### Pre-existing issues surfaced (NOT caused by this update — for the audit/fix backlog)
Empirically proven pre-existing by re-running the failing tests against the committed (pre-update) deps — identical failures:
1. `tests/renderer/.../PersistentPlayer.test.tsx` (7) + `CreatorHeader.test.tsx` (4): components call query hooks (`useSetting`/`useQueryClient`) but the tests render bare with **no `QueryClientProvider`** → `Error: No QueryClient set`. Fix: wrap these tests in a QueryClient provider (add a custom render in `tests/renderer/helpers/test-utils.tsx`).
2. `tests/main/.../migrations.test.ts` (1): **audit F-M5** — expected-table list omits `download_history`; unmasked now that better-sqlite3 rebuilt for the current Node ABI.
3. `tests/main/shared/ipc-schemas.test.ts` (1): "covers every channel" — new channels (editor / download-history) lack accept+reject test cases.
4. `npm run format:check` + `npm run lint` are red on `staging` for ~23 pre-existing files (prettier/prettier style + 1 `setState-in-effect` error) — none touched by this update. (Matches audit 04 ESLint backlog.)

### npm audit (16 advisories — pre-existing, unrelated to the TanStack worm)
All in build/dev tooling + transitive deps, none in the runtime path. **Do NOT run `npm audit fix --force`** — its "fixes" for `drizzle-kit` (→0.19.1) and `electron-vite` (→1.0.20) are breaking **downgrades**. Notable:
- **`vite` (high, Windows-relevant):** `launch-editor` NTLMv2 hash disclosure via UNC path. Fix is an **in-major patch** `vite 7.3.3 → 7.3.5` (no major jump) — recommended quick win; verify then pin.
- `react-router` (low, CSRF) — resolved for free when Tier 3 removes the unused `react-router`.
- `hono`, `brace-expansion`, `js-yaml`, `qs`, `tar`, `uuid`, `@babel/core`, `@hookform/devtools`, `@stryker-mutator/core` (drizzle-kit/electron-vite/esbuild chains) — transitive, mostly DoS/file-handling in tooling; address via targeted `overrides` or when their parents update.

### Recommended next steps
1. (Optional security quick win) pin `vite` to `7.3.5` and re-run `build` + `smoke`.
2. Fix the pre-existing test bugs (#1 QueryClient wrapper, #2 F-M5 table list, #3 channel coverage) as part of the audit work.
3. Tier 2 majors + Electron 42 (gated on better-sqlite3 12.11.1 rebuild) — separate effort, one commit each.
4. Tier 3 removals — fold into audit dead-code fix.
