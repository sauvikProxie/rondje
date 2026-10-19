-- =============================================================================
-- Rondje — database schema (Supabase PostgreSQL)
--
-- Apply with the SQL editor or `psql`, then apply `supabase/seed.sql`. The
-- script is re-runnable (create-if-not-exists / create-or-replace) and also
-- upgrades a project that has an earlier version of this schema in place
-- (see "Upgrades" below). It never drops tables or rows.
--
-- Design summary (see docs/rondje-spec.md sections 8, 9, 11, 14, 15, 23):
--   * All state changes go through SECURITY DEFINER functions in `public` that
--     authenticate the caller with auth.uid(), validate the request, lock the
--     session row (SELECT ... FOR UPDATE) and perform the transition atomically.
--   * Business errors are returned as {"ok": false, "error": "<code>"} instead
--     of being raised, so that a lazy deadline resolution performed at the start
--     of a rejected action is still committed.
--   * A session plays one of two game modes: Matchen (memory, one shared board
--     per game) or Fill in the Blanks (everyone answers the same grammar
--     sentence each round). Players may be split into groups (teams).
--   * A session can play several games one after another with the same
--     players: after a game ends the host sets up the next one (any mode) and
--     the session returns to the lobby. Points carry over into a running
--     session total; each finished game keeps its own result.
--   * Clients have no direct access to the board layout, vocabulary, question,
--     game, round, answer, attempt or action tables. Card content leaves the
--     database only through private.session_view(), which reveals a position
--     only while it is flipped in the current attempt or after it has been
--     matched. A sentence's correct answer is revealed only once its round is
--     closed.
--   * Every committed change increments game_sessions.revision and sends a
--     Realtime broadcast {session_id, revision} on the private topic
--     "session:<uuid>". Broadcast payloads never contain card content.
--   * There is no turn timer. The only timed transitions are short reveals
--     (a Matchen mismatch, a closed Fill in the Blanks round), stored as
--     database-clock timestamps and resolved lazily and idempotently by
--     private.resolve_overdue() under the session row lock. The host can move a
--     stalled game on with public.skip_turn().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schemas
-- -----------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
-- `authenticated` needs USAGE so that Realtime RLS policies can call
-- private.can_use_session_topic(); the schema is not exposed through the
-- Data API, so its functions cannot be called as RPCs.
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------

do $$
begin
	create type public.session_status as enum ('lobby', 'in_progress', 'completed');
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.game_variant as enum ('image_pairs', 'word_image', 'de_het', 'opposites');
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.proficiency_level as enum ('beginner', 'elementary', 'intermediate', 'advanced');
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.player_status as enum ('active', 'removed');
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.card_face_kind as enum ('image', 'word', 'article_word');
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.vocabulary_theme as enum (
		'transport', 'eten_en_drinken', 'huis', 'lichaam_en_dokter',
		'werk', 'boodschappen', 'weer', 'familie'
	);
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.game_status as enum ('active', 'completed');
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.game_end_reason as enum (
		'board_cleared', 'ended_by_host', 'not_enough_players', 'all_rounds_played'
	);
exception when duplicate_object then null;
end $$;
-- Upgrade: value added with Fill in the Blanks (no-op on a fresh install).
alter type public.game_end_reason add value if not exists 'all_rounds_played';

do $$
begin
	create type public.game_mode as enum ('matchen', 'fill_blanks');
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.grammar_topic as enum (
		'verbs', 'articles', 'prepositions', 'pronouns', 'adjectives', 'plurals', 'past_tense', 'word_order'
	);
exception when duplicate_object then null;
end $$;

do $$
begin
	create type public.attempt_outcome as enum ('match', 'mismatch', 'timeout', 'cancelled');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Shared constants (mirrored in src/lib/game/constants.ts; a test checks parity)
-- -----------------------------------------------------------------------------

-- Mismatch reveal interval: 2.5 seconds (spec 9.5).
create or replace function private.reveal_interval()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '2500 milliseconds' $$;

-- Fill in the Blanks: how long a closed round shows the answer (spec 23.4).
create or replace function private.round_reveal_interval()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '4 seconds' $$;

-- Maximum number of groups a session can be split into (spec 23.3).
create or replace function private.max_groups()
returns smallint
language sql
immutable
set search_path = ''
as $$ select 4::smallint $$;

-- Unambiguous join-code alphabet: no 0/O, 1/I/L.
create or replace function private.join_code_alphabet()
returns text
language sql
immutable
set search_path = ''
as $$ select 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'::text $$;

-- Predefined avatar collection (mirrored in src/lib/game/constants.ts).
create or replace function private.allowed_avatars()
returns text[]
language sql
immutable
set search_path = ''
as $$
	select array[
		'🦊', '🐼', '🐸', '🦉', '🐙', '🦁', '🐯', '🐨',
		'🐰', '🐻', '🐧', '🦄', '🐢', '🦋', '🐝', '🐳',
		'🦒', '🦔', '🐞', '🐶', '🐱', '🐭', '🐮', '🐷'
	]::text[]
$$;

-- Normalised form of a Fill in the Blanks answer: case, surrounding and
-- repeated spaces, typographic apostrophes and final punctuation are ignored
-- (mirrored by normalizeAnswer() in src/lib/game/blanks.ts).
create or replace function private.normalize_answer(p_answer text)
returns text
language sql
immutable
set search_path = ''
as $$
	select regexp_replace(
		regexp_replace(translate(lower(btrim(coalesce(p_answer, ''))), '’‘', ''''''), '\s+', ' ', 'g'),
		'\s*[.!?]+$', ''
	)
$$;

