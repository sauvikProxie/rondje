import { error, redirect } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

export function toViewer(user: User | null): Viewer | null {
	if (!user) return null;
	return { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous ?? false };
}

/** Hosts are signed-in, non-anonymous Supabase Auth users (spec 4.1, 15.1). */
export async function requireHost(locals: App.Locals, url: URL): Promise<User> {
	if (!locals.supabaseConfigured) {
		error(503, { message: 'The game server is not configured yet. Please try again later.' });
	}
	const { user } = await locals.safeGetSession();
	if (!user || user.is_anonymous) {
		redirect(303, `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
	return user;
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(value: string | null | undefined, fallback = '/dashboard'): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
	return value;
}
