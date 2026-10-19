import type { EndReason, GameMode, GrammarTopic, PairCount, ProficiencyLevel, Variant } from '$lib/game/constants';
import type { AttemptOutcome, CardFace } from '$lib/game/types';
import type { ErrorCode } from '$lib/errors';

/**
 * The caller's authorised view of a session, exactly as produced by
 * private.session_view() in supabase/schema.sql. It never contains the
 * content of a face-down position (`game.faces` holds only positions that are
 * matched or flipped in the current attempt), nor the answer of a Fill in the
 * Blanks round that is still open.
 */
export interface SessionView {
	revision: number;
	/** Database clock at the time the view was built (for deadline scheduling). */
	server_now: string;
	role: 'host' | 'player';
	/** The caller's player id (null for the host). */
	me: string | null;
	session: ViewSession;
	players: ViewPlayer[];
	/** The current game: null in the lobby, else the active or just-finished game. */
	game: ViewGame | null;
	/** The session's finished games, oldest first. */
	history: ViewHistoryGame[];
}

export interface ViewSession {
	id: string;
	name: string;
	join_code: string;
	scheduled_at: string | null;
	/** Settings of the current (or next) game. */
	mode: GameMode;
	/** Matchen only; null for Fill in the Blanks. */
	variant: Variant | null;
	/** Pairs (Matchen) or sentences (Fill in the Blanks). */
	pair_count: PairCount;
	/** 1 = no groups. */
	group_count: number;
	/** State of the current game; back to 'lobby' while the next game is set up. */
	status: 'lobby' | 'in_progress' | 'completed';
	created_at: string;
	started_at: string | null;
	ended_at: string | null;
}

export interface ViewPlayer {
	id: string;
	nickname: string;
	avatar: string;
	level: ProficiencyLevel;
	status: 'active' | 'removed';
	/** Points in the current game. */
	score: number;
	/** Running session total: points from earlier games plus `score`. */
	total_score: number;
	/** Group number (1-based) once the game has started, when the game uses groups. */
	group: number | null;
	joined_at: string;
}

/** A finished game of the session (results only). */
export interface ViewHistoryGame {
	/** 1-based. */
	number: number;
	mode: GameMode;
	variant: Variant | null;
	pair_count: PairCount;
	group_count: number;
	end_reason: EndReason;
	winner_ids: string[];
	winning_groups: number[];
	ended_at: string;
}

export interface ViewAttempt {
	player_id: string;
	first_position: number | null;
	second_position: number | null;
	outcome: AttemptOutcome;
	at: string;
}

export interface ViewGame {
	/** 1 for the session's first game, then 2, 3, ... */
	number: number;
	status: 'active' | 'completed';
	turn_order: string[];
	/** Matchen: whose turn it is. Always null in Fill in the Blanks. */
	active_player_id: string | null;
	/** End of a Matchen mismatch reveal or of a Fill in the Blanks answer reveal. */
	reveal_until: string | null;
	end_reason: EndReason | null;
	winner_ids: string[];
	/** Groups with the best result, when the session uses groups. */
	winning_groups: number[];
	started_at: string;
	ended_at: string | null;

	// Matchen (empty / null in Fill in the Blanks)
	/** Cards on the shared board. */
	card_count: number;
	first_flip: number | null;
	mismatch_positions: [number, number] | null;
	/** Position -> face, only for positions the caller may see. */
	faces: Record<string, CardFace>;
	/** Matched position -> player who found the pair (null if that player no longer exists). */
	matched: Record<string, string | null>;
	last_attempt: ViewAttempt | null;

	/** Fill in the Blanks: the current round while the game is active, else null. */
	round: ViewRound | null;
}

export interface ViewRound {
	/** 0-based. */
	index: number;
	count: number;
	phase: 'answering' | 'reveal';
	/** Dutch sentence with one blank written as "___". */
	sentence: string;
	translation: string;
	topic: GrammarTopic;
	/** How the caller answers: pick an option or type. Null for the host. */
	answer_mode: 'choice' | 'type' | null;
	/** The four options, only for callers who answer by choice (and the host). */
	options: string[] | null;
	/** Players who have answered this round. */
	answered: string[];
	my_answer: string | null;
	/** Only once the round is closed. */
	correct_answer: string | null;
	/** Player id -> answered correctly, only once the round is closed. */
	results: Record<string, boolean> | null;
}

/** Result shape of the action RPCs (flip, answer, skip, start, end, configure, remove, view). */
export interface ActionResult {
	ok: boolean;
	error: ErrorCode | null;
	view: SessionView | null;
}

/** Result of public.lookup_session(). */
export interface LookupResult {
	ok: boolean;
	error: ErrorCode | null;
	membership?: 'none' | 'player' | 'removed' | 'host';
	session?: {
		id: string;
		name: string;
		join_code: string;
		mode: GameMode;
		variant: Variant | null;
		pair_count: PairCount;
		group_count: number;
		status: ViewSession['status'];
		scheduled_at: string | null;
	};
}
