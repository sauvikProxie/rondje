import type { SessionView, ViewGame, ViewPlayer } from '$lib/types/session-view';
import { checkFlip, type FlipRuleError } from './turn-management';
import type { CardFace } from './types';

/**
 * Helpers that interpret a SessionView for display. They never decide the
 * outcome of an action; the server does.
 */

export type CellState = 'hidden' | 'flipped' | 'matched';

export interface BoardCell {
	position: number;
	state: CellState;
	/** Only present for flipped or matched cells. */
	face: CardFace | null;
	/** True for the two cards of a pending mismatch reveal. */
	mismatch: boolean;
	/** Player who found the pair, for matched cells. */
	matchedBy: string | null;
}

/** Positions currently face up in the active attempt (first flip or mismatch reveal). */
export function flippedPositions(game: ViewGame): number[] {
	if (game.mismatch_positions) return [...game.mismatch_positions];
	return game.first_flip === null ? [] : [game.first_flip];
}

/** The cells of the shared Matchen board as the caller is allowed to see them (spec 8.2). */
export function boardCells(game: ViewGame): BoardCell[] {
	const flipped = new Set(flippedPositions(game));
	const mismatch = new Set(game.mismatch_positions ?? []);

	return Array.from({ length: game.card_count }, (_, position) => {
		const key = String(position);
		const matched = Object.hasOwn(game.matched, key);
		const state: CellState = matched ? 'matched' : flipped.has(position) ? 'flipped' : 'hidden';
		return {
			position,
			state,
			face: state === 'hidden' ? null : (game.faces[key] ?? null),
			mismatch: mismatch.has(position),
			matchedBy: matched ? (game.matched[key] ?? null) : null
		};
	});
}

/** Why the caller cannot flip `position` right now, or null if they can. */
export function flipBlockReason(view: SessionView, position: number): FlipRuleError | 'not_a_player' | null {
	const game = view.game;
	if (!view.me || !game) return 'not_a_player';
	return checkFlip(
		{
			gameActive: game.status === 'active',
			activePlayerId: game.active_player_id,
			revealPending: game.mismatch_positions !== null,
			firstFlip: game.first_flip,
			cardCount: game.card_count,
			matched: new Set(Object.keys(game.matched).map(Number))
		},
		view.me,
		position
	);
}

function capitalise(text: string): string {
	return text.charAt(0).toLocaleUpperCase('nl') + text.slice(1);
}

/** Display text of a face: "🍎", "Fiets", "Het huis". */
export function faceText(face: CardFace): string {
	switch (face.kind) {
		case 'image':
			return face.emoji;
		case 'word':
			return capitalise(face.word);
		case 'article_word':
			return `${capitalise(face.article)} ${face.word}`;
	}
}

/** Accessible description of a face. */
export function faceLabel(face: CardFace): string {
	return face.kind === 'image' ? `picture ${face.emoji}` : faceText(face);
}

/** Pairs left on the shared board. */
export function pairsLeft(game: ViewGame): number {
	return Math.max(0, (game.card_count - Object.keys(game.matched).length) / 2);
}

export function playerById(view: SessionView, id: string | null | undefined): ViewPlayer | undefined {
	return id ? view.players.find((p) => p.id === id) : undefined;
}

/** Players in turn order for the scoreboard (lobby: join order). */
export function playersInTurnOrder(view: SessionView): ViewPlayer[] {
	const order = view.game?.turn_order;
	if (!order) return view.players.filter((p) => p.status === 'active');
	return order
		.map((id) => view.players.find((p) => p.id === id))
		.filter((p): p is ViewPlayer => p !== undefined);
}

/** "Group 2". */
export function groupLabel(group: number): string {
	return `Group ${group}`;
}

/** Score unit for the session's game: "pair(s)" or "correct". */
export function scoreUnit(view: Pick<SessionView, 'session'>, score: number): string {
	if (view.session.mode === 'fill_blanks') return 'correct';
	return score === 1 ? 'pair' : 'pairs';
}
