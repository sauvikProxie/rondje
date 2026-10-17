import { describe, expect, test } from 'vitest';
import { boardCells, faceLabel, faceText, flipBlockReason, matchedPairs } from '../../src/lib/game/view';
import type { SessionView, ViewGame } from '../../src/lib/types/session-view';

function game(overrides: Partial<ViewGame> = {}): ViewGame {
	return {
		status: 'active',
		card_count: 12,
		turn_order: ['a', 'b'],
		active_player_id: 'a',
		first_flip: null,
		mismatch_positions: null,
		reveal_until: null,
		turn_until: '2030-01-01T00:00:00Z',
		end_reason: null,
		winner_ids: [],
		started_at: '2030-01-01T00:00:00Z',
		ended_at: null,
		faces: {},
		boards: { a: [], b: [] },
		last_attempt: null,
		...overrides
	};
}

function view(g: ViewGame, me: string | null = 'a'): SessionView {
	return {
		revision: 3,
		server_now: '2030-01-01T00:00:00Z',
		role: me ? 'player' : 'host',
		me,
		session: {
			id: 's',
			name: 'Les',
			join_code: 'ABCDEF',
			scheduled_at: null,
			variant: 'word_image',
			pair_count: 6,
			status: 'in_progress',
			created_at: '2030-01-01T00:00:00Z',
			started_at: '2030-01-01T00:00:00Z',
			ended_at: null
		},
		players: [],
		game: g
	};
}

describe('board view helpers', () => {
	test('face-down cells never expose content, even if the position is known from another board', () => {
		const g = game({
			boards: { a: [], b: [0, 5] },
			faces: { '0': { kind: 'image', emoji: '🚲' }, '5': { kind: 'word', word: 'fiets' } }
		});
		const mine = boardCells(g, 'a');
		expect(mine[0]).toEqual({ position: 0, state: 'hidden', face: null, mismatch: false });
		const theirs = boardCells(g, 'b');
		expect(theirs[0]).toMatchObject({ state: 'matched', face: { emoji: '🚲' } });
		expect(theirs[5]).toMatchObject({ state: 'matched', face: { word: 'fiets' } });
	});

	test('flipped cards are shown only on the active player’s board', () => {
		const g = game({ first_flip: 2, faces: { '2': { kind: 'image', emoji: '🍎' } } });
		expect(boardCells(g, 'a')[2]).toMatchObject({ state: 'flipped', face: { emoji: '🍎' } });
		expect(boardCells(g, 'b')[2]).toMatchObject({ state: 'hidden', face: null });
	});

	test('mismatch reveals are marked so the UI can show the outcome without relying on colour', () => {
		const g = game({ mismatch_positions: [1, 7], reveal_until: '2030-01-01T00:00:02Z', turn_until: null });
		const cells = boardCells(g, 'a');
		expect(cells.filter((c) => c.mismatch).map((c) => c.position)).toEqual([1, 7]);
		expect(cells[1]!.state).toBe('flipped');
	});

	test('flipBlockReason mirrors the server rules for the client', () => {
		expect(flipBlockReason(view(game()), 0)).toBeNull();
		expect(flipBlockReason(view(game(), 'b'), 0)).toBe('not_your_turn');
		expect(flipBlockReason(view(game({ first_flip: 0 })), 0)).toBe('already_flipped');
		expect(flipBlockReason(view(game({ boards: { a: [0, 1], b: [] } })), 0)).toBe('already_matched');
		expect(flipBlockReason(view(game({ mismatch_positions: [0, 1] })), 4)).toBe('reveal_pending');
		expect(flipBlockReason(view(game({ status: 'completed' })), 4)).toBe('game_not_active');
		expect(flipBlockReason(view(game(), null), 0)).toBe('not_a_player');
	});

	test('face text and labels', () => {
		expect(faceText({ kind: 'word', word: 'kat' })).toBe('Kat');
		expect(faceText({ kind: 'article_word', article: 'het', word: 'huis' })).toBe('Het huis');
		expect(faceText({ kind: 'image', emoji: '🐱' })).toBe('🐱');
		expect(faceLabel({ kind: 'image', emoji: '🐱' })).toBe('picture 🐱');
	});

	test('matched pairs per board', () => {
		expect(matchedPairs(game({ boards: { a: [0, 3, 4, 9], b: [] } }), 'a')).toBe(2);
		expect(matchedPairs(game(), 'zzz')).toBe(0);
	});
});
