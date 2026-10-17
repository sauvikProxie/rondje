-- =============================================================================
-- Rondje — database schema (Supabase PostgreSQL)
--
-- Apply to a NEW Supabase project with the SQL editor or `psql`, then apply
-- `supabase/seed.sql`. The script is written to be re-runnable (create-if-not-
-- exists / create-or-replace), but it is intended for a fresh project: it does
-- not migrate or drop any pre-existing Rondje schema.
--
-- Design summary (see docs/rondje-spec.md sections 8, 9, 11, 14, 15):
--   * All state changes go through SECURITY DEFINER functions in `public` that
--     authenticate the caller with auth.uid(), validate the request, lock the
--     session row (SELECT ... FOR UPDATE) and perform the transition atomically.
--   * Business errors are returned as {"ok": false, "error": "<code>"} instead
--     of being raised, so that a lazy deadline resolution performed at the start
--     of a rejected action is still committed.
--   * Clients have no direct access to the board layout, vocabulary, game,
--     board-cell, attempt or action tables. Card content leaves the database
--     only through private.session_view(), which reveals a position only while
--     it is flipped in the current attempt or after it has been matched.
--   * Every committed change increments game_sessions.revision and sends a
--     Realtime broadcast {session_id, revision} on the private topic
--     "session:<uuid>". Broadcast payloads never contain card content.
--   * Timing is serverless-safe: mismatch reveals and turn deadlines are stored
--     as database-clock timestamps and resolved lazily and idempotently by
--     private.resolve_overdue() under the session row lock.
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
	create type public.game_end_reason as enum ('board_cleared', 'ended_by_host', 'not_enough_players');
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

