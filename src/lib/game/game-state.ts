import { createTurnOrder, generateLayout, selectPairs } from './board-generation';
import { REVEAL_INTERVAL_MS, type EndReason, type PairCount, type Variant } from './constants';
import { positionsMatch } from './matching';
import type { Rng } from './random';
import { assignGroups, decideWinners } from './scoring';
import { checkFlip, isPlayerActive, nextPlayer, resolveOverdue } from './turn-management';
import {
	GameRuleError,
	type GameState,
	type PairDefinition,
	type PlayerState,
	type TransitionResult,
	type VocabularyItem
} from './types';

/**
 * Pure model of the Matchen game rules (spec 7–10, 23). The authoritative
 * implementation runs inside PostgreSQL functions (supabase/schema.sql) so
 * that every transition is atomic; this module mirrors those transitions
 * exactly, is unit-tested in isolation, and is reused by the UI for
 * non-authoritative checks (disabling cards, rankings).
 *
 * All players play on one shared board: a matched pair stays face up for
 * everyone and is credited to the player who found it. There is no turn
 * timer; the host can skip a stalled turn.
 */

/** Initialise a game (spec 8.1): select pairs, shuffle one layout, groups and turn order. */
export function createGame(params: {
	variant: Variant;
	pairCount: PairCount;
	groupCount?: number;
	pairs: readonly PairDefinition[];
	items: ReadonlyMap<string, VocabularyItem>;
	playerIds: readonly string[];
	rng: Rng;
}): GameState {
	const { variant, pairCount, pairs, items, playerIds, rng } = params;
	const groupCount = params.groupCount ?? 1;
	if (playerIds.length < 2) throw new GameRuleError('not_enough_players');
	if (playerIds.length < groupCount) throw new GameRuleError('not_enough_players_for_groups');

	const selected = selectPairs({ variant, pairCount, pairs, items, rng });
	const layout = generateLayout(selected, rng);
	// Dealing the shuffled order round-robin makes the turn order alternate between groups.
	const turnOrder = createTurnOrder(playerIds, rng);
	const groups = assignGroups(turnOrder, groupCount);

	const players: Record<string, PlayerState> = {};
	for (const id of turnOrder) players[id] = { id, status: 'active', score: 0, group: groups.get(id) ?? null };

	return {
		status: 'active',
		pairCount,
		groupCount,
		layout,
		matchedBy: {},
		turnOrder,
		players,
		activePlayerId: turnOrder[0]!,
		firstFlip: null,
		mismatch: null,
		revealUntil: null,
		revision: 1,
		processedActions: [],
		attempts: [],
		endReason: null,
		winnerIds: [],
		winningGroups: []
	};
}

/** Matched positions of the shared board. */
export function matchedPositions(state: GameState): Set<number> {
	return new Set(Object.keys(state.matchedBy).map(Number));
}

function complete(state: GameState, reason: EndReason): GameState {
	const { winnerIds, winningGroups } = decideWinners(Object.values(state.players), state.groupCount);
	return {
		...state,
		status: 'completed',
		endReason: reason,
		winnerIds,
		winningGroups,
		activePlayerId: null,
		firstFlip: null,
		mismatch: null,
		revealUntil: null
	};
}

export interface FlipRequest {
	playerId: string;
	position: number;
	actionId: string;
	/** The state revision the client last saw. */
	revision: number;
}

