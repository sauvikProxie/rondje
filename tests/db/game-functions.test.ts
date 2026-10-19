/**
 * Runs the real supabase/schema.sql + seed.sql in PGlite and exercises the
 * database functions that are the authoritative game implementation.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { questionError } from '../../src/lib/game/blanks';
import {
	AVATARS,
	JOIN_CODE_ALPHABET,
	MAX_GROUPS,
	PAIR_COUNTS,
	REVEAL_INTERVAL_MS,
	ROUND_REVEAL_INTERVAL_MS,
	VARIANTS
} from '../../src/lib/game/constants';
import { TestDb, type User } from './harness';

let db: TestDb;

beforeAll(async () => {
	db = await TestDb.create();
});

afterAll(async () => {
	await db.close();
});

type Joined = { user: User; playerId: string };

/** Matchen session in progress with `n` players; returns players keyed by id and helpers. */
async function startedGame(n = 2, variant = 'word_image', pairCount = 6, groupCount = 1) {
	const host = await db.createHost();
	const { sessionId, joinCode } = await db.createSession(host, variant, pairCount, groupCount);
	const joined: Joined[] = [];
	for (let i = 0; i < n; i++) joined.push(await db.join(joinCode, `Player ${i + 1}`, AVATARS[i]));
	const res = await db.rpc(host, 'start_game', { p_session_id: sessionId });
	if (!res.ok) throw new Error(`start_game failed: ${res.error}`);
	const byId = new Map(joined.map((p) => [p.playerId, p]));
	const active = async () => {
		const g = await db.game(sessionId);
		return byId.get(g.active_player_id)!;
	};
	return { host, sessionId, joinCode, players: joined, byId, active };
}

/** Fill in the Blanks session in progress. `levels` gives each player's level. */
async function startedBlanks(levels: string[] = ['beginner', 'advanced'], sentences = 6, groupCount = 1) {
	const host = await db.createHost();
	const { sessionId, joinCode } = await db.createBlanksSession(host, sentences, groupCount);
	const joined: Joined[] = [];
	for (const [i, level] of levels.entries()) joined.push(await db.join(joinCode, `Speler ${i + 1}`, AVATARS[i], level));
	const res = await db.rpc(host, 'start_game', { p_session_id: sessionId });
	if (!res.ok) throw new Error(`start_game failed: ${res.error}`);
	return { host, sessionId, joinCode, players: joined };
}

async function score(playerId: string): Promise<number> {
	const rows = await db.sql<{ score: number }>('select score from public.players where id = $1', [playerId]);
	return rows[0]!.score;
}

async function view(user: User, sessionId: string) {
	return (await db.rpc(user, 'get_session_view', { p_session_id: sessionId })).view!;
}

/** A position whose card does NOT match the card at `position`. */
async function mismatchFor(sessionId: string, position: number): Promise<number> {
	const layout = await db.layout(sessionId);
	const pair = layout.find((c) => c.position === position)!.pair_id;
	return layout.find((c) => c.pair_id !== pair)!.position;
}

describe('seed content', () => {
	test('every variant has at least 12 valid, distinct pairs', async () => {
		const rows = await db.sql<{ variant: string; n: number }>(
			`select variant::text, count(*)::int as n from public.vocabulary_pairs where active group by variant`
		);
		const counts = Object.fromEntries(rows.map((r) => [r.variant, r.n]));
		for (const variant of VARIANTS) expect(counts[variant]).toBeGreaterThanOrEqual(12);
	});

	test('de_het pairs all use nouns with a valid article', async () => {
		const rows = await db.sql(
			`select i.word, i.article from public.vocabulary_pairs p
			 join public.vocabulary_items i on i.id = p.item_b
			 where p.variant = 'de_het' and (i.article is null or i.article not in ('de', 'het'))`
		);
		expect(rows).toEqual([]);
	});

	test('opposite words are each used in exactly one pair', async () => {
		const rows = await db.sql<{ item: string; n: number }>(
			`select item, count(*)::int as n from (
				select item_a as item from public.vocabulary_pairs where variant = 'opposites'
				union all select item_b from public.vocabulary_pairs where variant = 'opposites'
			) s group by item having count(*) > 1`
		);
		expect(rows).toEqual([]);
	});

	test('the vocabulary constraints reject an invalid pair shape', async () => {
		await expect(
			db.sql(
				`insert into public.vocabulary_pairs (variant, item_a, face_a, item_b, face_b)
				 select 'word_image', a.id, 'image', b.id, 'word'
				 from public.vocabulary_items a, public.vocabulary_items b
				 where a.slug = 'auto' and b.slug = 'fiets'`
			)
		).rejects.toThrow(/vocabulary_pairs_shape/);
	});

	test('the trigger rejects an article_word face for a word without article', async () => {
		await expect(
			db.sql(
				`insert into public.vocabulary_pairs (variant, item_a, face_a, item_b, face_b)
				 select 'de_het', a.id, 'image', a.id, 'article_word'
				 from public.vocabulary_items a where a.slug = 'groot'`
			)
		).rejects.toThrow();
	});

	test('there are enough grammar sentences for the largest game, all valid', async () => {
		const rows = await db.sql<{ sentence: string; answer: string; distractors: string[] }>(
			`select sentence, answer, distractors from public.grammar_questions where active`
		);
		expect(rows.length).toBeGreaterThanOrEqual(Math.max(...PAIR_COUNTS));
		for (const row of rows) expect(questionError(row), row.sentence).toBeNull();
		expect(new Set(rows.map((r) => r.sentence)).size).toBe(rows.length);
	});

	test('the grammar constraints reject a sentence without a blank or with a distractor equal to the answer', async () => {
		const insert = (sentence: string, answer: string, distractors: string[]) =>
			db.sql(
				`insert into public.grammar_questions (slug, sentence, answer, distractors, translation, topic)
				 values ($1, $2, $3, $4, 'x', 'verbs')`,
				[`test_${crypto.randomUUID().slice(0, 8)}`, sentence, answer, distractors]
			);
		await expect(insert('Ik werk thuis.', 'werk', ['a', 'b', 'c'])).rejects.toThrow(/one_blank/);
		await expect(insert('Ik ___ en ___.', 'werk', ['a', 'b', 'c'])).rejects.toThrow(/one_blank/);
		await expect(insert('Ik ___ thuis.', 'werk', ['Werk', 'b', 'c'])).rejects.toThrow(/distractors/);
		await expect(insert('Ik ___ thuis.', 'werk', ['a', 'b'])).rejects.toThrow(/distractors/);
	});
});

