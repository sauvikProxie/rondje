import { describe, expect, test } from 'vitest';
import { endGame, flipCard } from '../../src/lib/game/game-state';
import { isTie, rankPlayers, topScorers } from '../../src/lib/game/scoring';
import type { GameState } from '../../src/lib/game/types';
import { actionId, matchingPositions, newGame, nonMatchingPositions, T0 } from './fixtures';

function flip(state: GameState, playerId: string, position: number, id = actionId(), revision = state.revision) {
	return flipCard(state, { playerId, boardPlayerId: playerId, position, actionId: id, revision }, T0 + 1_000);
}

function mustFlip(state: GameState, playerId: string, position: number) {
	const result = flip(state, playerId, position);
	if (!result.ok) throw new Error(`flip rejected: ${result.error}`);
	return result.state;
}

describe('scoring and completion', () => {
	test('a successful pair awards exactly one point', () => {
		const state = newGame();
		const p = state.activePlayerId!;
		const [[a, b]] = matchingPositions(state) as [[number, number]];
		const after = mustFlip(mustFlip(state, p, a), p, b);
		expect(after.players[p]!.score).toBe(1);
		expect(after.attempts.at(-1)).toMatchObject({ outcome: 'match', firstPosition: a, secondPosition: b });
	});

	test('a failed attempt awards no points', () => {
		const state = newGame();
		const p = state.activePlayerId!;
		const [a, b] = nonMatchingPositions(state);
		const after = mustFlip(mustFlip(state, p, a), p, b);
		expect(Object.values(after.players).every((x) => x.score === 0)).toBe(true);
	});

	test('a duplicate action cannot award additional points', () => {
		const state = newGame();
		const p = state.activePlayerId!;
		const [[a, b]] = matchingPositions(state) as [[number, number]];
		const pending = mustFlip(state, p, a);
		const id = actionId();
		const scored = flip(pending, p, b, id);
		expect(scored.ok).toBe(true);
		// Replay with the same action id and the same (now stale) revision...
		const replay = flip(scored.state, p, b, id, pending.revision);
		expect(replay).toMatchObject({ ok: false, error: 'duplicate_action' });
		// ...or with the current revision.
		const replay2 = flip(scored.state, p, b, id);
		expect(replay2).toMatchObject({ ok: false, error: 'duplicate_action' });
		expect(replay2.state.players[p]!.score).toBe(1);
	});

	test('the game ends as soon as one player clears their board, and that player wins', () => {
		let state = newGame({ pairCount: 6 });
		const p = state.activePlayerId!;
		const pairs = matchingPositions(state);
		pairs.forEach(([a, b], i) => {
			state = mustFlip(state, p, a);
			state = mustFlip(state, p, b);
			if (i < pairs.length - 1) expect(state.status).toBe('active');
		});
		expect(state).toMatchObject({
			status: 'completed',
			endReason: 'board_cleared',
			winnerIds: [p],
			activePlayerId: null,
			turnUntil: null
		});
		expect(state.players[p]!.score).toBe(6);
	});

	test('the game cannot continue after completion', () => {
		let state = newGame({ pairCount: 6 });
		const p = state.activePlayerId!;
		for (const [a, b] of matchingPositions(state)) {
			state = mustFlip(state, p, a);
			state = mustFlip(state, p, b);
		}
		for (const player of state.turnOrder) {
			expect(flip(state, player, 0)).toMatchObject({ ok: false, error: 'game_not_active' });
		}
		expect(endGame(state)).toMatchObject({ ok: false, error: 'session_completed' });
	});

	test('the host ending early picks the highest score; equal scores tie', () => {
		let state = newGame({ players: ['a', 'b', 'c'] });
		const [first, second] = state.turnOrder as [string, string, string];
		const pairs = matchingPositions(state);
		// first: one match, then a miss.
		state = mustFlip(mustFlip(state, first, pairs[0]![0]), first, pairs[0]![1]);
		const [x, y] = nonMatchingPositions(state, new Set(pairs[0]));
		state = mustFlip(mustFlip(state, first, x), first, y);
		state = { ...state, mismatch: null, revealUntil: null, activePlayerId: second, turnUntil: T0 + 60_000, revision: state.revision + 1 };
		// second: one match on their own board.
		state = mustFlip(mustFlip(state, second, pairs[1]![0]), second, pairs[1]![1]);

		const ended = endGame(state);
		expect(ended.ok).toBe(true);
		expect(ended.state).toMatchObject({ status: 'completed', endReason: 'ended_by_host' });
		expect([...ended.state.winnerIds].sort()).toEqual([first, second].sort());
		expect(isTie(ended.state.winnerIds)).toBe(true);
	});

	test('final rankings use competition ranking; removed players have no rank and cannot win', () => {
		const players = [
			{ id: 'a', score: 3, status: 'active' as const },
			{ id: 'b', score: 5, status: 'active' as const },
			{ id: 'c', score: 3, status: 'active' as const },
			{ id: 'd', score: 1, status: 'active' as const },
			{ id: 'e', score: 9, status: 'removed' as const }
		];
		expect(topScorers(players)).toEqual(['b']);
		const ranked = rankPlayers(players, topScorers(players));
		expect(ranked.map((r) => [r.player.id, r.rank, r.isWinner])).toEqual([
			['b', 1, true],
			['a', 2, false],
			['c', 2, false],
			['d', 4, false],
			['e', null, false]
		]);
	});

	test('ties at the top are represented as multiple winners sharing rank 1', () => {
		const players = [
			{ id: 'a', score: 2, status: 'active' as const },
			{ id: 'b', score: 2, status: 'active' as const },
			{ id: 'c', score: 0, status: 'active' as const }
		];
		const winners = topScorers(players);
		expect(winners).toEqual(['a', 'b']);
		expect(isTie(winners)).toBe(true);
		const ranked = rankPlayers(players, winners);
		expect(ranked.filter((r) => r.rank === 1).map((r) => r.player.id)).toEqual(['a', 'b']);
		expect(ranked.every((r) => r.isWinner === (r.rank === 1))).toBe(true);
	});
});
