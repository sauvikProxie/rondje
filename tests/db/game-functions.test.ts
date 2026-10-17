/**
 * Runs the real supabase/schema.sql + seed.sql in PGlite and exercises the
 * database functions that are the authoritative game implementation.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	AVATARS,
	JOIN_CODE_ALPHABET,
	PAIR_COUNTS,
	REVEAL_INTERVAL_MS,
	TURN_TIME_LIMIT_MS,
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

/** Session in progress with `n` players; returns players keyed by id and helpers. */
async function startedGame(n = 2, variant = 'word_image', pairCount = 6) {
	const host = await db.createHost();
	const { sessionId, joinCode } = await db.createSession(host, variant, pairCount);
	const joined: { user: User; playerId: string }[] = [];
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

async function score(playerId: string): Promise<number> {
	const rows = await db.sql<{ score: number }>('select score from public.players where id = $1', [playerId]);
	return rows[0]!.score;
}

describe('seed vocabulary', () => {
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
});

describe('shared constants match the TypeScript definitions', () => {
	test('timing, join-code alphabet and avatars', async () => {
		const [row] = await db.sql<{ reveal: number; turn: number; alphabet: string; avatars: string[] }>(
			`select extract(epoch from private.reveal_interval()) * 1000 as reveal,
				extract(epoch from private.turn_time_limit()) * 1000 as turn,
				private.join_code_alphabet() as alphabet,
				private.allowed_avatars() as avatars`
		);
		expect(Number(row!.reveal)).toBe(REVEAL_INTERVAL_MS);
		expect(Number(row!.turn)).toBe(TURN_TIME_LIMIT_MS);
		expect(row!.alphabet).toBe(JOIN_CODE_ALPHABET);
		expect(row!.avatars).toEqual([...AVATARS]);
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
		const base = { p_name: 'Les 1', p_variant: 'de_het', p_pair_count: 8 };
		expect((await db.rpc(host, 'create_session', { ...base, p_pair_count: 10 })).error).toBe('invalid_pair_count');
		expect((await db.rpc(host, 'create_session', { ...base, p_variant: 'memory' })).error).toBe('invalid_variant');
		expect((await db.rpc(host, 'create_session', { ...base, p_name: '   ' })).error).toBe('invalid_session_name');
		expect((await db.rpc(host, 'create_session', base)).ok).toBe(true);
	});

	test('anonymous users cannot create sessions', async () => {
		const anon = await db.createUser({ anonymous: true });
		const res = await db.rpc(anon, 'create_session', { p_name: 'X', p_variant: 'de_het', p_pair_count: 6 });
		expect(res.error).toBe('not_host');
	});

	test('lookup validates the code and reports membership', async () => {
		const host = await db.createHost();
		const { joinCode } = await db.createSession(host);
		expect((await db.rpc(null, 'lookup_session', { p_join_code: 'abc' })).error).toBe('invalid_join_code');
		expect((await db.rpc(null, 'lookup_session', { p_join_code: 'ZZZZZZ' })).error).toBe('session_not_found');
		const visitor = await db.rpc(null, 'lookup_session', { p_join_code: joinCode.toLowerCase() });
		expect(visitor.ok).toBe(true);
		expect(visitor.membership).toBe('none');
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

	test.each(VARIANTS.flatMap((v) => PAIR_COUNTS.map((n) => [v, n] as const)))(
		'%s with %i pairs generates one valid shared layout',
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

			// Every player's board covers every position, unmatched.
			const cells = await db.sql<{ player_id: string; n: number; matched: number }>(
				`select player_id, count(*)::int as n, count(matched_at)::int as matched
				 from public.board_cells bc join public.games g on g.id = bc.game_id
				 where g.session_id = $1 group by player_id`,
				[game.sessionId]
			);
			expect(cells).toHaveLength(3);
			expect(cells.every((c) => c.n === pairCount * 2 && c.matched === 0)).toBe(true);

			const g = await db.game(game.sessionId);
			expect([...g.turn_order].sort()).toEqual(game.players.map((p) => p.playerId).sort());
			expect(g.active_player_id).toBe(g.turn_order[0]);
		}
	);

	test('insufficient vocabulary prevents initialisation and leaves no partial game', async () => {
		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createSession(host, 'opposites', 12);
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
		} finally {
			await db.sql(`update public.vocabulary_pairs set active = true where variant = 'opposites'`);
		}
	});
});

describe('turns, matching and scoring', () => {
	test('a match scores one point and keeps the turn; a mismatch reveals then passes the turn', async () => {
		const game = await startedGame(3);
		const pairs = await db.matchingPairs(game.sessionId);
		const first = await game.active();

		let res = await db.flip(first.user, game.sessionId, first.playerId, pairs[0]![0]);
		expect(res.ok).toBe(true);
		expect(res.view!.game.first_flip).toBe(pairs[0]![0]);
		res = await db.flip(first.user, game.sessionId, first.playerId, pairs[0]![1]);
		expect(res.ok).toBe(true);
		expect(await score(first.playerId)).toBe(1);
		expect(res.view!.game.active_player_id).toBe(first.playerId);
		expect(res.view!.game.last_attempt.outcome).toBe('match');

		// Other boards are unaffected.
		const otherMatched = await db.sql(
			`select 1 from public.board_cells where player_id <> $1 and matched_at is not null`,
			[first.playerId]
		);
		expect(otherMatched).toEqual([]);

		await db.flip(first.user, game.sessionId, first.playerId, pairs[1]![0]);
		res = await db.flip(first.user, game.sessionId, first.playerId, pairs[2]![0]);
		expect(res.view!.game.mismatch_positions).toEqual([pairs[1]![0], pairs[2]![0]]);
		expect(res.view!.game.reveal_until).not.toBeNull();
		expect(await score(first.playerId)).toBe(1);

		// While the reveal is pending the turn has not moved and nobody can flip.
		const g = await db.game(game.sessionId);
		expect(g.active_player_id).toBe(first.playerId);
		const third = await db.flip(first.user, game.sessionId, first.playerId, pairs[3]![0]);
		expect(third.error).toBe('reveal_pending');

		await db.expireDeadlines(game.sessionId);
		const after = await db.rpc(first.user, 'get_session_view', { p_session_id: game.sessionId });
		const expectedNext = g.turn_order[(g.turn_order.indexOf(first.playerId) + 1) % 3];
		expect(after.view!.game.active_player_id).toBe(expectedNext);
		expect(after.view!.game.mismatch_positions).toBeNull();
		// Mismatched cards are face down again: their content is no longer sent.
		expect(Object.keys(after.view!.game.faces).map(Number).sort()).toEqual([...pairs[0]!].sort((a, b) => a - b));
	});

	test('duplicate action ids never award additional points', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0]);
		const actionId = crypto.randomUUID();
		const rev = await db.revision(game.sessionId);
		const first = await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![1], { actionId, revision: rev });
		expect(first.ok).toBe(true);
		const replay = await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![1], { actionId, revision: rev });
		expect(replay.error).toBe('duplicate_action');
		const replay2 = await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![1], { actionId });
		expect(replay2.error).toBe('duplicate_action');
		expect(await score(p.playerId)).toBe(1);
	});

	test('stale revisions are rejected without changing state', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		const rev = await db.revision(game.sessionId);
		const res = await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0], { revision: rev - 1 });
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

		expect((await db.flip(other.user, game.sessionId, other.playerId, 0)).error).toBe('not_your_turn');
		expect((await db.flip(p.user, game.sessionId, other.playerId, 0)).error).toBe('not_your_board');
		expect((await db.flip(p.user, game.sessionId, p.playerId, 99)).error).toBe('invalid_position');
		expect((await db.flip(p.user, game.sessionId, p.playerId, -1)).error).toBe('invalid_position');
		expect((await db.flip(game.host, game.sessionId, p.playerId, 0)).error).toBe('forbidden');
		expect(await db.revision(game.sessionId)).toBe(before);

		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0]);
		expect((await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0])).error).toBe('already_flipped');
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![1]);
		expect((await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0])).error).toBe('already_matched');
		expect(await score(p.playerId)).toBe(1);
	});

	test('clearing a board ends the game immediately; that player wins; further flips are rejected', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		let res = null;
		for (const [a, b] of pairs) {
			await db.flip(p.user, game.sessionId, p.playerId, a);
			res = await db.flip(p.user, game.sessionId, p.playerId, b);
		}
		expect(res!.view!.session.status).toBe('completed');
		expect(res!.view!.game).toMatchObject({ status: 'completed', end_reason: 'board_cleared', winner_ids: [p.playerId] });
		expect(await score(p.playerId)).toBe(6);

		const other = game.players.find((x) => x.playerId !== p.playerId)!;
		expect((await db.flip(other.user, game.sessionId, other.playerId, 0)).error).toBe('game_not_active');
		expect((await db.flip(p.user, game.sessionId, p.playerId, 0)).error).toBe('game_not_active');
		expect((await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId })).error).toBe('session_completed');
		expect(await score(p.playerId)).toBe(6);
	});
});