describe('shared constants match the TypeScript definitions', () => {
	test('timing, groups, join-code alphabet and avatars', async () => {
		const [row] = await db.sql<{ reveal: number; round: number; groups: number; alphabet: string; avatars: string[] }>(
			`select extract(epoch from private.reveal_interval()) * 1000 as reveal,
				extract(epoch from private.round_reveal_interval()) * 1000 as round,
				private.max_groups() as groups,
				private.join_code_alphabet() as alphabet,
				private.allowed_avatars() as avatars`
		);
		expect(Number(row!.reveal)).toBe(REVEAL_INTERVAL_MS);
		expect(Number(row!.round)).toBe(ROUND_REVEAL_INTERVAL_MS);
		expect(Number(row!.groups)).toBe(MAX_GROUPS);
		expect(row!.alphabet).toBe(JOIN_CODE_ALPHABET);
		expect(row!.avatars).toEqual([...AVATARS]);
	});

	test('there is no turn timer in the schema', async () => {
		const cols = await db.sql(
			`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'turn_until'`
		);
		expect(cols).toEqual([]);
	});
});

describe('session creation and joining', () => {
	test('a host creates a session with a unique six-character code', async () => {
		const host = await db.createHost();
		const codes = new Set<string>();
		for (let i = 0; i < 5; i++) {
			const { joinCode } = await db.createSession(host);
			expect(joinCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
			codes.add(joinCode);
		}
		expect(codes.size).toBe(5);
	});

	test('session configuration is validated', async () => {
		const host = await db.createHost();
		const base = { p_name: 'Les 1', p_mode: 'matchen', p_variant: 'de_het', p_pair_count: 8, p_group_count: 1 };
		const create = (args: Record<string, unknown>) => db.rpc(host, 'create_session', { ...base, ...args });
		expect((await create({ p_pair_count: 10 })).error).toBe('invalid_pair_count');
		expect((await create({ p_variant: 'memory' })).error).toBe('invalid_variant');
		expect((await create({ p_variant: null })).error).toBe('invalid_variant');
		expect((await create({ p_mode: 'quiz' })).error).toBe('invalid_mode');
		expect((await create({ p_group_count: 0 })).error).toBe('invalid_group_count');
		expect((await create({ p_group_count: MAX_GROUPS + 1 })).error).toBe('invalid_group_count');
		expect((await create({ p_name: '   ' })).error).toBe('invalid_session_name');
		expect((await create({})).ok).toBe(true);
		expect((await create({ p_group_count: MAX_GROUPS })).ok).toBe(true);
	});

	test('a Fill in the Blanks session has no variant', async () => {
		const host = await db.createHost();
		const res = await db.rpc(host, 'create_session', {
			p_name: 'Grammatica', p_mode: 'fill_blanks', p_variant: 'de_het', p_pair_count: 8, p_group_count: 2
		});
		expect(res.ok).toBe(true);
		const [s] = await db.sql<any>('select mode, variant, pair_count, group_count from public.game_sessions where id = $1', [res.session_id]);
		expect(s).toEqual({ mode: 'fill_blanks', variant: null, pair_count: 8, group_count: 2 });
	});

	test('anonymous users cannot create sessions', async () => {
		const anon = await db.createUser({ anonymous: true });
		const res = await db.rpc(anon, 'create_session', { p_name: 'X', p_mode: 'matchen', p_variant: 'de_het', p_pair_count: 6 });
		expect(res.error).toBe('not_host');
	});

	test('lookup validates the code and reports membership, mode and groups', async () => {
		const host = await db.createHost();
		const { joinCode } = await db.createBlanksSession(host, 8, 3);
		expect((await db.rpc(null, 'lookup_session', { p_join_code: 'abc' })).error).toBe('invalid_join_code');
		expect((await db.rpc(null, 'lookup_session', { p_join_code: 'ZZZZZZ' })).error).toBe('session_not_found');
		const visitor = await db.rpc(null, 'lookup_session', { p_join_code: joinCode.toLowerCase() });
		expect(visitor.ok).toBe(true);
		expect(visitor.membership).toBe('none');
		expect(visitor.session).toMatchObject({ mode: 'fill_blanks', variant: null, pair_count: 8, group_count: 3 });
		expect(visitor.session).not.toHaveProperty('host_id');
		expect((await db.rpc(host, 'lookup_session', { p_join_code: joinCode })).membership).toBe('host');
	});

	test('nicknames are validated and unique case-insensitively', async () => {
		const host = await db.createHost();
		const { joinCode } = await db.createSession(host);
		await db.join(joinCode, 'Sanne');
		const user = await db.createUser();
		const attempt = (nickname: string, avatar = '🐼', level = 'beginner') =>
			db.rpc(user, 'join_session', { p_join_code: joinCode, p_nickname: nickname, p_avatar: avatar, p_level: level });
		expect((await attempt('  sANNE ')).error).toBe('nickname_taken');
		expect((await attempt('   ')).error).toBe('invalid_nickname');
		expect((await attempt('x'.repeat(21))).error).toBe('invalid_nickname');
		expect((await attempt('Bo', '💩')).error).toBe('invalid_avatar');
		expect((await attempt('Bo', '🐼', 'expert')).error).toBe('invalid_level');
		const ok = await attempt('  Bo  ');
		expect(ok.ok).toBe(true);
		const [row] = await db.sql<{ nickname: string }>('select nickname from public.players where id = $1', [ok.player_id]);
		expect(row!.nickname).toBe('Bo');
	});

	test('every avatar in the TypeScript list is accepted', async () => {
		const host = await db.createHost();
		const { joinCode } = await db.createSession(host);
		for (const [i, avatar] of AVATARS.entries()) {
			await expect(db.join(joinCode, `P${i}`, avatar)).resolves.toBeTruthy();
		}
	});

	test('rejoining returns the existing player; the host cannot join as a player', async () => {
		const host = await db.createHost();
		const { joinCode } = await db.createSession(host);
		const { user, playerId } = await db.join(joinCode, 'Noor');
		const again = await db.rpc(user, 'join_session', {
			p_join_code: joinCode, p_nickname: 'Other', p_avatar: '🐼', p_level: 'advanced'
		});
		expect(again).toMatchObject({ ok: true, player_id: playerId, already_joined: true });
		const asHost = await db.rpc(host, 'join_session', {
			p_join_code: joinCode, p_nickname: 'Host', p_avatar: '🐼', p_level: 'advanced'
		});
		expect(asHost.error).toBe('is_host');
	});

	test('new players cannot join a game in progress or a completed session; existing players can reconnect', async () => {
		const game = await startedGame(2);
		const late = await db.createUser();
		const join = () =>
			db.rpc(late, 'join_session', { p_join_code: game.joinCode, p_nickname: 'Late', p_avatar: '🐼', p_level: 'beginner' });
		expect((await join()).error).toBe('session_in_progress');
		const existing = game.players[0]!;
		expect((await db.rpc(existing.user, 'join_session', {
			p_join_code: game.joinCode, p_nickname: 'x', p_avatar: '🐼', p_level: 'beginner'
		})).ok).toBe(true);
		await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect((await join()).error).toBe('session_completed');
	});
});

describe('starting a game', () => {
	test('requires at least two eligible players', async () => {
		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createSession(host);
		await db.join(joinCode, 'Solo');
		expect((await db.rpc(host, 'start_game', { p_session_id: sessionId })).error).toBe('not_enough_players');
		const second = await db.join(joinCode, 'Duo', '🐼');
		await db.rpc(host, 'remove_player', { p_session_id: sessionId, p_player_id: second.playerId });
		expect((await db.rpc(host, 'start_game', { p_session_id: sessionId })).error).toBe('not_enough_players');
		const [s] = await db.sql<{ status: string }>('select status from public.game_sessions where id = $1', [sessionId]);
		expect(s!.status).toBe('lobby');
	});

	test('requires at least as many players as groups', async () => {
		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createSession(host, 'word_image', 6, 3);
		await db.join(joinCode, 'A');
		await db.join(joinCode, 'B', '🐼');
		const res = await db.rpc(host, 'start_game', { p_session_id: sessionId });
		expect(res.error).toBe('not_enough_players_for_groups');
		expect(await db.game(sessionId)).toBeUndefined();
		await db.join(joinCode, 'C', '🐸');
		expect((await db.rpc(host, 'start_game', { p_session_id: sessionId })).ok).toBe(true);
	});

	test.each(VARIANTS.flatMap((v) => PAIR_COUNTS.map((n) => [v, n] as const)))(
		'%s with %i pairs generates one valid shared board',
		async (variant, pairCount) => {
			const game = await startedGame(3, variant, pairCount);
			const layout = await db.layout(game.sessionId);
			expect(layout).toHaveLength(pairCount * 2);
			expect(layout.map((c) => c.position)).toEqual([...Array(pairCount * 2).keys()]);
			const perPair = new Map<string, number>();
			for (const c of layout) perPair.set(c.pair_id, (perPair.get(c.pair_id) ?? 0) + 1);
			expect(perPair.size).toBe(pairCount);
			expect([...perPair.values()].every((n) => n === 2)).toBe(true);

			// Every pair belongs to the variant; no emoji or word repeats.
			const tokens = await db.sql<{ variant: string; emoji_a: string | null; emoji_b: string | null; word_a: string; word_b: string }>(
				`select p.variant::text, ia.emoji as emoji_a, ib.emoji as emoji_b, ia.word as word_a, ib.word as word_b
				 from public.vocabulary_pairs p
				 join public.vocabulary_items ia on ia.id = p.item_a
				 join public.vocabulary_items ib on ib.id = p.item_b
				 where p.id = any($1::uuid[])`,
				[[...perPair.keys()]]
			);
			expect(tokens.every((t) => t.variant === variant)).toBe(true);
			const seen = new Set<string>();
			for (const t of tokens) {
				const own = new Set([t.emoji_a, t.emoji_b, t.word_a, t.word_b].filter(Boolean) as string[]);
				for (const token of own) {
					expect(seen.has(token)).toBe(false);
					seen.add(token);
				}
			}

			// The shared board starts with nothing matched.
			const matched = await db.sql(
				`select 1 from public.game_layout l join public.games g on g.id = l.game_id
				 where g.session_id = $1 and l.matched_at is not null`,
				[game.sessionId]
			);
			expect(matched).toEqual([]);

			const g = await db.game(game.sessionId);
			expect([...g.turn_order].sort()).toEqual(game.players.map((p) => p.playerId).sort());
			expect(g.active_player_id).toBe(g.turn_order[0]);
		}
	);

	test('groups are balanced and the turn order alternates between groups', async () => {
		const game = await startedGame(5, 'word_image', 6, 2);
		const rows = await db.sql<{ id: string; group_number: number }>(
			'select id, group_number from public.players where session_id = $1',
			[game.sessionId]
		);
		const groupOf = new Map(rows.map((r) => [r.id, r.group_number]));
		const sizes = [1, 2].map((g) => rows.filter((r) => r.group_number === g).length).sort();
		expect(sizes).toEqual([2, 3]);
		const g = await db.game(game.sessionId);
		expect(g.turn_order.map((id: string) => groupOf.get(id))).toEqual([1, 2, 1, 2, 1]);
		const v = await view(game.host, game.sessionId);
		expect(v.session.group_count).toBe(2);
		expect(v.players.every((p: { group: number }) => p.group === 1 || p.group === 2)).toBe(true);
	});

	test('without groups players have no group', async () => {
		const game = await startedGame(3);
		const rows = await db.sql('select 1 from public.players where session_id = $1 and group_number is not null', [game.sessionId]);
		expect(rows).toEqual([]);
	});

	test('insufficient vocabulary prevents initialisation and leaves no partial game', async () => {
		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createSession(host, 'opposites', 12, 2);
		await db.join(joinCode, 'A');
		await db.join(joinCode, 'B', '🐼');
		// Deactivate all but 8 opposite pairs.
		await db.sql(
			`update public.vocabulary_pairs set active = false where variant = 'opposites'
			 and id not in (select id from public.vocabulary_pairs where variant = 'opposites' order by id limit 8)`
		);
		try {
			const res = await db.rpc(host, 'start_game', { p_session_id: sessionId });
			expect(res.error).toBe('not_enough_vocabulary');
			expect(await db.game(sessionId)).toBeUndefined();
			expect(res.view!.session.status).toBe('lobby');
			// Groups were not assigned either.
			expect(await db.sql('select 1 from public.players where session_id = $1 and group_number is not null', [sessionId])).toEqual([]);
		} finally {
			await db.sql(`update public.vocabulary_pairs set active = true where variant = 'opposites'`);
		}
	});
});

describe('Matchen on one shared board', () => {
	test('a match scores one point and keeps the turn; a mismatch reveals then passes the turn', async () => {
		const game = await startedGame(3);
		const pairs = await db.matchingPairs(game.sessionId);
		const first = await game.active();

		let res = await db.flip(first.user, game.sessionId, pairs[0]![0]);
		expect(res.ok).toBe(true);
		expect(res.view!.game.first_flip).toBe(pairs[0]![0]);
		res = await db.flip(first.user, game.sessionId, pairs[0]![1]);
		expect(res.ok).toBe(true);
		expect(await score(first.playerId)).toBe(1);
		expect(res.view!.game.active_player_id).toBe(first.playerId);
		expect(res.view!.game.last_attempt.outcome).toBe('match');
		expect(res.view!.game.matched).toEqual({ [pairs[0]![0]]: first.playerId, [pairs[0]![1]]: first.playerId });

		await db.flip(first.user, game.sessionId, pairs[1]![0]);
		res = await db.flip(first.user, game.sessionId, pairs[2]![0]);
		expect(res.view!.game.mismatch_positions).toEqual([pairs[1]![0], pairs[2]![0]]);
		expect(res.view!.game.reveal_until).not.toBeNull();
		expect(await score(first.playerId)).toBe(1);

		// While the reveal is pending the turn has not moved and nobody can flip.
		const g = await db.game(game.sessionId);
		expect(g.active_player_id).toBe(first.playerId);
		const third = await db.flip(first.user, game.sessionId, pairs[3]![0]);
		expect(third.error).toBe('reveal_pending');

		await db.expireDeadlines(game.sessionId);
		const after = await view(first.user, game.sessionId);
		const expectedNext = g.turn_order[(g.turn_order.indexOf(first.playerId) + 1) % 3];
		expect(after.game.active_player_id).toBe(expectedNext);
		expect(after.game.mismatch_positions).toBeNull();
		// Mismatched cards are face down again; the matched pair is still face up.
		expect(Object.keys(after.game.faces).map(Number).sort()).toEqual([...pairs[0]!].sort((a, b) => a - b));
	});

	test('matched cards stay face up for everyone when the turn passes, and cannot be flipped again', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const first = await game.active();
		const second = game.players.find((p) => p.playerId !== first.playerId)!;
		await db.flip(first.user, game.sessionId, pairs[0]![0]);
		await db.flip(first.user, game.sessionId, pairs[0]![1]);
		await db.flip(first.user, game.sessionId, pairs[1]![0]);
		await db.flip(first.user, game.sessionId, pairs[2]![0]);
		await db.expireDeadlines(game.sessionId);

		for (const viewer of [game.host, first.user, second.user]) {
			const v = await view(viewer, game.sessionId);
			expect(v.game.active_player_id).toBe(second.playerId);
			expect(Object.keys(v.game.matched).map(Number).sort((a, b) => a - b)).toEqual([...pairs[0]!].sort((a, b) => a - b));
			expect(v.game.faces[String(pairs[0]![0])]).toBeTruthy();
			expect(v.game.faces[String(pairs[0]![1])]).toBeTruthy();
		}
		expect((await db.flip(second.user, game.sessionId, pairs[0]![0])).error).toBe('already_matched');
	});

	test('duplicate action ids never award additional points', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, pairs[0]![0]);
		const actionId = crypto.randomUUID();
		const rev = await db.revision(game.sessionId);
		const first = await db.flip(p.user, game.sessionId, pairs[0]![1], { actionId, revision: rev });
		expect(first.ok).toBe(true);
		const replay = await db.flip(p.user, game.sessionId, pairs[0]![1], { actionId, revision: rev });
		expect(replay.error).toBe('duplicate_action');
		const replay2 = await db.flip(p.user, game.sessionId, pairs[0]![1], { actionId });
		expect(replay2.error).toBe('duplicate_action');
		expect(await score(p.playerId)).toBe(1);
	});

	test('stale revisions are rejected without changing state', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		const rev = await db.revision(game.sessionId);
		const res = await db.flip(p.user, game.sessionId, pairs[0]![0], { revision: rev - 1 });
		expect(res.error).toBe('stale_state');
		expect(await db.revision(game.sessionId)).toBe(rev);
		expect((await db.game(game.sessionId)).first_flip).toBeNull();
	});

	test('invalid flips are rejected and do not mutate state', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		const other = game.players.find((x) => x.playerId !== p.playerId)!;
		const before = await db.revision(game.sessionId);

		expect((await db.flip(other.user, game.sessionId, 0)).error).toBe('not_your_turn');
		expect((await db.flip(p.user, game.sessionId, 99)).error).toBe('invalid_position');
		expect((await db.flip(p.user, game.sessionId, -1)).error).toBe('invalid_position');
		expect((await db.flip(game.host, game.sessionId, 0)).error).toBe('forbidden');
		expect(await db.revision(game.sessionId)).toBe(before);

		await db.flip(p.user, game.sessionId, pairs[0]![0]);
		expect((await db.flip(p.user, game.sessionId, pairs[0]![0])).error).toBe('already_flipped');
		await db.flip(p.user, game.sessionId, pairs[0]![1]);
		expect((await db.flip(p.user, game.sessionId, pairs[0]![0])).error).toBe('already_matched');
		expect(await score(p.playerId)).toBe(1);
	});

	test('the game ends when every pair is found; the highest score wins; further flips are rejected', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const first = await game.active();
		const second = game.players.find((x) => x.playerId !== first.playerId)!;
		// First player finds one pair and misses; the second finds the remaining five.
		await db.flip(first.user, game.sessionId, pairs[0]![0]);
		await db.flip(first.user, game.sessionId, pairs[0]![1]);
		await db.flip(first.user, game.sessionId, pairs[1]![0]);
		await db.flip(first.user, game.sessionId, pairs[2]![0]);
		await db.expireDeadlines(game.sessionId);
		// Clients refetch at the deadline, which resolves the reveal.
		expect((await view(second.user, game.sessionId)).game.active_player_id).toBe(second.playerId);
		let res = null;
		for (const [a, b] of pairs.slice(1)) {
			await db.flip(second.user, game.sessionId, a);
			res = await db.flip(second.user, game.sessionId, b);
		}
		expect(res!.view!.session.status).toBe('completed');
		expect(res!.view!.game).toMatchObject({ status: 'completed', end_reason: 'board_cleared', winner_ids: [second.playerId] });
		expect(await score(second.playerId)).toBe(5);
		expect(await score(first.playerId)).toBe(1);

		expect((await db.flip(first.user, game.sessionId, 0)).error).toBe('game_not_active');
		expect((await db.flip(second.user, game.sessionId, 0)).error).toBe('game_not_active');
		expect((await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId })).error).toBe('session_completed');
	});

	test('a Matchen session rejects answers', async () => {
		const game = await startedGame(2);
		const p = await game.active();
		expect((await db.answer(p.user, game.sessionId, 'werk', 0)).error).toBe('wrong_game_mode');
	});
});

