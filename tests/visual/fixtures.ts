import type { CardFace } from '$lib/game/types';
import type { SessionView, ViewGame, ViewPlayer, ViewRound } from '$lib/types/session-view';

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
	total_score: score as number,
	group: null,
	joined_at: iso(-60_000 + i * 1000)
}));

/** The same players dealt into two groups. */
const GROUPED = PLAYERS.map((p, i) => ({ ...p, group: (i % 2) + 1 }));

function base(
	status: SessionView['session']['status'],
	pairs: 6 | 8 | 12,
	players = PLAYERS,
	options: { mode?: 'matchen' | 'fill_blanks'; groups?: number; me?: string } = {}
): SessionView {
	const mode = options.mode ?? 'matchen';
	return {
		revision: 42,
		server_now: iso(0),
		role: 'player',
		me: options.me ?? 'p2',
		session: {
			id: '00000000-0000-4000-8000-000000000000',
			name: 'Dutch class, Thursday evening group',
			join_code: 'K7M2QX',
			scheduled_at: null,
			mode,
			variant: mode === 'matchen' ? 'de_het' : null,
			pair_count: pairs,
			group_count: options.groups ?? 1,
			status,
			created_at: iso(-3_600_000),
			started_at: status === 'lobby' ? null : iso(-600_000),
			ended_at: status === 'completed' ? iso(-1000) : null
		},
		players,
		game: null,
		history: []
	};
}

function blanksRound(phase: ViewRound['phase'], answerMode: 'choice' | 'type', mine: string | null): ViewRound {
	return {
		index: 2,
		count: 8,
		phase,
		sentence: 'Mijn moeder ___ (werken) vorig jaar in Rotterdam.',
		translation: 'My mother worked in Rotterdam last year.',
		topic: 'past_tense',
		answer_mode: answerMode,
		options: answerMode === 'choice' ? ['werkten', 'werkte', 'gewerkt', 'werkde'] : null,
		answered: mine === null ? ['p1', 'p3'] : ['p1', 'p2', 'p3'],
		my_answer: mine,
		correct_answer: phase === 'reveal' ? 'werkte' : null,
		results: phase === 'reveal' ? { p1: true, p2: mine === 'werkte', p3: false } : null
	};
}

