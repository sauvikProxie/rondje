import { requireHost } from '$lib/server/auth/guards';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = await requireHost(locals, url);
	return { hostEmail: user.email ?? null };
};
