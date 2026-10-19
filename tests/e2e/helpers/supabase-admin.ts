/**
 * TEST-ONLY helpers (spec 19.3). They use the Supabase secret key from the
 * Node test process to create the host account and to read the board layout
 * so the test can deliberately choose matching / non-matching positions.
 * This module lives under tests/ and is never imported by the application.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function e2eConfig() {
	const url = process.env.PUBLIC_SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY;
	const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	return url && secretKey && publishableKey ? { url, secretKey, publishableKey } : null;
}

export class SupabaseAdmin {
	readonly client: SupabaseClient;
	private readonly userIds = new Set<string>();

	constructor(url: string, secretKey: string) {
		this.client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
	}

	async createHost(email: string, password: string): Promise<string> {
		const { data, error } = await this.client.auth.admin.createUser({ email, password, email_confirm: true });
		if (error || !data.user) throw new Error(`Could not create test host: ${error?.message}`);
		this.userIds.add(data.user.id);
		return data.user.id;
	}

	async sessionByCode(joinCode: string) {
		const { data, error } = await this.client
			.from('game_sessions')
			.select('id, status, join_code')
			.eq('join_code', joinCode);
		if (error) throw error;
		return data;
	}

	async game(sessionId: string) {
		const { data, error } = await this.client
			.from('games')
			.select('id, status, turn_order, active_player_id, current_round, end_reason, winner_ids, winning_groups')
			.eq('session_id', sessionId)
			.single();
		if (error) throw error;
		return data as {
			id: string;
			status: string;
			turn_order: string[];
			active_player_id: string | null;
			current_round: number | null;
			end_reason: string | null;
			winner_ids: string[];
			winning_groups: number[];
		};
	}

	async players(sessionId: string) {
		const { data, error } = await this.client
			.from('players')
			.select('id, user_id, nickname, score, status, group_number')
			.eq('session_id', sessionId);
		if (error) throw error;
		return data as {
			id: string;
			user_id: string;
			nickname: string;
			score: number;
			status: string;
			group_number: number | null;
		}[];
	}

	/** Fill in the Blanks: the correct answer of a round (read with the secret key). */
	async roundAnswer(gameId: string, round: number): Promise<string> {
		const { data, error } = await this.client
			.from('game_rounds')
			.select('grammar_questions(answer)')
			.eq('game_id', gameId)
			.eq('round', round)
			.single();
		if (error) throw error;
		return (data as unknown as { grammar_questions: { answer: string } }).grammar_questions.answer;
	}

	/** Board layout: position -> pair id (read with the secret key; never exposed to clients). */
	async layout(gameId: string): Promise<Map<number, string>> {
		const { data, error } = await this.client.from('game_layout').select('position, pair_id').eq('game_id', gameId);
		if (error) throw error;
		return new Map(data.map((row) => [row.position as number, row.pair_id as string]));
	}

	trackUsers(ids: string[]) {
		ids.forEach((id) => this.userIds.add(id));
	}

	/** Delete created users; sessions, players and game rows cascade. */
	async cleanup() {
		for (const id of this.userIds) await this.client.auth.admin.deleteUser(id).catch(() => {});
		this.userIds.clear();
	}
}

/** [[a, b], ...] positions holding the same pair. */
export function pairPositions(layout: Map<number, string>): [number, number][] {
	const byPair = new Map<string, number[]>();
	for (const [position, pairId] of layout) byPair.set(pairId, [...(byPair.get(pairId) ?? []), position]);
	return [...byPair.values()].map(([a, b]) => [a!, b!]);
}
