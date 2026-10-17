import { describe, expect, test } from 'vitest';
import { REVEAL_INTERVAL_MS, TURN_TIME_LIMIT_MS } from '../../src/lib/game/constants';
import { flipCard } from '../../src/lib/game/game-state';
import { nextDeadline, nextPlayer, resolveOverdue } from '../../src/lib/game/turn-management';
import type { GameState } from '../../src/lib/game/types';
import { actionId, matchingPositions, newGame, nonMatchingPositions, T0 } from './fixtures';

function flip(state: GameState, playerId: string, position: number, now = T0 + 1_000, board = playerId) {
	return flipCard(state, { playerId, boardPlayerId: board, position, actionId: actionId(), revision: state.revision }, now);
}

function mustFlip(state: GameState, playerId: string, position: number, now = T0 + 1_000) {
	const result = flip(state, playerId, position, now);
	if (!result.ok) throw new Error(`flip rejected: ${result.error}`);
	return result.state;
}

describe('turn management', () => {
	test('the first player in the turn order receives the first turn', () => {
		const state = newGame();
		expect(state.activePlayerId).toBe(state.turnOrder[0]);
		expect(state.turnUntil).toBe(T0 + TURN_TIME_LIMIT_MS);
	});

	test('only the active player can flip', () => {
		const state = newGame();
		const [, other] = state.turnOrder;
		const result = flip(state, other!, 0);
		expect(result).toMatchObject({ ok: false, error: 'not_your_turn' });
		expect(result.state).toBe(state);
	});

	test('flips are limited to the active player’s own board', () => {
		const state = newGame();
		const [active, other] = state.turnOrder;
		const result = flip(state, active!, 0, T0 + 1_000, other!);
		expect(result).toMatchObject({ ok: false, error: 'not_your_board' });
	});

	test('cards are flipped one at a time: the first flip is pending', () => {
		const state = newGame();
		const active = state.activePlayerId!;
		const after = mustFlip(state, active, 3);
		expect(after.firstFlip).toBe(3);
		expect(after.activePlayerId).toBe(active);
		expect(after.revision).toBe(state.revision + 1);
	});

	test('a successful match retains the turn and resets the deadline', () => {
		const state = newGame();
		const active = state.activePlayerId!;
		const [[a, b]] = matchingPositions(state) as [[number, number]];
		const now = T0 + 30_000;
		const after = mustFlip(mustFlip(state, active, a, now), active, b, now);
		expect(after.activePlayerId).toBe(active);
		expect(after.firstFlip).toBeNull();
		expect(after.turnUntil).toBe(now + TURN_TIME_LIMIT_MS);
		expect(after.players[active]!.matched).toEqual([a, b].sort((x, y) => x - y));
	});

	test('a failed match reveals both cards, then advances the turn', () => {
		const state = newGame();
		const [first, second] = state.turnOrder as [string, string, string];
		const [a, b] = nonMatchingPositions(state);
		const now = T0 + 5_000;
		const after = mustFlip(mustFlip(state, first, a, now), first, b, now);
		expect(after.mismatch).toEqual([a, b]);
		expect(after.revealUntil).toBe(now + REVEAL_INTERVAL_MS);
		expect(after.turnUntil).toBeNull();
		expect(after.activePlayerId).toBe(first);

		// Before the reveal ends, nothing changes and further flips are refused.
		expect(resolveOverdue(after, now + REVEAL_INTERVAL_MS - 1)).toBe(after);
		expect(flip(after, first, 0, now + 100)).toMatchObject({ ok: false, error: 'reveal_pending' });
		expect(flip(after, second, 0, now + 100)).toMatchObject({ ok: false, error: 'not_your_turn' });

		const resolved = resolveOverdue(after, now + REVEAL_INTERVAL_MS);
		expect(resolved.mismatch).toBeNull();
		expect(resolved.activePlayerId).toBe(second);
		expect(resolved.turnUntil).toBe(now + REVEAL_INTERVAL_MS + TURN_TIME_LIMIT_MS);
	});

	test('matching on one player’s board does not change any other board', () => {
		const state = newGame();
		const active = state.activePlayerId!;
		const [[a, b]] = matchingPositions(state) as [[number, number]];
		const after = mustFlip(mustFlip(state, active, a), active, b);
		for (const id of state.turnOrder.filter((p) => p !== active)) {
			expect(after.players[id]!.matched).toEqual([]);
			expect(after.players[id]!.score).toBe(0);
		}
	});

	test('invalid actions do not change the turn or the state', () => {
		const state = newGame();
		const active = state.activePlayerId!;
		const [[a, b]] = matchingPositions(state) as [[number, number]];
		const pending = mustFlip(state, active, a);
		for (const [position, error] of [
			[a, 'already_flipped'],
			[-1, 'invalid_position'],
			[12, 'invalid_position'],
			[1.5, 'invalid_position']
		] as const) {
			const result = flip(pending, active, position);
			expect(result).toMatchObject({ ok: false, error });
			expect(result.state).toBe(pending);
		}
		const matched = mustFlip(pending, active, b);
		const again = flip(matched, active, a);
		expect(again).toMatchObject({ ok: false, error: 'already_matched' });
		expect(again.state.activePlayerId).toBe(active);
	});

	test('a stale revision is rejected', () => {
		const state = newGame();
		const active = state.activePlayerId!;
		const result = flipCard(state, { playerId: active, boardPlayerId: active, position: 0, actionId: actionId(), revision: state.revision - 1 }, T0);
		expect(result).toMatchObject({ ok: false, error: 'stale_state' });
	});

	test('unknown players are refused', () => {
		const state = newGame();
		expect(flip(state, 'stranger', 0)).toMatchObject({ ok: false, error: 'forbidden' });
	});

	test('nextPlayer wraps around and skips removed players', () => {
		const order = ['a', 'b', 'c', 'd'];
		const active = new Set(['a', 'c', 'd']);
		expect(nextPlayer(order, 'a', (id) => active.has(id))).toBe('c');
		expect(nextPlayer(order, 'd', (id) => active.has(id))).toBe('a');
		expect(nextPlayer(order, 'b', (id) => active.has(id))).toBe('c');
		expect(nextPlayer(order, 'a', (id) => id === 'a')).toBe('a');
		expect(nextPlayer(order, 'a', () => false)).toBeNull();
	});

	test('nextDeadline prefers the reveal deadline and is null when completed', () => {
		expect(nextDeadline({ status: 'active', revealUntil: 5, turnUntil: null })).toBe(5);
		expect(nextDeadline({ status: 'active', revealUntil: null, turnUntil: 9 })).toBe(9);
		expect(nextDeadline({ status: 'completed', revealUntil: null, turnUntil: null })).toBeNull();
	});
});
