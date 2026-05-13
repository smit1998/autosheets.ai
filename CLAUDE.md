# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package manager

This project uses **pnpm** (lockfile is `pnpm-lock.yaml`). Do not run `npm install` — it will produce a conflicting `package-lock.json` and may break the hoisted `node_modules` layout that Electron + native modules depend on.

`.npmrc` sets `shamefully-hoist=true` and `node-linker=hoisted` because `electron-builder` and `better-sqlite3` expect a flat `node_modules`. Don't remove these without testing a full `pnpm package` build.

`package.json` `pnpm.onlyBuiltDependencies` allowlists the postinstall scripts pnpm 10 sandboxes by default (`electron`, `better-sqlite3`, etc.). When adding a new dependency that has a meaningful postinstall (native module, electron-related), add it to that allowlist or builds will silently skip its setup.

## Commands

- `pnpm dev` — start Vite + Electron in dev (renderer HMR, main process auto-restart)
- `pnpm build` — type-check via `tsc -b` then build renderer (`dist/`) and main/preload (`dist-electron/`)
- `pnpm lint` — run ESLint over the repo
- `pnpm package` / `package:mac` / `package:win` — produce a packaged installer via `electron-builder`
- `pnpm electron:rebuild` — rebuild `better-sqlite3` against the current Electron ABI (run after upgrading Electron)
- `pnpm preview` — serve the renderer build standalone (browser only; no agent / no IPC)

There is no test runner configured.

## Product

**Autosheets** is an AI-assisted timesheet application for technology companies. Core idea: an agent runs in the background, observes the user's screen activity (Outlook / Zoom / Teams meetings, IDE work, ticket activity, etc.), and auto-categorizes time spent into project categories that admins define — so employees don't have to fill out timesheets manually. Goal is *time savings*, not surveillance.

Primary surfaces:
1. **Dashboard** — monthly metrics (hours per project, per category, trends).
2. **Admin** — project + category management.
3. **Agent control surface** — status, pause/resume, consent, visibility into what was captured.
4. **Timesheet review** — human-in-the-loop confirm/edit of the agent's allocations before submission.

Privacy is a first-class concern. Any UI that touches screen-capture data must surface clear consent state, easy pause/resume, and let the user inspect/correct what the agent recorded.

## Runtime model

This repo is an **Electron desktop application**, not a standalone web app. The shape is:

```
Electron shell
  ├── Renderer (React, this repo's src/)
  ├── Preload bridge  (electron/preload.ts → window.autosheets)
  └── Main process
      ├── Agent logic (electron/agent.ts — screen observation, classification)
      ├── SQLite store (electron/db.ts — better-sqlite3)
      └── IPC handlers (electron/ipc/handlers.ts)
```

The Electron main process hosts both the agent logic and the local SQLite store. The agent has OS-level permissions for screen observation, window/title introspection, and calendar/meeting integrations (Outlook, Zoom, Teams). The renderer is a sandboxed Chromium webview and cannot do any of that — anything privileged must go through the typed IPC bridge.

**IPC contract.** [src/shared/ipc-contract.ts](src/shared/ipc-contract.ts) is the single source of truth: a `IpcContract` map of `channel → { request, response }`. To add a channel:
1. Add an entry in `IpcContract`.
2. Implement the handler in [electron/ipc/handlers.ts](electron/ipc/handlers.ts) (the map is exhaustively typed — TS will fail if you miss one).
3. Call it from the renderer via `ipc('channel:name', payload)` from [src/shared/ipc.ts](src/shared/ipc.ts).