/** Flip one card on the shared board (spec 8.3, 9.2–9.4, 23.2). Mirrors public.flip_card(). */
export function flipCard(input: GameState, request: FlipRequest, now: number): TransitionResult {
	const player = input.players[request.playerId];
	if (!player) return { ok: false, error: 'forbidden', state: input };
	if (player.status === 'removed') return { ok: false, error: 'removed', state: input };

	const state = resolveOverdue(input, now);
	const reject = (error: Exclude<TransitionResult, { ok: true }>['error']): TransitionResult => ({
		ok: false,
		error,
		state
	});

	if (state.processedActions.includes(request.actionId)) return reject('duplicate_action');
	if (state.status !== 'active') return reject('game_not_active');
	if (request.revision !== state.revision) return reject('stale_state');

	const ruleError = checkFlip(
		{
			gameActive: true,
			activePlayerId: state.activePlayerId,
			revealPending: state.mismatch !== null,
			firstFlip: state.firstFlip,
			cardCount: state.layout.length,
			matched: matchedPositions(state)
		},
		request.playerId,
		request.position
	);
	if (ruleError) return reject(ruleError);

	const processed = [...state.processedActions, request.actionId];

	if (state.firstFlip === null) {
		return {
			ok: true,
			state: { ...state, firstFlip: request.position, processedActions: processed, revision: state.revision + 1 }
		};
	}

	const first = state.firstFlip;
	const second = request.position;
	const base = { ...state, firstFlip: null, processedActions: processed, revision: state.revision + 1 };

	if (positionsMatch(state.layout, first, second)) {
		const next: GameState = {
			...base,
			players: { ...state.players, [player.id]: { ...player, score: player.score + 1 } },
			matchedBy: { ...state.matchedBy, [first]: player.id, [second]: player.id },
			attempts: [
				...state.attempts,
				{ playerId: player.id, firstPosition: first, secondPosition: second, outcome: 'match', at: now }
			]
		};
		if (Object.keys(next.matchedBy).length === state.layout.length) {
			return { ok: true, state: complete(next, 'board_cleared') };
		}
		return { ok: true, state: next };
	}

	return {
		ok: true,
		state: {
			...base,
			attempts: [
				...state.attempts,
				{ playerId: player.id, firstPosition: first, secondPosition: second, outcome: 'mismatch', at: now }
			],
			mismatch: [first, second],
			revealUntil: now + REVEAL_INTERVAL_MS
		}
	};
}

/**
 * Host skips the active player's turn (spec 23.1). Mirrors the Matchen branch of
 * public.skip_turn(): a pending first flip turns back and the next player's
 * turn begins. Rejected while a mismatch reveal is pending (the turn is
 * already passing on).
 */
export function skipTurn(input: GameState, now: number): TransitionResult {
	const state = resolveOverdue(input, now);
	if (state.status !== 'active') return { ok: true, state };
	if (state.mismatch !== null) return { ok: false, error: 'reveal_pending', state };
	return {
		ok: true,
		state: {
			...state,
			attempts: [
				...state.attempts,
				{ playerId: state.activePlayerId!, firstPosition: state.firstFlip, secondPosition: null, outcome: 'cancelled', at: now }
			],
			firstFlip: null,
			activePlayerId: nextPlayer(state.turnOrder, state.activePlayerId, (id) => isPlayerActive(state, id)),
			revision: state.revision + 1
		}
	};
}

/** Host removes a player during the game (spec 9.6). Mirrors public.remove_player(). */
export function removePlayer(input: GameState, playerId: string, now: number): TransitionResult {
	const target = input.players[playerId];
	if (!target) return { ok: false, error: 'player_not_found', state: input };
	if (target.status === 'removed') return { ok: true, state: input };
	if (input.status !== 'active') return { ok: false, error: 'session_completed', state: input };

	let state = resolveOverdue(input, now);
	state = {
		...state,
		players: { ...state.players, [playerId]: { ...target, status: 'removed' } }
	};

	if (state.activePlayerId === playerId) {
		const attempts =
			state.firstFlip !== null
				? [
						...state.attempts,
						{
							playerId,
							firstPosition: state.firstFlip,
							secondPosition: null,
							outcome: 'cancelled' as const,
							at: now
						}
					]
				: state.attempts;
		const next = nextPlayer(state.turnOrder, playerId, (id) => isPlayerActive(state, id));
		if (next !== null) {
			state = {
				...state,
				attempts,
				firstFlip: null,
				mismatch: null,
				revealUntil: null,
				activePlayerId: next
			};
		}
	}

	const activeCount = Object.values(state.players).filter((p) => p.status === 'active').length;
	if (activeCount < 2) state = complete(state, 'not_enough_players');

	return { ok: true, state: { ...state, revision: state.revision + 1 } };
}

/** Host ends the game early (spec 9.7). Highest score (or group) wins; ties are possible. */
export function endGame(state: GameState): TransitionResult {
	if (state.status !== 'active') return { ok: false, error: 'session_completed', state };
	return { ok: true, state: { ...complete(state, 'ended_by_host'), revision: state.revision + 1 } };
}
