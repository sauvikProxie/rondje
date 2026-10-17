/**
 * Error codes returned by the database functions and API routes, with
 * messages suitable for ordinary users (spec 18). Raw database errors are
 * never shown in the interface.
 */
export const ERROR_MESSAGES = {
	// Authentication / authorisation
	not_authenticated: 'Your session has expired. Please refresh the page or sign in again.',
	not_host: 'Only the host of this session can do that.',
	forbidden: "You don't have access to this session.",
	removed: 'The host has removed you from this session.',
	is_host: "You're the host of this session. Hosts manage the game and don't play.",
	anonymous_disabled: 'Joining is not available right now. Please ask the host for help.',
	invalid_credentials: 'That email and password combination is not correct.',

	// Session lookup and lifecycle
	invalid_join_code: 'Join codes have 6 letters and numbers. Please check the code and try again.',
	session_not_found: "We couldn't find a session with that code.",
	session_completed: 'This session has already finished.',
	session_in_progress: 'This game has already started, so new players can no longer join.',
	session_not_in_lobby: 'This game has already started.',
	game_not_active: 'The game is not running.',

	// Onboarding
	invalid_nickname: 'Choose a nickname between 1 and 20 characters.',
	nickname_taken: 'Someone in this session already uses that nickname. Please pick another one.',
	invalid_avatar: 'Please choose one of the avatars.',
	invalid_level: 'Please choose your Dutch level.',

	// Session configuration
	invalid_session_name: 'Give the session a name of up to 60 characters.',
	invalid_variant: 'Please choose one of the four game variants.',
	invalid_pair_count: 'Choose 6, 8 or 12 pairs.',
	invalid_scheduled_at: 'Please enter a valid date and time.',
	not_enough_players: 'At least two players are needed to start the game.',
	not_enough_vocabulary: 'There are not enough words for this game variant and size. Try fewer pairs.',
	player_not_found: 'That player is no longer in this session.',

	// Gameplay
	invalid_input: 'That request was not valid.',
	duplicate_action: 'That move was already processed.',
	stale_state: 'The game moved on. Showing the latest state.',
	not_your_board: 'You can only flip cards on your own board.',
	not_your_turn: "It's not your turn yet.",
	reveal_pending: 'Wait a moment, the cards are turning back.',
	invalid_position: 'That card does not exist.',
	already_matched: 'That card is already matched.',
	already_flipped: 'That card is already face up. Pick another one.',

	// Infrastructure
	rate_limited: "You're going a bit fast. Please wait a moment and try again.",
	service_unavailable: "We couldn't reach the game server. Check your connection and try again.",
	unknown: 'Something went wrong. Please try again.'
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function isErrorCode(value: unknown): value is ErrorCode {
	return typeof value === 'string' && Object.hasOwn(ERROR_MESSAGES, value);
}

export function errorMessage(code: string | null | undefined): string {
	return isErrorCode(code) ? ERROR_MESSAGES[code] : ERROR_MESSAGES.unknown;
}

/** HTTP status for an error code returned by an API route. */
export function errorStatus(code: ErrorCode): number {
	switch (code) {
		case 'not_authenticated':
			return 401;
		case 'not_host':
		case 'forbidden':
		case 'removed':
		case 'is_host':
		case 'anonymous_disabled':
			return 403;
		case 'session_not_found':
		case 'player_not_found':
			return 404;
		case 'rate_limited':
			return 429;
		case 'service_unavailable':
			return 503;
		case 'unknown':
			return 500;
		case 'invalid_input':
		case 'invalid_join_code':
		case 'invalid_nickname':
		case 'invalid_avatar':
		case 'invalid_level':
		case 'invalid_session_name':
		case 'invalid_variant':
		case 'invalid_pair_count':
		case 'invalid_scheduled_at':
		case 'invalid_position':
		case 'invalid_credentials':
			return 400;
		default:
			// Rule violations: well-formed request that conflicts with game state.
			return 409;
	}
}
