import { json } from '@sveltejs/kit';
import { errorMessage, errorStatus, type ErrorCode } from '$lib/errors';
import type { SessionView } from '$lib/types/session-view';

/** JSON body returned by every /api route. */
export interface ApiResponse {
	ok: boolean;
	error: { code: ErrorCode; message: string } | null;
	view: SessionView | null;
}

export function apiResult(result: { ok: boolean; error: ErrorCode | null; view?: SessionView | null }): Response {
	const code = result.ok ? null : (result.error ?? 'unknown');
	const body: ApiResponse = {
		ok: result.ok,
		error: code ? { code, message: errorMessage(code) } : null,
		view: result.view ?? null
	};
	return json(body, { status: code ? errorStatus(code) : 200 });
}

export function apiError(code: ErrorCode): Response {
	return apiResult({ ok: false, error: code, view: null });
}
