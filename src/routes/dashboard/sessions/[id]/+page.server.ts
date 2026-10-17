import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { errorMessage } from '$lib/errors';
import { rpc } from '$lib/server/database/rpc';
import { uuidSchema } from '$lib/server/validation';
import { appBaseUrl } from '$lib/supabase/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, depends }) => {
	depends('app:session');
	const id = uuidSchema.safeParse(params.id);
	if (!id.success) error(404, { message: errorMessage('session_not_found') });

	const result = await rpc.getSessionView(locals.supabase, id.data);
	if (!result.ok || !result.view) {
		const code = result.error ?? 'unknown';
		if (code === 'service_unavailable') error(503, { message: errorMessage(code) });
		// Another host's session looks exactly like a missing one.
		error(404, { message: errorMessage('session_not_found') });
	}
	if (result.view.role !== 'host') error(404, { message: errorMessage('session_not_found') });

	const inviteUrl = `${appBaseUrl(url.origin)}/join/${result.view.session.join_code}`;
	const qrSvg = await QRCode.toString(inviteUrl, {
		type: 'svg',
		margin: 1,
		errorCorrectionLevel: 'M',
		color: { dark: '#123F3A', light: '#FFFFFF' }
	});

	return { view: result.view, inviteUrl, qrSvg };
};
