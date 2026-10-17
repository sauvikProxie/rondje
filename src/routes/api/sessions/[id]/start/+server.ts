import { rpc } from '$lib/server/database/rpc';
import { apiResult } from '$lib/server/http';
import { sessionRequest } from '$lib/server/sessions/api-guard';
import type { RequestHandler } from './$types';

/** Host: start the game. The database verifies ownership, lobby state, players and vocabulary. */
export const POST: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	return apiResult(await rpc.startGame(req.supabase, req.sessionId));
};
