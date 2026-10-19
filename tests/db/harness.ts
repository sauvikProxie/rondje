/**
 * Test harness that runs supabase/schema.sql and supabase/seed.sql inside
 * PGlite (PostgreSQL compiled to WASM) with a minimal stand-in for the parts
 * of Supabase the schema depends on: the `auth` schema (users, uid(), jwt()),
 * the anon/authenticated/service_role roles, and `realtime.messages` with
 * realtime.topic() and realtime.send().
 *
 * This verifies the real SQL (constraints, RLS, grants, functions) without a
 * Supabase project. It does not replace live tests against Supabase.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(import.meta.dirname, '..', '..');
const schemaSql = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');
const seedSql = readFileSync(resolve(root, 'supabase/seed.sql'), 'utf8');

const supabaseStub = /* sql */ `
	create role anon nologin;
	create role authenticated nologin;
	create role service_role nologin bypassrls;

	create schema auth;
	grant usage on schema auth to anon, authenticated, service_role;
	create table auth.users (
		id uuid primary key,
		email text,
		is_anonymous boolean not null default false
	);
	create function auth.uid() returns uuid language sql stable as $$
		select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
	$$;
	create function auth.jwt() returns jsonb language sql stable as $$
		select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
	$$;
	grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

	create schema realtime;
	grant usage on schema realtime to anon, authenticated, service_role;
	create table realtime.messages (
		id bigint generated always as identity primary key,
		topic text not null,
		extension text not null,
		payload jsonb,
		event text,
		private boolean default false,
		inserted_at timestamptz not null default now()
	);
	alter table realtime.messages enable row level security;
	grant select, insert on realtime.messages to authenticated;
	create function realtime.topic() returns text language sql stable as $$
		select nullif(current_setting('realtime.topic', true), '')
	$$;
	grant execute on function realtime.topic() to anon, authenticated;
	create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
	returns void language sql security definer as $$
		insert into realtime.messages (topic, extension, payload, event, private)
		values (topic, 'broadcast', payload, event, private)
	$$;
`;

export interface User {
	id: string;
	isAnonymous: boolean;
}

export type RpcResult = {
	ok: boolean;
	error: string | null;
	view: Record<string, any> | null;
	[key: string]: any;
};

export class TestDb {
	private constructor(readonly pg: PGlite) {}

	static async create(options: { seed?: boolean } = {}): Promise<TestDb> {
		const pg = new PGlite();
		await pg.exec(supabaseStub);
		await pg.exec(schemaSql);
		if (options.seed !== false) await pg.exec(seedSql);
		return new TestDb(pg);
	}

	async close() {
		await this.pg.close();
	}

	async createUser(options: { anonymous?: boolean } = {}): Promise<User> {
		const id = crypto.randomUUID();
		const isAnonymous = options.anonymous ?? true;
		await this.pg.query('insert into auth.users (id, is_anonymous) values ($1, $2)', [id, isAnonymous]);
		return { id, isAnonymous };
	}

