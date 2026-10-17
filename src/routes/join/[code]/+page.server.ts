import { fail, redirect } from '@sveltejs/kit';
import { errorMessage, type ErrorCode } from '$lib/errors';
import { rpc } from '$lib/server/database/rpc';
import { fieldErrors, joinCodeSchema, joinFormSchema } from '$lib/server/validation';
import type { LookupResult } from '$lib/types/session-view';
import type { Actions, PageServerLoad } from './$types';

type JoinState =
	| { kind: 'open'; session: NonNullable<LookupResult['session']> }
	| { kind: 'error'; code: ErrorCode; session?: LookupResult['session'] }
	| { kind: 'host'; session: NonNullable<LookupResult['session']> };

/** Validate the session before showing the onboarding form (spec 6.1). */
export const load: PageServerLoad = async ({ params, locals }): Promise<{ code: string; state: JoinState }> => {
	const parsed = joinCodeSchema.safeParse(params.code);
	if (!parsed.success) return { code: params.code, state: { kind: 'error', code: 'invalid_join_code' } };
	const code = parsed.data;
	if (code !== params.code) redirect(308, `/join/${code}`);
	if (!locals.supabaseConfigured) return { code, state: { kind: 'error', code: 'service_unavailable' } };

	const result = await rpc.lookupSession(locals.supabase, code);
	if (!result.ok || !result.session) return { code, state: { kind: 'error', code: result.error ?? 'unknown' } };

	const session = result.session;
	switch (result.membership) {
		case 'player':
			redirect(303, `/session/${code}`);
		case 'removed':
			return { code, state: { kind: 'error', code: 'removed', session } };
		case 'host':
			return { code, state: { kind: 'host', session } };
	}
	if (session.status === 'completed') return { code, state: { kind: 'error', code: 'session_completed', session } };
	if (session.status === 'in_progress') return { code, state: { kind: 'error', code: 'session_in_progress', session } };
	return { code, state: { kind: 'open', session } };
};

const FIELD_FOR_ERROR: Partial<Record<ErrorCode, string>> = {
	invalid_nickname: 'nickname',
	nickname_taken: 'nickname',
	invalid_avatar: 'avatar',
	invalid_level: 'level'
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		const code = joinCodeSchema.safeParse(params.code);
		const data = Object.fromEntries(await request.formData());
		const values = {
			nickname: String(data.nickname ?? ''),
			avatar: String(data.avatar ?? ''),
			level: String(data.level ?? '')
		};
		if (!code.success) return fail(400, { values, errors: { form: errorMessage('invalid_join_code') } });

		const parsed = joinFormSchema.safeParse(data);
		if (!parsed.success) return fail(400, { values, errors: fieldErrors(parsed.error) });

		// Players authenticate anonymously; the identity lives in the auth
		// cookie and is what links them to their player record (spec 4.2).
		const { user } = await locals.safeGetSession();
		if (!user) {
			const { error } = await locals.supabase.auth.signInAnonymously();
			if (error) {
				console.error('[join] anonymous sign-in failed', error.code, error.message);
				const reason: ErrorCode =
					error.code === 'anonymous_provider_disabled' ? 'anonymous_disabled' : 'service_unavailable';
				return fail(503, { values, errors: { form: errorMessage(reason) } });
			}
		}

		const result = await rpc.joinSession(locals.supabase, { joinCode: code.data, ...parsed.data });
		if (!result.ok) {
			const errorCode = result.error ?? 'unknown';
			const field = FIELD_FOR_ERROR[errorCode] ?? 'form';
			return fail(400, { values, errors: { [field]: errorMessage(errorCode) } });
		}

		redirect(303, `/session/${code.data}`);
	}
};