export function scene(name: string, pairs: 6 | 8 | 12): SessionView {
	const all = faces(pairs);
	const card_count = pairs * 2;
	// Found pairs on the shared board, with the player who found each.
	const matched: Record<string, string> = { '0': 'p1', '1': 'p1', '4': 'p3', '5': 'p3', '8': 'p5', '9': 'p5' };
	const visibleFaces = (extra: number[]) =>
		Object.fromEntries(Object.entries(all).filter(([pos]) => pos in matched || extra.includes(Number(pos))));

	const game: ViewGame = {
		number: 1,
		status: 'active',
		card_count,
		turn_order: PLAYERS.map((p) => p.id),
		active_player_id: 'p2',
		first_flip: 3,
		mismatch_positions: null,
		reveal_until: null,
		end_reason: null,
		winner_ids: [],
		winning_groups: [],
		started_at: iso(-600_000),
		ended_at: null,
		faces: visibleFaces([3]),
		matched,
		last_attempt: null,
		round: null
	};

	const blanksGame = (round: ViewRound): ViewGame => ({
		...game,
		active_player_id: null,
		card_count: 0,
		first_flip: null,
		faces: {},
		matched: {},
		reveal_until: round.phase === 'reveal' ? iso(3_000) : null,
		round
	});

	switch (name) {
		case 'lobby':
			return base('lobby', pairs);
		case 'lobby-blanks':
			return base('lobby', pairs, PLAYERS, { mode: 'fill_blanks', groups: 2 });
		case 'game-other':
			return {
				...base('in_progress', pairs),
				game: {
					...game,
					active_player_id: 'p3',
					first_flip: null,
					mismatch_positions: [12, 15].map((p) => p % card_count) as [number, number],
					reveal_until: iso(2_000),
					faces: visibleFaces([12 % card_count, 15 % card_count]),
					last_attempt: { player_id: 'p3', first_position: 12 % card_count, second_position: 15 % card_count, outcome: 'mismatch', at: iso(-100) }
				}
			};
		case 'game-groups':
			return { ...base('in_progress', pairs, GROUPED, { groups: 2 }), game };
		case 'blanks-choice':
			return { ...base('in_progress', 8, PLAYERS, { mode: 'fill_blanks' }), game: blanksGame(blanksRound('answering', 'choice', null)) };
		case 'blanks-type':
			return {
				...base('in_progress', 8, GROUPED, { mode: 'fill_blanks', groups: 2, me: 'p4' }),
				game: blanksGame(blanksRound('answering', 'type', null))
			};
		case 'blanks-reveal':
			return {
				...base('in_progress', 8, GROUPED, { mode: 'fill_blanks', groups: 2 }),
				game: blanksGame(blanksRound('reveal', 'choice', 'werkten'))
			};
		case 'results':
		case 'results-tie': {
			const tie = name === 'results-tie';
			const players = PLAYERS.map((p) =>
				p.id === 'p6' ? { ...p, status: 'removed' as const } : p.id === 'p1' && !tie ? { ...p, score: pairs - 4 } : p
			);
			return {
				...base('completed', pairs, players),
				game: {
					...game,
					status: 'completed',
					active_player_id: null,
					first_flip: null,
					end_reason: tie ? 'ended_by_host' : 'board_cleared',
					winner_ids: tie ? ['p1', 'p3'] : ['p1'],
					ended_at: iso(-1000),
					faces: tie ? visibleFaces([]) : all
				}
			};
		}
		case 'results-groups': {
			const players = GROUPED.map((p) => (p.id === 'p6' ? { ...p, status: 'removed' as const } : p));
			return {
				...base('completed', 8, players, { mode: 'fill_blanks', groups: 2 }),
				game: {
					...blanksGame(blanksRound('reveal', 'choice', 'werkte')),
					status: 'completed',
					end_reason: 'all_rounds_played',
					winner_ids: ['p1', 'p3', 'p5'],
					winning_groups: [1],
					ended_at: iso(-1000),
					reveal_until: null,
					round: null
				}
			};
		}
		case 'lobby-next':
		case 'results-session': {
			// Third game of a session: earlier points carried into the totals.
			const carried: Record<string, number> = { p1: 9, p2: 4, p3: 6, p4: 2, p5: 5, p6: 7 };
			const lobby = name === 'lobby-next';
			const players = PLAYERS.map((p) => ({
				...p,
				status: p.id === 'p6' ? ('removed' as const) : p.status,
				score: lobby ? 0 : p.score,
				total_score: carried[p.id]! + (lobby ? 0 : p.score)
			}));
			const history: SessionView['history'] = [
				{ number: 1, mode: 'matchen', variant: 'word_image', pair_count: 8, group_count: 1, end_reason: 'board_cleared', winner_ids: ['p1'], winning_groups: [], ended_at: iso(-1_800_000) },
				{ number: 2, mode: 'fill_blanks', variant: null, pair_count: 6, group_count: 2, end_reason: 'all_rounds_played', winner_ids: ['p1', 'p3', 'p5'], winning_groups: [1], ended_at: iso(-900_000) }
			];
			if (lobby) return { ...base('lobby', pairs, players), history };
			return {
				...base('completed', pairs, players),
				history: [
					...history,
					{ number: 3, mode: 'matchen', variant: 'de_het', pair_count: pairs, group_count: 1, end_reason: 'board_cleared', winner_ids: ['p1', 'p3'], winning_groups: [], ended_at: iso(-1000) }
				],
				game: {
					...game,
					number: 3,
					status: 'completed',
					active_player_id: null,
					first_flip: null,
					end_reason: 'board_cleared',
					winner_ids: ['p1', 'p3'],
					ended_at: iso(-1000),
					faces: all
				}
			};
		}
		default:
			return { ...base('in_progress', pairs), game };
	}
}