	/** Run `fn` as the given user with the `authenticated` role (or `anon` if user is null). */
	async as<T>(user: User | null, fn: (db: PGlite) => Promise<T>, topic?: string): Promise<T> {
		const claims = user
			? JSON.stringify({ sub: user.id, role: 'authenticated', is_anonymous: user.isAnonymous })
			: JSON.stringify({ role: 'anon' });
		await this.pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user?.id ?? '']);
		await this.pg.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
		await this.pg.query(`select set_config('realtime.topic', $1, false)`, [topic ?? '']);
		await this.pg.exec(`set role ${user ? 'authenticated' : 'anon'}`);
		try {
			return await fn(this.pg);
		} finally {
			await this.pg.exec('reset role');
			await this.pg.query(`select set_config('request.jwt.claim.sub', '', false)`);
			await this.pg.query(`select set_config('request.jwt.claims', '', false)`);
			await this.pg.query(`select set_config('realtime.topic', '', false)`);
		}
	}

	/** Call a public RPC function as `user`, like supabase.rpc(). */
	async rpc(user: User | null, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
		const names = Object.keys(args);
		const params = names.map((name, i) => `${name} => $${i + 1}`).join(', ');
		return this.as(user, async (db) => {
			const res = await db.query<{ result: RpcResult }>(
				`select public.${fn}(${params}) as result`,
				names.map((n) => args[n])
			);
			return res.rows[0]!.result;
		});
	}

	/** Superuser query (bypasses RLS) for test setup and assertions. */
	async sql<T = Record<string, any>>(query: string, params: unknown[] = []): Promise<T[]> {
		const res = await this.pg.query<T>(query, params);
		return res.rows;
	}

	// ---- convenience helpers -------------------------------------------------

	async createHost() {
		return this.createUser({ anonymous: false });
	}

	/** A Matchen session. */
	async createSession(host: User, variant = 'word_image', pairCount = 6, groupCount = 1) {
		const res = await this.rpc(host, 'create_session', {
			p_name: 'Test session',
			p_mode: 'matchen',
			p_variant: variant,
			p_pair_count: pairCount,
			p_group_count: groupCount
		});
		if (!res.ok) throw new Error(`create_session failed: ${res.error}`);
		return { sessionId: res.session_id as string, joinCode: res.join_code as string };
	}

	/** A Fill in the Blanks session with `sentences` rounds. */
	async createBlanksSession(host: User, sentences = 6, groupCount = 1) {
		const res = await this.rpc(host, 'create_session', {
			p_name: 'Grammar session',
			p_mode: 'fill_blanks',
			p_variant: null,
			p_pair_count: sentences,
			p_group_count: groupCount
		});
		if (!res.ok) throw new Error(`create_session failed: ${res.error}`);
		return { sessionId: res.session_id as string, joinCode: res.join_code as string };
	}

	async join(joinCode: string, nickname: string, avatar = '🦊', level = 'beginner') {
		const user = await this.createUser();
		const res = await this.rpc(user, 'join_session', {
			p_join_code: joinCode,
			p_nickname: nickname,
			p_avatar: avatar,
			p_level: level
		});
		if (!res.ok) throw new Error(`join_session failed: ${res.error}`);
		return { user, playerId: res.player_id as string };
	}

	/** Board layout of the session's latest game. */
	async layout(sessionId: string): Promise<{ position: number; pair_id: string }[]> {
		const game = await this.game(sessionId);
		if (!game) return [];
		return this.sql(`select position, pair_id from public.game_layout where game_id = $1 order by position`, [game.id]);
	}

	/** The session's latest game (a session can play several games). */
	async game(sessionId: string) {
		const rows = await this.sql<any>(
			`select * from public.games where session_id = $1 order by game_number desc limit 1`,
			[sessionId]
		);
		return rows[0];
	}

	async revision(sessionId: string): Promise<number> {
		const rows = await this.sql<{ revision: string | number }>(
			`select revision from public.game_sessions where id = $1`,
			[sessionId]
		);
		return Number(rows[0]!.revision);
	}

	/** Position pairs: [[a, b], ...] where a and b hold the same pair. */
	async matchingPairs(sessionId: string): Promise<[number, number][]> {
		const layout = await this.layout(sessionId);
		const byPair = new Map<string, number[]>();
		for (const cell of layout) {
			byPair.set(cell.pair_id, [...(byPair.get(cell.pair_id) ?? []), cell.position]);
		}
		return [...byPair.values()].map((p) => [p[0]!, p[1]!]);
	}

	/** Matchen: flip a card on the shared board. */
	async flip(user: User, sessionId: string, position: number, opts: { actionId?: string; revision?: number } = {}) {
		return this.rpc(user, 'flip_card', {
			p_session_id: sessionId,
			p_position: position,
			p_action_id: opts.actionId ?? crypto.randomUUID(),
			p_revision: opts.revision ?? (await this.revision(sessionId))
		});
	}

	/** Fill in the Blanks: answer a round (default: the current round). */
	async answer(user: User, sessionId: string, answer: string, round?: number) {
		return this.rpc(user, 'submit_answer', {
			p_session_id: sessionId,
			p_round: round ?? (await this.game(sessionId)).current_round,
			p_answer: answer
		});
	}

	/** Fill in the Blanks: the current round's question (read as superuser). */
	async currentQuestion(sessionId: string): Promise<{ round: number; answer: string; distractors: string[]; options: string[] }> {
		const rows = await this.sql<any>(
			`select r.round, q.answer, q.distractors, r.options
			 from public.games g
			 join public.game_rounds r on r.game_id = g.id and r.round = g.current_round
			 join public.grammar_questions q on q.id = r.question_id
			 where g.session_id = $1 and g.status = 'active'`,
			[sessionId]
		);
		return rows[0];
	}

	/** Move the reveal deadline into the past, simulating elapsed time. */
	async expireDeadlines(sessionId: string) {
		await this.sql(
			`update public.games set
				reveal_until = case when reveal_until is null then null else now() - interval '1 second' end
			 where session_id = $1 and status = 'active'`,
			[sessionId]
		);
	}
}
