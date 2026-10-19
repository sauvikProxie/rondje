/**
 * Several games in one session: configure_game() returns a finished session to
 * the lobby with new settings, points carry over into a running total and
 * every finished game keeps its own result.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AVATARS } from '../../src/lib/game/constants';
import { TestDb, type User } from './harness';

let db: TestDb;
beforeAll(async () => {
	db = await TestDb.create();
});
afterAll(async () => {
	await db.close();
});

type Joined = { user: User; playerId: string };

const MATCHEN = { p_mode: 'matchen', p_variant: 'word_image', p_pair_count: 6, p_group_count: 1 };
const BLANKS = { p_mode: 'fill_blanks', p_variant: null, p_pair_count: 6, p_group_count: 1 };

/** Matchen session in progress with `n` players. */
async function started(n = 2, groupCount = 1) {
	const host = await db.createHost();
	const { sessionId, joinCode } = await db.createSession(host, 'word_image', 6, groupCount);
	const players: Joined[] = [];
	for (let i = 0; i < n; i++) players.push(await db.join(joinCode, `Player ${i + 1}`, AVATARS[i]));
	expect((await db.rpc(host, 'start_game', { p_session_id: sessionId })).ok).toBe(true);
	const byId = new Map(players.map((p) => [p.playerId, p]));
	const active = async () => byId.get((await db.game(sessionId)).active_player_id)!;
	return { host, sessionId, joinCode, players, active };
}

/** The active player finds `count` pairs on the shared board. */
async function matchPairs(g: Awaited<ReturnType<typeof started>>, count: number) {
	const pairs = await db.matchingPairs(g.sessionId);
	const p = await g.active();
	for (const [a, b] of pairs.slice(0, count)) {
		await db.flip(p.user, g.sessionId, a);
		await db.flip(p.user, g.sessionId, b);
	}
	return p;
}

const configure = (user: User, sessionId: string, config: Record<string, unknown>) =>
	db.rpc(user, 'configure_game', { p_session_id: sessionId, ...config });

describe('configure_game after a game has finished', () => {
	test('returns the session to the lobby with the new settings and keeps the players', async () => {
		const g = await started(2);
		const scorer = await matchPairs(g, 2);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });

		const res = await configure(g.host, g.sessionId, { ...BLANKS, p_pair_count: 8 });
		expect(res).toMatchObject({ ok: true, error: null });
		const v = res.view!;
		expect(v.session).toMatchObject({
			status: 'lobby',
			mode: 'fill_blanks',
			variant: null,
			pair_count: 8,
			group_count: 1,
			started_at: null,
			ended_at: null
		});
		expect(v.game).toBeNull();
		// Same players, current scores reset, points carried into the session total.
		expect(v.players).toHaveLength(2);
		for (const p of v.players) expect(p).toMatchObject({ status: 'active', score: 0, group: null });
		expect(v.players.find((p: { id: string }) => p.id === scorer.playerId).total_score).toBe(2);
		// The finished game is kept as history.
		expect(v.history).toEqual([
			expect.objectContaining({
				number: 1,
				mode: 'matchen',
				variant: 'word_image',
				pair_count: 6,
				end_reason: 'ended_by_host',
				winner_ids: [scorer.playerId]
			})
		]);
	});

	test('the next game is numbered 2, plays normally and totals add up across games', async () => {
		const g = await started(2);
		const first = await matchPairs(g, 1);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		const firstGameId = (await db.game(g.sessionId)).id;

		await configure(g.host, g.sessionId, MATCHEN);
		const start = await db.rpc(g.host, 'start_game', { p_session_id: g.sessionId });
		expect(start.ok).toBe(true);
		expect(start.view!.game).toMatchObject({ number: 2, status: 'active', matched: {} });
		expect(start.view!.session.status).toBe('in_progress');

		const game2 = await db.game(g.sessionId);
		expect(game2).toMatchObject({ game_number: 2, mode: 'matchen', variant: 'word_image', pair_count: 6, group_count: 1 });
		expect(game2.id).not.toBe(firstGameId);
		// The first game's board is kept; the new one has its own.
		const layouts = await db.sql<{ game_id: string; n: number }>(
			'select game_id, count(*)::int as n from public.game_layout where game_id = any($1) group by game_id',
			[[firstGameId, game2.id]]
		);
		expect(layouts).toHaveLength(2);

		const second = await matchPairs(g, 2);
		const end = await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		expect(end.view!.game).toMatchObject({ number: 2, status: 'completed', winner_ids: [second.playerId] });
		expect(end.view!.history.map((h: { number: number }) => h.number)).toEqual([1, 2]);

		const totals = Object.fromEntries(
			end.view!.players.map((p: { id: string; score: number; total_score: number }) => [p.id, [p.score, p.total_score]])
		);
		if (first.playerId === second.playerId) {
			expect(totals[first.playerId]).toEqual([2, 3]);
		} else {
			expect(totals[first.playerId]).toEqual([0, 1]);
			expect(totals[second.playerId]).toEqual([2, 2]);
		}
	});

	test('a different game mode can follow, and the session can switch back again', async () => {
		const g = await started(2);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		await configure(g.host, g.sessionId, BLANKS);
		const blanks = await db.rpc(g.host, 'start_game', { p_session_id: g.sessionId });
		expect(blanks.view!.game).toMatchObject({ number: 2, card_count: 0 });
		expect(blanks.view!.game.round).toMatchObject({ index: 0, count: 6 });

		// Answer every round so the game ends by itself.
		for (let round = 0; round < 6; round++) {
			for (const p of g.players) await db.answer(p.user, g.sessionId, (await db.currentQuestion(g.sessionId)).answer);
			await db.expireDeadlines(g.sessionId);
			await db.rpc(g.host, 'get_session_view', { p_session_id: g.sessionId });
		}
		const done = await db.rpc(g.host, 'get_session_view', { p_session_id: g.sessionId });
		expect(done.view!.game).toMatchObject({ number: 2, status: 'completed', end_reason: 'all_rounds_played' });
		for (const p of done.view!.players) expect(p).toMatchObject({ score: 6, total_score: 6 });

		await configure(g.host, g.sessionId, { ...MATCHEN, p_variant: 'opposites' });
		const third = await db.rpc(g.host, 'start_game', { p_session_id: g.sessionId });
		expect(third.view!.game).toMatchObject({ number: 3, card_count: 12, round: null });
		expect(third.view!.session).toMatchObject({ mode: 'matchen', variant: 'opposites' });
	});

	test('new players can join between games and start with a total of 0', async () => {
		const g = await started(2);
		await matchPairs(g, 1);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });

		const lookup = await db.rpc(null, 'lookup_session', { p_join_code: g.joinCode });
		expect(lookup.session.status).toBe('completed');

		await configure(g.host, g.sessionId, MATCHEN);
		const late = await db.join(g.joinCode, 'Late', AVATARS[5]);
		const v = (await db.rpc(late.user, 'get_session_view', { p_session_id: g.sessionId })).view!;
		expect(v.players.find((p: { id: string }) => p.id === late.playerId)).toMatchObject({ score: 0, total_score: 0 });
		// The newcomer can see the earlier game's result.
		expect(v.history).toHaveLength(1);
		const start = await db.rpc(g.host, 'start_game', { p_session_id: g.sessionId });
		expect(start.view!.game.turn_order).toContain(late.playerId);
	});

	test('removed players stay removed; their points stay in their total but not in a later group result', async () => {
		const g = await started(3, 2);
		const scorer = await matchPairs(g, 2);
		await db.rpc(g.host, 'remove_player', { p_session_id: g.sessionId, p_player_id: scorer.playerId });
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });

		const lobby = await configure(g.host, g.sessionId, { ...MATCHEN, p_group_count: 2 });
		const removed = lobby.view!.players.find((p: { id: string }) => p.id === scorer.playerId);
		expect(removed).toMatchObject({ status: 'removed', score: 0, total_score: 2, group: null });
		expect((await db.rpc(scorer.user, 'get_session_view', { p_session_id: g.sessionId })).error).toBe('removed');

		const start = await db.rpc(g.host, 'start_game', { p_session_id: g.sessionId });
		expect(start.view!.game.turn_order).not.toContain(scorer.playerId);
		// With nobody scoring in game 2 the two groups tie: the removed player's
		// game-1 points do not count for any group.
		const end = await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		expect(end.view!.game.winning_groups).toEqual([1, 2]);
	});
});

