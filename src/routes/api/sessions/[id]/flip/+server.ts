import { rpc } from '$lib/server/database/rpc';
import { apiError, apiResult } from '$lib/server/http';
import { readJson, sessionRequest } from '$lib/server/sessions/api-guard';
import { flipRequestSchema } from '$lib/server/validation';
import type { RequestHandler } from './$types';

/** Flip one card: {boardPlayerId, position, actionId, revision}. */
export const POST: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	const parsed = flipRequestSchema.safeParse(await readJson(event.request));
	if (!parsed.success) return apiError('invalid_input');
	return apiResult(await rpc.flipCard(req.supabase, { sessionId: req.sessionId, ...parsed.data }));
};
