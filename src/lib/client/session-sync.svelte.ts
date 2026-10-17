import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ErrorCode } from '$lib/errors';
import { getBrowserSupabase } from '$lib/supabase/browser';
import type { SessionView } from '$lib/types/session-view';
import { uuid } from '$lib/utils/format';
import { callApi, type ApiResult } from './api';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** Errors after which this client must stop acting on the session. */
const FATAL_ERRORS: ReadonlySet<ErrorCode> = new Set(['removed', 'forbidden', 'session_not_found', 'not_authenticated']);

/** Errors that only mean "you were looking at old state"; the returned view fixes that. */
const SILENT_ERRORS: ReadonlySet<ErrorCode> = new Set(['stale_state', 'duplicate_action']);

const POLL_WHEN_DISCONNECTED_MS = 4_000;
const DEADLINE_GRACE_MS = 250;

/**
 * Keeps one participant's view of a session in sync (spec 11).
 *
 * - The server is authoritative; this class only ever displays views fetched
 *   from /api/sessions/:id/state or returned by actions.
 * - Views carry a monotonically increasing `revision`; an older view never
 *   replaces a newer one (duplicate, delayed or out-of-order responses).
 * - Realtime broadcasts contain only {session_id, revision} and simply
 *   trigger a refetch when they announce a newer revision.
 * - Deadlines (mismatch reveal, turn time limit) are persisted with the
 *   database clock; the client schedules a refetch at the deadline and the
 *   server decides whether it has passed.
 * - Reconnection, tab visibility changes and network recovery all refetch.
 */
export class SessionSync {
	view = $state.raw<SessionView>() as SessionView;
	online = $state.raw<ReadonlySet<string>>(new Set());
	connection = $state<ConnectionState>('connecting');
	fatal = $state<{ code: ErrorCode; message: string } | null>(null);
	notice = $state<{ code: ErrorCode; message: string; at: number } | null>(null);
	busy = $state(false);
	pendingFlip = $state<number | null>(null);
	/** Server-adjusted clock, ticking while a game is active (for countdowns). */
	now = $state(Date.now());

	readonly sessionId: string;
	private readonly presenceKey: string;
	private offsetMs = 0;
	private channel: RealtimeChannel | null = null;
	private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private tickTimer: ReturnType<typeof setInterval> | undefined;
	private noticeTimer: ReturnType<typeof setTimeout> | undefined;
	private refreshing: Promise<void> | null = null;
	private refreshQueued = false;
	private stopped = false;

	constructor(initial: SessionView, presenceKey: string) {
		this.sessionId = initial.session.id;
		this.presenceKey = presenceKey;
		this.apply(initial);
	}

	serverNow(): number {
		return Date.now() + this.offsetMs;
	}

	/** Apply a view unless it is older than the one already shown. Returns whether it was applied. */
	apply(next: SessionView): boolean {
		if (this.view && next.revision < this.view.revision) return false;
		const serverNow = Date.parse(next.server_now);
		if (!Number.isNaN(serverNow)) this.offsetMs = serverNow - Date.now();
		this.view = next;
		this.now = this.serverNow();
		this.scheduleDeadline();
		return true;
	}

