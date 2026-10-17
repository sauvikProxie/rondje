import { error, redirect } from '@sveltejs/kit';
import { errorMessage } from '$lib/errors';
import { rpc } from '$lib/server/database/rpc';
import { joinCodeSchema } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

/**
 * The player's game page (lobby → game → results). Identity comes only from
 * the authenticated (anonymous) Supabase session; the URL code just names
 * the session (spec 4.2, 11.5).
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const parsed = joinCodeSchema.safeParse(params.code);
	if (!parsed.success) error(404, { message: errorMessage('invalid_join_code') });
	const code = parsed.data;
	if (!locals.supabaseConfigured) error(503, { message: errorMessage('service_unavailable') });

	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, `/join/${code}`);

	const lookup = await rpc.lookupSession(locals.supabase, code);
	if (!lookup.ok || !lookup.session) {
		if (lookup.error === 'service_unavailable') error(503, { message: errorMessage('service_unavailable') });
		error(404, { message: errorMessage('session_not_found') });
	}
	switch (lookup.membership) {
		case 'none':
			redirect(303, `/join/${code}`);
		case 'host':
			redirect(303, `/dashboard/sessions/${lookup.session.id}`);
		case 'removed':
			return { removed: true as const, sessionName: lookup.session.name, view: null };
	}

	const result = await rpc.getSessionView(locals.supabase, lookup.session.id);
	if (!result.ok || !result.view) {
		if (result.error === 'removed') return { removed: true as const, sessionName: lookup.session.name, view: null };
		error(result.error === 'service_unavailable' ? 503 : 404, { message: errorMessage(result.error) });
	}
	return { removed: false as const, sessionName: lookup.session.name, view: result.view };
};
