# Rondje rebuild: progress log

Source of truth: `docs/rondje-spec.md`. Working rules: `docs/claude-code-rebuild-prompt.md`.
If the session restarts, re-read both files and this log before continuing.

## Stage status

| # | Stage | Status | Commit |
|---|---|---|---|
| 1 | Inspect repository, create `rebuild` branch | done | `WIP: pre-rebuild state` |
| 2 | SvelteKit / Svelte 5 / strict TS / Tailwind v4 / Nunito / adapter-vercel | done | Stage 2 |
| 3 | Supabase clients, env handling, `.env.example` | done | Stage 3 |
| 4 | `supabase/schema.sql`, `supabase/seed.sql`, DB types, PGlite DB tests | done | Stage 4 |
| 5 | Pure game engine + unit tests | done | Stage 5 |
| 6 | Host auth, dashboard, create session, code/QR/link | done | Stages 6-8 (one commit) |
| 7 | Player join, anonymous auth, onboarding, lobby, presence | done | Stages 6-8 |
| 8 | Server-authoritative game API, Realtime, reconnection | done | Stages 6-8 |
| 9 | Results, error states, responsive layout, accessibility | done | Stage 9 |
| 10 | Security tests, Playwright E2E | done (E2E written, not run: no credentials) | Stage 10 |
| 11 | Checks, README, final progress update | done | Stage 11 |

Stages 6–8 were developed together because the host page embeds the live
game table and the lobby depends on the sync layer. They were committed as
one commit rather than three commits that would not build on their own.

## Starting state (stage 1)

- The directory was **not** a Git repository and contained only `docs/`
  (the spec and the rebuild prompt). There was no framework, lockfile, routes
  or Supabase files, so no legacy code needed to be reused or removed.
- `git init`, then branch `rebuild` created on the unborn repository; the
  existing docs were committed as `WIP: pre-rebuild state`. There is no
  `main` branch; `rebuild` is the only branch. Nothing was pushed anywhere.
- Tooling: Node 22.19, npm 10.9, Git 2.45, Supabase CLI 2.121 via `npx`.
  **Docker is not installed**, so `supabase start` (local stack) was not
  available. **No Supabase credentials** were present.

## Architecture summary

- **Authority:** PostgreSQL functions in `supabase/schema.sql` (`SECURITY
  DEFINER`, `search_path = ''`, `auth.uid()` from the JWT, session row lock
  with `FOR UPDATE`). Business errors are returned, not raised, so lazy
  deadline resolution commits even when the action is rejected.
- **Server:** SvelteKit routes validate with Zod and call the functions with
  the caller's own Supabase session (`@supabase/ssr` in `hooks.server.ts`).
  The app never reads the secret key.
- **Hidden information:** `game_layout`, vocabulary, games, board cells,
  attempts and processed actions have RLS enabled with no client policies or
  grants. Content leaves the DB only via `private.session_view()`, which reveals
  flipped and matched positions only.
- **Realtime:** `realtime.send()` inside each transaction publishes
  `{session_id, revision}` on the private topic `session:<uuid>`;
  `realtime.messages` policies allow receive and presence for the host and
  active players only. `SessionSync` (client) refetches on newer revisions,
  on (re)subscribe, on visibility/online events and at deadlines. It polls
  every 4 s while disconnected and every 15 s as a safety net while connected,
  and never applies an older revision.
- **Engine:** `src/lib/game/` mirrors the SQL transitions exactly (same
  check order, same resolution semantics). It is unit-tested and reused by
  the UI for disabling cards and for rankings.

## Key decisions

- **Package manager:** npm. npm 10.9.3 crashed (`Cannot read properties of
  null (reading 'edgesOut')`), so the install was done with
  `npx npm@11 install`.
- **SvelteKit 2.70, not 3.x:** SvelteKit 3.0.0 was released on 2026-10-01,
  two weeks before this rebuild, so the mature 2.x line was used: kit 2.70,
  svelte 5.57 (runes enforced), vite 7, vite-plugin-svelte 6,
  adapter-vercel 6, TypeScript 5.9 (svelte-check does not support TS 7).
- **Palette contrast:** white on teal `#249D8F` is ~3.3:1, so primary
  buttons use deep teal `#1B7A6F` (5.2:1). Error text uses a darker coral
  `#A63D25` (6.3:1).
- **Env read at runtime** (`$env/dynamic/*`) so the app builds without
  credentials.
- **Database types** (`src/lib/types/database.ts`) are hand-written in the
  `supabase gen types` format because no project was available to generate
  them from.