describe('no turn timer; the host can skip', () => {
	test('a player keeps the turn however long they take', async () => {
		const game = await startedGame(2);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, 0);
		// Even with the game started long ago, nothing expires.
		await db.sql(`update public.games set started_at = now() - interval '1 day' where session_id = $1`, [game.sessionId]);
		const before = await db.revision(game.sessionId);
		const v = await view(p.user, game.sessionId);
		expect(v.game.active_player_id).toBe(p.playerId);
		expect(v.game.first_flip).toBe(0);
		expect(v.game).not.toHaveProperty('turn_until');
		expect(await db.revision(game.sessionId)).toBe(before);
	});

	test('skip_turn turns back a pending first flip and passes the turn on', async () => {
		const game = await startedGame(3);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, 0);
		const g = await db.game(game.sessionId);
		const res = await db.rpc(game.host, 'skip_turn', { p_session_id: game.sessionId });
		expect(res.ok).toBe(true);
		expect(res.view!.game.active_player_id).toBe(g.turn_order[(g.turn_order.indexOf(p.playerId) + 1) % 3]);
		expect(res.view!.game.first_flip).toBeNull();
		expect(res.view!.game.faces).toEqual({});
		expect(res.view!.game.last_attempt).toMatchObject({ outcome: 'cancelled', player_id: p.playerId, first_position: 0 });
		// The skipped player can no longer flip.
		expect((await db.flip(p.user, game.sessionId, 1)).error).toBe('not_your_turn');
	});

	test('skip_turn during a mismatch reveal is refused; only the host may skip', async () => {
		const game = await startedGame(2);
		const p = await game.active();
		expect((await db.rpc(p.user, 'skip_turn', { p_session_id: game.sessionId })).error).toBe('not_host');
		expect((await db.rpc(await db.createHost(), 'skip_turn', { p_session_id: game.sessionId })).error).toBe('not_host');
		await db.flip(p.user, game.sessionId, 0);
		await db.flip(p.user, game.sessionId, await mismatchFor(game.sessionId, 0));
		expect((await db.rpc(game.host, 'skip_turn', { p_session_id: game.sessionId })).error).toBe('reveal_pending');
		await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect((await db.rpc(game.host, 'skip_turn', { p_session_id: game.sessionId })).error).toBe('session_completed');
	});
});

