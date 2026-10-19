import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// RLS limits this to the signed-in host's own sessions.
	const { data, error: queryError } = await locals.supabase
		.from('game_sessions')
		.select('id, name, join_code, mode, variant, pair_count, group_count, status, scheduled_at, created_at, players(status)')
		.order('created_at', { ascending: false })
		.limit(100);

	if (queryError) {
		console.error('[dashboard] session list failed', queryError.message);
		error(503, { message: "We couldn't load your sessions. Please refresh to try again." });
	}

	return {
		sessions: (data ?? []).map(({ players, ...session }) => ({
			...session,
			participantCount: players.filter((p) => p.status === 'active').length
		}))
	};
};
