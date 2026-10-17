/**
 * Shared game constants. Values that also exist in SQL are mirrored in
 * supabase/schema.sql (private.reveal_interval(), private.turn_time_limit(),
 * private.join_code_alphabet(), private.allowed_avatars()); the database test
 * suite checks that both definitions agree.
 */

/** Mismatch reveal interval (spec 9.5). */
export const REVEAL_INTERVAL_MS = 2_500;

/** Turn time limit (spec 9.5). */
export const TURN_TIME_LIMIT_MS = 60_000;

export const VARIANTS = ['image_pairs', 'word_image', 'de_het', 'opposites'] as const;
export type Variant = (typeof VARIANTS)[number];

export const PAIR_COUNTS = [6, 8, 12] as const;
export type PairCount = (typeof PAIR_COUNTS)[number];

export const PROFICIENCY_LEVELS = ['beginner', 'elementary', 'intermediate', 'advanced'] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

/** Unambiguous join-code alphabet (no 0/O, 1/I/L). */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export const NICKNAME_MAX_LENGTH = 20;
export const SESSION_NAME_MAX_LENGTH = 60;

/** Predefined avatar collection (spec 6.2). */
export const AVATARS = [
	'🦊', '🐼', '🐸', '🦉', '🐙', '🦁', '🐯', '🐨',
	'🐰', '🐻', '🐧', '🦄', '🐢', '🦋', '🐝', '🐳',
	'🦒', '🦔', '🐞', '🐶', '🐱', '🐭', '🐮', '🐷'
] as const;
export type Avatar = (typeof AVATARS)[number];

export const VARIANT_INFO: Record<Variant, { label: string; description: string; example: string }> = {
	image_pairs: {
		label: 'Image Pairs',
		description: 'Find two identical pictures.',
		example: '🍎 + 🍎'
	},
	word_image: {
		label: 'Word–Image',
		description: 'Match a picture with its Dutch word.',
		example: '🚲 + Fiets'
	},
	de_het: {
		label: 'De Het',
		description: 'Match a picture with the noun and its correct article.',
		example: '🏠 + Het huis'
	},
	opposites: {
		label: 'Opposites',
		description: 'Match Dutch words with their opposites.',
		example: 'Groot + Klein'
	}
};

export const LEVEL_LABELS: Record<ProficiencyLevel, string> = {
	beginner: 'Beginner',
	elementary: 'Elementary',
	intermediate: 'Intermediate',
	advanced: 'Advanced'
};

export type EndReason = 'board_cleared' | 'ended_by_host' | 'not_enough_players';

export const END_REASON_LABELS: Record<EndReason, string> = {
	board_cleared: 'A board was cleared',
	ended_by_host: 'Ended by the host',
	not_enough_players: 'Not enough players left'
};
