import { rpc } from '$lib/server/database/rpc';
import { apiResult } from '$lib/server/http';
import { sessionRequest } from '$lib/server/sessions/api-guard';
import type { RequestHandler } from './$types';

/** Host: end the active game early. */
export const POST: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	return apiResult(await rpc.endGame(req.supabase, req.sessionId));
};
