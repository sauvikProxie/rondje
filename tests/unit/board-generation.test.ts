import { describe, expect, test } from 'vitest';
import { createTurnOrder, generateLayout, selectPairs, validateLayout } from '../../src/lib/game/board-generation';
import { PAIR_COUNTS, VARIANTS } from '../../src/lib/game/constants';
import { createGame } from '../../src/lib/game/game-state';
import { pairTokens } from '../../src/lib/game/matching';
import { seededRng } from '../../src/lib/game/random';
import { GameRuleError, type PairDefinition, type VocabularyItem } from '../../src/lib/game/types';
import { items, newGame, pairs } from './fixtures';

describe('board generation', () => {
	test.each(VARIANTS.flatMap((v) => PAIR_COUNTS.map((n) => [v, n] as const)))(
		'%s / %i pairs: layout has exactly the requested pairs, each exactly twice',
		(variant, pairCount) => {
			const state = newGame({ variant, pairCount, seed: pairCount * 7 });
			expect(state.layout).toHaveLength(pairCount * 2);
			const counts = new Map<string, number>();
			for (const card of state.layout) counts.set(card.pairId, (counts.get(card.pairId) ?? 0) + 1);
			expect(counts.size).toBe(pairCount);
			expect([...counts.values()].every((n) => n === 2)).toBe(true);
			expect(() => validateLayout(state.layout, pairCount)).not.toThrow();
		}
	);

	test('every position maps to a valid pair of the chosen variant', () => {
		const state = newGame({ variant: 'de_het', pairCount: 12 });
		const byId = new Map(pairs.map((p) => [p.id, p]));
		for (const card of state.layout) {
			const pair = byId.get(card.pairId);
			expect(pair?.variant).toBe('de_het');
		}
	});

	test('each pair has one card per side, so shuffling keeps pair relationships', () => {
		for (let seed = 1; seed <= 25; seed++) {
			const state = newGame({ seed, pairCount: 8 });
			const sides = new Map<string, number[]>();
			for (const card of state.layout) sides.set(card.pairId, [...(sides.get(card.pairId) ?? []), card.side]);
			for (const s of sides.values()) expect(s.sort()).toEqual([0, 1]);
		}
	});

	test('different seeds shuffle positions differently', () => {
		const a = newGame({ seed: 1, pairCount: 12 }).layout.map((c) => `${c.pairId}/${c.side}`);
		const b = newGame({ seed: 2, pairCount: 12 }).layout.map((c) => `${c.pairId}/${c.side}`);
		expect(a).not.toEqual(b);
	});

	test('everyone plays on one shared board that starts with every position unmatched', () => {
		const state = newGame({ players: ['a', 'b', 'c', 'd'], pairCount: 8 });
		expect(state.layout).toHaveLength(16);
		expect(state.matchedBy).toEqual({});
		expect(Object.values(state.players).every((p) => p.score === 0)).toBe(true);
	});

	test('the turn order contains every eligible player exactly once', () => {
		const players = ['a', 'b', 'c', 'd', 'e'];
		const state = newGame({ players });
		expect([...state.turnOrder].sort()).toEqual(players);
		expect(state.activePlayerId).toBe(state.turnOrder[0]);
		expect(() => createTurnOrder(['a', 'a'], seededRng(1))).toThrow();
	});

	test('without groups nobody has a group', () => {
		const state = newGame();
		expect(Object.values(state.players).every((p) => p.group === null)).toBe(true);
	});

	test.each([2, 3, 4])('%i groups: balanced, and the turn order alternates between groups', (groupCount) => {
		const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
		const state = newGame({ players, groupCount, seed: groupCount });
		const sizes = new Map<number, number>();
		for (const p of Object.values(state.players)) sizes.set(p.group!, (sizes.get(p.group!) ?? 0) + 1);
		expect([...sizes.keys()].sort()).toEqual(Array.from({ length: groupCount }, (_, i) => i + 1));
		expect(Math.max(...sizes.values()) - Math.min(...sizes.values())).toBeLessThanOrEqual(1);
		// Consecutive turns belong to different groups.
		const groups = state.turnOrder.map((id) => state.players[id]!.group);
		groups.forEach((g, i) => expect(g).toBe((i % groupCount) + 1));
	});

	test('a game cannot start with fewer players than groups', () => {
		expect(() => newGame({ players: ['a', 'b'], groupCount: 3 })).toThrow(GameRuleError);
	});

	test('no two selected pairs share an emoji or a word', () => {
		for (const variant of VARIANTS) {
			const selected = selectPairs({ variant, pairCount: 12, pairs, items, rng: seededRng(3) });
			const tokens = selected.flatMap((p) => pairTokens(p, items));
			expect(new Set(tokens).size).toBe(tokens.length);
		}
	});

	test('insufficient vocabulary is rejected', () => {
		const few = pairs.filter((p) => p.variant === 'opposites').slice(0, 7);
		expect(() => selectPairs({ variant: 'opposites', pairCount: 8, pairs: few, items, rng: seededRng(1) })).toThrow(
			GameRuleError
		);
		try {
			selectPairs({ variant: 'opposites', pairCount: 8, pairs: few, items, rng: seededRng(1) });
		} catch (error) {
			expect((error as GameRuleError).code).toBe('not_enough_vocabulary');
		}
	});

	test('invalid and inactive vocabulary is never used', () => {
		const brokenItems = new Map<string, VocabularyItem>(items);
		brokenItems.set('geen-lidwoord', { id: 'geen-lidwoord', word: 'water', article: null, emoji: '💧' });
		const candidates: PairDefinition[] = [
			// Invalid: de_het requires an article.
			{ id: 'bad-1', variant: 'de_het', itemA: 'geen-lidwoord', faceA: 'image', itemB: 'geen-lidwoord', faceB: 'article_word' },
			// Invalid: wrong shape for word_image.
			{ id: 'bad-2', variant: 'de_het', itemA: 'auto', faceA: 'word', itemB: 'auto', faceB: 'word' },
			// Inactive.
			{ ...pairs.find((p) => p.id === 'de_het:fiets')!, active: false },
			...pairs.filter((p) => p.variant === 'de_het' && p.id !== 'de_het:fiets')
		];
		for (let seed = 0; seed < 20; seed++) {
			const selected = selectPairs({ variant: 'de_het', pairCount: 12, pairs: candidates, items: brokenItems, rng: seededRng(seed) });
			const ids = selected.map((p) => p.id);
			expect(ids).not.toContain('bad-1');
			expect(ids).not.toContain('bad-2');
			expect(ids).not.toContain('de_het:fiets');
		}
		// Only invalid data available => rejected.
		expect(() =>
			selectPairs({ variant: 'de_het', pairCount: 6, pairs: candidates.slice(0, 3), items: brokenItems, rng: seededRng(1) })
		).toThrow(/not_enough_vocabulary|Only/);
	});

	test('a game cannot start with fewer than two players', () => {
		expect(() =>
			createGame({ variant: 'word_image', pairCount: 6, pairs, items, playerIds: ['solo'], rng: seededRng(1) })
		).toThrow(GameRuleError);
	});

	test('layout validation rejects broken layouts', () => {
		const selected = selectPairs({ variant: 'word_image', pairCount: 6, pairs, items, rng: seededRng(5) });
		const layout = generateLayout(selected, seededRng(5));
		expect(() => validateLayout(layout.slice(1), 6)).toThrow();
		const duplicated = layout.map((c, i) => (i === 1 ? { ...layout[0]!, position: 1 } : c));
		expect(() => validateLayout(duplicated, 6)).toThrow();
	});
});
