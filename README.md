# Rondje

A browser-based, multiplayer memory game for practising Dutch vocabulary. A
host creates a session and shares a code, QR code or link. Players join with a
nickname and emoji avatar, then take turns flipping cards on identical boards.

The product and technical specification is [`docs/rondje-spec.md`](docs/rondje-spec.md);
the rebuild log is [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Stack

SvelteKit 2 · Svelte 5 (runes) · TypeScript (strict) · Supabase (PostgreSQL,
Auth, Realtime) via `@supabase/supabase-js` and `@supabase/ssr` · Tailwind CSS v4 ·
Zod · `qrcode` · Nunito (`@fontsource-variable/nunito`) · Vitest · Playwright ·
`@sveltejs/adapter-vercel`.

Dev-only: `@electric-sql/pglite` runs the real `supabase/schema.sql` in-process
for database and security tests.

## How it works

- **The database is authoritative.** Every state change goes through a
  `SECURITY DEFINER` PostgreSQL function in `supabase/schema.sql`
  (`create_session`, `join_session`, `start_game`, `flip_card`, `end_game`,
  `remove_player`, `get_session_view`). Each one identifies the caller with
  `auth.uid()` from their JWT, locks the session row, validates the request and
  applies the transition atomically. Business errors are returned as
  `{ok:false, error}`, not raised.
- **SvelteKit server routes** (`src/routes/api/sessions/[id]/…`) validate input
  with Zod and call those functions with the caller's own Supabase session. The
  app never uses the Supabase secret key.
- **Hidden cards stay hidden.** The board layout is stored once per game in
  `game_layout`, which no client role can read. Clients receive only their
  authorised view: card content for positions that are flipped in the current
  attempt or already matched. Card identifiers are plain board positions.
- **Realtime carries only notifications.** After each change the database sends
  `{session_id, revision}` on the private channel `session:<id>`. Clients
  refetch their view and never apply an older revision over a newer one.
  Presence on the same channel shows who is online.
- **Timing is safe on serverless hosting.** Mismatch reveals (2.5 s) and turn
  limits (60 s) are stored as database-clock deadlines (`reveal_until`,
  `turn_until`). They are resolved lazily and idempotently by the next read or
  action. Clients schedule a refetch at each deadline.
- **The pure game engine** in `src/lib/game/` mirrors the SQL rules for unit
  tests. The UI reuses it to disable cards that can't be flipped and to compute
  rankings.

### Routes

| Route | Purpose |
|---|---|
| `/` | Landing page; enter a join code |
| `/auth/login` | Host sign in / sign up (email + password) |
| `/dashboard` | Host's sessions |
| `/dashboard/sessions/new` | Create a session (configure, then review) |
| `/dashboard/sessions/[id]` | Manage a session: code, QR, link, participants, start/end, live game, results |
| `/join/[code]` | Validate the session, then onboarding (nickname, avatar, level) |
| `/session/[code]` | Player view: lobby, then game, then results |
| `/api/sessions/[id]/state` | `GET` the caller's authorised view (resolves overdue deadlines) |
| `/api/sessions/[id]/flip` | `POST {boardPlayerId, position, actionId, revision}` |
| `/api/sessions/[id]/start`, `/end`, `/delete` | Host actions (`/delete` permanently removes the session and all its data) |
| `/api/sessions/[id]/players/[playerId]/remove` | Host removes a participant |

## Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer (see the npm note under "Installation")
- A Supabase project (hosted). The Supabase CLI local stack also works if
  Docker is available.

## Installation

```sh
npm install
```

> If npm 10 crashes with `Cannot read properties of null (reading 'edgesOut')`,
> use `npx npm@11 install` instead. That was the workaround needed while
> building this project; the resulting lockfile works with npm 10.

## Environment variables

Copy `.env.example` to `.env` and fill it in:

| Variable | Used by | Notes |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | app (browser + server) | `https://<ref>.supabase.co` |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app (browser + server) | Publishable key (`sb_publishable_…`) or legacy anon key |
| `SUPABASE_SECRET_KEY` | **tests only** | Secret key (`sb_secret_…`) or legacy service-role key. Never exposed to the browser; the application does not read it |
| `SUPABASE_PROJECT_REF` | tooling | For `supabase gen types` |
| `PUBLIC_APP_URL` | app | Base URL for invitation links and QR codes, e.g. `https://rondje.example.com`. Falls back to the request origin if unset |

Variables are read at runtime (`$env/dynamic/*`), so the app builds without
them. Pages that need Supabase show a friendly "not configured" or
"unavailable" message.

## Supabase project setup

1. **Create a project** in the Supabase dashboard.
2. **Apply the schema, then the seed.** In the SQL editor, run
   `supabase/schema.sql`, then `supabase/seed.sql`. Or with `psql` and the
   project's connection string:
   ```sh
   psql "$DATABASE_URL" -f supabase/schema.sql
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
   Both scripts are written for a fresh project and are safe to re-run
   (create-if-not-exists, `on conflict do nothing`). They do not drop or migrate
   existing data.
3. **Dashboard settings that cannot be set from SQL:**
   - **Authentication → Sign In / Providers → Allow anonymous sign-ins:
     enable.** Players join as anonymous users.
   - **Authentication → Sign In / Providers → Email: enable** email/password
     sign-in for hosts. Magic links and OAuth are not used. If "Confirm email" is
     enabled, new hosts must click the confirmation link before signing in; the
     sign-up screen says so.
   - **Realtime → Settings → "Allow public access": disable**, so only private
     channels authorised by the `realtime.messages` policies in
     `schema.sql` can be used.
   - **Authentication → URL Configuration:** set the Site URL to your
     `PUBLIC_APP_URL` (used in confirmation emails).
   - Optional: Authentication → Rate limits. Consider enabling CAPTCHA for
     anonymous sign-ins on a public deployment.
4. **Regenerate types** after changing the schema (optional; `src/lib/types/database.ts`
   is maintained by hand to match `schema.sql`):
   ```sh
   npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public > src/lib/types/database.ts
   ```
   Then re-add the `Tables`/`Enums` helper exports at the bottom if your CLI
   version does not generate them.

## Local development

```sh
npm run dev          # http://localhost:5173
```

To test on a phone on the same network, run `npm run dev -- --host` and set
`PUBLIC_APP_URL` to the LAN address so the QR code points to it.

## Checks and tests

```sh
npm run check        # svelte-kit sync + svelte-check (TypeScript strict)
npm run build        # production build (adapter-vercel)
npm test             # all Vitest projects: unit + db
npm run test:unit    # pure game engine (tests/unit)
npm run test:db      # schema.sql + seed.sql in PGlite: game functions and security (tests/db)
npx playwright install chromium   # once
npm run test:e2e     # Playwright: responsive checks + multiplayer journey
```

- **`tests/unit`** covers board generation, all four variants, turns,
  deadlines, removal, scoring and completion, using the pure engine.
- **`tests/db`** loads the real `supabase/schema.sql` and `seed.sql` into
  PGlite, with a small stand-in for Supabase's `auth` and `realtime` schemas and
  the `anon`/`authenticated` roles. It exercises every RPC, RLS policy, grant
  and Realtime policy. It does not replace testing against Supabase itself
  (PGlite is single-connection, so true concurrency is not exercised there).
- **`tests/e2e/responsive.spec.ts`** checks for horizontal overflow, touch
  target size and obscured cards at 360×640, 390×844, 412×915, tablet and
  desktop. App pages come from the production build. The lobby, game and results
  screens are rendered by a test-only harness (`tests/visual`, its own Vite
  server on port 4174) with fixture views. No Supabase is required.
- **`tests/e2e/multiplayer.spec.ts`** is the full journey from spec 19.3: host
  sign-in, session creation, three players in separate browser contexts, a
  match, a miss, a board clear, synchronised results, and refresh. It needs
  `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
  `SUPABASE_SECRET_KEY` for a project with the schema and seed applied and
  anonymous sign-ins enabled; it is skipped otherwise. It creates a confirmed
  host through the admin API, reads the layout with the secret key (test-only
  helper in `tests/e2e/helpers`), and deletes the users it created afterwards.
  Use a non-production project.

## Deployment (Vercel)

1. Import the repository in Vercel (framework preset: SvelteKit).
2. Set `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `PUBLIC_APP_URL` (your production URL) in the project's environment
   variables. Do **not** add `SUPABASE_SECRET_KEY`; the app doesn't need it.
3. Deploy. `@sveltejs/adapter-vercel` produces Node serverless functions. No
   timers run on the server; deadlines are resolved by the database on the next
   request.
4. Add the production URL to Supabase Authentication → URL Configuration.

## Remaining manual steps

- Apply `supabase/schema.sql` and `supabase/seed.sql` to your project.
- Make the dashboard changes above (anonymous sign-ins, email provider,
  Realtime public access off, site URL).
- Run `npm run test:e2e` against a test project to verify live
  authentication, Realtime and multiplayer synchronisation (see
  `docs/PROGRESS.md` for what has and has not been verified).
- Rate limiting in `src/hooks.server.ts` is in-memory per server instance (best
  effort on serverless). For stronger protection, add platform-level limits
  (Vercel firewall rules or Supabase Auth rate limits).

## Project structure

```text
src/
├── hooks.server.ts            Supabase SSR client, rate limiting, security headers
├── lib/
│   ├── client/                Browser: API client, SessionSync (revision-aware realtime state)
│   ├── components/            layout/, session/, lobby/, game/, shared/
│   ├── game/                  Pure engine: constants, types, board-generation, matching,
│   │                          turn-management, scoring, game-state, view helpers
│   ├── server/                auth guards, Zod validation, typed RPC wrappers, HTTP helpers
│   ├── supabase/              config + browser client
│   ├── types/                 database.ts (Supabase types), session-view.ts (RPC JSON)
│   ├── utils/                 formatting, UUID
│   └── errors.ts              error codes → user-facing messages
└── routes/                    see the routes table above
supabase/
├── schema.sql                 tables, constraints, indexes, RLS, grants, realtime policies, functions
└── seed.sql                   80 nouns (8 themes) → 80 pairs each for 3 variants; 20 opposite pairs
tests/
├── unit/                      engine tests
├── db/                        PGlite harness, game-function tests, security tests
├── e2e/                       Playwright: responsive + multiplayer (+ test-only admin helpers)
└── visual/                    test-only render harness for responsive checks
```
