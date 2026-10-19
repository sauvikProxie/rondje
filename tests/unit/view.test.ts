import { describe, expect, test } from 'vitest';
import { boardCells, faceLabel, faceText, flipBlockReason, pairsLeft } from '../../src/lib/game/view';
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
		end_reason: null,
		winner_ids: [],
		winning_groups: [],
		started_at: '2030-01-01T00:00:00Z',
		ended_at: null,
		faces: {},
		matched: {},
		last_attempt: null,
		round: null,
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
			mode: 'matchen',
			variant: 'word_image',
			pair_count: 6,
			group_count: 1,
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
	test('matched cards stay face up on the shared board for everyone, whoever plays next', () => {
		const g = game({
			active_player_id: 'b',
			matched: { '0': 'a', '5': 'a' },
			faces: { '0': { kind: 'image', emoji: '🚲' }, '5': { kind: 'word', word: 'fiets' } }
		});
		const cells = boardCells(g);
		expect(cells[0]).toMatchObject({ state: 'matched', face: { emoji: '🚲' }, matchedBy: 'a' });
		expect(cells[5]).toMatchObject({ state: 'matched', face: { word: 'fiets' }, matchedBy: 'a' });
		expect(cells[1]).toEqual({ position: 1, state: 'hidden', face: null, mismatch: false, matchedBy: null });
	});

	test('the current flip is shown face up', () => {
		const g = game({ first_flip: 2, faces: { '2': { kind: 'image', emoji: '🍎' } } });
		expect(boardCells(g)[2]).toMatchObject({ state: 'flipped', face: { emoji: '🍎' } });
	});

	test('mismatch reveals are marked so the UI can show the outcome without relying on colour', () => {
		const g = game({ mismatch_positions: [1, 7], reveal_until: '2030-01-01T00:00:02Z' });
		const cells = boardCells(g);
		expect(cells.filter((c) => c.mismatch).map((c) => c.position)).toEqual([1, 7]);
		expect(cells[1]!.state).toBe('flipped');
	});

	test('a pair matched by a player who no longer exists still shows as matched', () => {
		const g = game({ matched: { '3': null, '4': null }, faces: { '3': { kind: 'word', word: 'kat' }, '4': { kind: 'image', emoji: '🐱' } } });
		expect(boardCells(g)[3]).toMatchObject({ state: 'matched', matchedBy: null });
	});

	test('flipBlockReason mirrors the server rules for the client', () => {
		expect(flipBlockReason(view(game()), 0)).toBeNull();
		expect(flipBlockReason(view(game(), 'b'), 0)).toBe('not_your_turn');
		expect(flipBlockReason(view(game({ first_flip: 0 })), 0)).toBe('already_flipped');
		expect(flipBlockReason(view(game({ matched: { '0': 'b', '1': 'b' } })), 0)).toBe('already_matched');
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

	test('pairs left on the shared board', () => {
		expect(pairsLeft(game())).toBe(6);
		expect(pairsLeft(game({ matched: { '0': 'a', '3': 'a', '4': 'b', '9': 'b' } }))).toBe(4);
	});
});
