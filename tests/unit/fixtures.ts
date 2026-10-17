import type { PairCount, Variant } from '../../src/lib/game/constants';
import { createGame } from '../../src/lib/game/game-state';
import { seededRng } from '../../src/lib/game/random';
import type { GameState, PairDefinition, VocabularyItem } from '../../src/lib/game/types';

const NOUNS: [word: string, article: 'de' | 'het', emoji: string][] = [
	['auto', 'de', '🚗'],
	['fiets', 'de', '🚲'],
	['huis', 'het', '🏠'],
	['appel', 'de', '🍎'],
	['brood', 'het', '🍞'],
	['kat', 'de', '🐱'],
	['boek', 'het', '📕'],
	['zon', 'de', '☀️'],
	['ei', 'het', '🥚'],
	['trein', 'de', '🚆'],
	['bed', 'het', '🛏️'],
	['sleutel', 'de', '🔑'],
	['oog', 'het', '👁️'],
	['vis', 'de', '🐟']
];

const OPPOSITES: [string, string][] = [
	['groot', 'klein'],
	['warm', 'koud'],
	['open', 'dicht'],
	['hoog', 'laag'],
	['lang', 'kort'],
	['snel', 'langzaam'],
	['oud', 'jong'],
	['licht', 'donker'],
	['dik', 'dun'],
	['vol', 'leeg'],
	['nat', 'droog'],
	['vroeg', 'laat'],
	['duur', 'goedkoop']
];

export const items = new Map<string, VocabularyItem>();
for (const [word, article, emoji] of NOUNS) items.set(word, { id: word, word, article, emoji });
for (const [a, b] of OPPOSITES) {
	items.set(a, { id: a, word: a, article: null, emoji: null });
	items.set(b, { id: b, word: b, article: null, emoji: null });
}

export const pairs: PairDefinition[] = [
	...NOUNS.flatMap(([word]): PairDefinition[] => [
		{ id: `image_pairs:${word}`, variant: 'image_pairs', itemA: word, faceA: 'image', itemB: word, faceB: 'image' },
		{ id: `word_image:${word}`, variant: 'word_image', itemA: word, faceA: 'image', itemB: word, faceB: 'word' },
		{ id: `de_het:${word}`, variant: 'de_het', itemA: word, faceA: 'image', itemB: word, faceB: 'article_word' }
	]),
	...OPPOSITES.map(([a, b]): PairDefinition => ({
		id: `opposites:${a}`,
		variant: 'opposites',
		itemA: a,
		faceA: 'word',
		itemB: b,
		faceB: 'word'
	}))
];

export const T0 = 1_700_000_000_000;

export function newGame(
	options: { players?: string[]; variant?: Variant; pairCount?: PairCount; seed?: number } = {}
): GameState {
	return createGame({
		variant: options.variant ?? 'word_image',
		pairCount: options.pairCount ?? 6,
		pairs,
		items,
		playerIds: options.players ?? ['anna', 'bram', 'cas'],
		rng: seededRng(options.seed ?? 42),
		now: T0
	});
}

/** Positions of the two cards of each pair: [[a, b], ...]. */
export function matchingPositions(state: GameState): [number, number][] {
	const byPair = new Map<string, number[]>();
	for (const card of state.layout) byPair.set(card.pairId, [...(byPair.get(card.pairId) ?? []), card.position]);
	return [...byPair.values()].map(([a, b]) => [a!, b!]);
}

/** Two positions holding different pairs. */
export function nonMatchingPositions(state: GameState, skip: ReadonlySet<number> = new Set()): [number, number] {
	const [first, ...rest] = state.layout.filter((c) => !skip.has(c.position));
	const other = rest.find((c) => c.pairId !== first!.pairId)!;
	return [first!.position, other.position];
}

let counter = 0;
export function actionId(): string {
	counter += 1;
	return `action-${counter}`;
}
