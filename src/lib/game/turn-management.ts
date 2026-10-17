import { TURN_TIME_LIMIT_MS } from './constants';
import type { GameErrorCode, GameState } from './types';

/**
 * The next non-removed player after `current` in the fixed turn order,
 * wrapping around. Returns `current` only when it is the sole active player,
 * and null when nobody is active (mirrors private.next_player()).
 */
export function nextPlayer(
	turnOrder: readonly string[],
	current: string | null,
	isActive: (playerId: string) => boolean
): string | null {
	const n = turnOrder.length;
	const index = current === null ? -1 : turnOrder.indexOf(current);
	for (let k = 1; k <= n; k++) {
		const candidate = turnOrder[(index + k + n) % n]!;
		if (isActive(candidate)) return candidate;
	}
	return null;
}

/** What a flip needs to know about the current game. */
export interface FlipContext {
	gameActive: boolean;
	activePlayerId: string | null;
	revealPending: boolean;
	firstFlip: number | null;
	cardCount: number;
	/** Matched positions on the flipping player's own board. */
	matched: ReadonlySet<number>;
}

export type FlipRuleError = Extract<
	GameErrorCode,
	| 'game_not_active'
	| 'not_your_board'
	| 'not_your_turn'
	| 'reveal_pending'
	| 'invalid_position'
	| 'already_matched'
	| 'already_flipped'
>;

/**
 * Flip validation rules (spec 8.3, 9.2), in the same order as public.flip_card().
 * Used by the engine and by the client to disable cards; the server always
 * re-validates.
 */
export function checkFlip(
	ctx: FlipContext,
	playerId: string,
	boardPlayerId: string,
	position: number
): FlipRuleError | null {
	if (!ctx.gameActive) return 'game_not_active';
	if (boardPlayerId !== playerId) return 'not_your_board';
	if (ctx.activePlayerId !== playerId) return 'not_your_turn';
	if (ctx.revealPending) return 'reveal_pending';
	if (!Number.isInteger(position) || position < 0 || position >= ctx.cardCount) return 'invalid_position';
	if (ctx.matched.has(position)) return 'already_matched';
	if (ctx.firstFlip === position) return 'already_flipped';
	return null;
}

export function isPlayerActive(state: GameState, playerId: string): boolean {
	return state.players[playerId]?.status === 'active';
}

/**
 * Lazily resolve an overdue mismatch reveal or turn deadline (spec 9.4, 9.6),
 * mirroring private.resolve_overdue(): at most one transition per call, and
 * the new deadline is always in the future, so repeated calls with the same
 * `now` are no-ops. Returns the same object when nothing changed.
 */
export function resolveOverdue(state: GameState, now: number): GameState {
	if (state.status !== 'active') return state;
	const next = () => nextPlayer(state.turnOrder, state.activePlayerId, (id) => isPlayerActive(state, id));

	if (state.mismatch !== null) {
		if (state.revealUntil !== null && now < state.revealUntil) return state;
		// Reveal finished: cards turn face down, the turn passes on.
		return {
			...state,
			mismatch: null,
			revealUntil: null,
			activePlayerId: next(),
			turnUntil: now + TURN_TIME_LIMIT_MS,
			revision: state.revision + 1
		};
	}

	if (state.turnUntil !== null && now >= state.turnUntil) {
		// Deadline passed: a pending first flip turns back, the turn passes on.
		return {
			...state,
			attempts: [
				...state.attempts,
				{
					playerId: state.activePlayerId!,
					firstPosition: state.firstFlip,
					secondPosition: null,
					outcome: 'timeout',
					at: now
				}
			],
			firstFlip: null,
			activePlayerId: next(),
			turnUntil: now + TURN_TIME_LIMIT_MS,
			revision: state.revision + 1
		};
	}

	return state;
}

/** The next deadline (reveal end or turn end) a client should refetch at, if any. */
export function nextDeadline(
	state: Pick<GameState, 'status' | 'revealUntil' | 'turnUntil'>
): number | null {
	if (state.status !== 'active') return null;
	return state.revealUntil ?? state.turnUntil;
}
