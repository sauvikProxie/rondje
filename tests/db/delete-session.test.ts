import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
	db = await TestDb.create();
});
afterAll(async () => {
	await db.close();
});

const count = async (table: string) =>
	(await db.sql<{ n: number }>(`select count(*)::int as n from ${table}`))[0]!.n;

async function started() {
	const host = await db.createHost();
	const { sessionId, joinCode } = await db.createSession(host);
	const a = await db.join(joinCode, 'A');
	const b = await db.join(joinCode, 'B', '🐼');
	await db.rpc(host, 'start_game', { p_session_id: sessionId });
	return { host, sessionId, joinCode, a, b };
}

describe('delete_session', () => {
	test('deletes a lobby session', async () => {
		const host = await db.createHost();
		const { sessionId, joinCode } = await db.createSession(host);
		await db.join(joinCode, 'A');
		const res = await db.rpc(host, 'delete_session', { p_session_id: sessionId });
		expect(res).toMatchObject({ ok: true, error: null });
		expect(await db.sql('select 1 from public.game_sessions where id = $1', [sessionId])).toEqual([]);
		expect(await db.sql('select 1 from public.players where session_id = $1', [sessionId])).toEqual([]);
		expect((await db.rpc(null, 'lookup_session', { p_join_code: joinCode })).error).toBe('session_not_found');
	});

	test('deletes an in-progress session with all of its game data, but only that session', async () => {
		const other = await started();
		const g = await started();
		const pairs = await db.matchingPairs(g.sessionId);
		const active = (await db.game(g.sessionId)).active_player_id;
		const p = [g.a, g.b].find((x) => x.playerId === active)!;
		await db.flip(p.user, g.sessionId, p.playerId, pairs[0]![0]);
		await db.flip(p.user, g.sessionId, p.playerId, pairs[0]![1]);

		const before = {
			layout: await count('public.game_layout'),
			cells: await count('public.board_cells'),
			attempts: await count('public.game_attempts'),
			actions: await count('public.processed_actions')
		};
		expect((await db.rpc(g.host, 'delete_session', { p_session_id: g.sessionId })).ok).toBe(true);

		expect(await db.game(g.sessionId)).toBeUndefined();
		expect(await count('public.game_layout')).toBe(before.layout - 12);
		expect(await count('public.board_cells')).toBe(before.cells - 24);
		expect(await count('public.game_attempts')).toBe(before.attempts - 1);
		expect(await count('public.processed_actions')).toBe(before.actions - 2);

		// The other session is untouched and still playable.
		expect((await db.rpc(other.host, 'get_session_view', { p_session_id: other.sessionId })).ok).toBe(true);
	});

	test('deletes a completed session', async () => {
		const g = await started();
		await db.rpc(g.host, 'end_game', { p_session_id: g.sessionId });
		expect((await db.rpc(g.host, 'delete_session', { p_session_id: g.sessionId })).ok).toBe(true);
	});

	test('only the owning host can delete; players and other hosts are refused and nothing changes', async () => {
		const g = await started();
		const otherHost = await db.createHost();
		expect((await db.rpc(otherHost, 'delete_session', { p_session_id: g.sessionId })).error).toBe('not_host');
		expect((await db.rpc(g.a.user, 'delete_session', { p_session_id: g.sessionId })).error).toBe('not_host');
		await expect(db.rpc(null, 'delete_session', { p_session_id: g.sessionId })).rejects.toThrow(/permission denied/);
		expect(await db.sql('select 1 from public.game_sessions where id = $1', [g.sessionId])).toHaveLength(1);
	});

	test('deleting twice or an unknown id reports session_not_found; direct table delete is blocked', async () => {
		const g = await started();
		await db.rpc(g.host, 'delete_session', { p_session_id: g.sessionId });
		expect((await db.rpc(g.host, 'delete_session', { p_session_id: g.sessionId })).error).toBe('session_not_found');
		expect((await db.rpc(g.host, 'delete_session', { p_session_id: crypto.randomUUID() })).error).toBe('session_not_found');
		const other = await started();
		await expect(
			db.as(other.host, (pg) => pg.query('delete from public.game_sessions'))
		).rejects.toThrow(/permission denied/);
	});

	test('members lose access after deletion', async () => {
		const g = await started();
		await db.rpc(g.host, 'delete_session', { p_session_id: g.sessionId });
		expect((await db.rpc(g.a.user, 'get_session_view', { p_session_id: g.sessionId })).error).toBe('session_not_found');
		expect((await db.flip(g.a.user, g.sessionId, g.a.playerId, 0, { revision: 1 })).error).toBe('session_not_found');
	});

	test('a final notification is broadcast so open pages refetch', async () => {
		const g = await started();
		const before = await db.revision(g.sessionId);
		await db.rpc(g.host, 'delete_session', { p_session_id: g.sessionId });
		const msgs = await db.sql<{ payload: { revision: number } }>(
			'select payload from realtime.messages where topic = $1 order by id desc limit 1',
			[`session:${g.sessionId}`]
		);
		expect(msgs[0]!.payload.revision).toBe(before + 1);
	});
});
