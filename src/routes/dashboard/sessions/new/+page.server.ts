import { fail, redirect } from '@sveltejs/kit';
import { errorMessage } from '$lib/errors';
import { rpc } from '$lib/server/database/rpc';
import { createSessionSchema, fieldErrors } from '$lib/server/validation';
import type { Actions } from './$types';

const FIELD_FOR_ERROR: Record<string, string> = {
	invalid_session_name: 'name',
	invalid_variant: 'variant',
	invalid_pair_count: 'pairCount'
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = Object.fromEntries(await request.formData());
		const values = {
			name: String(data.name ?? ''),
			variant: String(data.variant ?? ''),
			pairCount: String(data.pairCount ?? ''),
			scheduledLocal: String(data.scheduledLocal ?? '')
		};
		const parsed = createSessionSchema.safeParse(data);
		if (!parsed.success) return fail(400, { values, errors: fieldErrors(parsed.error) });

		const result = await rpc.createSession(locals.supabase, parsed.data);
		if (!result.ok || !result.session_id) {
			const code = result.error ?? 'unknown';
			const field = FIELD_FOR_ERROR[code] ?? 'form';
			return fail(400, { values, errors: { [field]: errorMessage(code) } });
		}

		redirect(303, `/dashboard/sessions/${result.session_id}`);
	}
};
