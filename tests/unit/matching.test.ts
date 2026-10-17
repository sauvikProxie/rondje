import { describe, expect, test } from 'vitest';
import { cardFace, cardsMatch, isValidPairDefinition, pairDefinitionError, positionsMatch } from '../../src/lib/game/matching';
import type { LayoutCard, PairDefinition } from '../../src/lib/game/types';
import { faceText } from '../../src/lib/game/view';
import { items, newGame, pairs } from './fixtures';

const pair = (id: string) => pairs.find((p) => p.id === id)!;
const card = (position: number, pairId: string, side: 0 | 1): LayoutCard => ({ position, pairId, side });

describe('matching per variant', () => {
	test('Image Pairs: identical image identities match', () => {
		const apple = pair('image_pairs:appel');
		expect(isValidPairDefinition(apple, items)).toBe(true);
		expect(cardFace(apple, 0, items)).toEqual({ kind: 'image', emoji: '🍎' });
		expect(cardFace(apple, 1, items)).toEqual({ kind: 'image', emoji: '🍎' });
		expect(cardsMatch(card(0, apple.id, 0), card(5, apple.id, 1))).toBe(true);
	});

	test('Word–Image: the correct word and image match', () => {
		const cat = pair('word_image:kat');
		expect(isValidPairDefinition(cat, items)).toBe(true);
		expect(faceText(cardFace(cat, 0, items))).toBe('🐱');
		expect(faceText(cardFace(cat, 1, items))).toBe('Kat');
		expect(cardsMatch(card(1, cat.id, 0), card(2, cat.id, 1))).toBe(true);
		// The image of one item never matches the word of another.
		expect(cardsMatch(card(1, cat.id, 0), card(2, 'word_image:auto', 1))).toBe(false);
	});

	test('De Het: the image matches the noun with its correct article', () => {
		const house = pair('de_het:huis');
		expect(isValidPairDefinition(house, items)).toBe(true);
		expect(faceText(cardFace(house, 1, items))).toBe('Het huis');
		expect(faceText(cardFace(pair('de_het:fiets'), 1, items))).toBe('De fiets');
		expect(cardsMatch(card(0, house.id, 0), card(1, house.id, 1))).toBe(true);
	});

	test('De Het: a noun without an article is not a valid pair', () => {
		const noArticle = new Map(items);
		noArticle.set('huis', { ...items.get('huis')!, article: null });
		expect(pairDefinitionError(pair('de_het:huis'), noArticle)).toMatch(/article/);
	});

	test('Opposites: only explicitly configured opposites match', () => {
		const big = pair('opposites:groot');
		expect(isValidPairDefinition(big, items)).toBe(true);
		expect([faceText(cardFace(big, 0, items)), faceText(cardFace(big, 1, items))]).toEqual(['Groot', 'Klein']);
		expect(cardsMatch(card(0, big.id, 0), card(1, big.id, 1))).toBe(true);
		// groot/warm are not configured as opposites.
		expect(cardsMatch(card(0, big.id, 0), card(1, 'opposites:warm', 0))).toBe(false);
	});

	test('invalid combinations are rejected', () => {
		const invalid: PairDefinition[] = [
			{ id: 'x1', variant: 'image_pairs', itemA: 'auto', faceA: 'image', itemB: 'fiets', faceB: 'image' },
			{ id: 'x2', variant: 'word_image', itemA: 'auto', faceA: 'image', itemB: 'fiets', faceB: 'word' },
			{ id: 'x3', variant: 'word_image', itemA: 'auto', faceA: 'word', itemB: 'auto', faceB: 'word' },
			{ id: 'x4', variant: 'opposites', itemA: 'groot', faceA: 'word', itemB: 'groot', faceB: 'word' },
			{ id: 'x5', variant: 'opposites', itemA: 'groot', faceA: 'image', itemB: 'klein', faceB: 'word' },
			{ id: 'x6', variant: 'image_pairs', itemA: 'groot', faceA: 'image', itemB: 'groot', faceB: 'image' },
			{ id: 'x7', variant: 'word_image', itemA: 'onbekend', faceA: 'image', itemB: 'onbekend', faceB: 'word' }
		];
		for (const p of invalid) expect(isValidPairDefinition(p, items), p.id).toBe(false);
	});

	test('a card never matches itself, and same-side cards do not match', () => {
		const apple = pair('image_pairs:appel');
		expect(cardsMatch(card(3, apple.id, 0), card(3, apple.id, 0))).toBe(false);
		expect(cardsMatch(card(3, apple.id, 0), card(4, apple.id, 0))).toBe(false);
	});

	test('positionsMatch follows the layout', () => {
		const state = newGame();
		const [a, b] = [0, state.layout.findIndex((c, i) => i > 0 && c.pairId === state.layout[0]!.pairId)];
		expect(positionsMatch(state.layout, a!, b!)).toBe(true);
		const c = state.layout.findIndex((x) => x.pairId !== state.layout[0]!.pairId);
		expect(positionsMatch(state.layout, a!, c)).toBe(false);
		expect(positionsMatch(state.layout, a!, 999)).toBe(false);
	});
});
