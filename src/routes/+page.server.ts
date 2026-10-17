import { fail, redirect } from '@sveltejs/kit';
import { joinCodeSchema } from '$lib/server/validation';
import type { Actions } from './$types';

export const actions: Actions = {
	join: async ({ request }) => {
		const data = await request.formData();
		const raw = String(data.get('code') ?? '');
		const parsed = joinCodeSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, { code: raw, error: parsed.error.issues[0]?.message ?? 'Please check the code.' });
		}
		redirect(303, `/join/${parsed.data}`);
	}
};
