import { rpc } from '$lib/server/database/rpc';
import { apiError, apiResult } from '$lib/server/http';
import { sessionRequest } from '$lib/server/sessions/api-guard';
import { uuidSchema } from '$lib/server/validation';
import type { RequestHandler } from './$types';

/** Host: remove a participant (lobby or in-game). */
export const POST: RequestHandler = async (event) => {
	const req = sessionRequest(event);
	if (!req.ok) return req.response;
	const playerId = uuidSchema.safeParse(event.params.playerId);
	if (!playerId.success) return apiError('player_not_found');
	return apiResult(await rpc.removePlayer(req.supabase, req.sessionId, playerId.data));
};
