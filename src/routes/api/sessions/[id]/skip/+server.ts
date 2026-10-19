import { rpc } from '$lib/server/database/rpc';
import { apiResult } from '$lib/server/http';
import { sessionRequest } from '$lib/server/sessions/api-guard';
import type { RequestHandler } from './$types';

/** Host: move a stalled game on (Matchen: next player's turn; Fill in the Blanks: close the round). */
export const POST: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	return apiResult(await rpc.skipTurn(req.supabase, req.sessionId));
};