-- Three distinct wrong options, none equal to the answer (used by a CHECK).
create or replace function private.valid_distractors(p_answer text, p_distractors text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
	select cardinality(p_distractors) = 3
		and array_position(p_distractors, null) is null
		and (
			select count(distinct private.normalize_answer(d)) = 3
				and bool_and(private.normalize_answer(d) <> private.normalize_answer(p_answer) and d = btrim(d) and d <> '')
			from unnest(p_distractors) as d
		)
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- 14.1 Hosts: references Supabase Auth users that created at least one session.
-- No credentials are stored here; Supabase Auth is the source of truth.
create table if not exists public.hosts (
	id uuid primary key references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

-- 14.2 Game sessions: one shared table that plays one game at a time. The
-- game settings are those of the current (or next) game; each game keeps a
-- copy of its own. `variant` applies to Matchen only. `pair_count` is the
-- number of pairs in Matchen and the number of sentences (rounds) in Fill in
-- the Blanks. `status` is the state of the current game: back in 'lobby'
-- while the host sets up the next one.
create table if not exists public.game_sessions (
	id uuid primary key default gen_random_uuid(),
	host_id uuid not null references public.hosts (id) on delete cascade,
	name text not null,
	join_code text not null,
	scheduled_at timestamptz,
	mode public.game_mode not null default 'matchen',
	variant public.game_variant,
	pair_count smallint not null,
	-- 1 = no groups; 2..max_groups() = players are split into that many teams.
	group_count smallint not null default 1,
	status public.session_status not null default 'lobby',
	revision bigint not null default 1,
	created_at timestamptz not null default now(),
	started_at timestamptz,
	ended_at timestamptz,
	constraint game_sessions_join_code_key unique (join_code),
	constraint game_sessions_join_code_format check (join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
	constraint game_sessions_name_length check (name = btrim(name) and char_length(name) between 1 and 60),
	constraint game_sessions_pair_count check (pair_count in (6, 8, 12)),
	constraint game_sessions_revision_positive check (revision >= 1),
	constraint game_sessions_lifecycle check (
		(status = 'lobby' and started_at is null and ended_at is null)
		or (status = 'in_progress' and started_at is not null and ended_at is null)
		or (status = 'completed' and started_at is not null and ended_at is not null)
	)
);

create index if not exists game_sessions_host_created_idx
	on public.game_sessions (host_id, created_at desc);

-- 14.3 Players: an authenticated (usually anonymous) identity within a session.
create table if not exists public.players (
	id uuid primary key default gen_random_uuid(),
	session_id uuid not null references public.game_sessions (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	nickname text not null,
	avatar text not null,
	level public.proficiency_level not null,
	status public.player_status not null default 'active',
	-- 14.8 Scores: one point per matched pair or correct sentence in the
	-- current game, written only by flip_card() and submit_answer().
	score integer not null default 0,
	-- Points from the session's earlier games; the session total is
	-- carried_score + score. Moved over by configure_game().
	carried_score integer not null default 0,
	-- Team (1-based) in the current game, assigned by start_game() when the
	-- game uses groups.
	group_number smallint,
	joined_at timestamptz not null default now(),
	removed_at timestamptz,
	constraint players_session_user_key unique (session_id, user_id),
	constraint players_nickname_length check (
		nickname = btrim(nickname) and char_length(nickname) between 1 and 20
	),
	constraint players_avatar_allowed check (avatar = any (private.allowed_avatars())),
	constraint players_score_range check (score between 0 and 12),
	constraint players_carried_score check (carried_score >= 0),
	constraint players_removed_consistency check (
		(status = 'active' and removed_at is null) or (status = 'removed' and removed_at is not null)
	)
);

-- Case-insensitive nickname uniqueness among active players of a session.
create unique index if not exists players_active_nickname_key
	on public.players (session_id, lower(nickname))
	where status = 'active';
create index if not exists players_session_joined_idx on public.players (session_id, joined_at);
create index if not exists players_user_idx on public.players (user_id);

-- 14.4 Vocabulary items: one record per concept, usable by every variant.
create table if not exists public.vocabulary_items (
	id uuid primary key default gen_random_uuid(),
	slug text not null,
	word text not null,
	article text,
	emoji text,
	-- Reserved for real images later; the engine only needs (item, face kind).
	image_path text,
	theme public.vocabulary_theme,
	level public.proficiency_level,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	constraint vocabulary_items_slug_key unique (slug),
	constraint vocabulary_items_slug_format check (slug ~ '^[a-z0-9_]+$'),
	constraint vocabulary_items_word_format check (word = btrim(word) and word = lower(word) and char_length(word) between 1 and 40),
	constraint vocabulary_items_article check (article is null or article in ('de', 'het'))
);

create unique index if not exists vocabulary_items_word_key on public.vocabulary_items (lower(word));
create unique index if not exists vocabulary_items_emoji_key on public.vocabulary_items (emoji) where emoji is not null;

-- 14.5 Vocabulary pairs: the explicit, variant-specific matching relationship.
--   image_pairs : (item X, image)  + (item X, image)
--   word_image  : (item X, image)  + (item X, word)
--   de_het      : (item X, image)  + (item X, article_word)
--   opposites   : (item X, word)   + (item Y, word), X <> Y
create table if not exists public.vocabulary_pairs (
	id uuid primary key default gen_random_uuid(),
	variant public.game_variant not null,
	item_a uuid not null references public.vocabulary_items (id) on delete restrict,
	face_a public.card_face_kind not null,
	item_b uuid not null references public.vocabulary_items (id) on delete restrict,
	face_b public.card_face_kind not null,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	constraint vocabulary_pairs_variant_items_key unique (variant, item_a, item_b),
	constraint vocabulary_pairs_shape check (
		(variant = 'image_pairs' and item_a = item_b and face_a = 'image' and face_b = 'image')
		or (variant = 'word_image' and item_a = item_b and face_a = 'image' and face_b = 'word')
		or (variant = 'de_het' and item_a = item_b and face_a = 'image' and face_b = 'article_word')
		or (variant = 'opposites' and item_a <> item_b and face_a = 'word' and face_b = 'word')
	)
);

create index if not exists vocabulary_pairs_variant_idx on public.vocabulary_pairs (variant) where active;
create index if not exists vocabulary_pairs_item_a_idx on public.vocabulary_pairs (item_a);
create index if not exists vocabulary_pairs_item_b_idx on public.vocabulary_pairs (item_b);

-- 14.6 Game state: authoritative state of one game of a session. A session
-- has at most one active game; earlier games stay as its history.
create table if not exists public.games (
	id uuid primary key default gen_random_uuid(),
	session_id uuid not null references public.game_sessions (id) on delete cascade,
	-- 1 for the session's first game, then 2, 3, ...
	game_number smallint not null default 1,
	-- The settings this game was played with (copied from the session at start).
	mode public.game_mode not null,
	variant public.game_variant,
	pair_count smallint not null,
	group_count smallint not null,
	status public.game_status not null default 'active',
	-- Fixed random turn order (player ids); removed players are skipped.
	-- With groups the order alternates between groups. Unused by Fill in the
	-- Blanks, where everyone answers at once.
	turn_order uuid[] not null,
	-- Matchen: whose turn it is. Always null in Fill in the Blanks.
	active_player_id uuid references public.players (id) on delete set null,
	-- Matchen: pending first flip of the current attempt (board position).
	first_flip smallint,
	-- Matchen: pending mismatch reveal, the two positions, visible until reveal_until.
	mismatch_positions smallint[],
	-- Matchen: end of a mismatch reveal. Fill in the Blanks: end of the answer
	-- reveal of the current (closed) round.
	reveal_until timestamptz,
	-- Fill in the Blanks: 0-based index of the round being played.
	current_round smallint,
	end_reason public.game_end_reason,
	winner_ids uuid[] not null default '{}',
	-- Groups with the highest total, when the session uses groups.
	winning_groups smallint[] not null default '{}',
	started_at timestamptz not null default now(),
	ended_at timestamptz,
	constraint games_turn_order_size check (cardinality(turn_order) >= 2)
	-- games_session_number_key, games_mismatch_shape and games_completion:
	-- see "Upgrades" below.
);

-- 14.7 Board layout: stored ONCE per game. Never readable by clients. In
-- Matchen every player plays on this one shared board: a matched pair stays
-- matched for everyone, credited to the player who found it.
create table if not exists public.game_layout (
	game_id uuid not null references public.games (id) on delete cascade,
	position smallint not null,
	pair_id uuid not null references public.vocabulary_pairs (id) on delete restrict,
	-- 0 = (item_a, face_a), 1 = (item_b, face_b)
	side smallint not null,
	matched_by uuid references public.players (id) on delete set null,
	matched_at timestamptz,
	primary key (game_id, position),
	constraint game_layout_position_range check (position between 0 and 23),
	constraint game_layout_side check (side in (0, 1)),
	-- Each side of each pair appears exactly once => every pair exactly twice.
	constraint game_layout_pair_side_key unique (game_id, pair_id, side)
);

-- Fill in the Blanks content: a Dutch sentence with exactly one blank ("___"),
-- its correct answer and three wrong options for multiple choice.
create table if not exists public.grammar_questions (
	id uuid primary key default gen_random_uuid(),
	slug text not null,
	sentence text not null,
	answer text not null,
	distractors text[] not null,
	-- English meaning of the whole sentence, shown as a hint.
	translation text not null,
	topic public.grammar_topic not null,
	level public.proficiency_level,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	constraint grammar_questions_slug_key unique (slug),
	constraint grammar_questions_slug_format check (slug ~ '^[a-z0-9_]+$'),
	constraint grammar_questions_one_blank check (
		sentence = btrim(sentence) and sentence like '%\_\_\_%' and sentence not like '%\_\_\_%\_\_\_%'
	),
	constraint grammar_questions_answer check (answer = btrim(answer) and char_length(answer) between 1 and 40),
	constraint grammar_questions_distractors check (private.valid_distractors(answer, distractors)),
	constraint grammar_questions_translation check (char_length(btrim(translation)) between 1 and 200)
);

-- Fill in the Blanks: the questions of one game, in play order. The options are
-- shuffled once per game so every player sees them in the same order.
create table if not exists public.game_rounds (
	game_id uuid not null references public.games (id) on delete cascade,
	round smallint not null,
	question_id uuid not null references public.grammar_questions (id) on delete restrict,
	options text[] not null,
	closed_at timestamptz,
	primary key (game_id, round),
	constraint game_rounds_round_range check (round between 0 and 11),
	constraint game_rounds_question_key unique (game_id, question_id),
	constraint game_rounds_options check (cardinality(options) = 4)
);

-- Fill in the Blanks: one answer per player per round.
create table if not exists public.round_answers (
	game_id uuid not null,
	round smallint not null,
	player_id uuid not null references public.players (id) on delete cascade,
	answer text not null,
	correct boolean not null,
	answered_at timestamptz not null default now(),
	primary key (game_id, round, player_id),
	foreign key (game_id, round) references public.game_rounds (game_id, round) on delete cascade,
	constraint round_answers_length check (char_length(answer) between 1 and 60)
);

-- Attempt log ("the server records the attempt").
create table if not exists public.game_attempts (
	id bigint generated always as identity primary key,
	game_id uuid not null references public.games (id) on delete cascade,
	player_id uuid not null references public.players (id) on delete cascade,
	first_position smallint,
	second_position smallint,
	outcome public.attempt_outcome not null,
	created_at timestamptz not null default now(),
	constraint game_attempts_positions check (
		(outcome in ('match', 'mismatch') and first_position is not null and second_position is not null)
		or (outcome in ('timeout', 'cancelled') and second_position is null)
	)
);

create index if not exists game_attempts_game_idx on public.game_attempts (game_id, id desc);

-- Processed action ids (idempotency, spec 9.2 / 14.10).
create table if not exists public.processed_actions (
	action_id uuid primary key,
	game_id uuid not null references public.games (id) on delete cascade,
	player_id uuid not null references public.players (id) on delete cascade,
	created_at timestamptz not null default now()
);

create index if not exists processed_actions_game_idx on public.processed_actions (game_id);

create index if not exists round_answers_player_idx on public.round_answers (player_id);
create index if not exists grammar_questions_active_idx on public.grammar_questions (id) where active;

-- -----------------------------------------------------------------------------
-- Upgrades (idempotent). Bring a project created with an earlier version of
-- this schema up to date: shared Matchen board, no turn timer, groups, Fill
-- in the Blanks and several games per session. On a fresh install the columns
-- already exist and the
-- constraints are simply re-created. Finish or end running games first: a game
-- in progress during the upgrade loses its per-player board state.
--
-- The earlier per-player `public.board_cells` table is no longer used. It is
-- left in place (with RLS on and no client grants) so no data is dropped; it
-- can be removed manually with `drop table public.board_cells;`.
-- -----------------------------------------------------------------------------

alter table public.game_sessions add column if not exists mode public.game_mode not null default 'matchen';
alter table public.game_sessions add column if not exists group_count smallint not null default 1;
alter table public.game_sessions alter column variant drop not null;
alter table public.game_sessions drop constraint if exists game_sessions_mode_variant;
alter table public.game_sessions add constraint game_sessions_mode_variant check (
	(mode = 'matchen' and variant is not null) or (mode = 'fill_blanks' and variant is null)
);
alter table public.game_sessions drop constraint if exists game_sessions_group_count;
alter table public.game_sessions add constraint game_sessions_group_count check (group_count between 1 and 4);

alter table public.players add column if not exists group_number smallint;
alter table public.players drop constraint if exists players_group_number;
alter table public.players add constraint players_group_number check (group_number is null or group_number between 1 and 4);

alter table public.games add column if not exists current_round smallint;
alter table public.games add column if not exists winning_groups smallint[] not null default '{}';
alter table public.games drop constraint if exists games_mismatch_shape;
alter table public.games drop constraint if exists games_completion;
-- The 60-second turn timer was removed.
alter table public.games drop column if exists turn_until;
alter table public.games add constraint games_mismatch_shape check (
	mismatch_positions is null
	or (cardinality(mismatch_positions) = 2 and reveal_until is not null and first_flip is null)
);
alter table public.games add constraint games_completion check (
	(status = 'active' and end_reason is null and ended_at is null)
	or (status = 'completed' and end_reason is not null and ended_at is not null
		and first_flip is null and mismatch_positions is null and reveal_until is null)
);

alter table public.game_layout add column if not exists matched_by uuid references public.players (id) on delete set null;
alter table public.game_layout add column if not exists matched_at timestamptz;

-- Several games per session: games are numbered and keep their own settings,
-- and players carry their points over into a running session total.
alter table public.players add column if not exists carried_score integer not null default 0;
alter table public.players drop constraint if exists players_carried_score;
alter table public.players add constraint players_carried_score check (carried_score >= 0);

alter table public.games add column if not exists game_number smallint not null default 1;
alter table public.games add column if not exists mode public.game_mode;
alter table public.games add column if not exists variant public.game_variant;
alter table public.games add column if not exists pair_count smallint;
alter table public.games add column if not exists group_count smallint;
-- Games created before this upgrade were the only game of their session.
update public.games g
set mode = s.mode, variant = s.variant, pair_count = s.pair_count, group_count = s.group_count
from public.game_sessions s
where s.id = g.session_id and g.mode is null;
alter table public.games alter column mode set not null;
alter table public.games alter column pair_count set not null;
alter table public.games alter column group_count set not null;
alter table public.games drop constraint if exists games_mode_variant;
alter table public.games add constraint games_mode_variant check (
	(mode = 'matchen' and variant is not null) or (mode = 'fill_blanks' and variant is null)
);
alter table public.games drop constraint if exists games_session_key;
alter table public.games drop constraint if exists games_session_number_key;
alter table public.games add constraint games_session_number_key unique (session_id, game_number);
create unique index if not exists games_one_active_per_session on public.games (session_id) where status = 'active';

-- Functions whose signature changed or that are no longer used.
drop function if exists public.create_session(text, text, integer, timestamptz);
drop function if exists public.flip_card(uuid, uuid, integer, uuid, bigint);
drop function if exists private.complete_game(uuid, public.game_end_reason, uuid[]);
drop function if exists private.top_scorers(uuid);
drop function if exists private.turn_time_limit();

-- -----------------------------------------------------------------------------
-- Vocabulary validation trigger
-- -----------------------------------------------------------------------------

create or replace function private.validate_vocabulary_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_a public.vocabulary_items%rowtype;
	v_b public.vocabulary_items%rowtype;
begin
	select * into v_a from public.vocabulary_items where id = new.item_a;
	select * into v_b from public.vocabulary_items where id = new.item_b;

	if (new.face_a = 'image' and v_a.emoji is null and v_a.image_path is null)
		or (new.face_b = 'image' and v_b.emoji is null and v_b.image_path is null) then
		raise exception 'vocabulary pair %: image face requires an emoji or image', new.id;
	end if;

	if (new.face_a = 'article_word' and v_a.article is null)
		or (new.face_b = 'article_word' and v_b.article is null) then
		raise exception 'vocabulary pair %: article_word face requires an article', new.id;
	end if;

	return new;
end;
$$;

drop trigger if exists vocabulary_pairs_validate on public.vocabulary_pairs;
create trigger vocabulary_pairs_validate
	before insert or update on public.vocabulary_pairs
	for each row execute function private.validate_vocabulary_pair();

-- -----------------------------------------------------------------------------
-- Row-Level Security and grants
-- -----------------------------------------------------------------------------

alter table public.hosts enable row level security;
alter table public.game_sessions enable row level security;
alter table public.players enable row level security;
alter table public.vocabulary_items enable row level security;
alter table public.vocabulary_pairs enable row level security;
alter table public.games enable row level security;
alter table public.game_layout enable row level security;
alter table public.game_attempts enable row level security;
alter table public.processed_actions enable row level security;
alter table public.grammar_questions enable row level security;
alter table public.game_rounds enable row level security;
alter table public.round_answers enable row level security;

-- Supabase grants table privileges to anon/authenticated by default; remove
-- them and grant back only what is needed.
revoke all on table
	public.hosts, public.game_sessions, public.players, public.vocabulary_items,
	public.vocabulary_pairs, public.games, public.game_layout,
	public.game_attempts, public.processed_actions,
	public.grammar_questions, public.game_rounds, public.round_answers
from public, anon, authenticated;

grant all on table
	public.hosts, public.game_sessions, public.players, public.vocabulary_items,
	public.vocabulary_pairs, public.games, public.game_layout,
	public.game_attempts, public.processed_actions,
	public.grammar_questions, public.game_rounds, public.round_answers
to service_role;

-- Read-only access for the host dashboard. All writes go through functions.
grant select on table public.hosts, public.game_sessions, public.players to authenticated;

drop policy if exists "hosts: read own row" on public.hosts;
create policy "hosts: read own row" on public.hosts
	for select to authenticated
	using (id = (select auth.uid()));

drop policy if exists "game_sessions: host reads own sessions" on public.game_sessions;
create policy "game_sessions: host reads own sessions" on public.game_sessions
	for select to authenticated
	using (host_id = (select auth.uid()));

drop policy if exists "players: host reads own sessions' players" on public.players;
create policy "players: host reads own sessions' players" on public.players
	for select to authenticated
	using (
		exists (
			select 1 from public.game_sessions s
			where s.id = players.session_id and s.host_id = (select auth.uid())
		)
	);

drop policy if exists "players: player reads own row" on public.players;
create policy "players: player reads own row" on public.players
	for select to authenticated
	using (user_id = (select auth.uid()));

-- vocabulary_items, vocabulary_pairs, games, game_layout, game_attempts,
-- processed_actions, grammar_questions, game_rounds and round_answers
-- intentionally have NO policies and NO grants for anon/authenticated: RLS
-- denies everything. Clients receive the permitted subset only through
-- public.get_session_view() and the action functions below.

-- -----------------------------------------------------------------------------
-- Private helpers
-- -----------------------------------------------------------------------------

create or replace function private.is_anonymous()
returns boolean
language sql
stable
set search_path = ''
as $$
	select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function private.generate_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
	v_alphabet text := private.join_code_alphabet();
	v_bytes bytea := uuid_send(gen_random_uuid());
	v_code text := '';
	i int;
begin
	-- Bytes 0..5 of a v4 UUID are fully random.
	for i in 0..5 loop
		v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
	end loop;
	return v_code;
end;
$$;

-- Increment the session revision and publish a minimal Realtime notification.
create or replace function private.bump_revision(p_session_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_revision bigint;
begin
	update public.game_sessions
	set revision = revision + 1
	where id = p_session_id
	returning revision into v_revision;

	perform realtime.send(
		jsonb_build_object('session_id', p_session_id, 'revision', v_revision),
		'state',
		'session:' || p_session_id::text,
		true
	);

	return v_revision;
end;
$$;

-- Next non-removed player after p_current in the fixed turn order (wrapping).
-- Returns p_current itself only if it is the sole active player, or null if
-- nobody is active.
create or replace function private.next_player(p_turn_order uuid[], p_current uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_n int := cardinality(p_turn_order);
	v_idx int := coalesce(array_position(p_turn_order, p_current), 0);
	v_candidate uuid;
	k int;
begin
	for k in 1..v_n loop
		v_candidate := p_turn_order[((v_idx - 1 + k) % v_n) + 1];
		if exists (select 1 from public.players where id = v_candidate and status = 'active') then
			return v_candidate;
		end if;
	end loop;
	return null;
end;
$$;

-- The winners of a game (spec 10, 23.3). Removed players keep their points but
-- cannot win.
--   * Without groups: the active players with the highest score.
--   * With groups: the groups with the most points per member (the same order
--     as the group totals when groups are equally large; fair when they are
--     not), and the active members of those groups. Every member's points
--     count for their group, including members removed during the game; a
--     group without active members cannot win.
create or replace function private.decide_winners(
	p_session_id uuid,
	out winner_ids uuid[],
	out winning_groups smallint[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_group_count smallint;
begin
	select s.group_count into v_group_count from public.game_sessions s where s.id = p_session_id;

	if coalesce(v_group_count, 1) <= 1 then
		winning_groups := '{}';
		select coalesce(array_agg(p.id order by p.joined_at, p.id), '{}')
		into winner_ids
		from public.players p
		where p.session_id = p_session_id
			and p.status = 'active'
			and p.score = (
				select max(q.score) from public.players q
				where q.session_id = p_session_id and q.status = 'active'
			);
		return;
	end if;

	with group_scores as (
		select p.group_number as g, sum(p.score)::numeric / count(*) as per_member
		from public.players p
		where p.session_id = p_session_id and p.group_number is not null
		group by p.group_number
		having bool_or(p.status = 'active')
	)
	select coalesce(array_agg(gs.g order by gs.g), '{}')
	into winning_groups
	from group_scores gs
	where gs.per_member = (select max(x.per_member) from group_scores x);

	select coalesce(array_agg(p.id order by p.joined_at, p.id), '{}')
	into winner_ids
	from public.players p
	where p.session_id = p_session_id and p.status = 'active' and p.group_number = any (winning_groups);
end;
$$;

-- Mark the game and session completed. Caller holds the session row lock.
create or replace function private.complete_game(p_session_id uuid, p_reason public.game_end_reason)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_winners record;
begin
	select * into v_winners from private.decide_winners(p_session_id);

	update public.games
	set status = 'completed',
		end_reason = p_reason,
		winner_ids = v_winners.winner_ids,
		winning_groups = v_winners.winning_groups,
		active_player_id = null,
		first_flip = null,
		mismatch_positions = null,
		reveal_until = null,
		ended_at = now()
	where session_id = p_session_id and status = 'active';

	update public.game_sessions
	set status = 'completed', ended_at = now()
	where id = p_session_id and status = 'in_progress';
end;
$$;

-- Fill in the Blanks: close the current round and show its answer until
-- reveal_until. Caller holds the session row lock; no-op if already closed.
create or replace function private.close_round(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_game public.games%rowtype;
begin
	select * into v_game from public.games where id = p_game_id for update;
	if v_game.status <> 'active' or v_game.reveal_until is not null then
		return;
	end if;
	update public.game_rounds set closed_at = now()
	where game_id = p_game_id and round = v_game.current_round;
	update public.games set reveal_until = now() + private.round_reveal_interval()
	where id = p_game_id;
end;
$$;

-- Fill in the Blanks: close the current round once every active player has
-- answered it. Returns true if it closed the round.
create or replace function private.close_round_if_complete(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_game public.games%rowtype;
begin
	select * into v_game from public.games where id = p_game_id;
	if v_game.status <> 'active' or v_game.reveal_until is not null then
		return false;
	end if;
	if exists (
		select 1 from public.players p
		where p.session_id = v_game.session_id and p.status = 'active'
			and not exists (
				select 1 from public.round_answers a
				where a.game_id = p_game_id and a.round = v_game.current_round and a.player_id = p.id
			)
	) then
		return false;
	end if;
	perform private.close_round(p_game_id);
	return true;
end;
$$;

-- Lazily resolve an overdue reveal (spec 9.4, 23.4). Must be called while
-- holding the session row lock. Performs at most one transition and clears the
-- deadline, so calling it again immediately is a no-op (idempotent). Returns
-- true if state changed.
--   * Matchen: a mismatch reveal ended, the cards turn face down and the turn
--     passes on.
--   * Fill in the Blanks: the answer reveal ended, the next round starts, or
--     the game ends after the last round.
-- There is no turn timer (spec 23.1).
create or replace function private.resolve_overdue(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_game public.games%rowtype;
begin
	select * into v_game
	from public.games
	where session_id = p_session_id and status = 'active'
	for update;

	if not found or v_game.reveal_until is null or v_game.reveal_until > now() then
		return false;
	end if;

	if v_game.mismatch_positions is not null then
		update public.games
		set mismatch_positions = null,
			reveal_until = null,
			active_player_id = private.next_player(v_game.turn_order, v_game.active_player_id)
		where id = v_game.id;
	else
		if v_game.current_round + 1 >= v_game.pair_count then
			perform private.complete_game(p_session_id, 'all_rounds_played');
		else
			update public.games
			set current_round = current_round + 1, reveal_until = null
			where id = v_game.id;
		end if;
	end if;

	perform private.bump_revision(p_session_id);
	return true;
end;
$$;

-- Content of one card face. Only ever called for positions the caller may see.
create or replace function private.card_face(p_pair_id uuid, p_side smallint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select case f.kind
		when 'image' then jsonb_strip_nulls(jsonb_build_object(
			'kind', 'image', 'emoji', i.emoji, 'image_path', i.image_path))
		when 'word' then jsonb_build_object('kind', 'word', 'word', i.word)
		when 'article_word' then jsonb_build_object('kind', 'article_word', 'article', i.article, 'word', i.word)
	end
	from public.vocabulary_pairs p
	cross join lateral (
		select
			case when p_side = 0 then p.item_a else p.item_b end as item_id,
			case when p_side = 0 then p.face_a else p.face_b end as kind
	) f
	join public.vocabulary_items i on i.id = f.item_id
	where p.id = p_pair_id
$$;

-- The caller's authorised view of a session (spec 8.2). Returns null when the
-- user is neither the host nor an active player of the session.
create or replace function private.session_view(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_session public.game_sessions%rowtype;
	v_game public.games%rowtype;
	v_role text;
	v_me uuid;
	v_level public.proficiency_level;
	v_players jsonb;
	v_game_json jsonb;
	v_history jsonb;
	v_visible smallint[];
begin
	select * into v_session from public.game_sessions where id = p_session_id;
	if not found or p_user_id is null then
		return null;
	end if;

	if v_session.host_id = p_user_id then
		v_role := 'host';
	else
		select id, level into v_me, v_level
		from public.players
		where session_id = p_session_id and user_id = p_user_id and status = 'active';
		if v_me is null then
			return null;
		end if;
		v_role := 'player';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', p.id,
			'nickname', p.nickname,
			'avatar', p.avatar,
			'level', p.level,
			'status', p.status,
			'score', p.score,
			'total_score', p.carried_score + p.score,
			'group', p.group_number,
			'joined_at', p.joined_at
		) order by p.joined_at, p.id), '[]'::jsonb)
	into v_players
	from public.players p
	where p.session_id = p_session_id;

	-- Finished games of the session, oldest first (results only, no content).
	select coalesce(jsonb_agg(jsonb_build_object(
			'number', g.game_number,
			'mode', g.mode,
			'variant', g.variant,
			'pair_count', g.pair_count,
			'group_count', g.group_count,
			'end_reason', g.end_reason,
			'winner_ids', to_jsonb(g.winner_ids),
			'winning_groups', to_jsonb(g.winning_groups),
			'ended_at', g.ended_at
		) order by g.game_number), '[]'::jsonb)
	into v_history
	from public.games g
	where g.session_id = p_session_id and g.status = 'completed';

	-- The current game: none while the session is in the lobby, otherwise the
	-- latest one (active, or just finished).
	if v_session.status <> 'lobby' then
		select * into v_game from public.games
		where session_id = p_session_id
		order by game_number desc
		limit 1;
	end if;
	if v_game.id is not null then
		v_game_json := jsonb_build_object(
			'number', v_game.game_number,
			'status', v_game.status,
			'turn_order', to_jsonb(v_game.turn_order),
			'active_player_id', v_game.active_player_id,
			'reveal_until', v_game.reveal_until,
			'end_reason', v_game.end_reason,
			'winner_ids', to_jsonb(v_game.winner_ids),
			'winning_groups', to_jsonb(v_game.winning_groups),
			'started_at', v_game.started_at,
			'ended_at', v_game.ended_at
		);

		if v_game.mode = 'matchen' then
			-- Visible positions: matched, or flipped in the current attempt /
			-- pending mismatch reveal. Nothing else is ever revealed.
			select coalesce(array_agg(l.position), '{}')
			into v_visible
			from public.game_layout l
			where l.game_id = v_game.id and l.matched_at is not null;

			if v_game.first_flip is not null then
				v_visible := v_visible || v_game.first_flip;
			end if;
			if v_game.mismatch_positions is not null then
				v_visible := v_visible || v_game.mismatch_positions;
			end if;

			v_game_json := v_game_json || jsonb_build_object(
				'card_count', v_game.pair_count * 2,
				'first_flip', v_game.first_flip,
				'mismatch_positions', to_jsonb(v_game.mismatch_positions),
				'faces', (
					select coalesce(jsonb_object_agg(l.position::text, private.card_face(l.pair_id, l.side)), '{}'::jsonb)
					from public.game_layout l
					where l.game_id = v_game.id and l.position = any (v_visible)
				),
				-- Matched position -> player who found the pair.
				'matched', (
					select coalesce(jsonb_object_agg(l.position::text, l.matched_by), '{}'::jsonb)
					from public.game_layout l
					where l.game_id = v_game.id and l.matched_at is not null
				),
				'last_attempt', (
					select jsonb_build_object(
						'player_id', a.player_id,
						'first_position', a.first_position,
						'second_position', a.second_position,
						'outcome', a.outcome,
						'at', a.created_at
					)
					from public.game_attempts a
					where a.game_id = v_game.id
					order by a.id desc
					limit 1
				),
				'round', null
			);
		else
			v_game_json := v_game_json || jsonb_build_object(
				'card_count', 0,
				'first_flip', null,
				'mismatch_positions', null,
				'faces', '{}'::jsonb,
				'matched', '{}'::jsonb,
				'last_attempt', null,
				'round', case when v_game.status = 'active' then (
					select jsonb_build_object(
						'index', r.round,
						'count', v_game.pair_count,
						'phase', case when r.closed_at is null then 'answering' else 'reveal' end,
						'sentence', q.sentence,
						'translation', q.translation,
						'topic', q.topic,
						-- Multiple choice for Beginner/Elementary players (and the host);
						-- Intermediate/Advanced players type the answer and get no options.
						'answer_mode', case
							when v_role = 'host' then null
							when v_level in ('beginner', 'elementary') then 'choice'
							else 'type'
						end,
						'options', case
							when v_role = 'host' or v_level in ('beginner', 'elementary') then to_jsonb(r.options)
						end,
						'answered', (
							select coalesce(jsonb_agg(a.player_id order by a.answered_at, a.player_id), '[]'::jsonb)
							from public.round_answers a
							where a.game_id = v_game.id and a.round = r.round
						),
						'my_answer', (
							select a.answer from public.round_answers a
							where a.game_id = v_game.id and a.round = r.round and a.player_id = v_me
						),
						-- The answer and who got it right only once the round is closed.
						'correct_answer', case when r.closed_at is not null then q.answer end,
						'results', case when r.closed_at is not null then (
							select coalesce(jsonb_object_agg(a.player_id::text, a.correct), '{}'::jsonb)
							from public.round_answers a
							where a.game_id = v_game.id and a.round = r.round
						) end
					)
					from public.game_rounds r
					join public.grammar_questions q on q.id = r.question_id
					where r.game_id = v_game.id and r.round = v_game.current_round
				) end
			);
		end if;
	end if;

	return jsonb_build_object(
		'revision', v_session.revision,
		'server_now', clock_timestamp(),
		'role', v_role,
		'me', v_me,
		'session', jsonb_build_object(
			'id', v_session.id,
			'name', v_session.name,
			'join_code', v_session.join_code,
			'scheduled_at', v_session.scheduled_at,
			'mode', v_session.mode,
			'variant', v_session.variant,
			'pair_count', v_session.pair_count,
			'group_count', v_session.group_count,
			'status', v_session.status,
			'created_at', v_session.created_at,
			'started_at', v_session.started_at,
			'ended_at', v_session.ended_at
		),
		'players', v_players,
		'game', v_game_json,
		'history', v_history
	);
end;
$$;

-- Standard RPC result: {ok, error, view}. The view is the caller's current
-- authorised view so that clients can reconcile even after a rejection.
create or replace function private.respond(p_session_id uuid, p_error text default null, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'ok', p_error is null,
		'error', p_error,
		'view', private.session_view(p_session_id, auth.uid())
	) || coalesce(p_extra, '{}'::jsonb)
$$;

create or replace function private.fail(p_error text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
	select jsonb_build_object('ok', false, 'error', p_error, 'view', null)
$$;

-- Validate a game's settings; returns the error code, or null if they are
-- valid. p_variant is required for Matchen and ignored for Fill in the Blanks;
-- p_pair_count is pairs or sentences.
create or replace function private.game_config_error(
	p_mode text,
	p_variant text,
	p_pair_count integer,
	p_group_count integer
)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when p_mode is null or p_mode not in ('matchen', 'fill_blanks') then 'invalid_mode'
		when p_mode = 'matchen' and (p_variant is null
			or p_variant not in ('image_pairs', 'word_image', 'de_het', 'opposites')) then 'invalid_variant'
		when p_pair_count is null or p_pair_count not in (6, 8, 12) then 'invalid_pair_count'
		when p_group_count is null or p_group_count < 1 or p_group_count > private.max_groups() then 'invalid_group_count'
	end
$$;

-- Realtime authorisation helper: host or active player of the session named
-- by a "session:<uuid>" topic.
create or replace function private.can_use_session_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session_id uuid;
begin
	if v_uid is null or p_topic is null
		or p_topic !~ '^session:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
		return false;
	end if;
	v_session_id := substr(p_topic, 9)::uuid;
	return exists (
			select 1 from public.game_sessions s
			where s.id = v_session_id and s.host_id = v_uid
		)
		or exists (
			select 1 from public.players p
			where p.session_id = v_session_id and p.user_id = v_uid and p.status = 'active'
		);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public RPC functions (the only write path for clients)
-- -----------------------------------------------------------------------------

-- Host: create a session (spec 5.3, 23). p_variant is required for Matchen and
-- ignored for Fill in the Blanks; p_pair_count is pairs or sentences.
create or replace function public.create_session(
	p_name text,
	p_mode text,
	p_variant text,
	p_pair_count integer,
	p_group_count integer default 1,
	p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_name text := btrim(coalesce(p_name, ''));
	v_error text := private.game_config_error(p_mode, p_variant, p_pair_count, p_group_count);
	v_variant public.game_variant;
	v_id uuid;
	v_code text;
	v_attempt int := 0;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;
	if private.is_anonymous() then
		return private.fail('not_host');
	end if;
	if char_length(v_name) < 1 or char_length(v_name) > 60 then
		return private.fail('invalid_session_name');
	end if;
	if v_error is not null then
		return private.fail(v_error);
	end if;
	if p_mode = 'matchen' then
		v_variant := p_variant::public.game_variant;
	end if;

	insert into public.hosts (id) values (v_uid) on conflict (id) do nothing;

	loop
		v_attempt := v_attempt + 1;
		v_code := private.generate_join_code();
		begin
			insert into public.game_sessions (host_id, name, join_code, scheduled_at, mode, variant, pair_count, group_count)
			values (v_uid, v_name, v_code, p_scheduled_at, p_mode::public.game_mode, v_variant, p_pair_count, p_group_count)
			returning id into v_id;
			exit;
		exception when unique_violation then
			if v_attempt >= 25 then
				raise;
			end if;
		end;
	end loop;

	return jsonb_build_object('ok', true, 'error', null, 'session_id', v_id, 'join_code', v_code);
end;
$$;

-- Anyone (including unauthenticated visitors) may look up a session by its
-- exact join code to validate it before onboarding (spec 6.1). Returns only
-- what the join screen needs.
create or replace function public.lookup_session(p_join_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_code text := upper(btrim(coalesce(p_join_code, '')));
	v_session public.game_sessions%rowtype;
	v_membership text := 'none';
	v_player public.players%rowtype;
begin
	if v_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
		return private.fail('invalid_join_code');
	end if;

	select * into v_session from public.game_sessions where join_code = v_code;
	if not found then
		return private.fail('session_not_found');
	end if;

	if v_uid is not null then
		if v_session.host_id = v_uid then
			v_membership := 'host';
		else
			select * into v_player from public.players
			where session_id = v_session.id and user_id = v_uid;
			if found then
				v_membership := case when v_player.status = 'active' then 'player' else 'removed' end;
			end if;
		end if;
	end if;

	return jsonb_build_object(
		'ok', true,
		'error', null,
		'membership', v_membership,
		'session', jsonb_build_object(
			'id', v_session.id,
			'name', v_session.name,
			'join_code', v_session.join_code,
			'mode', v_session.mode,
			'variant', v_session.variant,
			'pair_count', v_session.pair_count,
			'group_count', v_session.group_count,
			'status', v_session.status,
			'scheduled_at', v_session.scheduled_at
		)
	);
end;
$$;

-- Player: join a session in the lobby (spec 6.1, 6.2).
create or replace function public.join_session(
	p_join_code text,
	p_nickname text,
	p_avatar text,
	p_level text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_code text := upper(btrim(coalesce(p_join_code, '')));
	v_nickname text := btrim(coalesce(p_nickname, ''));
	v_session public.game_sessions%rowtype;
	v_existing public.players%rowtype;
	v_player_id uuid;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;
	if v_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
		return private.fail('invalid_join_code');
	end if;

	select * into v_session from public.game_sessions where join_code = v_code for update;
	if not found then
		return private.fail('session_not_found');
	end if;
	if v_session.host_id = v_uid then
		return private.fail('is_host');
	end if;

	select * into v_existing from public.players where session_id = v_session.id and user_id = v_uid;
	if found then
		if v_existing.status = 'removed' then
			return private.fail('removed');
		end if;
		-- Already joined (e.g. refresh, second tab): recover the existing player.
		return jsonb_build_object('ok', true, 'error', null, 'session_id', v_session.id,
			'player_id', v_existing.id, 'already_joined', true);
	end if;

	if v_session.status = 'completed' then
		return private.fail('session_completed');
	end if;
	if v_session.status <> 'lobby' then
		return private.fail('session_in_progress');
	end if;

	if char_length(v_nickname) < 1 or char_length(v_nickname) > 20 or v_nickname ~ '[[:cntrl:]]' then
		return private.fail('invalid_nickname');
	end if;
	if p_avatar is null or not (p_avatar = any (private.allowed_avatars())) then
		return private.fail('invalid_avatar');
	end if;
	if p_level is null or p_level not in ('beginner', 'elementary', 'intermediate', 'advanced') then
		return private.fail('invalid_level');
	end if;
	if exists (
		select 1 from public.players
		where session_id = v_session.id and status = 'active' and lower(nickname) = lower(v_nickname)
	) then
		return private.fail('nickname_taken');
	end if;

	begin
		insert into public.players (session_id, user_id, nickname, avatar, level)
		values (v_session.id, v_uid, v_nickname, p_avatar, p_level::public.proficiency_level)
		returning id into v_player_id;
	exception when unique_violation then
		return private.fail('nickname_taken');
	end;

	perform private.bump_revision(v_session.id);

	return jsonb_build_object('ok', true, 'error', null, 'session_id', v_session.id,
		'player_id', v_player_id, 'already_joined', false);
end;
$$;

-- Host or player: fetch the caller's authorised view. Resolves overdue
-- deadlines first (spec 9.4 step 2), so this is a volatile "read".
create or replace function public.get_session_view(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
	v_player public.players%rowtype;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id;
	if not found then
		return private.fail('session_not_found');
	end if;

	if v_session.host_id <> v_uid then
		select * into v_player from public.players where session_id = p_session_id and user_id = v_uid;
		if not found then
			return private.fail('forbidden');
		end if;
		if v_player.status = 'removed' then
			return private.fail('removed');
		end if;
	end if;

	if v_session.status = 'in_progress' and exists (
		select 1 from public.games g
		where g.session_id = p_session_id and g.status = 'active' and g.reveal_until <= now()
	) then
		perform 1 from public.game_sessions where id = p_session_id for update;
		perform private.resolve_overdue(p_session_id);
	end if;

	return private.respond(p_session_id);
end;
$$;

-- Host: start the session's next game (spec 6.4, 8.1, 23). Initialisation is atomic: an
-- unexpected failure raises and rolls back the whole transaction; business
-- errors are returned before anything is written.
create or replace function public.start_game(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
	v_player_ids uuid[];
	v_selected uuid[] := '{}';
	v_used text[] := '{}';
	v_tokens text[];
	v_game_id uuid;
	r record;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;
	if v_session.host_id <> v_uid then
		return private.fail('not_host');
	end if;
	if v_session.status <> 'lobby' then
		return private.respond(p_session_id, 'session_not_in_lobby');
	end if;

	-- Random, server-side order over all eligible (non-removed) players.
	select coalesce(array_agg(p.id order by gen_random_uuid()), '{}')
	into v_player_ids
	from public.players p
	where p.session_id = p_session_id and p.status = 'active';

	if cardinality(v_player_ids) < 2 then
		return private.respond(p_session_id, 'not_enough_players');
	end if;
	if cardinality(v_player_ids) < v_session.group_count then
		return private.respond(p_session_id, 'not_enough_players_for_groups');
	end if;

	if v_session.mode = 'fill_blanks' then
		select coalesce(array_agg(q.id), '{}')
		into v_selected
		from (
			select q.id from public.grammar_questions q
			where q.active
			order by gen_random_uuid()
			limit v_session.pair_count
		) q;

		if cardinality(v_selected) < v_session.pair_count then
			return private.respond(p_session_id, 'not_enough_questions');
		end if;
	else
		-- Select random valid pairs; no two pairs may share an emoji or a word.
		for r in
			select p.id,
				ia.emoji as emoji_a, ia.word as word_a,
				ib.emoji as emoji_b, ib.word as word_b
			from public.vocabulary_pairs p
			join public.vocabulary_items ia on ia.id = p.item_a
			join public.vocabulary_items ib on ib.id = p.item_b
			where p.variant = v_session.variant and p.active and ia.active and ib.active
			order by gen_random_uuid()
		loop
			v_tokens := array_remove(array[
				'e:' || r.emoji_a, 'w:' || lower(r.word_a),
				'e:' || r.emoji_b, 'w:' || lower(r.word_b)
			], null);
			if not (v_tokens && v_used) then
				v_selected := v_selected || r.id;
				v_used := v_used || v_tokens;
				exit when cardinality(v_selected) = v_session.pair_count;
			end if;
		end loop;

		if cardinality(v_selected) < v_session.pair_count then
			return private.respond(p_session_id, 'not_enough_vocabulary');
		end if;
	end if;

	-- Groups: deal the shuffled players round-robin, so groups differ in size
	-- by at most one and the turn order alternates between groups.
	update public.players p
	set group_number = case
		when v_session.group_count > 1 then ((o.ord - 1) % v_session.group_count + 1)::smallint
	end
	from unnest(v_player_ids) with ordinality as o (player_id, ord)
	where p.id = o.player_id;

	insert into public.games (
		session_id, game_number, mode, variant, pair_count, group_count,
		turn_order, active_player_id, current_round
	)
	values (
		p_session_id,
		coalesce((select max(g.game_number) from public.games g where g.session_id = p_session_id), 0) + 1,
		v_session.mode,
		v_session.variant,
		v_session.pair_count,
		v_session.group_count,
		v_player_ids,
		case when v_session.mode = 'matchen' then v_player_ids[1] end,
		case when v_session.mode = 'fill_blanks' then 0 end
	)
	returning id into v_game_id;

	if v_session.mode = 'fill_blanks' then
		-- Rounds in random order; each round's four options shuffled once.
		insert into public.game_rounds (game_id, round, question_id, options)
		select v_game_id,
			(o.ord - 1)::smallint,
			q.id,
			(select array_agg(x order by gen_random_uuid()) from unnest(array[q.answer] || q.distractors) as x)
		from unnest(v_selected) with ordinality as o (question_id, ord)
		join public.grammar_questions q on q.id = o.question_id;
	else
		-- One shuffled layout shared by all players: both sides of every pair.
		insert into public.game_layout (game_id, position, pair_id, side)
		select v_game_id,
			(row_number() over (order by gen_random_uuid()) - 1)::smallint,
			sel.pair_id,
			sides.side
		from unnest(v_selected) as sel (pair_id)
		cross join (values (0::smallint), (1::smallint)) as sides (side);

		-- Invariants: exactly 2 * pair_count positions, every pair exactly twice.
		if (select count(*) from public.game_layout where game_id = v_game_id) <> v_session.pair_count * 2
			or exists (
				select 1 from public.game_layout where game_id = v_game_id
				group by pair_id having count(*) <> 2
			) then
			raise exception 'board layout invariant violated';
		end if;
	end if;

	update public.game_sessions
	set status = 'in_progress', started_at = now()
	where id = p_session_id;

	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Player: flip one card on the shared Matchen board (spec 8.3, 9.2–9.4, 23.2).
create or replace function public.flip_card(
	p_session_id uuid,
	p_position integer,
	p_action_id uuid,
	p_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
	v_player public.players%rowtype;
	v_game public.games%rowtype;
	v_pair_first uuid;
	v_pair_second uuid;
	v_remaining int;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;
	if p_session_id is null or p_position is null or p_action_id is null or p_revision is null then
		return private.fail('invalid_input');
	end if;

	-- Serialise every action on this session.
	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;

	select * into v_player from public.players where session_id = p_session_id and user_id = v_uid;
	if not found then
		return private.fail('forbidden');
	end if;
	if v_player.status = 'removed' then
		return private.fail('removed');
	end if;

	perform private.resolve_overdue(p_session_id);

	if exists (select 1 from public.processed_actions where action_id = p_action_id) then
		return private.respond(p_session_id, 'duplicate_action');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id;
	if v_session.status <> 'in_progress' then
		return private.respond(p_session_id, 'game_not_active');
	end if;
	if v_session.mode <> 'matchen' then
		return private.respond(p_session_id, 'wrong_game_mode');
	end if;
	select * into v_game from public.games where session_id = p_session_id and status = 'active';

	if p_revision <> v_session.revision then
		return private.respond(p_session_id, 'stale_state');
	end if;
	if v_game.active_player_id is distinct from v_player.id then
		return private.respond(p_session_id, 'not_your_turn');
	end if;
	if v_game.mismatch_positions is not null then
		return private.respond(p_session_id, 'reveal_pending');
	end if;
	if p_position < 0 or p_position >= v_session.pair_count * 2 then
		return private.respond(p_session_id, 'invalid_position');
	end if;
	if exists (
		select 1 from public.game_layout
		where game_id = v_game.id and position = p_position and matched_at is not null
	) then
		return private.respond(p_session_id, 'already_matched');
	end if;
	if v_game.first_flip = p_position then
		return private.respond(p_session_id, 'already_flipped');
	end if;

	insert into public.processed_actions (action_id, game_id, player_id)
	values (p_action_id, v_game.id, v_player.id);

	if v_game.first_flip is null then
		-- First flip: reveal to everyone, remember it as pending.
		update public.games set first_flip = p_position where id = v_game.id;
	else
		select pair_id into v_pair_first from public.game_layout
		where game_id = v_game.id and position = v_game.first_flip;
		select pair_id into v_pair_second from public.game_layout
		where game_id = v_game.id and position = p_position;

		if v_pair_first = v_pair_second then
			-- Match: the pair stays face up on the shared board for everyone,
			-- credited to this player, +1 point.
			update public.game_layout
			set matched_by = v_player.id, matched_at = now()
			where game_id = v_game.id and position in (v_game.first_flip, p_position);

			update public.players set score = score + 1 where id = v_player.id;

			insert into public.game_attempts (game_id, player_id, first_position, second_position, outcome)
			values (v_game.id, v_player.id, v_game.first_flip, p_position, 'match');

			select count(*) into v_remaining
			from public.game_layout
			where game_id = v_game.id and matched_at is null;

			if v_remaining = 0 then
				-- Every pair found: the game ends; highest score (or group) wins.
				perform private.complete_game(p_session_id, 'board_cleared');
			else
				-- Same player goes again.
				update public.games set first_flip = null where id = v_game.id;
			end if;
		else
			-- Mismatch: both stay visible until reveal_until, then turn passes.
			insert into public.game_attempts (game_id, player_id, first_position, second_position, outcome)
			values (v_game.id, v_player.id, v_game.first_flip, p_position, 'mismatch');

			update public.games
			set first_flip = null,
				mismatch_positions = array[v_game.first_flip, p_position]::smallint[],
				reveal_until = now() + private.reveal_interval()
			where id = v_game.id;
		end if;
	end if;

	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Host: end an active game early (spec 9.7). Highest score wins; ties allowed.
create or replace function public.end_game(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;
	if v_session.host_id <> v_uid then
		return private.fail('not_host');
	end if;
	if v_session.status = 'completed' then
		return private.respond(p_session_id, 'session_completed');
	end if;
	if v_session.status <> 'in_progress' then
		return private.respond(p_session_id, 'game_not_active');
	end if;

	perform private.complete_game(p_session_id, 'ended_by_host');
	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Host: set up the session's next game (any mode), keeping the players.
--   * After a game has finished: every player's points move into their
--     running session total (carried_score), scores and groups are reset and
--     the session returns to the lobby with the new settings. The finished
--     game keeps its result. New players can join until the host starts.
--   * In the lobby: only the settings change.
-- Not allowed while a game is in progress.
create or replace function public.configure_game(
	p_session_id uuid,
	p_mode text,
	p_variant text,
	p_pair_count integer,
	p_group_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
	v_error text := private.game_config_error(p_mode, p_variant, p_pair_count, p_group_count);
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;
	if v_session.host_id <> v_uid then
		return private.fail('not_host');
	end if;
	if v_session.status = 'in_progress' then
		return private.respond(p_session_id, 'game_in_progress');
	end if;
	if v_error is not null then
		return private.respond(p_session_id, v_error);
	end if;

	if v_session.status = 'completed' then
		update public.players
		set carried_score = carried_score + score, score = 0, group_number = null
		where session_id = p_session_id;
	end if;

	update public.game_sessions
	set mode = p_mode::public.game_mode,
		variant = case when p_mode = 'matchen' then p_variant::public.game_variant end,
		pair_count = p_pair_count,
		group_count = p_group_count,
		status = 'lobby',
		started_at = null,
		ended_at = null
	where id = p_session_id;

	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Player: answer the current Fill in the Blanks round (spec 23.4). One answer
-- per player per round, final once submitted. Beginner and Elementary players
-- must pick one of the round's options; the others type the answer.
create or replace function public.submit_answer(p_session_id uuid, p_round integer, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
	v_player public.players%rowtype;
	v_game public.games%rowtype;
	v_round public.game_rounds%rowtype;
	v_answer text := btrim(coalesce(p_answer, ''));
	v_correct_answer text;
	v_correct boolean;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;
	if p_session_id is null or p_round is null then
		return private.fail('invalid_input');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;

	select * into v_player from public.players where session_id = p_session_id and user_id = v_uid;
	if not found then
		return private.fail('forbidden');
	end if;
	if v_player.status = 'removed' then
		return private.fail('removed');
	end if;

	perform private.resolve_overdue(p_session_id);

	select * into v_session from public.game_sessions where id = p_session_id;
	if v_session.status <> 'in_progress' then
		return private.respond(p_session_id, 'game_not_active');
	end if;
	if v_session.mode <> 'fill_blanks' then
		return private.respond(p_session_id, 'wrong_game_mode');
	end if;
	select * into v_game from public.games where session_id = p_session_id and status = 'active';

	if p_round <> v_game.current_round or v_game.reveal_until is not null then
		return private.respond(p_session_id, 'round_closed');
	end if;
	if exists (
		select 1 from public.round_answers
		where game_id = v_game.id and round = v_game.current_round and player_id = v_player.id
	) then
		return private.respond(p_session_id, 'already_answered');
	end if;
	if char_length(v_answer) < 1 or char_length(v_answer) > 60 or v_answer ~ '[[:cntrl:]]' then
		return private.respond(p_session_id, 'invalid_answer');
	end if;

	select * into v_round from public.game_rounds where game_id = v_game.id and round = v_game.current_round;
	select q.answer into v_correct_answer from public.grammar_questions q where q.id = v_round.question_id;

	if v_player.level in ('beginner', 'elementary') and not exists (
		select 1 from unnest(v_round.options) as o where o = v_answer
	) then
		return private.respond(p_session_id, 'invalid_answer');
	end if;

	v_correct := private.normalize_answer(v_answer) = private.normalize_answer(v_correct_answer);

	insert into public.round_answers (game_id, round, player_id, answer, correct)
	values (v_game.id, v_game.current_round, v_player.id, v_answer, v_correct);

	if v_correct then
		update public.players set score = score + 1 where id = v_player.id;
	end if;

	perform private.close_round_if_complete(v_game.id);
	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Host: move a stalled game on (spec 23.1). There is no turn timer, so this is
-- how the host handles a player who is away.
--   * Matchen: the active player's turn ends (a pending first flip turns back)
--     and the next player's turn begins.
--   * Fill in the Blanks: the current round closes now and its answer is shown;
--     players who did not answer score nothing for it.
create or replace function public.skip_turn(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
	v_game public.games%rowtype;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;
	if v_session.host_id <> v_uid then
		return private.fail('not_host');
	end if;
	if v_session.status = 'completed' then
		return private.respond(p_session_id, 'session_completed');
	end if;
	if v_session.status <> 'in_progress' then
		return private.respond(p_session_id, 'game_not_active');
	end if;

	perform private.resolve_overdue(p_session_id);
	select * into v_game from public.games where session_id = p_session_id order by game_number desc limit 1;
	if v_game.status <> 'active' then
		return private.respond(p_session_id);
	end if;

	if v_session.mode = 'matchen' then
		if v_game.mismatch_positions is not null then
			-- The turn is already passing on.
			return private.respond(p_session_id, 'reveal_pending');
		end if;
		insert into public.game_attempts (game_id, player_id, first_position, second_position, outcome)
		values (v_game.id, v_game.active_player_id, v_game.first_flip, null, 'cancelled');
		update public.games
		set first_flip = null,
			active_player_id = private.next_player(v_game.turn_order, v_game.active_player_id)
		where id = v_game.id;
	else
		if v_game.reveal_until is not null then
			-- Round already closed; the next one starts by itself.
			return private.respond(p_session_id);
		end if;
		perform private.close_round(v_game.id);
	end if;

	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Host: remove a participant (spec 6.3, 9.6).
create or replace function public.remove_player(p_session_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
	v_player public.players%rowtype;
	v_game public.games%rowtype;
	v_next uuid;
	v_active_count int;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;
	if v_session.host_id <> v_uid then
		return private.fail('not_host');
	end if;

	select * into v_player from public.players where id = p_player_id and session_id = p_session_id;
	if not found then
		return private.respond(p_session_id, 'player_not_found');
	end if;
	if v_player.status = 'removed' then
		-- Idempotent: already removed.
		return private.respond(p_session_id);
	end if;
	if v_session.status = 'completed' then
		return private.respond(p_session_id, 'session_completed');
	end if;

	if v_session.status = 'in_progress' then
		perform private.resolve_overdue(p_session_id);
	end if;

	update public.players set status = 'removed', removed_at = now() where id = p_player_id;

	if v_session.status = 'in_progress' then
		select * into v_game from public.games where session_id = p_session_id order by game_number desc limit 1 for update;

		if v_session.mode = 'matchen' and v_game.status = 'active' and v_game.active_player_id = p_player_id then
			if v_game.first_flip is not null then
				insert into public.game_attempts (game_id, player_id, first_position, second_position, outcome)
				values (v_game.id, p_player_id, v_game.first_flip, null, 'cancelled');
			end if;
			v_next := private.next_player(v_game.turn_order, p_player_id);
			if v_next is not null then
				update public.games
				set first_flip = null,
					mismatch_positions = null,
					reveal_until = null,
					active_player_id = v_next
				where id = v_game.id;
			end if;
		end if;

		select count(*) into v_active_count
		from public.players
		where session_id = p_session_id and status = 'active';

		if v_active_count < 2 then
			perform private.complete_game(p_session_id, 'not_enough_players');
		elsif v_session.mode = 'fill_blanks' then
			-- The removed player may have been the last one still to answer.
			perform private.close_round_if_complete(v_game.id);
		end if;
	end if;

	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Host: permanently delete a session with everything that belongs to it
-- (players, game, layout, boards, attempts). Allowed in any status. Members are
-- notified first so their open pages refetch and find the session gone.
create or replace function public.delete_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_session public.game_sessions%rowtype;
begin
	if v_uid is null then
		return private.fail('not_authenticated');
	end if;

	select * into v_session from public.game_sessions where id = p_session_id for update;
	if not found then
		return private.fail('session_not_found');
	end if;
	if v_session.host_id <> v_uid then
		return private.fail('not_host');
	end if;

	perform private.bump_revision(p_session_id);
	-- Cascades to players, games, game_layout, game_rounds, round_answers,
	-- game_attempts and processed_actions.
	delete from public.game_sessions where id = p_session_id;

	return jsonb_build_object('ok', true, 'error', null, 'view', null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------

-- Private helpers: owner only, except the Realtime policy helper and the
-- avatar list used by a CHECK constraint.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.can_use_session_topic(text) to authenticated;
-- Used by CHECK constraints (seed data is written by the owner or service_role).
grant execute on function private.allowed_avatars() to service_role;
grant execute on function private.valid_distractors(text, text[]) to service_role;
grant execute on function private.normalize_answer(text) to service_role;

-- Public RPCs: never callable by PUBLIC; anon only for lookup_session.
revoke execute on function public.create_session(text, text, text, integer, integer, timestamptz) from public, anon;
revoke execute on function public.lookup_session(text) from public;
revoke execute on function public.join_session(text, text, text, text) from public, anon;
revoke execute on function public.get_session_view(uuid) from public, anon;
revoke execute on function public.start_game(uuid) from public, anon;
revoke execute on function public.flip_card(uuid, integer, uuid, bigint) from public, anon;
revoke execute on function public.submit_answer(uuid, integer, text) from public, anon;
revoke execute on function public.skip_turn(uuid) from public, anon;
revoke execute on function public.end_game(uuid) from public, anon;
revoke execute on function public.configure_game(uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.remove_player(uuid, uuid) from public, anon;
revoke execute on function public.delete_session(uuid) from public, anon;

grant execute on function public.lookup_session(text) to anon, authenticated;
grant execute on function public.create_session(text, text, text, integer, integer, timestamptz) to authenticated;
grant execute on function public.join_session(text, text, text, text) to authenticated;
grant execute on function public.get_session_view(uuid) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.flip_card(uuid, integer, uuid, bigint) to authenticated;
grant execute on function public.submit_answer(uuid, integer, text) to authenticated;
grant execute on function public.skip_turn(uuid) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
grant execute on function public.configure_game(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.remove_player(uuid, uuid) to authenticated;
grant execute on function public.delete_session(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime authorisation (private Broadcast + Presence, spec 11.3)
--
-- Topic: "session:<session uuid>". Only the session's host and its active
-- (non-removed) players may receive messages or track presence. Clients may
-- NOT send broadcasts; game-state broadcasts are sent by the database via
-- realtime.send() inside the action functions above.
-- In the Supabase dashboard, Realtime settings, disable "Allow public access"
-- so that only private channels can be used.
-- -----------------------------------------------------------------------------

drop policy if exists "rondje: session members receive broadcast and presence" on realtime.messages;
create policy "rondje: session members receive broadcast and presence" on realtime.messages
	for select to authenticated
	using (
		realtime.messages.extension in ('broadcast', 'presence')
		and private.can_use_session_topic((select realtime.topic()))
	);

drop policy if exists "rondje: session members track presence" on realtime.messages;
create policy "rondje: session members track presence" on realtime.messages
	for insert to authenticated
	with check (
		realtime.messages.extension = 'presence'
		and private.can_use_session_topic((select realtime.topic()))
	);