describe('deadlines, removal and ending', () => {
	test('an overdue mismatch reveal is resolved exactly once across many reads', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0]);
		await db.flip(p.user, game.sessionId, p.playerId, pairs[1]![0]);
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

	test('an expired turn deadline turns back a pending first flip and advances the turn', async () => {
		const game = await startedGame(2);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, p.playerId, 0);
		await db.expireDeadlines(game.sessionId);
		const view = await db.rpc(p.user, 'get_session_view', { p_session_id: game.sessionId });
		expect(view.view!.game.first_flip).toBeNull();
		expect(view.view!.game.active_player_id).not.toBe(p.playerId);
		expect(view.view!.game.faces).toEqual({});
		expect(view.view!.game.last_attempt).toMatchObject({ outcome: 'timeout', player_id: p.playerId, first_position: 0 });
		expect(new Date(view.view!.game.turn_until).getTime()).toBeGreaterThan(Date.now());
		// The late player's flip with the old revision is rejected.
		const late = await db.flip(p.user, game.sessionId, p.playerId, 1);
		expect(late.error).toBe('not_your_turn');
	});

	test('a flip that arrives after the deadline first resolves it and is then rejected', async () => {
		const game = await startedGame(2);
		const p = await game.active();
		const rev = await db.revision(game.sessionId);
		await db.expireDeadlines(game.sessionId);
		const res = await db.flip(p.user, game.sessionId, p.playerId, 0, { revision: rev });
		expect(res.error).toBe('stale_state');
		// The resolution itself was committed.
		expect((await db.game(game.sessionId)).active_player_id).not.toBe(p.playerId);
		expect(await db.revision(game.sessionId)).toBe(rev + 1);
	});

	test('removing the active player cancels their attempt and advances the turn', async () => {
		const game = await startedGame(3);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, p.playerId, 0);
		const g = await db.game(game.sessionId);
		const res = await db.rpc(game.host, 'remove_player', { p_session_id: game.sessionId, p_player_id: p.playerId });
		expect(res.ok).toBe(true);
		expect(res.view!.game.active_player_id).toBe(g.turn_order[(g.turn_order.indexOf(p.playerId) + 1) % 3]);
		expect(res.view!.game.first_flip).toBeNull();
		expect(res.view!.session.status).toBe('in_progress');
		expect(res.view!.players.find((x: { id: string }) => x.id === p.playerId).status).toBe('removed');

		// The removed player cannot act or read the game any more.
		expect((await db.flip(p.user, game.sessionId, p.playerId, 1)).error).toBe('removed');
		expect((await db.rpc(p.user, 'get_session_view', { p_session_id: game.sessionId })).error).toBe('removed');
		// Removed players are skipped in the turn order.
		const next = await game.active();
		await db.flip(next.user, game.sessionId, next.playerId, 0);
		await db.flip(next.user, game.sessionId, next.playerId, await mismatchFor(game.sessionId, 0));
		await db.expireDeadlines(game.sessionId);
		await db.rpc(next.user, 'get_session_view', { p_session_id: game.sessionId });
		expect((await game.active()).playerId).not.toBe(p.playerId);
	});

	test('removal that leaves fewer than two players ends the game and keeps the removed score', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0]);
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![1]);
		const res = await db.rpc(game.host, 'remove_player', { p_session_id: game.sessionId, p_player_id: p.playerId });
		const other = game.players.find((x) => x.playerId !== p.playerId)!;
		expect(res.view!.game).toMatchObject({ status: 'completed', end_reason: 'not_enough_players', winner_ids: [other.playerId] });
		expect(res.view!.players.find((x: { id: string }) => x.id === p.playerId)).toMatchObject({ status: 'removed', score: 1 });
	});

	test('the host can end the game early; equal top scores are a tie', async () => {
		const game = await startedGame(3);
		const res = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		expect(res.view!.game).toMatchObject({ status: 'completed', end_reason: 'ended_by_host' });
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
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0]);
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![1]);
		const ended = await db.rpc(game.host, 'end_game', { p_session_id: game.sessionId });
		const later = await db.rpc(game.players[0]!.user, 'get_session_view', { p_session_id: game.sessionId });
		expect(later.view!.game).toEqual({ ...ended.view!.game });
		expect(later.view!.game.winner_ids).toEqual([p.playerId]);
	});
});

describe('realtime notifications', () => {
	test('broadcasts carry only the session id and revision on the private session topic', async () => {
		const game = await startedGame(2);
		const pairs = await db.matchingPairs(game.sessionId);
		const p = await game.active();
		await db.flip(p.user, game.sessionId, p.playerId, pairs[0]![0]);
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

/** A position whose card does NOT match the card at `position`. */
async function mismatchFor(sessionId: string, position: number): Promise<number> {
	const layout = await db.layout(sessionId);
	const pair = layout.find((c) => c.position === position)!.pair_id;
	return layout.find((c) => c.pair_id !== pair)!.position;
}
