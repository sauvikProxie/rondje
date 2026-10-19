import { z } from 'zod';
import {
	AVATARS,
	GAME_MODES,
	JOIN_CODE_PATTERN,
	MAX_GROUPS,
	NICKNAME_MAX_LENGTH,
	PAIR_COUNTS,
	PROFICIENCY_LEVELS,
	SESSION_NAME_MAX_LENGTH,
	VARIANTS,
	type GameMode
} from '$lib/game/constants';
import { ANSWER_MAX_LENGTH } from '$lib/game/blanks';

/**
 * Centralised server-side validation (spec 15.4). The database functions
 * validate again; these schemas give early, friendly errors and keep
 * malformed input away from the database.
 */

/** Length in Unicode code points, matching PostgreSQL char_length(). */
const codePoints = (value: string) => [...value].length;

export const joinCodeSchema = z
	.string()
	.transform((value) => value.toUpperCase().replace(/[\s-]/g, ''))
	.pipe(z.string().regex(JOIN_CODE_PATTERN, 'Join codes have 6 letters and numbers.'));

export const nicknameSchema = z
	.string()
	.trim()
	.refine((value) => codePoints(value) >= 1, 'Please enter a nickname.')
	.refine((value) => codePoints(value) <= NICKNAME_MAX_LENGTH, `Nicknames can be at most ${NICKNAME_MAX_LENGTH} characters.`)
	.refine((value) => !/\p{Cc}/u.test(value), 'Nicknames cannot contain control characters.');

export const joinFormSchema = z.object({
	nickname: nicknameSchema,
	avatar: z.enum(AVATARS, 'Please choose an avatar.'),
	level: z.enum(PROFICIENCY_LEVELS, 'Please choose your Dutch level.')
});

/** Settings of one game: used when creating a session and when setting up its next game. */
const gameConfigFields = {
	mode: z.enum(GAME_MODES, 'Please choose a game.'),
	/** Matchen only; ignored for Fill in the Blanks. */
	variant: z.string().optional(),
	pairCount: z.coerce
		.number('Please choose the number of pairs or sentences.')
		.int()
		.refine((value) => (PAIR_COUNTS as readonly number[]).includes(value), 'Choose 6, 8 or 12.'),
	groupCount: z.coerce
		.number('Please choose the number of groups.')
		.int()
		.min(1, 'Choose no groups, or 2 to 4 groups.')
		.max(MAX_GROUPS, 'Choose no groups, or 2 to 4 groups.')
};

/** Matchen needs a valid variant; Fill in the Blanks has none. */
function resolveVariant<T extends { mode: GameMode; variant?: string }>(value: T, ctx: z.RefinementCtx<T>) {
	if (value.mode === 'fill_blanks') return { ...value, variant: null };
	const variant = VARIANTS.find((v) => v === value.variant);
	if (!variant) {
		ctx.addIssue({ code: 'custom', path: ['variant'], message: 'Please choose a game variant.' });
		return z.NEVER;
	}
	return { ...value, variant };
}

/** Host: settings of the session's next game. */
export const gameConfigSchema = z.object(gameConfigFields).transform(resolveVariant);

export const createSessionSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Please give the session a name.')
			.max(SESSION_NAME_MAX_LENGTH, `Session names can be at most ${SESSION_NAME_MAX_LENGTH} characters.`),
		...gameConfigFields,
		/** ISO 8601 timestamp produced by the browser from the local date/time, or empty. */
		scheduledAt: z
			.string()
			.trim()
			.optional()
			.transform((value, ctx) => {
				if (!value) return null;
				const date = new Date(value);
				if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000 || date.getFullYear() > 2100) {
					ctx.addIssue({ code: 'custom', message: 'Please enter a valid date and time.' });
					return z.NEVER;
				}
				return date.toISOString();
			})
	})
	.transform(resolveVariant);

export const credentialsSchema = z.object({
	email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address.')),
	password: z.string().min(1, 'Please enter your password.').max(72, 'Passwords can be at most 72 characters.')
});

export const signUpSchema = credentialsSchema.extend({
	password: z
		.string()
		.min(8, 'Use at least 8 characters for your password.')
		.max(72, 'Passwords can be at most 72 characters.')
});

export const uuidSchema = z.uuid();

export const flipRequestSchema = z.object({
	position: z.number().int().min(0).max(23),
	actionId: z.uuid(),
	revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
});

export const answerRequestSchema = z.object({
	round: z.number().int().min(0).max(11),
	answer: z
		.string()
		.trim()
		.min(1)
		.refine((value) => codePoints(value) <= ANSWER_MAX_LENGTH)
		.refine((value) => !/\p{Cc}/u.test(value))
});

/** First error message per top-level field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
	const result: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = String(issue.path[0] ?? 'form');
		result[key] ??= issue.message;
	}
	return result;
}
