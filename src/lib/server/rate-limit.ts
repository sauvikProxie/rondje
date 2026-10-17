/**
 * Best-effort, in-memory fixed-window rate limiter (spec 15.6).
 *
 * On serverless platforms each instance has its own memory, so this limits
 * bursts per instance rather than globally. It complements, and never
 * replaces, the validation in the database functions, which make repeated
 * requests harmless (idempotent action ids, row locks, turn checks).
 */
interface Window {
	count: number;
	resetAt: number;
}

const windows = new Map<string, Window>();
let lastSweep = 0;

export interface RateLimitRule {
	limit: number;
	windowMs: number;
}

export const RATE_LIMITS = {
	flip: { limit: 30, windowMs: 10_000 },
	api: { limit: 60, windowMs: 60_000 },
	auth: { limit: 10, windowMs: 60_000 },
	form: { limit: 30, windowMs: 60_000 }
} satisfies Record<string, RateLimitRule>;

export function rateLimit(key: string, rule: RateLimitRule, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
	if (now - lastSweep > 60_000) {
		for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
		lastSweep = now;
	}

	const current = windows.get(key);
	if (!current || current.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + rule.windowMs });
		return { allowed: true, retryAfterMs: 0 };
	}
	current.count += 1;
	if (current.count > rule.limit) return { allowed: false, retryAfterMs: current.resetAt - now };
	return { allowed: true, retryAfterMs: 0 };
}

/** Which bucket a mutating request falls into. */
export function rateLimitBucket(pathname: string): keyof typeof RATE_LIMITS {
	if (/^\/api\/sessions\/[^/]+\/flip$/.test(pathname)) return 'flip';
	if (pathname.startsWith('/api/')) return 'api';
	if (pathname.startsWith('/auth')) return 'auth';
	return 'form';
}
