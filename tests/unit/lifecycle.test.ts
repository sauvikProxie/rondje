import { describe, expect, test } from 'vitest';
import { REVEAL_INTERVAL_MS } from '../../src/lib/game/constants';
import { flipCard, removePlayer, skipTurn } from '../../src/lib/game/game-state';
import { resolveOverdue } from '../../src/lib/game/turn-management';
import type { GameState } from '../../src/lib/game/types';
import { actionId, matchingPositions, newGame, nonMatchingPositions, T0 } from './fixtures';

function mustFlip(state: GameState, playerId: string, position: number, now: number) {
	const result = flipCard(state, { playerId, position, actionId: actionId(), revision: state.revision }, now);
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
		const stale = flipCard(revealing, { playerId: second, position: a, actionId: actionId(), revision: revealing.revision }, T0 + REVEAL_INTERVAL_MS);
		expect(stale).toMatchObject({ ok: false, error: 'stale_state' });
		expect(stale.state.activePlayerId).toBe(second);
		// With the fresh revision the flip succeeds.
		const ok = flipCard(stale.state, { playerId: second, position: a, actionId: actionId(), revision: stale.state.revision }, T0 + REVEAL_INTERVAL_MS);
		expect(ok.ok).toBe(true);
	});

	test('there is no turn timer: a player who waits keeps the turn and a pending first flip', () => {
		const state = newGame();
		const [first] = state.turnOrder as [string, string, string];
		const pending = mustFlip(state, first, 4, T0 + 1_000);
		const muchLater = T0 + 24 * 60 * 60 * 1000;
		expect(resolveOverdue(pending, muchLater)).toBe(pending);
		expect(pending.revealUntil).toBeNull();
	});

	test('the host can skip a stalled turn: a pending first flip turns back and the next player plays', () => {
		const state = newGame();
		const [first, second, third] = state.turnOrder as [string, string, string];
		const pending = mustFlip(state, first, 4, T0 + 1_000);
		const skipped = skipTurn(pending, T0 + 2_000);
		expect(skipped.ok).toBe(true);
		expect(skipped.state).toMatchObject({ firstFlip: null, activePlayerId: second, revision: pending.revision + 1 });
		expect(skipped.state.attempts.at(-1)).toMatchObject({ outcome: 'cancelled', playerId: first, firstPosition: 4 });
		// Skipping without a pending flip works too, and wraps around.
		const again = skipTurn(skipTurn(skipped.state, T0).state, T0).state;
		expect(again.activePlayerId).toBe(first);
		expect(third).not.toBe(first);
	});

	test('skipping during a mismatch reveal is refused (the turn is already passing on)', () => {
		const state = newGame();
		const [first] = state.turnOrder as [string, string, string];
		const [a, b] = nonMatchingPositions(state);
		const revealing = mustFlip(mustFlip(state, first, a, T0), first, b, T0);
		expect(skipTurn(revealing, T0 + 100)).toMatchObject({ ok: false, error: 'reveal_pending' });
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
		expect(after.attempts.at(-1)).toMatchObject({ outcome: 'cancelled', playerId: first });
		expect(after.status).toBe('active');
		expect(after.revision).toBe(pending.revision + 1);

		// The removed player cannot act any more and is skipped from now on.
		const blocked = flipCard(after, { playerId: first, position: 0, actionId: actionId(), revision: after.revision }, T0 + 3_000);
		expect(blocked).toMatchObject({ ok: false, error: 'removed' });
		const skipped = skipTurn(skipTurn(after, T0).state, T0).state;
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
	});

	test('removal that leaves fewer than two players ends the game; the removed score is kept', () => {
		let state = newGame({ players: ['a', 'b'] });
		const [first, second] = state.turnOrder as [string, string];
		const [[x, y]] = matchingPositions(state) as [[number, number]];
		state = mustFlip(mustFlip(state, first, x, T0), first, y, T0);
		const result = removePlayer(state, first, T0 + 100);
		expect(result.state).toMatchObject({ status: 'completed', endReason: 'not_enough_players', winnerIds: [second] });
		expect(result.state.players[first]).toMatchObject({ status: 'removed', score: 1 });
		// Pairs found by a removed player stay found.
		expect(result.state.matchedBy).toEqual({ [x]: first, [y]: first });
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
