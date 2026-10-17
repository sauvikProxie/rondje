export interface ScoredPlayer {
	id: string;
	score: number;
	status: 'active' | 'removed';
}

export interface RankedPlayer<T extends ScoredPlayer> {
	player: T;
	/** Competition rank (1, 1, 3, ...) among active players; null for removed players. */
	rank: number | null;
	isWinner: boolean;
}

/** Active (non-removed) players with the highest score (mirrors private.top_scorers()). */
export function topScorers(players: readonly ScoredPlayer[]): string[] {
	const active = players.filter((p) => p.status === 'active');
	if (active.length === 0) return [];
	const best = Math.max(...active.map((p) => p.score));
	return active.filter((p) => p.score === best).map((p) => p.id);
}

/**
 * Final rankings (spec 10.3). Active players are ranked by score with
 * standard competition ranking, so tied players share a rank. Removed
 * players keep their score but are listed last without a rank and cannot
 * win. `winnerIds` comes from the persisted game result.
 */
export function rankPlayers<T extends ScoredPlayer>(
	players: readonly T[],
	winnerIds: readonly string[]
): RankedPlayer<T>[] {
	const winners = new Set(winnerIds);
	const byScore = (a: T, b: T) => b.score - a.score;
	const active = players.filter((p) => p.status === 'active').sort(byScore);
	const removed = players.filter((p) => p.status === 'removed').sort(byScore);

	const ranked: RankedPlayer<T>[] = [];
	active.forEach((player, index) => {
		const previous = ranked[index - 1];
		const rank = previous && previous.player.score === player.score ? previous.rank : index + 1;
		ranked.push({ player, rank, isWinner: winners.has(player.id) });
	});
	for (const player of removed) ranked.push({ player, rank: null, isWinner: false });
	return ranked;
}

/** More than one winner is only possible when the host ends the game early. */
export function isTie(winnerIds: readonly string[]): boolean {
	return winnerIds.length > 1;
}
