import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			/** Request-scoped Supabase client (throws if Supabase is not configured). */
			supabase: SupabaseClient<Database>;
			supabaseConfigured: boolean;
			/** Verified session and user (via auth.getUser()), memoised per request. */
			safeGetSession(): Promise<{ session: Session | null; user: User | null }>;
		}
		interface PageData {
			viewer?: Viewer | null;
		}
		// interface PageState {}
		// interface Platform {}
	}

	/** Minimal identity of the signed-in user exposed to pages. */
	interface Viewer {
		id: string;
		email: string | null;
		isAnonymous: boolean;
	}
}

export {};