	/** Fetch the latest authorised view. Concurrent calls are coalesced. */
	refresh(): Promise<void> {
		if (this.stopped) return Promise.resolve();
		if (this.refreshing) {
			this.refreshQueued = true;
			return this.refreshing;
		}
		this.refreshing = (async () => {
			do {
				this.refreshQueued = false;
				const result = await callApi(`/api/sessions/${this.sessionId}/state`);
				this.handleResult(result, { quiet: true });
			} while (this.refreshQueued && !this.stopped);
		})().finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	/** Host or player action. Applies the returned view and surfaces friendly errors. */
	async act(path: string, body: unknown = {}): Promise<ApiResult> {
		this.busy = true;
		try {
			let result = await callApi(`/api/sessions/${this.sessionId}/${path}`, { method: 'POST', body });
			if (result.error?.code === 'service_unavailable') {
				// One retry with the same body; action ids make this safe.
				await new Promise((resolve) => setTimeout(resolve, 600));
				result = await callApi(`/api/sessions/${this.sessionId}/${path}`, { method: 'POST', body });
			}
			this.handleResult(result, { quiet: false });
			return result;
		} finally {
			this.busy = false;
		}
	}

	/** Flip one card on the caller's own board. */
	async flip(position: number): Promise<void> {
		const me = this.view.me;
		if (!me || this.pendingFlip !== null) return;
		this.pendingFlip = position;
		try {
			await this.act('flip', { boardPlayerId: me, position, actionId: uuid(), revision: this.view.revision });
		} finally {
			this.pendingFlip = null;
		}
	}

	dismissNotice() {
		this.notice = null;
	}

	/** Start realtime, timers and listeners. Returns a cleanup function. */
	start(): () => void {
		this.stopped = false;
		const onVisible = () => {
			if (document.visibilityState === 'visible') void this.refresh();
		};
		const onOnline = () => {
			this.connection = this.channel ? 'reconnecting' : 'connecting';
			void this.refresh();
		};
		const onOffline = () => (this.connection = 'offline');
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		window.addEventListener('pageshow', onVisible);

		this.tickTimer = setInterval(() => {
			if (this.view.game?.status === 'active') this.now = this.serverNow();
		}, 250);
		this.pollTimer = setInterval(() => {
			if (this.connection !== 'live' && document.visibilityState === 'visible') void this.refresh();
		}, POLL_WHEN_DISCONNECTED_MS);

		void this.connectRealtime();

		return () => {
			this.stopped = true;
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
			window.removeEventListener('pageshow', onVisible);
			clearTimeout(this.deadlineTimer);
			clearTimeout(this.noticeTimer);
			clearInterval(this.pollTimer);
			clearInterval(this.tickTimer);
			this.disconnectRealtime();
		};
	}

	private async connectRealtime() {
		try {
			const supabase = getBrowserSupabase();
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (this.stopped) return;
			if (session) await supabase.realtime.setAuth(session.access_token);

			const channel = supabase.channel(`session:${this.sessionId}`, {
				config: { private: true, presence: { key: this.presenceKey } }
			});
			this.channel = channel;

			channel
				.on('broadcast', { event: 'state' }, ({ payload }) => {
					const revision = Number((payload as { revision?: unknown } | undefined)?.revision);
					// Payloads carry no game data; a newer revision just means "refetch".
					if (!Number.isFinite(revision) || revision > this.view.revision) void this.refresh();
				})
				.on('presence', { event: 'sync' }, () => {
					this.online = new Set(Object.keys(channel.presenceState()));
				})
				.subscribe((status) => {
					if (this.stopped) return;
					if (status === 'SUBSCRIBED') {
						this.connection = 'live';
						void channel.track({ online_at: new Date().toISOString() });
						// Reconcile anything missed while (re)connecting.
						void this.refresh();
					} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
						this.connection = navigator.onLine ? 'reconnecting' : 'offline';
					} else if (status === 'CLOSED') {
						this.connection = 'reconnecting';
					}
				});
		} catch (error) {
			console.warn('Realtime unavailable; falling back to polling', error);
			this.connection = 'reconnecting';
		}
	}

	private disconnectRealtime() {
		if (this.channel) {
			const channel = this.channel;
			this.channel = null;
			void channel.untrack().catch(() => {});
			void getBrowserSupabase().removeChannel(channel);
		}
	}

	private handleResult(result: ApiResult, options: { quiet: boolean }) {
		if (result.view) this.apply(result.view);
		if (result.ok || !result.error) return;

		const { code, message } = result.error;
		if (FATAL_ERRORS.has(code)) {
			this.fatal = { code, message };
			this.stopped = true;
			clearTimeout(this.deadlineTimer);
			this.disconnectRealtime();
			return;
		}
		if (code === 'service_unavailable') this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		if (SILENT_ERRORS.has(code)) return;
		if (!options.quiet || code === 'rate_limited') this.showNotice(code, message);
	}

	private showNotice(code: ErrorCode, message: string) {
		this.notice = { code, message, at: Date.now() };
		clearTimeout(this.noticeTimer);
		this.noticeTimer = setTimeout(() => (this.notice = null), 4_500);
	}

	private scheduleDeadline() {
		clearTimeout(this.deadlineTimer);
		const game = this.view.game;
		if (this.stopped || !game || game.status !== 'active') return;
		const deadline = game.reveal_until ?? game.turn_until;
		if (!deadline) return;
		const delay = Math.max(0, Date.parse(deadline) - this.serverNow()) + DEADLINE_GRACE_MS;
		this.deadlineTimer = setTimeout(() => void this.refresh(), delay);
	}
}
