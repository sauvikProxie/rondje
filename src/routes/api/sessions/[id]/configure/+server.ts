import type { ErrorCode } from '$lib/errors';
import { rpc } from '$lib/server/database/rpc';
import { apiError, apiResult } from '$lib/server/http';
import { readJson, sessionRequest } from '$lib/server/sessions/api-guard';
import { gameConfigSchema } from '$lib/server/validation';
import type { RequestHandler } from './$types';

const ERROR_FOR_FIELD: Record<string, ErrorCode> = {
	mode: 'invalid_mode',
	variant: 'invalid_variant',
	pairCount: 'invalid_pair_count',
	groupCount: 'invalid_group_count'
};

/**
 * Host: set up the session's next game, {mode, variant, pairCount, groupCount}.
 * After a finished game this returns everyone to the lobby (points carry over
 * into the session total); in the lobby it changes the settings.
 */
export const POST: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	const parsed = gameConfigSchema.safeParse(await readJson(event.request));
	if (!parsed.success) return apiError(ERROR_FOR_FIELD[String(parsed.error.issues[0]?.path[0])] ?? 'invalid_input');
	return apiResult(await rpc.configureGame(req.supabase, { sessionId: req.sessionId, ...parsed.data }));
};
