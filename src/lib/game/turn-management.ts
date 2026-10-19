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
	/** Matched positions on the shared board. */
	matched: ReadonlySet<number>;
}

export type FlipRuleError = Extract<
	GameErrorCode,
	'game_not_active' | 'not_your_turn' | 'reveal_pending' | 'invalid_position' | 'already_matched' | 'already_flipped'
>;

/**
 * Flip validation rules (spec 8.3, 9.2, 23.2), in the same order as
 * public.flip_card(). Used by the engine and by the client to disable cards;
 * the server always re-validates.
 */
export function checkFlip(ctx: FlipContext, playerId: string, position: number): FlipRuleError | null {
	if (!ctx.gameActive) return 'game_not_active';
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
 * Lazily resolve an overdue mismatch reveal (spec 9.4), mirroring the Matchen
 * branch of private.resolve_overdue(): once the reveal has ended the cards
 * turn face down and the turn passes on. There is no turn timer (spec 23.1),
 * so nothing else ever expires. Returns the same object when nothing changed.
 */
export function resolveOverdue(state: GameState, now: number): GameState {
	if (state.status !== 'active' || state.mismatch === null) return state;
	if (state.revealUntil !== null && now < state.revealUntil) return state;
	return {
		...state,
		mismatch: null,
		revealUntil: null,
		activePlayerId: nextPlayer(state.turnOrder, state.activePlayerId, (id) => isPlayerActive(state, id)),
		revision: state.revision + 1
	};
}

/** The next deadline (end of a reveal) a client should refetch at, if any. */
export function nextDeadline(state: Pick<GameState, 'status' | 'revealUntil'>): number | null {
	if (state.status !== 'active') return null;
	return state.revealUntil;
}