describe('deadlines, removal and ending', () => {
	test('an overdue mismatch reveal is resolved exactly once across many reads', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, pairs[0]![0]);
		await db.flip(p.user, game.sessionId, pairs[1]![0]);
		await db.expireDeadlines(game.sessionId);
		const before = await db.revision(game.sessionId);
		const readers = [game.host, ...game.players.map((x) => x.user)];
		const results = [];
		for (const reader of [...readers, ...readers]) {
			results.push(await db.rpc(reader, 'get_session_view', { p_session_id: game.sessionId }));
		}
		expect(await db.revision(game.sessionId)).toBe(before + 1);
		const g = await db.game(game.sessionId);
		expect(g.active_player_id).not.toBe(p.playerId);
		expect(new Set(results.map((r) => r.view!.game.active_player_id)).size).toBe(1);
	});

	test('a flip that arrives after the reveal ended first resolves it and is then rejected', async () => {
		const game = await startedGame(2);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, 0);
		await db.flip(p.user, game.sessionId, await mismatchFor(game.sessionId, 0));
		const rev = await db.revision(game.sessionId);
		await db.expireDeadlines(game.sessionId);
		const res = await db.flip(p.user, game.sessionId, 1, { revision: rev });
		expect(res.error).toBe('stale_state');
		// The resolution itself was committed.
		expect((await db.game(game.sessionId)).active_player_id).not.toBe(p.playerId);
		expect(await db.revision(game.sessionId)).toBe(rev + 1);
	});

	test('removing the active player cancels their attempt and advances the turn', async () => {
		const game = await startedGame(3);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, 0);
		const g = await db.game(game.sessionId);
		const res = await db.rpc(game.host, 'remove_player', { p_session_id: game.sessionId, p_player_id: p.playerId });
		expect(res.ok).toBe(true);
		expect(res.view!.game.active_player_id).toBe(g.turn_order[(g.turn_order.indexOf(p.playerId) + 1) % 3]);
		expect(res.view!.game.first_flip).toBeNull();
		expect(res.view!.session.status).toBe('in_progress');
		expect(res.view!.players.find((x: { id: string }) => x.id === p.playerId).status).toBe('removed');

		// The removed player cannot act or read the game any more.
		expect((await db.flip(p.user, game.sessionId, 1)).error).toBe('removed');
		expect((await db.rpc(p.user, 'get_session_view', { p_session_id: game.sessionId })).error).toBe('removed');
		// Removed players are skipped in the turn order.
		const next = await game.active();
		await db.flip(next.user, game.sessionId, 0);
		await db.flip(next.user, game.sessionId, await mismatchFor(game.sessionId, 0));
		await db.expireDeadlines(game.sessionId);
		await db.rpc(next.user, 'get_session_view', { p_session_id: game.sessionId });
		expect((await game.active()).playerId).not.toBe(p.playerId);
	});

	test('removal that leaves fewer than two players ends the game and keeps the removed score and pairs', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, pairs[0]![0]);
		await db.flip(p.user, game.sessionId, pairs[0]![1]);
		const res = await db.rpc(game.host, 'remove_player', { p_session_id: game.sessionId, p_player_id: p.playerId });
		const other = game.players.find((x) => x.playerId !== p.playerId)!;
		expect(res.view!.game).toMatchObject({ status: 'completed', end_reason: 'not_enough_players', winner_ids: [other.playerId] });
		expect(res.view!.players.find((x: { id: string }) => x.id === p.playerId)).toMatchObject({ status: 'removed', score: 1 });
		expect(Object.values(res.view!.game.matched)).toEqual([p.playerId, p.playerId]);
	});

	test('the host can end the game early; equal top scores are a tie', async () => {
		const game = await startedGame(3);
		const res = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect(res.view!.game).toMatchObject({ status: 'completed', end_reason: 'ended_by_host', winning_groups: [] });
		expect([...res.view!.game.winner_ids].sort()).toEqual(game.players.map((p) => p.playerId).sort());
		const [s] = await db.sql<{ status: string; ended_at: string | null }>(
			'select status, ended_at from public.game_sessions where id = $1',
			[game.sessionId]
		);
		expect(s!.status).toBe('completed');
		expect(s!.ended_at).not.toBeNull();
	});

	test('results persist and are returned unchanged on later reads', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, pairs[0]![0]);
		await db.flip(p.user, game.sessionId, pairs[0]![1]);
		const ended = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		const later = await view(game.players[0]!.user, game.sessionId);
		expect(later.game).toEqual({ ...ended.view!.game });
		expect(later.game.winner_ids).toEqual([p.playerId]);
	});
});

