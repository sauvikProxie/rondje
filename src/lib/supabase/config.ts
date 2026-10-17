import { env } from '$env/dynamic/public';

/**
 * Public Supabase configuration (safe for the browser). Read at runtime so the
 * app can be built without credentials. The secret key is never read by the
 * application; it is only used by test tooling under tests/.
 */
export interface SupabasePublicConfig {
	url: string;
	publishableKey: string;
}

export function getSupabaseConfig(): SupabasePublicConfig | null {
	const url = env.PUBLIC_SUPABASE_URL?.trim();
	const publishableKey = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
	if (!url || !publishableKey) return null;
	return { url, publishableKey };
}

export function requireSupabaseConfig(): SupabasePublicConfig {
	const config = getSupabaseConfig();
	if (!config) {
		throw new Error(
			'Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).'
		);
	}
	return config;
}

/**
 * Base URL used for invitation links (spec 5.4). Uses PUBLIC_APP_URL and falls
 * back to the current request origin; never a hard-coded domain.
 */
export function appBaseUrl(fallbackOrigin: string): string {
	const configured = env.PUBLIC_APP_URL?.trim();
	return (configured || fallbackOrigin).replace(/\/+$/, '');
}
