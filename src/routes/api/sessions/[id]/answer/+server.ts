import { rpc } from '$lib/server/database/rpc';
import { apiError, apiResult } from '$lib/server/http';
import { readJson, sessionRequest } from '$lib/server/sessions/api-guard';
import { answerRequestSchema } from '$lib/server/validation';
import type { RequestHandler } from './$types';

/** Fill in the Blanks: answer the current round: {round, answer}. */
export const POST: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	const parsed = answerRequestSchema.safeParse(await readJson(event.request));
	if (!parsed.success) return apiError('invalid_answer');
	return apiResult(await rpc.submitAnswer(req.supabase, { sessionId: req.sessionId, ...parsed.data }));
};