describe('configure_game in the lobby and its guards', () => {
	test('in the lobby only the settings change', async () => {
		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createSession(host);
		const a = await db.join(joinCode, 'A');
		const before = await db.revision(sessionId);
		const res = await configure(host, sessionId, { ...MATCHEN, p_variant: 'de_het', p_pair_count: 12, p_group_count: 2 });
		expect(res.ok).toBe(true);
		expect(res.view!.session).toMatchObject({ status: 'lobby', variant: 'de_het', pair_count: 12, group_count: 2 });
		expect(res.view!.players).toEqual([expect.objectContaining({ id: a.playerId, score: 0, total_score: 0 })]);
		expect(res.view!.history).toEqual([]);
		expect(await db.revision(sessionId)).toBe(before + 1);
	});

	test('is refused while a game is in progress', async () => {
		const g = await started(2);
		const res = await configure(g.host, g.sessionId, BLANKS);
		expect(res).toMatchObject({ ok: false, error: 'game_in_progress' });
		expect(res.view!.session).toMatchObject({ status: 'in_progress', mode: 'matchen' });
	});

	test('only the host can set up a game', async () => {
		const g = await started(2);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		expect((await configure(g.players[0]!.user, g.sessionId, MATCHEN)).error).toBe('not_host');
		const otherHost = await db.createHost();
		expect((await configure(otherHost, g.sessionId, MATCHEN)).error).toBe('not_host');
		await expect(configure(null as unknown as User, g.sessionId, MATCHEN)).rejects.toThrow(/permission denied/);
		const [s] = await db.sql<{ status: string }>('select status from public.game_sessions where id = $1', [g.sessionId]);
		expect(s!.status).toBe('completed');
	});

	test('invalid settings are rejected without changing anything', async () => {
		const g = await started(2);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		const cases: [Record<string, unknown>, string][] = [
			[{ ...MATCHEN, p_mode: 'poker' }, 'invalid_mode'],
			[{ ...MATCHEN, p_variant: null }, 'invalid_variant'],
			[{ ...MATCHEN, p_pair_count: 7 }, 'invalid_pair_count'],
			[{ ...MATCHEN, p_group_count: 5 }, 'invalid_group_count']
		];
		for (const [config, error] of cases) {
			const res = await configure(g.host, g.sessionId, config);
			expect(res.error, error).toBe(error);
			expect(res.view!.session.status).toBe('completed');
		}
		const scores = await db.sql<{ score: number; carried_score: number }>(
			'select score, carried_score from public.players where session_id = $1',
			[g.sessionId]
		);
		for (const s of scores) expect(s.carried_score).toBe(0);
	});

	test('configuring twice before starting does not carry points over twice', async () => {
		const g = await started(2);
		const scorer = await matchPairs(g, 3);
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		await configure(g.host, g.sessionId, BLANKS);
		const res = await configure(g.host, g.sessionId, MATCHEN);
		expect(res.view!.players.find((p: { id: string }) => p.id === scorer.playerId).total_score).toBe(3);
	});
});
