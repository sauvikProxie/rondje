import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { requireSupabaseConfig } from './config';

let client: SupabaseClient<Database> | undefined;

/**
 * Browser Supabase client. Used only for Realtime (private channels and
 * presence); all reads and writes of game data go through the SvelteKit
 * server. It shares the auth session cookies written by @supabase/ssr.
 */
export function getBrowserSupabase(): SupabaseClient<Database> {
	if (!client) {
		const { url, publishableKey } = requireSupabaseConfig();
		client = createBrowserClient<Database>(url, publishableKey);
	}
	return client;
}
