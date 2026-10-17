import type { EndReason, PairCount, ProficiencyLevel, Variant } from '$lib/game/constants';
import type { AttemptOutcome, CardFace } from '$lib/game/types';
import type { ErrorCode } from '$lib/errors';

/**
 * The caller's authorised view of a session, exactly as produced by
 * private.session_view() in supabase/schema.sql. It never contains the
 * content of a face-down position: `game.faces` holds only positions that are
 * matched on some board or flipped in the current attempt.
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
	game: ViewGame | null;
}

export interface ViewSession {
	id: string;
	name: string;
	join_code: string;
	scheduled_at: string | null;
	variant: Variant;
	pair_count: PairCount;
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
	score: number;
	joined_at: string;
}

export interface ViewAttempt {
	player_id: string;
	first_position: number | null;
	second_position: number | null;
	outcome: AttemptOutcome;
	at: string;
}

export interface ViewGame {
	status: 'active' | 'completed';
	card_count: number;
	turn_order: string[];
	active_player_id: string | null;
	first_flip: number | null;
	mismatch_positions: [number, number] | null;
	reveal_until: string | null;
	turn_until: string | null;
	end_reason: EndReason | null;
	winner_ids: string[];
	started_at: string;
	ended_at: string | null;
	/** Position -> face, only for positions the caller may see. */
	faces: Record<string, CardFace>;
	/** Player id -> matched positions on that player's board. */
	boards: Record<string, number[]>;
	last_attempt: ViewAttempt | null;
}

/** Result shape of the action RPCs (flip, start, end, remove, view). */
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
		variant: Variant;
		pair_count: PairCount;
		status: ViewSession['status'];
		scheduled_at: string | null;
	};
}
