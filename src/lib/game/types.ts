import type { EndReason, PairCount, Variant } from './constants';

export type FaceKind = 'image' | 'word' | 'article_word';
export type Article = 'de' | 'het';

/** A vocabulary concept (spec 14.4). */
export interface VocabularyItem {
	id: string;
	word: string;
	article: Article | null;
	emoji: string | null;
	active?: boolean;
}

/** An explicit matching relationship for one variant (spec 14.5). */
export interface PairDefinition {
	id: string;
	variant: Variant;
	itemA: string;
	faceA: FaceKind;
	itemB: string;
	faceB: FaceKind;
	active?: boolean;
}

/** What a revealed card shows. */
export type CardFace =
	| { kind: 'image'; emoji: string; image_path?: string }
	| { kind: 'word'; word: string }
	| { kind: 'article_word'; article: Article; word: string };

/** One board position of the shared layout. side 0 = (itemA, faceA), side 1 = (itemB, faceB). */
export interface LayoutCard {
	position: number;
	pairId: string;
	side: 0 | 1;
}

export type PlayerStatus = 'active' | 'removed';

export interface PlayerState {
	id: string;
	status: PlayerStatus;
	score: number;
	/** Matched positions on this player's own board. */
	matched: number[];
}

export type AttemptOutcome = 'match' | 'mismatch' | 'timeout' | 'cancelled';

export interface Attempt {
	playerId: string;
	firstPosition: number | null;
	secondPosition: number | null;
	outcome: AttemptOutcome;
	at: number;
}

/**
 * Authoritative game state, as stored by the database. Times are epoch
 * milliseconds of the (database) clock.
 */
export interface GameState {
	status: 'active' | 'completed';
	pairCount: PairCount;
	/** The single shared layout; every player's board references it. */
	layout: LayoutCard[];
	turnOrder: string[];
	players: Record<string, PlayerState>;
	activePlayerId: string | null;
	firstFlip: number | null;
	mismatch: [number, number] | null;
	revealUntil: number | null;
	turnUntil: number | null;
	revision: number;
	processedActions: string[];
	attempts: Attempt[];
	endReason: EndReason | null;
	winnerIds: string[];
}

export type GameErrorCode =
	| 'forbidden'
	| 'removed'
	| 'duplicate_action'
	| 'game_not_active'
	| 'stale_state'
	| 'not_your_board'
	| 'not_your_turn'
	| 'reveal_pending'
	| 'invalid_position'
	| 'already_matched'
	| 'already_flipped'
	| 'player_not_found'
	| 'session_completed'
	| 'not_enough_players'
	| 'not_enough_vocabulary';

/**
 * Result of a transition. On rejection `state` still carries any lazy
 * deadline resolution that happened first (mirrors the SQL functions, which
 * commit that resolution even when the action itself is rejected).
 */
export type TransitionResult =
	| { ok: true; state: GameState }
	| { ok: false; error: GameErrorCode; state: GameState };

export class GameRuleError extends Error {
	constructor(readonly code: GameErrorCode, message?: string) {
		super(message ?? code);
		this.name = 'GameRuleError';
	}
}