Renderer code MUST go through `ipc()` — never touch `window.autosheets` directly, never import from `electron/` (those modules use Node APIs and won't bundle for the renderer). Mock `window.autosheets` for browser-only dev / tests.

**Persistence.** SQLite via `better-sqlite3` lives in `app.getPath('userData')/autosheets.db`. Schema is in [electron/db.ts](electron/db.ts). It's a native module — after upgrading Electron, run `pnpm electron:rebuild`.

**Agent.** [electron/agent.ts](electron/agent.ts) is currently a stub. Real screen capture, classification, and calendar/meeting integration land here. Keep all privileged work behind the IPC boundary so the renderer stays platform-agnostic.

Implications for code in `src/`:
- Treat the renderer as a pure UI layer. All privileged operations (screen capture, file system, OS auth, agent control, local DB) go through a typed IPC client that lives in `src/shared/ipc.ts` (to be added when the shell is scaffolded). Components and features must depend on that client, not on `window.electron` / Tauri globals directly.
- `pnpm dev` currently runs Vite standalone in a browser. That's fine for pure UI work, but features that need the agent or OS permissions must be exercised inside the desktop shell once it exists. Mock the IPC client for browser-only dev and tests.
- Do not pull in web-only assumptions (e.g. `localStorage` for anything important, browser routing semantics that break under `file://`). Persistence belongs in the agent / main process behind IPC.

## Architecture

Single-page React 19 + TypeScript app scaffolded with Vite, intended to run as the renderer inside the desktop shell described above. Entry point is [src/main.tsx](src/main.tsx), which mounts [src/App.tsx](src/App.tsx) into `#root` from [index.html](index.html). Static SVG icon sprite lives in [public/icons.svg](public/icons.svg) and is referenced via `<use href="/icons.svg#...">`.

TypeScript is configured with project references: [tsconfig.json](tsconfig.json) is a solution file pointing at [tsconfig.app.json](tsconfig.app.json) (app code under `src/`) and [tsconfig.node.json](tsconfig.node.json) (Vite/build config). The build runs `tsc -b` so both projects must type-check.

ESLint config is flat-config in [eslint.config.js](eslint.config.js) using `typescript-eslint`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`. The README documents how to upgrade to type-aware lint rules (`recommendedTypeChecked` / `strictTypeChecked`) — not currently enabled.

React Compiler is intentionally not enabled (see [README.md](README.md)).

## Project Guidelines

### Folder structure
- Feature-based component architecture. Each feature lives in its own folder under `src/features/<feature>/` and owns its `components/`, `hooks.ts`, `types.ts`, and `api.ts`.
- Tests follow the same feature-based layout. Each component has its own `tests/` folder colocated with the component file (e.g. `Foo/Foo.tsx` + `Foo/tests/Foo.test.tsx`). Do not put tests in a top-level `__tests__` or central test folder. The only exception is global test infrastructure (e.g. `src/test/setup.ts`).
- `src/shared/components/` holds shared/common components used across features.
- `src/shared/hooks.ts` and `src/shared/types.ts` hold shared hooks and types respectively. Anything used by more than one feature belongs here, not inside a feature.
- `src/shared/constants.ts` is the single source for project-wide constants — define them there and import from there; do not inline magic values.
- `src/i18n/` contains one JSON file per language (e.g. `en.json`, `es.json`). All user-facing strings must live in these files and be read from them — never hardcode user-facing text in components.

### State management

Three layers, each with one library. Pick by the *nature* of the state:

- **Local component state** — `useState` / `useReducer`. Dialog open/closed, form fields, hover, anything that lives and dies with the component.
- **Global static / context-shaped state** — React Context. Identity (`UserContext`), routing (`NavContext`), theme. Things that rarely change but everything in the tree needs to read. Don't put server data or UI flags here.
- **Global client UI state** — **Zustand** stores in [src/shared/stores/](src/shared/stores/). Cross-component UI state that's neither identity nor server data: agent running flag, classification activity, toast queues. Read with `useStore(s => s.field)` selectors so unrelated changes don't rerender consumers. Actions live inside the store so callers don't reach into IPC directly. See [src/shared/stores/agent.ts](src/shared/stores/agent.ts) for the pattern.
- **Server state (IPC)** — **TanStack Query**. Anything returned by `ipc(...)` reads is a query. Anything mutating via `ipc(...)` is a mutation. Query keys are arrays starting with the domain (`['projects']`, `['categories']`, `['users']`). Mutations call `queryClient.invalidateQueries({ queryKey: […] })` on success to refresh consumers. The shared `QueryClient` lives at [src/shared/queryClient.ts](src/shared/queryClient.ts) and is provided once at the App root. See [Projects.tsx](src/features/projects/Projects.tsx) for the pattern.

The legacy [`useAsyncData`](src/shared/hooks.ts) hook still exists in places; migrate calls to TanStack Query when you touch them. Don't introduce new `useAsyncData` calls.

Strict no-prop-drilling rule: if a prop would be passed through 3 or more layers, lift it — into a Context (for identity/routing), a Zustand store (for cross-component UI state), or a TanStack query (for server data). Never thread it manually.

### Performance
- Use `useMemo` for expensive computations, `useCallback` for stable function references passed to children, and `React.memo` for components whose re-renders are expensive or frequent.

### Testing
- Write **limited but specific** tests that cover the main functionality and meaningful edge cases of a feature/component. Do not produce an exhaustive list of tests for every prop permutation, trivial render, or implementation detail.
- Use judgement to decide the right amount of coverage. A small component may only need 1–2 tests; a complex feature may need more. Optimize for tests that would actually catch a regression a user would notice.
- Prefer testing behavior through the rendered UI (queries from `@testing-library/react`) over testing internal state or implementation.

### UI library
- Use **MUI** (`@mui/material`) for all base UI primitives (buttons, inputs, dialogs, layout, typography, etc.) and `@mui/icons-material` for icons, so the design language stays consistent. Do not hand-roll equivalents of components MUI already provides.
- The app is wrapped in a single `ThemeProvider` + `CssBaseline` in [src/main.tsx](src/main.tsx). The theme lives in [src/shared/theme.ts](src/shared/theme.ts) — all design tokens (palette, typography, spacing, component overrides) belong there, not inline in components.
- Style with MUI's `sx` prop or `styled()` from `@mui/material/styles`. Avoid ad-hoc CSS files for component styling.
- Feature components in `src/features/<feature>/` should compose MUI primitives; shared composite components live in `src/shared/components/`.

### Dependencies
- Avoid adding external libraries beyond the MUI / Zustand / TanStack Query stack already in use. If one is genuinely required, ask for permission before installing it.