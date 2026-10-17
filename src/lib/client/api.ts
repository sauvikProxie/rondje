import { ERROR_MESSAGES, isErrorCode, type ErrorCode } from '$lib/errors';
import type { SessionView } from '$lib/types/session-view';

export interface ApiResult {
	ok: boolean;
	error: { code: ErrorCode; message: string } | null;
	view: SessionView | null;
}

function failure(code: ErrorCode): ApiResult {
	return { ok: false, error: { code, message: ERROR_MESSAGES[code] }, view: null };
}

/** Call a JSON API route. Never throws; network problems become `service_unavailable`. */
export async function callApi(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<ApiResult> {
	let response: Response;
	try {
		response = await fetch(path, {
			method: init.method ?? 'GET',
			headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			cache: 'no-store',
			credentials: 'same-origin'
		});
	} catch {
		return failure('service_unavailable');
	}

	try {
		const body = (await response.json()) as Partial<ApiResult>;
		if (typeof body.ok !== 'boolean') throw new Error('Malformed response');
		const code = body.error?.code;
		return {
			ok: body.ok,
			error: body.ok ? null : { code: isErrorCode(code) ? code : 'unknown', message: body.error?.message ?? ERROR_MESSAGES.unknown },
			view: body.view ?? null
		};
	} catch {
		if (response.status === 429) return failure('rate_limited');
		if (response.status === 401) return failure('not_authenticated');
		return failure(response.status >= 500 ? 'service_unavailable' : 'unknown');
	}
}
