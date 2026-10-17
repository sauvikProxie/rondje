import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { apiError } from '$lib/server/http';
import { uuidSchema } from '$lib/server/validation';
import type { Database } from '$lib/types/database';

/**
 * Common preconditions for /api/sessions/:id routes. Authentication and
 * authorisation are enforced by the database functions using the caller's
 * JWT; here we only reject requests that cannot possibly succeed.
 */
export function sessionRequest(
	event: Pick<RequestEvent, 'locals' | 'params'>
): { ok: true; sessionId: string; supabase: SupabaseClient<Database> } | { ok: false; response: Response } {
	if (!event.locals.supabaseConfigured) return { ok: false, response: apiError('service_unavailable') };
	const parsed = uuidSchema.safeParse((event.params as { id?: string }).id);
	if (!parsed.success) return { ok: false, response: apiError('session_not_found') };
	return { ok: true, sessionId: parsed.data, supabase: event.locals.supabase };
}

/** Parse a JSON body without throwing. */
export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}
