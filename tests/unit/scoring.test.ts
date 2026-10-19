import { describe, expect, test } from 'vitest';
import { endGame, flipCard } from '../../src/lib/game/game-state';
import {
	assignGroups,
	decideWinners,
	groupsUneven,
	isTie,
	rankGroups,
	rankPlayers,
	topScorers
} from '../../src/lib/game/scoring';
import { resolveOverdue } from '../../src/lib/game/turn-management';
import type { GameState } from '../../src/lib/game/types';
import { actionId, matchingPositions, newGame, nonMatchingPositions, T0 } from './fixtures';

function flip(state: GameState, playerId: string, position: number, id = actionId(), revision = state.revision) {
	return flipCard(state, { playerId, position, actionId: id, revision }, T0 + 1_000);
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

	test('the game ends when every pair on the shared board is found; the highest score wins', () => {
		let state = newGame({ pairCount: 6 });
		const [first, second] = state.turnOrder as [string, string, string];
		const pairs = matchingPositions(state);
		// First player finds one pair, then misses; the second player finds the rest.
		state = mustFlip(mustFlip(state, first, pairs[0]![0]), first, pairs[0]![1]);
		const [x, y] = nonMatchingPositions(state, new Set(pairs[0]));
		state = mustFlip(mustFlip(state, first, x), first, y);
		state = resolveOverdue(state, T0 + 60_000);
		pairs.slice(1).forEach(([a, b], i) => {
			state = mustFlip(state, second, a);
			state = mustFlip(state, second, b);
			if (i < pairs.length - 2) expect(state.status).toBe('active');
		});
		expect(state).toMatchObject({
			status: 'completed',
			endReason: 'board_cleared',
			winnerIds: [second],
			winningGroups: [],
			activePlayerId: null
		});
		expect(state.players[second]!.score).toBe(5);
		expect(state.players[first]!.score).toBe(1);
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
		state = resolveOverdue(state, T0 + 60_000);
		expect(state.activePlayerId).toBe(second);
		// second: one match on the shared board.
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

describe('groups', () => {
	const p = (id: string, group: number, score: number, status: 'active' | 'removed' = 'active') => ({ id, group, score, status });

	test('players are dealt round-robin into groups', () => {
		expect([...assignGroups(['a', 'b', 'c', 'd', 'e'], 2)]).toEqual([
			['a', 1], ['b', 2], ['c', 1], ['d', 2], ['e', 1]
		]);
		expect([...assignGroups(['a', 'b'], 1).values()]).toEqual([null, null]);
	});

	test('each group has its own scorecard with the total of its members', () => {
		const players = [p('a', 1, 3), p('b', 2, 1), p('c', 1, 2), p('d', 2, 4)];
		const standings = rankGroups(players, 2, [2]);
		expect(standings.map((s) => [s.group, s.total, s.rank, s.isWinner])).toEqual([
			[1, 5, 1, false],
			[2, 5, 1, true]
		]);
		expect(standings[0]!.members.map((m) => m.id)).toEqual(['a', 'c']);
	});

	test('the group with the most points wins; members of the winning group are the winners', () => {
		const players = [p('a', 1, 3), p('b', 2, 1), p('c', 1, 2), p('d', 2, 2)];
		expect(decideWinners(players, 2)).toEqual({ winnerIds: ['a', 'c'], winningGroups: [1] });
	});

	test('equal group results are a tie between groups', () => {
		const players = [p('a', 1, 3), p('b', 2, 1), p('c', 1, 0), p('d', 2, 2)];
		const result = decideWinners(players, 2);
		expect(result.winningGroups).toEqual([1, 2]);
		expect(isTie(result.winningGroups)).toBe(true);
	});

	test('uneven groups are ranked by points per member', () => {
		// Group 1: 3 players, 6 points (2 each). Group 2: 2 players, 5 points (2.5 each).
		const players = [p('a', 1, 2), p('b', 2, 3), p('c', 1, 2), p('d', 2, 2), p('e', 1, 2)];
		const standings = rankGroups(players, 2);
		expect(groupsUneven(standings)).toBe(true);
		expect(standings.map((s) => [s.group, s.total, s.rank])).toEqual([
			[2, 5, 1],
			[1, 6, 2]
		]);
		expect(decideWinners(players, 2).winningGroups).toEqual([2]);
	});

	test('removed members still count for their group but cannot win; a group with no active members cannot win', () => {
		const players = [p('a', 1, 4, 'removed'), p('b', 1, 1), p('c', 2, 2), p('d', 3, 9, 'removed')];
		const result = decideWinners(players, 3);
		expect(result).toEqual({ winnerIds: ['b'], winningGroups: [1] });
		const standings = rankGroups(players, 3, result.winningGroups);
		expect(standings.at(-1)).toMatchObject({ group: 3, rank: null, isWinner: false });
	});

	test('a game with groups ends with the winning group recorded', () => {
		let state = newGame({ players: ['a', 'b', 'c', 'd'], groupCount: 2, pairCount: 6 });
		const first = state.activePlayerId!;
		for (const [x, y] of matchingPositions(state)) {
			state = mustFlip(mustFlip(state, first, x), first, y);
		}
		const group = state.players[first]!.group!;
		expect(state.status).toBe('completed');
		expect(state.winningGroups).toEqual([group]);
		expect([...state.winnerIds].sort()).toEqual(
			Object.values(state.players).filter((x) => x.group === group).map((x) => x.id).sort()
		);
	});
});