describe('groups', () => {
	test('the group with the most points wins; its active members are the winners', async () => {
		const game = await startedGame(4, 'word_image', 6, 2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, pairs[0]![0]);
		await db.flip(p.user, game.sessionId, pairs[0]![1]);
		const res = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		const players = res.view!.players as { id: string; group: number }[];
		const group = players.find((x) => x.id === p.playerId)!.group;
		expect(res.view!.game.winning_groups).toEqual([group]);
		expect([...res.view!.game.winner_ids].sort()).toEqual(players.filter((x) => x.group === group).map((x) => x.id).sort());
	});

	test('equal group results are a tie between groups', async () => {
		const game = await startedGame(4, 'word_image', 6, 2);
		const res = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect(res.view!.game.winning_groups).toEqual([1, 2]);
		expect(res.view!.game.winner_ids).toHaveLength(4);
	});

	test('uneven groups are compared by points per member', async () => {
		const game = await startedGame(3, 'word_image', 6, 2);
		const rows = await db.sql<{ id: string; group_number: number }>(
			'select id, group_number from public.players where session_id = $1',
			[game.sessionId]
		);
		const big = rows.filter((r) => r.group_number === 1).map((r) => r.id);
		const small = rows.filter((r) => r.group_number === 2).map((r) => r.id);
		expect([big.length, small.length]).toEqual([2, 1]);
		// Group 1: 3 points over 2 players (1.5 each). Group 2: 2 points over 1 player.
		await db.sql('update public.players set score = 3 where id = $1', [big[0]]);
		await db.sql('update public.players set score = 2 where id = $1', [small[0]]);
		const res = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect(res.view!.game.winning_groups).toEqual([2]);
		expect(res.view!.game.winner_ids).toEqual([small[0]]);
	});

	test('removed members count for their group but a group with no active members cannot win', async () => {
		const game = await startedGame(3, 'word_image', 6, 3);
		const rows = await db.sql<{ id: string; group_number: number }>(
			'select id, group_number from public.players where session_id = $1 order by group_number',
			[game.sessionId]
		);
		await db.sql('update public.players set score = 5 where id = $1', [rows[0]!.id]);
		await db.sql('update public.players set score = 1 where id = $1', [rows[1]!.id]);
		await db.rpc(game.host, 'remove_player', { p_session_id: game.sessionId, p_player_id: rows[0]!.id });
		const res = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect(res.view!.game.winning_groups).toEqual([2]);
		expect(res.view!.game.winner_ids).toEqual([rows[1]!.id]);
	});
});