- **PGlite (dev dependency)** runs the real schema/seed in tests with a
  small stand-in for Supabase's `auth`/`realtime` schemas and roles. It was
  added because there was no other way to execute and verify the SQL in this
  environment.
- **Rate limiting:** in-memory per instance in `hooks.server.ts` (best effort
  on serverless); the DB functions make repeated requests harmless anyway.

## Spec gaps resolved

Also recorded in spec section 22 ("Implementation Notes").

1. Removed players keep their score but are not ranked and cannot win;
   winners on host-end / too-few-players are the top-scoring non-removed
   players.
2. Lazy resolution performs at most one transition; the next turn deadline
   is `now() + 60 s` at resolution time (a late resolution gives a full turn
   instead of chaining timeouts).
3. Flips with a stale revision are rejected (`stale_state`) without state
   change; replayed action ids are rejected (`duplicate_action`). Both
   responses include the current view so the client reconciles.
4. Flip requests also carry the board owner id for an explicit own-board check.
5. One revision counter on `game_sessions` covers lobby and game.
6. A host cannot join their own session as a player.
7. A player removed in the lobby cannot rejoin with the same identity.
8. "End game" is available only while in progress (no lobby cancel feature).

No contradictions between the spec and the rebuild prompt were found.

## Commands run (final state)

| Command | Result |
|---|---|
| `npx npm@11 install` | success; `npm audit --omit=dev`: 0 vulnerabilities |
| `npm run check` | 596 files, 0 errors, 0 warnings |
| `npm run build` | success (adapter-vercel output) |
| `npm test` (Vitest unit + db) | 8 files, 139 tests passed |
| `npx playwright install chromium` | installed |
| `npx playwright test` | 55 passed (responsive, all 5 viewports), 1 skipped (multiplayer: no credentials) |

During development, a deliberate mutation (score `+1` changed to `+2` in
`flip_card`) made 5 DB tests fail, which confirmed that the DB suite detects
rule regressions. The schema was then restored.

## Live verification against Supabase (2026-10-17, after credentials were added)

Project checks (read-only probes): schema functions present; seed present
(82 pairs each for image_pairs / word_image / de_het, 20 opposites; the
project has two more nouns than `seed.sql`); `game_layout` denied to the
publishable key; anonymous sign-ins enabled.

| Command | Result |
|---|---|
| `npx playwright test --project=multiplayer` (run 1) | failed at player join: text typed before hydration was reset (app bug, fixed) |
| (run 2) | failed on the final flip: test waited for a card that the results screen had replaced (test bug, fixed) |
| (runs 3 and 4) | **passed** (1.0 min): host sign-in, session creation, 3 players in separate contexts, identical boards, match keeps turn, miss passes turn, scoreboard sync, board clear, same results everywhere, results survive refresh |
| Realtime probe (throwaway users, cleaned up) | member subscribes to private `session:<id>` and receives `{id, revision, session_id}` ~0.4 s after a change; non-member gets `Unauthorized`; **a public channel could still be subscribed, so "Allow public access" is still enabled in the dashboard** |
| `npm test` / `npx playwright test` | 139 passed / 56 passed |

Fix made: the join nickname, login email and landing join-code inputs now
use `bind:value`, which Svelte preserves across hydration; a plain `value=`
attribute was reset, silently emptying a `required` field.

Still not verified: genuinely simultaneous requests (row locks exist but no
parallel stress test was run); host sign-up flow with email confirmation
(the test host is created through the admin API).

## Not verified before credentials were available (historical)

- Live Supabase Auth: host email/password sign-in and sign-up, anonymous
  sign-in, cookie handling through `@supabase/ssr`.
- Applying `schema.sql`/`seed.sql` to a real Supabase project. They were
  executed in PGlite (PostgreSQL 17 compiled to WASM) with stubbed `auth`
  and `realtime` objects. Supabase-specific parts (`realtime.send`,
  `realtime.topic()`, policies on `realtime.messages`, default grants) follow
  Supabase's documented APIs but have not run on Supabase.
- Realtime delivery, presence and multi-browser synchronisation.
- True concurrency (PGlite is single-connection; row locks are in place but
  not exercised with parallel transactions).
- `tests/e2e/multiplayer.spec.ts`: written and type-checked; it is listed
  by Playwright and skipped without credentials.

To run them: create a test Supabase project, apply both SQL files, enable
anonymous sign-ins and email/password, disable Realtime public access, put
`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY` in `.env`, then run `npm run test:e2e`.

## Open issues

- None known in code. The items above need a live Supabase project.
