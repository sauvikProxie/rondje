import { rpc } from '$lib/server/database/rpc';
import { apiResult } from '$lib/server/http';
import { sessionRequest } from '$lib/server/sessions/api-guard';
import type { RequestHandler } from './$types';

/**
 * The caller's authorised view. The database resolves overdue reveal/turn
 * deadlines first (lazy, idempotent), so polling this at a deadline is how
 * timed transitions happen on serverless hosting.
 */
export const GET: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	return apiResult(await rpc.getSessionView(req.supabase, req.sessionId));
};
