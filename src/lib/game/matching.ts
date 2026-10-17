import type { Variant } from './constants';
import type { CardFace, FaceKind, LayoutCard, PairDefinition, VocabularyItem } from './types';

/** Expected (faceA, faceB) and item relationship per variant (spec 7.2, 14.5). */
const VARIANT_SHAPES: Record<Variant, { faceA: FaceKind; faceB: FaceKind; sameItem: boolean }> = {
	image_pairs: { faceA: 'image', faceB: 'image', sameItem: true },
	word_image: { faceA: 'image', faceB: 'word', sameItem: true },
	de_het: { faceA: 'image', faceB: 'article_word', sameItem: true },
	opposites: { faceA: 'word', faceB: 'word', sameItem: false }
};

function faceError(item: VocabularyItem | undefined, kind: FaceKind): string | null {
	if (!item) return 'unknown vocabulary item';
	if (!item.word.trim()) return 'item has no word';
	if (kind === 'image' && !item.emoji) return 'image face requires an emoji';
	if (kind === 'article_word' && item.article !== 'de' && item.article !== 'het') {
		return 'article_word face requires the article "de" or "het"';
	}
	return null;
}

/**
 * Validates that a pair definition is a well-formed, explicit relationship for
 * its variant. Returns a reason when invalid, or null when valid.
 */
export function pairDefinitionError(
	pair: PairDefinition,
	items: ReadonlyMap<string, VocabularyItem>
): string | null {
	const shape = VARIANT_SHAPES[pair.variant];
	if (!shape) return 'unknown variant';
	if (pair.faceA !== shape.faceA || pair.faceB !== shape.faceB) {
		return `faces must be ${shape.faceA} + ${shape.faceB} for ${pair.variant}`;
	}
	if (shape.sameItem && pair.itemA !== pair.itemB) return 'both cards must show the same item';
	if (!shape.sameItem && pair.itemA === pair.itemB) return 'opposites must link two different words';
	return faceError(items.get(pair.itemA), pair.faceA) ?? faceError(items.get(pair.itemB), pair.faceB);
}

export function isValidPairDefinition(
	pair: PairDefinition,
	items: ReadonlyMap<string, VocabularyItem>
): boolean {
	return pairDefinitionError(pair, items) === null;
}

/** The face shown by one side of a pair. */
export function cardFace(
	pair: PairDefinition,
	side: 0 | 1,
	items: ReadonlyMap<string, VocabularyItem>
): CardFace {
	const itemId = side === 0 ? pair.itemA : pair.itemB;
	const kind = side === 0 ? pair.faceA : pair.faceB;
	const item = items.get(itemId);
	if (!item) throw new Error(`Unknown vocabulary item ${itemId}`);
	switch (kind) {
		case 'image':
			return { kind: 'image', emoji: item.emoji ?? '' };
		case 'word':
			return { kind: 'word', word: item.word };
		case 'article_word':
			return { kind: 'article_word', article: item.article ?? 'de', word: item.word };
	}
}

/**
 * Emoji and words used by a pair. Within one game no two pairs may share any
 * of these, so every match is unambiguous (spec 7.3).
 */
export function pairTokens(pair: PairDefinition, items: ReadonlyMap<string, VocabularyItem>): string[] {
	const tokens = new Set<string>();
	for (const id of [pair.itemA, pair.itemB]) {
		const item = items.get(id);
		if (!item) continue;
		if (item.emoji) tokens.add(`e:${item.emoji}`);
		tokens.add(`w:${item.word.toLowerCase()}`);
	}
	return [...tokens];
}

/** Two layout cards match when they are the two sides of the same pair. */
export function cardsMatch(a: LayoutCard, b: LayoutCard): boolean {
	return a.position !== b.position && a.pairId === b.pairId && a.side !== b.side;
}

/** Whether two positions of a layout hold a matching pair. */
export function positionsMatch(layout: readonly LayoutCard[], a: number, b: number): boolean {
	const cardA = layout[a];
	const cardB = layout[b];
	return cardA !== undefined && cardB !== undefined && cardsMatch(cardA, cardB);
}
