import { fail, redirect } from '@sveltejs/kit';
import { ERROR_MESSAGES } from '$lib/errors';
import { safeNext } from '$lib/server/auth/guards';
import { credentialsSchema, fieldErrors, signUpSchema } from '$lib/server/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (user && !user.is_anonymous) redirect(303, safeNext(url.searchParams.get('next')));
	return {
		next: safeNext(url.searchParams.get('next')),
		configured: locals.supabaseConfigured,
		playingAsGuest: Boolean(user?.is_anonymous)
	};
};

export const actions: Actions = {
	signin: async ({ request, locals, url }) => {
		const data = Object.fromEntries(await request.formData());
		const parsed = credentialsSchema.safeParse(data);
		const email = String(data.email ?? '');
		if (!parsed.success) return fail(400, { mode: 'signin', email, errors: fieldErrors(parsed.error) });

		const { error } = await locals.supabase.auth.signInWithPassword(parsed.data);
		if (error) {
			const message =
				error.code === 'email_not_confirmed'
					? 'Please confirm your email address first, then sign in.'
					: error.status === 400 || error.code === 'invalid_credentials'
						? ERROR_MESSAGES.invalid_credentials
						: ERROR_MESSAGES.service_unavailable;
			return fail(400, { mode: 'signin', email, errors: { form: message } });
		}
		redirect(303, safeNext(url.searchParams.get('next')));
	},

	signup: async ({ request, locals, url }) => {
		const data = Object.fromEntries(await request.formData());
		const parsed = signUpSchema.safeParse(data);
		const email = String(data.email ?? '');
		if (!parsed.success) return fail(400, { mode: 'signup', email, errors: fieldErrors(parsed.error) });

		const { data: result, error } = await locals.supabase.auth.signUp({
			...parsed.data,
			options: { emailRedirectTo: `${url.origin}/auth/login` }
		});
		if (error) {
			const message =
				error.code === 'user_already_exists'
					? 'An account with this email already exists. Please sign in.'
					: error.code === 'weak_password'
						? 'Please choose a stronger password.'
						: error.code === 'email_provider_disabled' || error.code === 'signup_disabled'
							? 'New host accounts cannot be created right now.'
							: ERROR_MESSAGES.service_unavailable;
			return fail(400, { mode: 'signup', email, errors: { form: message } });
		}
		if (!result.session) {
			// Email confirmation is enabled in the Supabase project.
			return { mode: 'signup', email, confirmEmail: true };
		}
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
