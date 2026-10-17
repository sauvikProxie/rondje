import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { isErrorCode, type ErrorCode } from '$lib/errors';
import type { Database, Json } from '$lib/types/database';
import type { ActionResult, LookupResult, SessionView } from '$lib/types/session-view';

/**
 * Typed wrappers around the database functions in supabase/schema.sql. All
 * calls use the request-scoped client, so the database identifies the
 * caller from their JWT (auth.uid()); no identity is passed as a parameter.
 */

type Client = SupabaseClient<Database>;

interface RpcEnvelope {
	ok: boolean;
	error: ErrorCode | null;
}

function failure(fn: string, error: PostgrestError): RpcEnvelope {
	// Log details server-side only; never send them to the browser.
	console.error(`[rpc] ${fn} failed: ${error.code ?? ''} ${error.message}`);
	const authFailure = error.code === 'PGRST301' || error.code === 'PGRST302' || /jwt/i.test(error.message);
	return { ok: false, error: authFailure ? 'not_authenticated' : 'service_unavailable' };
}

async function call<T extends RpcEnvelope>(
	fn: string,
	request: PromiseLike<{ data: Json | null; error: PostgrestError | null }>
): Promise<T> {
	try {
		const { data, error } = await request;
		if (error) return failure(fn, error) as T;
		const result = (data ?? {}) as unknown as T;
		if (!result.ok && !isErrorCode(result.error)) {
			console.error(`[rpc] ${fn} returned unknown error code: ${String(result.error)}`);
			return { ...result, error: 'unknown' };
		}
		return result;
	} catch (cause) {
		console.error(`[rpc] ${fn} threw`, cause);
		return { ok: false, error: 'service_unavailable' } as T;
	}
}

export interface CreateSessionResult extends RpcEnvelope {
	session_id?: string;
	join_code?: string;
}

export interface JoinSessionResult extends RpcEnvelope {
	session_id?: string;
	player_id?: string;
	already_joined?: boolean;
}

export const rpc = {
	createSession: (
		supabase: Client,
		args: { name: string; variant: string; pairCount: number; scheduledAt: string | null }
	) =>
		call<CreateSessionResult>(
			'create_session',
			supabase.rpc('create_session', {
				p_name: args.name,
				p_variant: args.variant,
				p_pair_count: args.pairCount,
				p_scheduled_at: args.scheduledAt
			})
		),

	lookupSession: (supabase: Client, joinCode: string) =>
		call<LookupResult & RpcEnvelope>('lookup_session', supabase.rpc('lookup_session', { p_join_code: joinCode })),

	joinSession: (supabase: Client, args: { joinCode: string; nickname: string; avatar: string; level: string }) =>
		call<JoinSessionResult>(
			'join_session',
			supabase.rpc('join_session', {
				p_join_code: args.joinCode,
				p_nickname: args.nickname,
				p_avatar: args.avatar,
				p_level: args.level
			})
		),

	getSessionView: (supabase: Client, sessionId: string) =>
		call<ActionResult>('get_session_view', supabase.rpc('get_session_view', { p_session_id: sessionId })),

	startGame: (supabase: Client, sessionId: string) =>
		call<ActionResult>('start_game', supabase.rpc('start_game', { p_session_id: sessionId })),

	endGame: (supabase: Client, sessionId: string) =>
		call<ActionResult>('end_game', supabase.rpc('end_game', { p_session_id: sessionId })),

	deleteSession: (supabase: Client, sessionId: string) =>
		call<ActionResult>('delete_session', supabase.rpc('delete_session', { p_session_id: sessionId })),

	removePlayer: (supabase: Client, sessionId: string, playerId: string) =>
		call<ActionResult>(
			'remove_player',
			supabase.rpc('remove_player', { p_session_id: sessionId, p_player_id: playerId })
		),

	flipCard: (
		supabase: Client,
		args: { sessionId: string; boardPlayerId: string; position: number; actionId: string; revision: number }
	) =>
		call<ActionResult>(
			'flip_card',
			supabase.rpc('flip_card', {
				p_session_id: args.sessionId,
				p_board_player_id: args.boardPlayerId,
				p_position: args.position,
				p_action_id: args.actionId,
				p_revision: args.revision
			})
		)
};

export type { SessionView };
