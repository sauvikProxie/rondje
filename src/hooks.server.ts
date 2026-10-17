import { createServerClient } from '@supabase/ssr';
import { json, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { ERROR_MESSAGES } from '$lib/errors';
import { RATE_LIMITS, rateLimit, rateLimitBucket } from '$lib/server/rate-limit';
import { getSupabaseConfig } from '$lib/supabase/config';
import type { Database } from '$lib/types/database';

/**
 * Creates a request-scoped Supabase client bound to the auth cookies
 * (@supabase/ssr). The client uses the publishable key and the user's JWT,
 * so the database enforces RLS and auth.uid() for every call.
 */
const supabase: Handle = async ({ event, resolve }) => {
	const config = getSupabaseConfig();
	let client: SupabaseClient<Database> | undefined;

	const getClient = (): SupabaseClient<Database> => {
		if (!config) {
			throw new Error(
				'Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).'
			);
		}
		client ??= createServerClient<Database>(config.url, config.publishableKey, {
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					for (const { name, value, options } of cookiesToSet) {
						event.cookies.set(name, value, { ...options, path: '/' });
					}
				}
			}
		});
		return client;
	};

	Object.defineProperty(event.locals, 'supabase', { get: getClient, enumerable: true });
	event.locals.supabaseConfigured = config !== null;

	let sessionPromise: Promise<{ session: Session | null; user: User | null }> | undefined;
	event.locals.safeGetSession = () => {
		sessionPromise ??= (async () => {
			if (!config) return { session: null, user: null };
			const supabase = getClient();
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) return { session: null, user: null };
			// getSession() reads cookies without verifying them; getUser() asks
			// Supabase Auth to validate the JWT.
			const {
				data: { user },
				error
			} = await supabase.auth.getUser();
			if (error || !user) return { session: null, user: null };
			return { session, user };
		})();
		return sessionPromise;
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
};

/** Per-instance burst limiting for mutating requests. */
const limiter: Handle = async ({ event, resolve }) => {
	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
		const bucket = rateLimitBucket(event.url.pathname);
		let ip = 'unknown';
		try {
			ip = event.getClientAddress();
		} catch {
			// Not available in some environments (e.g. prerendering).
		}
		const { allowed, retryAfterMs } = rateLimit(`${bucket}:${ip}`, RATE_LIMITS[bucket]);
		if (!allowed) {
			const headers = { 'retry-after': String(Math.ceil(retryAfterMs / 1000)) };
			if (event.url.pathname.startsWith('/api/')) {
				return json(
					{ ok: false, error: { code: 'rate_limited', message: ERROR_MESSAGES.rate_limited } },
					{ status: 429, headers }
				);
			}
			return new Response(ERROR_MESSAGES.rate_limited, { status: 429, headers });
		}
	}
	return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	if (event.url.pathname.startsWith('/api/')) response.headers.set('cache-control', 'no-store');
	return response;
};

export const handle = sequence(limiter, supabase, securityHeaders);
