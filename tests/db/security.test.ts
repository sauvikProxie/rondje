/**
 * Security tests (spec 15, 19.2) against the real schema in PGlite, executed
 * with the same roles Supabase uses (anon / authenticated) and RLS enabled.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { TestDb, type User } from './harness';

let db: TestDb;

beforeAll(async () => {
	db = await TestDb.create();
});

afterAll(async () => {
	await db.close();
});

async function game(players = 2, variant = 'word_image') {
	const host = await db.createHost();
	const { sessionId, joinCode } = await db.createSession(host, variant, 6);
	const joined: { user: User; playerId: string }[] = [];
	for (let i = 0; i < players; i++) joined.push(await db.join(joinCode, `Speler ${i}`, ['🦊', '🐼', '🐸'][i]));
	const start = await db.rpc(host, 'start_game', { p_session_id: sessionId });
	expect(start.ok).toBe(true);
	const g = await db.game(sessionId);
	const active = joined.find((p) => p.playerId === g.active_player_id)!;
	const waiting = joined.find((p) => p.playerId !== g.active_player_id)!;
	return { host, sessionId, joinCode, players: joined, active, waiting };
}

const PROTECTED_TABLES = [
	'public.game_layout',
	'public.vocabulary_items',
	'public.vocabulary_pairs',
	'public.games',
	'public.board_cells',
	'public.game_attempts',
	'public.processed_actions'
];

describe('direct table access', () => {
	test.each(PROTECTED_TABLES)('players cannot read %s', async (table) => {
		const g = await game();
		await expect(db.as(g.active.user, (pg) => pg.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
	});

	test.each(PROTECTED_TABLES)('hosts cannot read %s either (no face-down content for anyone)', async (table) => {
		const g = await game();
		await expect(db.as(g.host, (pg) => pg.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
	});

	test('anonymous (signed-out) visitors cannot read sessions, players or vocabulary', async () => {
		await game();
		for (const table of ['public.game_sessions', 'public.players', 'public.hosts', ...PROTECTED_TABLES]) {
			await expect(db.as(null, (pg) => pg.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
		}
	});

	test('players cannot modify scores, turns, boards or session status directly', async () => {
		const g = await game();
		const p = g.active;
		const attempts = [
			`update public.players set score = 99 where id = '${p.playerId}'`,
			`insert into public.players (session_id, user_id, nickname, avatar, level) values ('${g.sessionId}', '${p.user.id}', 'x', '🦊', 'beginner')`,
			`update public.games set active_player_id = '${p.playerId}'`,
			`update public.board_cells set matched_at = now() where player_id = '${p.playerId}'`,
			`update public.game_sessions set status = 'completed' where id = '${g.sessionId}'`,
			`delete from public.players where id = '${g.waiting.playerId}'`,
			`insert into public.processed_actions (action_id, game_id, player_id) select gen_random_uuid(), id, '${p.playerId}' from public.games limit 1`
		];
		for (const sql of attempts) {
			await expect(db.as(p.user, (pg) => pg.query(sql)), sql).rejects.toThrow(/permission denied/);
		}
		const [row] = await db.sql<{ score: number }>('select score from public.players where id = $1', [p.playerId]);
		expect(row!.score).toBe(0);
	});

	test('a player can only see their own player row directly', async () => {
		const g = await game(3);
		const rows = await db.as(g.active.user, (pg) => pg.query<{ id: string }>('select id from public.players'));
		expect(rows.rows.map((r) => r.id)).toEqual([g.active.playerId]);
		const sessions = await db.as(g.active.user, (pg) => pg.query('select * from public.game_sessions'));
		expect(sessions.rows).toEqual([]);
	});

	test('signed-out visitors cannot call game functions', async () => {
		const g = await game();
		for (const [fn, args] of [
			['get_session_view', { p_session_id: g.sessionId }],
			['start_game', { p_session_id: g.sessionId }],
			['end_game', { p_session_id: g.sessionId }],
			['join_session', { p_join_code: g.joinCode, p_nickname: 'x', p_avatar: '🦊', p_level: 'beginner' }]
		] as const) {
			await expect(db.rpc(null, fn, args), fn).rejects.toThrow(/permission denied/);
		}
	});

	test('private helper functions cannot be called by clients', async () => {
		const g = await game();
		await expect(
			db.as(g.active.user, (pg) => pg.query(`select private.resolve_overdue('${g.sessionId}')`))
		).rejects.toThrow(/permission denied/);
		await expect(
			db.as(g.active.user, (pg) => pg.query(`select private.session_view('${g.sessionId}', '${g.waiting.user.id}')`))
		).rejects.toThrow(/permission denied/);
	});
});

describe('player authorisation', () => {
	test('players cannot start or end the game, or remove other players', async () => {
		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createSession(host);
		const a = await db.join(joinCode, 'A');
		const b = await db.join(joinCode, 'B', '🐼');
		expect((await db.rpc(a.user, 'start_game', { p_session_id: sessionId })).error).toBe('not_host');
		expect((await db.rpc(a.user, 'remove_player', { p_session_id: sessionId, p_player_id: b.playerId })).error).toBe('not_host');
		await db.rpc(host, 'start_game', { p_session_id: sessionId });
		expect((await db.rpc(a.user, 'end_game', { p_session_id: sessionId })).error).toBe('not_host');
		const [s] = await db.sql<{ status: string }>('select status from public.game_sessions where id = $1', [sessionId]);
		expect(s!.status).toBe('in_progress');
	});

	test('a player cannot play out of turn or flip on another player’s board', async () => {
		const g = await game();
		const before = await db.revision(g.sessionId);
		expect((await db.flip(g.waiting.user, g.sessionId, g.waiting.playerId, 0)).error).toBe('not_your_turn');
		expect((await db.flip(g.active.user, g.sessionId, g.waiting.playerId, 0)).error).toBe('not_your_board');
		expect((await db.flip(g.waiting.user, g.sessionId, g.active.playerId, 0)).error).toBe('not_your_board');
		expect(await db.revision(g.sessionId)).toBe(before);
	});

	test('a user who is not in the session cannot read or act on it', async () => {
		const g = await game();
		const stranger = await db.createUser();
		expect((await db.rpc(stranger, 'get_session_view', { p_session_id: g.sessionId })).error).toBe('forbidden');
		expect((await db.flip(stranger, g.sessionId, g.active.playerId, 0)).error).toBe('forbidden');
	});

	test('removed participants cannot continue participating', async () => {
		const g = await game(3);
		await db.rpc(g.host, 'remove_player', { p_session_id: g.sessionId, p_player_id: g.waiting.playerId });
		const removed = g.waiting;
		expect((await db.rpc(removed.user, 'get_session_view', { p_session_id: g.sessionId })).error).toBe('removed');
		expect((await db.flip(removed.user, g.sessionId, removed.playerId, 0)).error).toBe('removed');
		const rejoin = await db.rpc(removed.user, 'join_session', {
			p_join_code: g.joinCode, p_nickname: 'Again', p_avatar: '🐢', p_level: 'beginner'
		});
		expect(rejoin.error).toBe('removed');
		expect((await db.rpc(removed.user, 'lookup_session', { p_join_code: g.joinCode })).membership).toBe('removed');
	});

	test('a completed game rejects additional scoring actions', async () => {
		const g = await game();
		const pairs = await db.matchingPairs(g.sessionId);
		await db.flip(g.active.user, g.sessionId, g.active.playerId, pairs[0]![0]);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		const late = await db.flip(g.active.user, g.sessionId, g.active.playerId, pairs[0]![1]);
		expect(late.error).toBe('game_not_active');
		const [row] = await db.sql<{ score: number }>('select score from public.players where id = $1', [g.active.playerId]);
		expect(row!.score).toBe(0);
		expect((await db.rpc(g.host, 'start_game', { p_session_id: g.sessionId })).error).toBe('session_not_in_lobby');
	});
});

describe('host authorisation', () => {
	test('a host cannot manage or view another host’s session', async () => {
		const g = await game();
		const otherHost = await db.createHost();
		expect((await db.rpc(otherHost, 'get_session_view', { p_session_id: g.sessionId })).error).toBe('forbidden');
		expect((await db.rpc(otherHost, 'end_game', { p_session_id: g.sessionId })).error).toBe('not_host');
		expect((await db.rpc(otherHost, 'start_game', { p_session_id: g.sessionId })).error).toBe('not_host');
		expect(
			(await db.rpc(otherHost, 'remove_player', { p_session_id: g.sessionId, p_player_id: g.active.playerId })).error
		).toBe('not_host');
		const visible = await db.as(otherHost, (pg) => pg.query('select id from public.game_sessions'));
		expect(visible.rows).toEqual([]);
		const players = await db.as(otherHost, (pg) => pg.query('select id from public.players'));
		expect(players.rows).toEqual([]);
	});

	test('hosts see their own sessions and participants', async () => {
		const g = await game(2);
		const sessions = await db.as(g.host, (pg) => pg.query<{ id: string }>('select id from public.game_sessions'));
		expect(sessions.rows.map((r) => r.id)).toEqual([g.sessionId]);
		const players = await db.as(g.host, (pg) => pg.query<{ id: string }>('select id from public.players'));
		expect(players.rows).toHaveLength(2);
	});
});

describe('hidden card content', () => {
	test('views contain content only for flipped or matched positions, never ids that encode pairs', async () => {
		const g = await game(2, 'word_image');
		const pairs = await db.matchingPairs(g.sessionId);
		// Match one pair, then flip one card of another pair.
		await db.flip(g.active.user, g.sessionId, g.active.playerId, pairs[0]![0]);
		await db.flip(g.active.user, g.sessionId, g.active.playerId, pairs[0]![1]);
		await db.flip(g.active.user, g.sessionId, g.active.playerId, pairs[1]![0]);
		const expectedVisible = [pairs[0]![0], pairs[0]![1], pairs[1]![0]].sort((a, b) => a - b);

		for (const viewer of [g.host, g.active.user, g.waiting.user]) {
			const res = await db.rpc(viewer, 'get_session_view', { p_session_id: g.sessionId });
			const view = res.view!;
			expect(Object.keys(view.game.faces).map(Number).sort((a, b) => a - b)).toEqual(expectedVisible);

			const json = JSON.stringify(view);
			expect(json).not.toMatch(/pair_id|item_a|item_b|"side"|layout/);
			const layout = await db.layout(g.sessionId);
			for (const cell of layout) expect(json).not.toContain(cell.pair_id);

			// Content of pairs with no visible card never appears anywhere in the response.
			const hiddenPairIds = layout
				.filter((c) => !expectedVisible.some((p) => layout[p]!.pair_id === c.pair_id))
				.map((c) => c.pair_id);
			const hiddenWords = await db.sql<{ word: string; emoji: string }>(
				`select i.word, i.emoji from public.vocabulary_pairs p
				 join public.vocabulary_items i on i.id = p.item_a where p.id = any($1::uuid[])`,
				[hiddenPairIds]
			);
			expect(hiddenWords.length).toBe(4);
			for (const { word, emoji } of hiddenWords) {
				expect(json).not.toContain(`"${word}"`);
				expect(json).not.toContain(emoji);
			}
		}
	});

	test('after a mismatch reveal ends, the two cards are hidden again', async () => {
		const g = await game();
		const pairs = await db.matchingPairs(g.sessionId);
		await db.flip(g.active.user, g.sessionId, g.active.playerId, pairs[0]![0]);
		await db.flip(g.active.user, g.sessionId, g.active.playerId, pairs[1]![0]);
		const during = await db.rpc(g.waiting.user, 'get_session_view', { p_session_id: g.sessionId });
		expect(Object.keys(during.view!.game.faces)).toHaveLength(2);
		await db.expireDeadlines(g.sessionId);
		const after = await db.rpc(g.waiting.user, 'get_session_view', { p_session_id: g.sessionId });
		expect(after.view!.game.faces).toEqual({});
	});

	test('lookup by join code reveals no host identity or game data', async () => {
		const g = await game();
		const res = await db.rpc(null, 'lookup_session', { p_join_code: g.joinCode });
		expect(Object.keys(res.session).sort()).toEqual(
			['id', 'join_code', 'name', 'pair_count', 'scheduled_at', 'status', 'variant'].sort()
		);
		expect(res).not.toHaveProperty('view');
	});
});

describe('realtime authorisation', () => {
	const topic = (sessionId: string) => `session:${sessionId}`;

	async function receive(user: User | null, sessionId: string) {
		return db.as(user, (pg) => pg.query('select payload from realtime.messages'), topic(sessionId));
	}

	test('session members receive notifications; others and signed-out users do not', async () => {
		const g = await game();
		const stranger = await db.createUser();
		expect((await receive(g.active.user, g.sessionId)).rows.length).toBeGreaterThan(0);
		expect((await receive(g.host, g.sessionId)).rows.length).toBeGreaterThan(0);
		expect((await receive(stranger, g.sessionId)).rows).toEqual([]);
		await expect(receive(null, g.sessionId)).rejects.toThrow(/permission denied/);
	});

	test('a member of one session cannot subscribe to another session’s channel', async () => {
		const g1 = await game();
		const g2 = await game();
		expect((await receive(g1.active.user, g2.sessionId)).rows).toEqual([]);
		const malformed = await db.as(g1.active.user, (pg) => pg.query('select 1 from realtime.messages'), `session:${g1.sessionId}x`);
		expect(malformed.rows).toEqual([]);
	});

	test('removed players lose access to the channel', async () => {
		const g = await game(3);
		await db.rpc(g.host, 'remove_player', { p_session_id: g.sessionId, p_player_id: g.waiting.playerId });
		expect((await receive(g.waiting.user, g.sessionId)).rows).toEqual([]);
	});

	test('members may track presence but may not send broadcasts', async () => {
		const g = await game();
		const insert = (user: User, extension: string, sessionId = g.sessionId) =>
			db.as(
				user,
				(pg) =>
					pg.query(`insert into realtime.messages (topic, extension, payload, event) values ($1, $2, '{}', 'x')`, [
						topic(sessionId),
						extension
					]),
				topic(sessionId)
			);
		await expect(insert(g.active.user, 'presence')).resolves.toBeTruthy();
		await expect(insert(g.active.user, 'broadcast')).rejects.toThrow(/row-level security/);
		const stranger = await db.createUser();
		await expect(insert(stranger, 'presence')).rejects.toThrow(/row-level security/);
	});
});
