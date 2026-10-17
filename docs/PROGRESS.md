# Rondje rebuild — progress log

Source of truth: `docs/rondje-spec.md`. Working rules: `docs/claude-code-rebuild-prompt.md`.
If the session restarts, re-read both files and this log before continuing.

## Stage status

| # | Stage | Status |
|---|---|---|
| 1 | Inspect repository, create `rebuild` branch | done |
| 2 | SvelteKit / Svelte 5 / strict TS / Tailwind v4 / Nunito / adapter-vercel | done |
| 3 | Supabase clients, env handling, `.env.example` | pending |
| 4 | `supabase/schema.sql`, `supabase/seed.sql`, DB types | pending |
| 5 | Pure game engine + unit tests | pending |
| 6 | Host auth, dashboard, create session, code/QR/link | pending |
| 7 | Player join, anonymous auth, onboarding, lobby, presence | pending |
| 8 | Server-authoritative game actions, Realtime, reconnection | pending |
| 9 | Results, error states, responsive layout, accessibility | pending |
| 10 | Security tests, Playwright E2E | pending |
| 11 | Checks, README, final progress update | pending |

## Starting state (stage 1)

- The directory was **not** a Git repository and contained only `docs/`
  (the spec and the rebuild prompt). No framework, lockfile, routes or
  Supabase files existed, so nothing legacy needed to be reused or removed.
- `git init`, then branch `rebuild` created on the unborn repository; the
  existing docs were committed as `WIP: pre-rebuild state`. There is no
  `main` branch yet; `rebuild` is the only branch.
- Tooling available: Node 22.19, npm 10.9 (npm 11 via `npx` used for
  installs, see below), Git 2.45, Supabase CLI 2.121 via `npx`.
  **Docker is not installed**, so `supabase start` (local stack) is not
  available. No Supabase credentials are present.

## Key decisions

- **Package manager:** npm (no lockfile existed; npm is the only manager
  installed). `npm install` with npm 10.9.3 crashed with an arborist bug
  (`Cannot read properties of null (reading 'edgesOut')`); the install was
  done with `npx npm@11 install`, which produces a normal
  `package-lock.json` usable by npm 10 too.
- **SvelteKit 2.70 (not 3.x):** SvelteKit 3.0.0 was released on
  2026-10-01, two weeks before this rebuild. The mature 2.x line was chosen
  to reduce risk: `@sveltejs/kit` 2.70, `svelte` 5.57 (runes enforced via
  `compilerOptions.runes`), `vite` 7, `@sveltejs/vite-plugin-svelte` 6,
  `@sveltejs/adapter-vercel` 6, TypeScript 5.9 (svelte-check does not yet
  support TypeScript 7).
- **Tailwind v4** via `@tailwindcss/vite`; theme tokens in `src/app.css`.
  Palette contrast: white on teal `#249D8F` is only ~3.3:1, so primary
  buttons use deep teal `#1B7A6F` (5.2:1 with white). Error text uses a
  darker coral `#A63D25` (6.3:1 on white) because coral `#E76F51` fails
  for small text. Coral/teal are still used for accents and large text.

## Commands run

| Command | Result |
|---|---|
| `npx npm@11 install` | success |
| `npm run check` (stage 2) | 0 errors, 0 warnings |
| `npm run build` (stage 2) | success (adapter-vercel output) |

## Open issues

- None yet.