describe('Fill in the Blanks', () => {
	test('start creates the rounds, each with four shuffled options including the answer', async () => {
		const game = await startedBlanks(['beginner', 'advanced'], 8);
		const rounds = await db.sql<{ round: number; options: string[]; answer: string; distractors: string[] }>(
			`select r.round, r.options, q.answer, q.distractors
			 from public.game_rounds r join public.games g on g.id = r.game_id
			 join public.grammar_questions q on q.id = r.question_id
			 where g.session_id = $1 order by r.round`,
			[game.sessionId]
		);
		expect(rounds.map((r) => r.round)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		for (const r of rounds) expect([...r.options].sort()).toEqual([r.answer, ...r.distractors].sort());
		const g = await db.game(game.sessionId);
		expect(g).toMatchObject({ current_round: 0, active_player_id: null, reveal_until: null });
	});

	test('choice players get the options; typing players do not; nobody sees the answer while the round is open', async () => {
		const game = await startedBlanks(['elementary', 'intermediate']);
		const [chooser, typer] = game.players as [Joined, Joined];
		const q = await db.currentQuestion(game.sessionId);
		const a = (await view(chooser.user, game.sessionId)).game.round;
		const b = (await view(typer.user, game.sessionId)).game.round;
		const h = (await view(game.host, game.sessionId)).game.round;
		expect(a).toMatchObject({ index: 0, count: 6, phase: 'answering', answer_mode: 'choice', correct_answer: null, results: null });
		expect([...a.options].sort()).toEqual([...q.options].sort());
		expect(b).toMatchObject({ answer_mode: 'type', options: null, correct_answer: null });
		expect(h).toMatchObject({ answer_mode: null, correct_answer: null });
		expect(h.options).toHaveLength(4);
		for (const r of [a, b, h]) {
			const json = JSON.stringify(r);
			expect(json).not.toContain('distractors');
			expect(r.sentence).toContain('___');
		}
		// The typing player's view does not leak the answer anywhere.
		expect(JSON.stringify(await view(typer.user, game.sessionId))).not.toContain(`"${q.answer}"`);
	});

	test('a correct answer scores one point; a wrong one scores nothing; answers are final', async () => {
		const game = await startedBlanks(['beginner', 'advanced', 'beginner']);
		const [a, b] = game.players as [Joined, Joined, Joined];
		const q = await db.currentQuestion(game.sessionId);
		expect((await db.answer(a.user, game.sessionId, q.answer)).ok).toBe(true);
		expect((await db.answer(b.user, game.sessionId, `${q.answer}x`)).ok).toBe(true);
		expect(await score(a.playerId)).toBe(1);
		expect(await score(b.playerId)).toBe(0);
		expect((await db.answer(a.user, game.sessionId, q.answer)).error).toBe('already_answered');
		expect(await score(a.playerId)).toBe(1);
		const v = await view(a.user, game.sessionId);
		expect(v.game.round).toMatchObject({ phase: 'answering', my_answer: q.answer, correct_answer: null });
		expect([...v.game.round.answered].sort()).toEqual([a.playerId, b.playerId].sort());
	});

	test('typed answers ignore case, spaces and final punctuation', async () => {
		const game = await startedBlanks(['advanced', 'advanced']);
		const [a] = game.players as [Joined, Joined];
		const q = await db.currentQuestion(game.sessionId);
		expect((await db.answer(a.user, game.sessionId, `  ${q.answer.toUpperCase()}. `)).ok).toBe(true);
		expect(await score(a.playerId)).toBe(1);
	});

	test('choice players must pick one of the options; answers are validated', async () => {
		const game = await startedBlanks(['beginner', 'advanced']);
		const [chooser, typer] = game.players as [Joined, Joined];
		expect((await db.answer(chooser.user, game.sessionId, 'iets anders')).error).toBe('invalid_answer');
		expect((await db.answer(typer.user, game.sessionId, '   ')).error).toBe('invalid_answer');
		expect((await db.answer(typer.user, game.sessionId, 'x'.repeat(61))).error).toBe('invalid_answer');
		expect((await db.answer(typer.user, game.sessionId, 'iets anders')).ok).toBe(true);
		expect((await db.answer(game.host, game.sessionId, 'x')).error).toBe('forbidden');
	});

	test('the round closes when everyone has answered: the answer is revealed, then the next round starts', async () => {
		const game = await startedBlanks(['beginner', 'advanced']);
		const [a, b] = game.players as [Joined, Joined];
		const q = await db.currentQuestion(game.sessionId);
		await db.answer(a.user, game.sessionId, q.answer);
		const wrong = q.distractors[0]!;
		const res = await db.answer(b.user, game.sessionId, wrong);
		expect(res.view!.game.round).toMatchObject({
			index: 0,
			phase: 'reveal',
			correct_answer: q.answer,
			results: { [a.playerId]: true, [b.playerId]: false }
		});
		expect(res.view!.game.reveal_until).not.toBeNull();
		// Answers after the round closed are refused.
		expect((await db.answer(a.user, game.sessionId, q.answer, 0)).error).toBe('round_closed');

		await db.expireDeadlines(game.sessionId);
		const next = await view(a.user, game.sessionId);
		expect(next.game.round).toMatchObject({ index: 1, phase: 'answering', my_answer: null, correct_answer: null, answered: [] });
		expect(next.game.reveal_until).toBeNull();
		// An answer for an old round is refused.
		expect((await db.answer(b.user, game.sessionId, 'x', 0)).error).toBe('round_closed');
	});

	test('after the last round the game ends; the best score wins', async () => {
		const game = await startedBlanks(['beginner', 'beginner'], 6);
		const [a, b] = game.players as [Joined, Joined];
		let res = null;
		for (let round = 0; round < 6; round++) {
			const q = await db.currentQuestion(game.sessionId);
			await db.answer(a.user, game.sessionId, q.answer);
			res = await db.answer(b.user, game.sessionId, round === 0 ? q.answer : q.distractors[0]!);
			await db.expireDeadlines(game.sessionId);
			res = await db.rpc(a.user, 'get_session_view', { p_session_id: game.sessionId });
		}
		expect(res!.view!.session.status).toBe('completed');
		expect(res!.view!.game).toMatchObject({ status: 'completed', end_reason: 'all_rounds_played', winner_ids: [a.playerId], round: null });
		expect(await score(a.playerId)).toBe(6);
		expect(await score(b.playerId)).toBe(1);
		expect((await db.answer(a.user, game.sessionId, 'x')).error).toBe('game_not_active');
	});

	test('the host can close a round early; players who did not answer score nothing', async () => {
		const game = await startedBlanks(['beginner', 'beginner']);
		const [a, b] = game.players as [Joined, Joined];
		const q = await db.currentQuestion(game.sessionId);
		await db.answer(a.user, game.sessionId, q.answer);
		expect((await db.rpc(a.user, 'skip_turn', { p_session_id: game.sessionId })).error).toBe('not_host');
		const res = await db.rpc(game.host, 'skip_turn', { p_session_id: game.sessionId });
		expect(res.ok).toBe(true);
		expect(res.view!.game.round).toMatchObject({ phase: 'reveal', correct_answer: q.answer, results: { [a.playerId]: true } });
		expect(res.view!.game.round.results).not.toHaveProperty(b.playerId);
		expect((await db.answer(b.user, game.sessionId, q.answer)).error).toBe('round_closed');
		// Skipping again during the reveal changes nothing.
		const rev = await db.revision(game.sessionId);
		expect((await db.rpc(game.host, 'skip_turn', { p_session_id: game.sessionId })).ok).toBe(true);
		expect(await db.revision(game.sessionId)).toBe(rev);
	});

	test('removing the last player who had not answered closes the round', async () => {
		const game = await startedBlanks(['beginner', 'beginner', 'beginner']);
		const [a, b, c] = game.players as [Joined, Joined, Joined];
		const q = await db.currentQuestion(game.sessionId);
		await db.answer(a.user, game.sessionId, q.answer);
		await db.answer(b.user, game.sessionId, q.answer);
		const res = await db.rpc(game.host, 'remove_player', { p_session_id: game.sessionId, p_player_id: c.playerId });
		expect(res.view!.game.round.phase).toBe('reveal');
		expect(res.view!.session.status).toBe('in_progress');
	});

	test('with groups, every correct answer counts for the group', async () => {
		const game = await startedBlanks(['beginner', 'beginner', 'beginner', 'beginner'], 6, 2);
		const players = (await view(game.host, game.sessionId)).players as { id: string; group: number }[];
		const group1 = players.filter((p) => p.group === 1).map((p) => p.id);
		const q = await db.currentQuestion(game.sessionId);
		for (const p of game.players) {
			await db.answer(p.user, game.sessionId, group1.includes(p.playerId) ? q.answer : q.distractors[0]!);
		}
		const res = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect(res.view!.game.winning_groups).toEqual([1]);
		expect([...res.view!.game.winner_ids].sort()).toEqual([...group1].sort());
	});

	test('a Fill in the Blanks session rejects flips; it needs enough sentences to start', async () => {
		const game = await startedBlanks();
		expect((await db.flip(game.players[0]!.user, game.sessionId, 0)).error).toBe('wrong_game_mode');

		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createBlanksSession(host, 12);
		await db.join(joinCode, 'A');
		await db.join(joinCode, 'B', '🐼');
		await db.sql(
			`update public.grammar_questions set active = false
			 where id not in (select id from public.grammar_questions order by id limit 8)`
		);
		try {
			const res = await db.rpc(host, 'start_game', { p_session_id: sessionId });
			expect(res.error).toBe('not_enough_questions');
			expect(await db.game(sessionId)).toBeUndefined();
		} finally {
			await db.sql(`update public.grammar_questions set active = true`);
		}
	});
});

describe('realtime notifications', () => {
	test('broadcasts carry only the session id and revision on the private session topic', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, pairs[0]![0]);
		const messages = await db.sql<{ topic: string; event: string; private: boolean; payload: Record<string, unknown> }>(
			`select topic, event, private, payload from realtime.messages where topic = $1 order by id`,
			[`session:${game.sessionId}`]
		);
		expect(messages.length).toBeGreaterThan(0);
		for (const m of messages) {
			expect(m.private).toBe(true);
			expect(m.event).toBe('state');
			expect(Object.keys(m.payload).sort()).toEqual(['revision', 'session_id']);
		}
		expect(messages.at(-1)!.payload.revision).toBe(await db.revision(game.sessionId));
	});
});
