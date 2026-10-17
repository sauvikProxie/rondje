import { describe, expect, test } from 'vitest';
import { REVEAL_INTERVAL_MS, TURN_TIME_LIMIT_MS } from '../../src/lib/game/constants';
import { flipCard, removePlayer } from '../../src/lib/game/game-state';
import { resolveOverdue } from '../../src/lib/game/turn-management';
import type { GameState } from '../../src/lib/game/types';
import { actionId, matchingPositions, newGame, nonMatchingPositions, T0 } from './fixtures';

function mustFlip(state: GameState, playerId: string, position: number, now: number) {
	const result = flipCard(state, { playerId, boardPlayerId: playerId, position, actionId: actionId(), revision: state.revision }, now);
	if (!result.ok) throw new Error(`flip rejected: ${result.error}`);
	return result.state;
}

describe('lifecycle edge cases', () => {
	test('an overdue mismatch reveal is resolved exactly once even when several requests arrive together', () => {
		const state = newGame();
		const [first, second] = state.turnOrder as [string, string, string];
		const [a, b] = nonMatchingPositions(state);
		const revealing = mustFlip(mustFlip(state, first, a, T0), first, b, T0);
		const late = T0 + REVEAL_INTERVAL_MS + 10;

		// Requests are serialised by the session row lock; each one resolves first.
		let current = revealing;
		const observed: GameState[] = [];
		for (let i = 0; i < 5; i++) {
			current = resolveOverdue(current, late);
			observed.push(current);
		}
		expect(current.revision).toBe(revealing.revision + 1);
		expect(current.activePlayerId).toBe(second);
		expect(new Set(observed.map((s) => s.activePlayerId))).toEqual(new Set([second]));
		expect(observed.slice(1).every((s) => s === observed[0])).toBe(true);
	});

	test('a late flip by the next player resolves the reveal and is then judged on fresh state', () => {
		const state = newGame();
		const [first, second] = state.turnOrder as [string, string, string];
		const [a, b] = nonMatchingPositions(state);
		const revealing = mustFlip(mustFlip(state, first, a, T0), first, b, T0);
		// The client still holds the pre-resolution revision, so it is told to refresh.
		const stale = flipCard(revealing, { playerId: second, boardPlayerId: second, position: a, actionId: actionId(), revision: revealing.revision }, T0 + REVEAL_INTERVAL_MS);
		expect(stale).toMatchObject({ ok: false, error: 'stale_state' });
		expect(stale.state.activePlayerId).toBe(second);
		// With the fresh revision the flip succeeds.
		const ok = flipCard(stale.state, { playerId: second, boardPlayerId: second, position: a, actionId: actionId(), revision: stale.state.revision }, T0 + REVEAL_INTERVAL_MS);
		expect(ok.ok).toBe(true);
	});

	test('an expired turn deadline turns back a pending first flip and advances the turn', () => {
		const state = newGame();
		const [first, second] = state.turnOrder as [string, string, string];
		const pending = mustFlip(state, first, 4, T0 + 1_000);
		const deadline = state.turnUntil!;
		expect(resolveOverdue(pending, deadline - 1)).toBe(pending);
		const expired = resolveOverdue(pending, deadline);
		expect(expired.firstFlip).toBeNull();
		expect(expired.activePlayerId).toBe(second);
		expect(expired.turnUntil).toBe(deadline + TURN_TIME_LIMIT_MS);
		expect(expired.attempts.at(-1)).toMatchObject({ outcome: 'timeout', playerId: first, firstPosition: 4 });
		// Idempotent.
		expect(resolveOverdue(expired, deadline)).toBe(expired);
	});

	test('an absent player without any flip also loses the turn at the deadline', () => {
		const state = newGame();
		const [first, second, third] = state.turnOrder as [string, string, string];
		const once = resolveOverdue(state, state.turnUntil! + 5);
		expect(once.activePlayerId).toBe(second);
		const twice = resolveOverdue(once, once.turnUntil!);
		expect(twice.activePlayerId).toBe(third);
		const thrice = resolveOverdue(twice, twice.turnUntil!);
		expect(thrice.activePlayerId).toBe(first);
		expect(first).not.toBe(second);
	});

	test('removing the active player cancels the pending attempt and advances the turn', () => {
		const state = newGame();
		const [first, second] = state.turnOrder as [string, string, string];
		const pending = mustFlip(state, first, 2, T0 + 1_000);
		const result = removePlayer(pending, first, T0 + 2_000);
		expect(result.ok).toBe(true);
		const after = result.state;
		expect(after.players[first]!.status).toBe('removed');
		expect(after.activePlayerId).toBe(second);
		expect(after.firstFlip).toBeNull();
		expect(after.turnUntil).toBe(T0 + 2_000 + TURN_TIME_LIMIT_MS);
		expect(after.attempts.at(-1)).toMatchObject({ outcome: 'cancelled', playerId: first });
		expect(after.status).toBe('active');
		expect(after.revision).toBe(pending.revision + 1);

		// The removed player cannot act any more and is skipped from now on.
		const blocked = flipCard(after, { playerId: first, boardPlayerId: first, position: 0, actionId: actionId(), revision: after.revision }, T0 + 3_000);
		expect(blocked).toMatchObject({ ok: false, error: 'removed' });
		const skipped = resolveOverdue(resolveOverdue(after, after.turnUntil!), after.turnUntil! + TURN_TIME_LIMIT_MS);
		expect(skipped.activePlayerId).not.toBe(first);
	});

	test('removing the active player during a mismatch reveal clears it', () => {
		const state = newGame();
		const [first, second] = state.turnOrder as [string, string, string];
		const [a, b] = nonMatchingPositions(state);
		const revealing = mustFlip(mustFlip(state, first, a, T0), first, b, T0);
		const after = removePlayer(revealing, first, T0 + 500).state;
		expect(after.mismatch).toBeNull();
		expect(after.revealUntil).toBeNull();
		expect(after.activePlayerId).toBe(second);
	});

	test('removing a waiting player keeps the turn', () => {
		const state = newGame();
		const [first, , third] = state.turnOrder as [string, string, string];
		const after = removePlayer(state, third, T0 + 100).state;
		expect(after.activePlayerId).toBe(first);
		expect(after.turnUntil).toBe(state.turnUntil);
	});

	test('removal that leaves fewer than two players ends the game; the removed score is kept', () => {
		let state = newGame({ players: ['a', 'b'] });
		const [first, second] = state.turnOrder as [string, string];
		const [[x, y]] = matchingPositions(state) as [[number, number]];
		state = mustFlip(mustFlip(state, first, x, T0), first, y, T0);
		const result = removePlayer(state, first, T0 + 100);
		expect(result.state).toMatchObject({ status: 'completed', endReason: 'not_enough_players', winnerIds: [second] });
		expect(result.state.players[first]).toMatchObject({ status: 'removed', score: 1 });
	});

	test('removal is idempotent and unknown players are reported', () => {
		const state = newGame();
		const once = removePlayer(state, 'cas', T0).state;
		const twice = removePlayer(once, 'cas', T0);
		expect(twice).toMatchObject({ ok: true });
		expect(twice.state).toBe(once);
		expect(removePlayer(state, 'nobody', T0)).toMatchObject({ ok: false, error: 'player_not_found' });
	});
});