-- Turn time limit: 60 seconds (spec 9.5).
create or replace function private.turn_time_limit()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '60 seconds' $$;

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

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- 14.1 Hosts: references Supabase Auth users that created at least one session.
-- No credentials are stored here; Supabase Auth is the source of truth.
create table if not exists public.hosts (
	id uuid primary key references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

-- 14.2 Game sessions: one session = one Matchen game = one shared table.
create table if not exists public.game_sessions (
	id uuid primary key default gen_random_uuid(),
	host_id uuid not null references public.hosts (id) on delete cascade,
	name text not null,
	join_code text not null,
	scheduled_at timestamptz,
	variant public.game_variant not null,
	pair_count smallint not null,
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
	-- 14.8 Scores: one point per matched pair, written only by flip_card().
	score integer not null default 0,
	joined_at timestamptz not null default now(),
	removed_at timestamptz,
	constraint players_session_user_key unique (session_id, user_id),
	constraint players_nickname_length check (
		nickname = btrim(nickname) and char_length(nickname) between 1 and 20
	),
	constraint players_avatar_allowed check (avatar = any (private.allowed_avatars())),
	constraint players_score_range check (score between 0 and 12),
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

-- 14.6 Game state: authoritative state of the session's single game.
create table if not exists public.games (
	id uuid primary key default gen_random_uuid(),
	session_id uuid not null references public.game_sessions (id) on delete cascade,
	status public.game_status not null default 'active',
	-- Fixed random turn order (player ids); removed players are skipped.
	turn_order uuid[] not null,
	active_player_id uuid references public.players (id) on delete set null,
	-- Pending first flip of the current attempt (board position).
	first_flip smallint,
	-- Pending mismatch reveal: the two positions, visible until reveal_until.
	mismatch_positions smallint[],
	reveal_until timestamptz,
	turn_until timestamptz,
	end_reason public.game_end_reason,
	winner_ids uuid[] not null default '{}',
	started_at timestamptz not null default now(),
	ended_at timestamptz,
	constraint games_session_key unique (session_id),
	constraint games_turn_order_size check (cardinality(turn_order) >= 2),
	constraint games_mismatch_shape check (
		(mismatch_positions is null and reveal_until is null)
		or (cardinality(mismatch_positions) = 2 and reveal_until is not null and first_flip is null)
	),
	constraint games_completion check (
		(status = 'active' and end_reason is null and ended_at is null and active_player_id is not null)
		or (status = 'completed' and end_reason is not null and ended_at is not null
			and first_flip is null and mismatch_positions is null and turn_until is null)
	)
);

-- 14.7 Board layout: stored ONCE per game. Never readable by clients.
create table if not exists public.game_layout (
	game_id uuid not null references public.games (id) on delete cascade,
	position smallint not null,
	pair_id uuid not null references public.vocabulary_pairs (id) on delete restrict,
	-- 0 = (item_a, face_a), 1 = (item_b, face_b)
	side smallint not null,
	primary key (game_id, position),
	constraint game_layout_position_range check (position between 0 and 23),
	constraint game_layout_side check (side in (0, 1)),
	-- Each side of each pair appears exactly once => every pair exactly twice.
	constraint game_layout_pair_side_key unique (game_id, pair_id, side)
);

-- 14.7 Player boards: per-player state for every layout position.
create table if not exists public.board_cells (
	game_id uuid not null,
	player_id uuid not null references public.players (id) on delete cascade,
	position smallint not null,
	matched_at timestamptz,
	primary key (player_id, position),
	foreign key (game_id, position) references public.game_layout (game_id, position) on delete cascade
);

create index if not exists board_cells_game_idx on public.board_cells (game_id);

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
alter table public.board_cells enable row level security;
alter table public.game_attempts enable row level security;
alter table public.processed_actions enable row level security;

-- Supabase grants table privileges to anon/authenticated by default; remove
-- them and grant back only what is needed.
revoke all on table
	public.hosts, public.game_sessions, public.players, public.vocabulary_items,
	public.vocabulary_pairs, public.games, public.game_layout, public.board_cells,
	public.game_attempts, public.processed_actions
from public, anon, authenticated;

grant all on table
	public.hosts, public.game_sessions, public.players, public.vocabulary_items,
	public.vocabulary_pairs, public.games, public.game_layout, public.board_cells,
	public.game_attempts, public.processed_actions
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

-- vocabulary_items, vocabulary_pairs, games, game_layout, board_cells,
-- game_attempts and processed_actions intentionally have NO policies and NO
-- grants for anon/authenticated: RLS denies everything. Clients receive the
-- permitted subset only through public.get_session_view() and the action
-- functions below.

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

-- Active (non-removed) players with the highest score.
create or replace function private.top_scorers(p_session_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(array_agg(p.id order by p.joined_at, p.id), '{}')
	from public.players p
	where p.session_id = p_session_id
		and p.status = 'active'
		and p.score = (
			select max(q.score) from public.players q
			where q.session_id = p_session_id and q.status = 'active'
		)
$$;

-- Mark the game and session completed. Caller holds the session row lock.
create or replace function private.complete_game(
	p_session_id uuid,
	p_reason public.game_end_reason,
	p_winner_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.games
	set status = 'completed',
		end_reason = p_reason,
		winner_ids = coalesce(p_winner_ids, private.top_scorers(p_session_id)),
		active_player_id = null,
		first_flip = null,
		mismatch_positions = null,
		reveal_until = null,
		turn_until = null,
		ended_at = now()
	where session_id = p_session_id and status = 'active';

	update public.game_sessions
	set status = 'completed', ended_at = now()
	where id = p_session_id and status = 'in_progress';
end;
$$;

-- Lazily resolve an overdue mismatch reveal or turn deadline (spec 9.4, 9.6).
-- Must be called while holding the session row lock. Performs at most one
-- transition; the deadline it sets is always in the future, so calling it
-- again immediately is a no-op (idempotent). Returns true if state changed.
create or replace function private.resolve_overdue(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_game public.games%rowtype;
	v_next uuid;
begin
	select * into v_game
	from public.games
	where session_id = p_session_id
	for update;

	if not found or v_game.status <> 'active' then
		return false;
	end if;

	if v_game.mismatch_positions is not null then
		if v_game.reveal_until > now() then
			return false;
		end if;
		-- Reveal finished: cards turn face down, turn passes on.
		v_next := private.next_player(v_game.turn_order, v_game.active_player_id);
		update public.games
		set mismatch_positions = null,
			reveal_until = null,
			active_player_id = v_next,
			turn_until = now() + private.turn_time_limit()
		where id = v_game.id;
	elsif v_game.turn_until is not null and v_game.turn_until <= now() then
		-- Turn deadline passed: a pending first flip turns back, turn passes on.
		insert into public.game_attempts (game_id, player_id, first_position, second_position, outcome)
		values (v_game.id, v_game.active_player_id, v_game.first_flip, null, 'timeout');
		v_next := private.next_player(v_game.turn_order, v_game.active_player_id);
		update public.games
		set first_flip = null,
			active_player_id = v_next,
			turn_until = now() + private.turn_time_limit()
		where id = v_game.id;
	else
		return false;
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
	v_players jsonb;
	v_game_json jsonb;
	v_visible smallint[];
begin
	select * into v_session from public.game_sessions where id = p_session_id;
	if not found or p_user_id is null then
		return null;
	end if;

	if v_session.host_id = p_user_id then
		v_role := 'host';
	else
		select id into v_me
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
			'joined_at', p.joined_at
		) order by p.joined_at, p.id), '[]'::jsonb)
	into v_players
	from public.players p
	where p.session_id = p_session_id;

	select * into v_game from public.games where session_id = p_session_id;
	if found then
		-- Visible positions: matched on some board, or flipped in the current
		-- attempt / pending mismatch reveal. Nothing else is ever revealed.
		select coalesce(array_agg(distinct bc.position), '{}')
		into v_visible
		from public.board_cells bc
		where bc.game_id = v_game.id and bc.matched_at is not null;

		if v_game.first_flip is not null then
			v_visible := v_visible || v_game.first_flip;
		end if;
		if v_game.mismatch_positions is not null then
			v_visible := v_visible || v_game.mismatch_positions;
		end if;

		v_game_json := jsonb_build_object(
			'status', v_game.status,
			'card_count', v_session.pair_count * 2,
			'turn_order', to_jsonb(v_game.turn_order),
			'active_player_id', v_game.active_player_id,
			'first_flip', v_game.first_flip,
			'mismatch_positions', to_jsonb(v_game.mismatch_positions),
			'reveal_until', v_game.reveal_until,
			'turn_until', v_game.turn_until,
			'end_reason', v_game.end_reason,
			'winner_ids', to_jsonb(v_game.winner_ids),
			'started_at', v_game.started_at,
			'ended_at', v_game.ended_at,
			'faces', (
				select coalesce(jsonb_object_agg(l.position::text, private.card_face(l.pair_id, l.side)), '{}'::jsonb)
				from public.game_layout l
				where l.game_id = v_game.id and l.position = any (v_visible)
			),
			'boards', (
				select coalesce(jsonb_object_agg(s.player_id::text, s.matched), '{}'::jsonb)
				from (
					select bc.player_id,
						coalesce(jsonb_agg(bc.position order by bc.position)
							filter (where bc.matched_at is not null), '[]'::jsonb) as matched
					from public.board_cells bc
					where bc.game_id = v_game.id
					group by bc.player_id
				) s
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
			)
		);
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
			'variant', v_session.variant,
			'pair_count', v_session.pair_count,
			'status', v_session.status,
			'created_at', v_session.created_at,
			'started_at', v_session.started_at,
			'ended_at', v_session.ended_at
		),
		'players', v_players,
		'game', v_game_json
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

-- Host: create a session (spec 5.3).
create or replace function public.create_session(
	p_name text,
	p_variant text,
	p_pair_count integer,
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
	if p_variant is null or p_variant not in ('image_pairs', 'word_image', 'de_het', 'opposites') then
		return private.fail('invalid_variant');
	end if;
	if p_pair_count is null or p_pair_count not in (6, 8, 12) then
		return private.fail('invalid_pair_count');
	end if;

	insert into public.hosts (id) values (v_uid) on conflict (id) do nothing;

	loop
		v_attempt := v_attempt + 1;
		v_code := private.generate_join_code();
		begin
			insert into public.game_sessions (host_id, name, join_code, scheduled_at, variant, pair_count)
			values (v_uid, v_name, v_code, p_scheduled_at, p_variant::public.game_variant, p_pair_count)
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
			'variant', v_session.variant,
			'pair_count', v_session.pair_count,
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
		where g.session_id = p_session_id and g.status = 'active'
			and (
				(g.mismatch_positions is not null and g.reveal_until <= now())
				or (g.mismatch_positions is null and g.turn_until <= now())
			)
	) then
		perform 1 from public.game_sessions where id = p_session_id for update;
		perform private.resolve_overdue(p_session_id);
	end if;

	return private.respond(p_session_id);
end;
$$;

-- Host: start the game (spec 6.4, 8.1). Board generation is atomic: any
-- failure raises and rolls back the whole transaction.
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

	-- Random, server-side turn order over all eligible (non-removed) players.
	select coalesce(array_agg(p.id order by gen_random_uuid()), '{}')
	into v_player_ids
	from public.players p
	where p.session_id = p_session_id and p.status = 'active';

	if cardinality(v_player_ids) < 2 then
		return private.respond(p_session_id, 'not_enough_players');
	end if;

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

	insert into public.games (session_id, turn_order, active_player_id, turn_until)
	values (p_session_id, v_player_ids, v_player_ids[1], now() + private.turn_time_limit())
	returning id into v_game_id;

	-- One shuffled layout: both sides of every selected pair.
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

	-- One board per eligible player, all referencing the same layout.
	insert into public.board_cells (game_id, player_id, position)
	select v_game_id, pid, l.position
	from unnest(v_player_ids) as pid
	cross join public.game_layout l
	where l.game_id = v_game_id;

	update public.game_sessions
	set status = 'in_progress', started_at = now()
	where id = p_session_id;

	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- Player: flip one card on their own board (spec 8.3, 9.2–9.4).
create or replace function public.flip_card(
	p_session_id uuid,
	p_board_player_id uuid,
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
	if p_session_id is null or p_board_player_id is null or p_position is null
		or p_action_id is null or p_revision is null then
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
	select * into v_game from public.games where session_id = p_session_id;

	if p_revision <> v_session.revision then
		return private.respond(p_session_id, 'stale_state');
	end if;
	if p_board_player_id <> v_player.id then
		return private.respond(p_session_id, 'not_your_board');
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
		select 1 from public.board_cells
		where player_id = v_player.id and position = p_position and matched_at is not null
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
			-- Match: both positions matched on this player's board only, +1 point.
			update public.board_cells
			set matched_at = now()
			where player_id = v_player.id and position in (v_game.first_flip, p_position);

			update public.players set score = score + 1 where id = v_player.id;

			insert into public.game_attempts (game_id, player_id, first_position, second_position, outcome)
			values (v_game.id, v_player.id, v_game.first_flip, p_position, 'match');

			select count(*) into v_remaining
			from public.board_cells
			where player_id = v_player.id and matched_at is null;

			if v_remaining = 0 then
				-- Board cleared: the game ends immediately and this player wins.
				perform private.complete_game(p_session_id, 'board_cleared', array[v_player.id]);
			else
				-- Same player goes again with a fresh deadline.
				update public.games
				set first_flip = null, turn_until = now() + private.turn_time_limit()
				where id = v_game.id;
			end if;
		else
			-- Mismatch: both stay visible until reveal_until, then turn passes.
			insert into public.game_attempts (game_id, player_id, first_position, second_position, outcome)
			values (v_game.id, v_player.id, v_game.first_flip, p_position, 'mismatch');

			update public.games
			set first_flip = null,
				mismatch_positions = array[v_game.first_flip, p_position]::smallint[],
				reveal_until = now() + private.reveal_interval(),
				turn_until = null
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

	perform private.complete_game(p_session_id, 'ended_by_host', null);
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
		select * into v_game from public.games where session_id = p_session_id for update;

		if v_game.status = 'active' and v_game.active_player_id = p_player_id then
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
					active_player_id = v_next,
					turn_until = now() + private.turn_time_limit()
				where id = v_game.id;
			end if;
		end if;

		select count(*) into v_active_count
		from public.players
		where session_id = p_session_id and status = 'active';

		if v_active_count < 2 then
			perform private.complete_game(p_session_id, 'not_enough_players', null);
		end if;
	end if;

	perform private.bump_revision(p_session_id);
	return private.respond(p_session_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------

-- Private helpers: owner only, except the Realtime policy helper and the
-- avatar list used by a CHECK constraint.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.can_use_session_topic(text) to authenticated;
grant execute on function private.allowed_avatars() to service_role;

-- Public RPCs: never callable by PUBLIC; anon only for lookup_session.
revoke execute on function public.create_session(text, text, integer, timestamptz) from public, anon;
revoke execute on function public.lookup_session(text) from public;
revoke execute on function public.join_session(text, text, text, text) from public, anon;
revoke execute on function public.get_session_view(uuid) from public, anon;
revoke execute on function public.start_game(uuid) from public, anon;
revoke execute on function public.flip_card(uuid, uuid, integer, uuid, bigint) from public, anon;
revoke execute on function public.end_game(uuid) from public, anon;
revoke execute on function public.remove_player(uuid, uuid) from public, anon;

grant execute on function public.lookup_session(text) to anon, authenticated;
grant execute on function public.create_session(text, text, integer, timestamptz) to authenticated;
grant execute on function public.join_session(text, text, text, text) to authenticated;
grant execute on function public.get_session_view(uuid) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.flip_card(uuid, uuid, integer, uuid, bigint) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
grant execute on function public.remove_player(uuid, uuid) to authenticated;

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
