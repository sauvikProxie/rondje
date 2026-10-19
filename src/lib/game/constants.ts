/**
 * Shared game constants. Values that also exist in SQL are mirrored in
 * supabase/schema.sql (private.reveal_interval(), private.round_reveal_interval(),
 * private.max_groups(), private.join_code_alphabet(), private.allowed_avatars());
 * the database test suite checks that both definitions agree.
 */

/** Matchen: how long a mismatched pair stays visible (spec 9.5). There is no turn timer (spec 23.1). */
export const REVEAL_INTERVAL_MS = 2_500;

/** Fill in the Blanks: how long a closed round shows its answer (spec 23.4). */
export const ROUND_REVEAL_INTERVAL_MS = 4_000;

export const GAME_MODES = ['matchen', 'fill_blanks'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const VARIANTS = ['image_pairs', 'word_image', 'de_het', 'opposites'] as const;
export type Variant = (typeof VARIANTS)[number];

/** Pairs (Matchen) or sentences (Fill in the Blanks) per game. */
export const PAIR_COUNTS = [6, 8, 12] as const;
export type PairCount = (typeof PAIR_COUNTS)[number];

/** 1 = no groups (spec 23.3). */
export const MAX_GROUPS = 4;
export const GROUP_COUNTS = [1, 2, 3, 4] as const;
export type GroupCount = (typeof GROUP_COUNTS)[number];

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

export const MODE_INFO: Record<GameMode, { label: string; description: string; example: string; unit: [string, string] }> = {
	matchen: {
		label: 'Matchen',
		description: 'Memory game on one shared board. Take turns finding pairs.',
		example: '🚲 + Fiets',
		unit: ['pair', 'pairs']
	},
	fill_blanks: {
		label: 'Fill in the Blanks',
		description: 'Everyone completes the same Dutch sentence at the same time.',
		example: 'Ik ___ (werken) thuis. → werk',
		unit: ['sentence', 'sentences']
	}
};

export const LEVEL_LABELS: Record<ProficiencyLevel, string> = {
	beginner: 'Beginner',
	elementary: 'Elementary',
	intermediate: 'Intermediate',
	advanced: 'Advanced'
};

export type GrammarTopic =
	| 'verbs'
	| 'articles'
	| 'prepositions'
	| 'pronouns'
	| 'adjectives'
	| 'plurals'
	| 'past_tense'
	| 'word_order';

export const GRAMMAR_TOPIC_LABELS: Record<GrammarTopic, string> = {
	verbs: 'Verbs',
	articles: 'De or het',
	prepositions: 'Prepositions',
	pronouns: 'Pronouns',
	adjectives: 'Adjectives',
	plurals: 'Plurals',
	past_tense: 'Past tense',
	word_order: 'Word order'
};

export type EndReason = 'board_cleared' | 'ended_by_host' | 'not_enough_players' | 'all_rounds_played';

export const END_REASON_LABELS: Record<EndReason, string> = {
	board_cleared: 'All pairs were found',
	ended_by_host: 'Ended by the host',
	not_enough_players: 'Not enough players left',
	all_rounds_played: 'All sentences were played'
};
