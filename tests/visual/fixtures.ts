import type { CardFace } from '$lib/game/types';
import type { SessionView, ViewPlayer } from '$lib/types/session-view';

const NOW = Date.now();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const NOUNS: [string, 'de' | 'het', string][] = [
	['ziekenhuis', 'het', '🏥'],
	['vrachtwagen', 'de', '🚚'],
	['portemonnee', 'de', '👛'],
	['winkelwagen', 'de', '🛒'],
	['thermometer', 'de', '🌡️'],
	['helikopter', 'de', '🚁'],
	['regenboog', 'de', '🌈'],
	['huis', 'het', '🏠'],
	['fiets', 'de', '🚲'],
	['bonnetje', 'het', '🧾'],
	['kalender', 'de', '📅'],
	['paraplu', 'de', '☂️']
];

/** Faces for a de_het layout: position 2k = image, 2k+1 = article+noun (shuffled order is irrelevant here). */
function faces(pairs: number): Record<string, CardFace> {
	const result: Record<string, CardFace> = {};
	for (let k = 0; k < pairs; k++) {
		const [word, article, emoji] = NOUNS[k]!;
		result[String(2 * k)] = { kind: 'image', emoji };
		result[String(2 * k + 1)] = { kind: 'article_word', article, word };
	}
	return result;
}

const PLAYERS: ViewPlayer[] = [
	['p1', 'Annemarie van Dijk', '🦊', 3],
	['p2', 'Bram', '🐼', 1],
	['p3', 'Charlotte-Sophie X', '🦉', 3],
	['p4', 'Daan', '🐸', 0],
	['p5', 'Eva', '🐙', 2],
	['p6', 'Femke', '🦁', 0]
].map(([id, nickname, avatar, score], i) => ({
	id: id as string,
	nickname: nickname as string,
	avatar: avatar as string,
	level: (['beginner', 'elementary', 'intermediate', 'advanced'] as const)[i % 4]!,
	status: 'active' as const,
	score: score as number,
	joined_at: iso(-60_000 + i * 1000)
}));

function base(status: SessionView['session']['status'], pairs: 6 | 8 | 12, players = PLAYERS): SessionView {
	return {
		revision: 42,
		server_now: iso(0),
		role: 'player',
		me: 'p2',
		session: {
			id: '00000000-0000-4000-8000-000000000000',
			name: 'Dutch class, Thursday evening group',
			join_code: 'K7M2QX',
			scheduled_at: null,
			variant: 'de_het',
			pair_count: pairs,
			status,
			created_at: iso(-3_600_000),
			started_at: status === 'lobby' ? null : iso(-600_000),
			ended_at: status === 'completed' ? iso(-1000) : null
		},
		players,
		game: null
	};
}

export function scene(name: string, pairs: 6 | 8 | 12): SessionView {
	const all = faces(pairs);
	const card_count = pairs * 2;
	const boards: Record<string, number[]> = {
		p1: [0, 1, 2, 3, 4, 5].slice(0, Math.min(6, card_count)),
		p2: [0, 1],
		p3: [6, 7, 8, 9, 10, 11].slice(0, Math.min(6, card_count)),
		p4: [],
		p5: [2, 3, 4, 5],
		p6: []
	};
	const visibleMatched = new Set(Object.values(boards).flat());
	const visibleFaces = (extra: number[]) =>
		Object.fromEntries(Object.entries(all).filter(([pos]) => visibleMatched.has(Number(pos)) || extra.includes(Number(pos))));

	const game = {
		status: 'active' as const,
		card_count,
		turn_order: PLAYERS.map((p) => p.id),
		active_player_id: 'p2',
		first_flip: 3 as number | null,
		mismatch_positions: null as [number, number] | null,
		reveal_until: null as string | null,
		turn_until: iso(42_000) as string | null,
		end_reason: null,
		winner_ids: [] as string[],
		started_at: iso(-600_000),
		ended_at: null,
		faces: visibleFaces([3]),
		boards,
		last_attempt: null
	};

	switch (name) {
		case 'lobby':
			return base('lobby', pairs);
		case 'game-other':
			return {
				...base('in_progress', pairs),
				game: {
					...game,
					active_player_id: 'p3',
					first_flip: null,
					mismatch_positions: [12, 15].map((p) => p % card_count) as [number, number],
					reveal_until: iso(2_000),
					turn_until: null,
					faces: visibleFaces([12 % card_count, 15 % card_count]),
					last_attempt: { player_id: 'p3', first_position: 12 % card_count, second_position: 15 % card_count, outcome: 'mismatch', at: iso(-100) }
				}
			};
		case 'results':
		case 'results-tie': {
			const tie = name === 'results-tie';
			const players = PLAYERS.map((p) =>
				p.id === 'p6' ? { ...p, status: 'removed' as const } : p.id === 'p1' && !tie ? { ...p, score: pairs } : p
			);
			return {
				...base('completed', pairs, players),
				game: {
					...game,
					status: 'completed',
					active_player_id: null,
					first_flip: null,
					turn_until: null,
					end_reason: tie ? 'ended_by_host' : 'board_cleared',
					winner_ids: tie ? ['p1', 'p3'] : ['p1'],
					ended_at: iso(-1000),
					boards: tie ? boards : { ...boards, p1: [...Array(card_count).keys()] },
					faces: tie ? visibleFaces([]) : all
				}
			};
		}
		default:
			return { ...base('in_progress', pairs), game };
	}
}
