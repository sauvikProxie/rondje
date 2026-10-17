import type { PairCount, Variant } from './constants';
import { isValidPairDefinition, pairTokens } from './matching';
import { shuffle, type Rng } from './random';
import { GameRuleError, type LayoutCard, type PairDefinition, type VocabularyItem } from './types';

/**
 * Select `pairCount` random valid pairs for `variant` (spec 7.3, 8.1 step 1).
 * Inactive and invalid pair definitions are rejected; no two selected pairs
 * share an emoji or a Dutch word. Throws `not_enough_vocabulary` when the
 * vocabulary cannot support the configuration.
 */
export function selectPairs(params: {
	variant: Variant;
	pairCount: PairCount;
	pairs: readonly PairDefinition[];
	items: ReadonlyMap<string, VocabularyItem>;
	rng: Rng;
}): PairDefinition[] {
	const { variant, pairCount, pairs, items, rng } = params;
	const candidates = pairs.filter((pair) => {
		if (pair.variant !== variant || pair.active === false) return false;
		const a = items.get(pair.itemA);
		const b = items.get(pair.itemB);
		if (!a || !b || a.active === false || b.active === false) return false;
		return isValidPairDefinition(pair, items);
	});

	const selected: PairDefinition[] = [];
	const used = new Set<string>();
	for (const pair of shuffle(candidates, rng)) {
		const tokens = pairTokens(pair, items);
		if (tokens.some((token) => used.has(token))) continue;
		selected.push(pair);
		tokens.forEach((token) => used.add(token));
		if (selected.length === pairCount) return selected;
	}

	throw new GameRuleError(
		'not_enough_vocabulary',
		`Only ${selected.length} usable ${variant} pairs available; ${pairCount} required`
	);
}

/** Both cards of every pair, shuffled into board positions (spec 8.1 steps 2–3). */
export function generateLayout(pairs: readonly PairDefinition[], rng: Rng): LayoutCard[] {
	const cards = pairs.flatMap((pair) => [
		{ pairId: pair.id, side: 0 as const },
		{ pairId: pair.id, side: 1 as const }
	]);
	const layout = shuffle(cards, rng).map((card, position) => ({ ...card, position }));
	validateLayout(layout, pairs.length);
	return layout;
}

/**
 * Layout invariants (spec 8.1 step 7): exactly 2 × pairCount positions
 * numbered 0..n-1, and every pair appears exactly twice (once per side).
 */
export function validateLayout(layout: readonly LayoutCard[], pairCount: number): void {
	if (layout.length !== pairCount * 2) {
		throw new Error(`Layout has ${layout.length} cards, expected ${pairCount * 2}`);
	}
	const sides = new Map<string, Set<number>>();
	layout.forEach((card, index) => {
		if (card.position !== index) throw new Error(`Layout position ${index} is out of order`);
		const seen = sides.get(card.pairId) ?? new Set<number>();
		if (seen.has(card.side)) throw new Error(`Pair ${card.pairId} side ${card.side} appears twice`);
		seen.add(card.side);
		sides.set(card.pairId, seen);
	});
	if (sides.size !== pairCount || [...sides.values()].some((s) => s.size !== 2)) {
		throw new Error('Every pair must appear exactly twice');
	}
}

/** Random, fixed turn order containing every eligible player once (spec 8.1 step 6). */
export function createTurnOrder(playerIds: readonly string[], rng: Rng): string[] {
	const unique = [...new Set(playerIds)];
	if (unique.length !== playerIds.length) throw new Error('Duplicate player in turn order');
	return shuffle(unique, rng);
}
