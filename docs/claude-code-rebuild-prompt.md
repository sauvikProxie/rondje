# Claude Code Prompt — Fresh Rebuild of Rondje

You are working in the existing Rondje repository. Rebuild the
application according to `docs/rondje-spec.md`. The specification is the
source of truth for product scope, game rules, stack, data model,
security, design, and tests. This prompt covers **how** to work; the
spec covers **what** to build. If they ever seem to disagree, follow the
spec and note the discrepancy in your final report.

## 1. Working Mode

Work autonomously. Do not stop to ask me to approve a plan, choose
between routine implementation options, or confirm individual stages.
Make sensible engineering decisions and continue until the
implementation, tests, and documentation are complete. Do not return
only a plan; implement the application.

Before changing anything:

1. Run `git status` and inspect the repository: framework setup,
   package manager and lockfile, package scripts, existing routes, and
   any existing Supabase files.
2. Read `docs/rondje-spec.md` completely. Pay particular attention to
   sections 7–9 (game rules), 11 (synchronisation) and 15 (security).
3. Decide what can be reused safely and what conflicts with the spec.

Safety rules:

- Create a branch named `rebuild` and commit after each completed stage
  in section 4 with a clear message. Never force-push, reset, rebase
  away, or otherwise discard existing work.
- If there are uncommitted changes when you start, commit them first on
  the `rebuild` branch as "WIP: pre-rebuild state" so nothing is lost.
- Do not run anything against a remote or production Supabase database.
  Write SQL files for me to review and apply. If a local Supabase stack
  (`supabase start`) is available, you may apply the SQL there.
- Never put the Supabase secret key in client code or in any variable
  with a `PUBLIC_` prefix. Never commit real secrets.

Replace conflicting legacy code cleanly rather than patching around it,
while keeping useful configuration and unrelated work.

## 2. Progress File

This is a long task. Keep `docs/PROGRESS.md` up to date as you go: which
stages are done, key decisions, open issues, and commands run with their
results. If your context is compacted or the session restarts, re-read
`docs/PROGRESS.md` and the spec before continuing.

## 3. Non-Negotiables

These are in the spec, but they are the easiest to get wrong:

- **Stack:** exactly the stack in spec section 3. No React, Socket.IO,
  Redis, or custom Node game server. Use the repository's existing
  package manager. Avoid unnecessary dependencies.
- **Scope:** nothing from spec section 2.2.
- **How the game works (spec 7.1, 8, 9):** every player has their own
  board of face-down cards containing complete pairs, and all boards
  share one identical layout (same cards, same positions). On their
  turn a player flips two cards on their own board, one request per
  flip. A match scores a point and they go again; a miss flips the
  cards back and passes the turn. Every flip is visible to everyone.
  The game ends when the first player clears their board.
- **Server-authoritative:** matching, scoring, turn advancement, and
  completion happen only in trusted server code and database functions.
  Critical actions are atomic and idempotent (spec 14.10).
- **Timing on Vercel:** no server-side `setTimeout`. Mismatch reveals
  and turn deadlines use persisted database-clock deadlines resolved
  lazily and idempotently (spec 9.4–9.6).
- **Hidden cards:** face-down card content is never sent to any client,
  including the board's owner. Realtime notifications carry only
  session ID and revision; clients fetch their authorised view (spec
  8.2, 11.3).
- **Honesty:** never claim a check, migration, or live test ran or
  passed unless it actually did.

## 4. Stages

Work through these in order, committing after each:

1. Inspect the repository and Git status; create the branch.
2. Establish a working SvelteKit, Svelte 5 (runes), strict TypeScript
   foundation with Tailwind v4, Nunito, and `adapter-vercel`.
3. Configure Supabase clients (`@supabase/ssr` in `hooks.server.ts`),
   environment handling, and `.env.example` exactly as in spec section
   16.
4. Write `supabase/schema.sql` (tables, constraints, indexes, RLS,
   grants, `realtime.messages` policies, PostgreSQL functions for
   atomic actions) and `supabase/seed.sql` (at least 12 valid pairs per
   variant). Generate or hand-write matching TypeScript database types.
5. Implement the pure game engine in `src/lib/game/` with unit tests,
   independent of the UI and Supabase. Cover board generation, all four
   variants, turn rules, deadlines, player removal, scoring, and the
   end-of-game condition.
6. Host authentication (email and password) and session management:
   dashboard, create session, join code, QR code, invitation link.
7. Player join flow with anonymous auth, onboarding, lobby, and
   presence.
8. Server-authoritative game actions wired to the UI; Realtime
   notifications; reconnection and stale-state handling.
9. Results screen, error states, responsive layout at the spec's
   viewport sizes, and accessibility.
10. Security tests and the Playwright end-to-end test (spec section 19).
11. Run checks, fix issues, write the README, update `docs/PROGRESS.md`.

Do not create placeholder screens and call them done. Do not leave TODOs
in gameplay, security, or persistence paths.

## 5. Checks

Run, and fix failures until they pass:

- `svelte-check` (via the repository's check script)
- production build
- unit tests (Vitest)
- Playwright tests, if a Supabase project or local Supabase stack with
  credentials is available

If credentials are missing, do not stop to ask for them. Finish all
local work, mark the live tests as not run, and explain exactly what is
needed to run them.

## 6. README

Cover: prerequisites, installation, environment variables, local
development, Supabase project setup, applying `schema.sql` and
`seed.sql`, the dashboard settings that cannot be set from SQL
(anonymous sign-ins, email/password auth, disabling public Realtime
access), running checks and tests, deployment to Vercel, and any
remaining manual steps.

Keep `docs/rondje-spec.md` aligned with the implementation. Do not
silently weaken or change product rules. If you find a genuine
contradiction or gap in the spec, choose the option most consistent
with its principles, implement it, and record it in `docs/PROGRESS.md`
and the final report.

## 7. Final Report

When finished, report concisely:

1. What was implemented.
2. Key routes and architecture.
3. Database and schema files created.
4. Commands run and their actual results.
5. Manual Supabase setup still required.
6. Tests not run, and why.
7. Any spec gaps you resolved, and how.

Start now by inspecting the repository and reading
`docs/rondje-spec.md`.
