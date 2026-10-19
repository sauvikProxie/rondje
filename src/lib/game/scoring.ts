export interface ScoredPlayer {
	id: string;
	score: number;
	status: 'active' | 'removed';
	/** Group number (1-based) when the game uses groups. */
	group?: number | null;
}

export interface RankedPlayer<T extends ScoredPlayer> {
	player: T;
	/** Competition rank (1, 1, 3, ...) among active players; null for removed players. */
	rank: number | null;
	isWinner: boolean;
}

export interface GroupStanding<T extends ScoredPlayer> {
	group: number;
	members: T[];
	/** Points of every member, including members removed during the game. */
	total: number;
	/** Competition rank among groups that still have an active member; null otherwise. */
	rank: number | null;
	isWinner: boolean;
}

/** Active (non-removed) players with the highest score. */
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
 * win. `winnerIds` comes from the persisted game result. `scoreOf` picks
 * the points to rank by (default: the current game's score; the session
 * standings rank by the running total).
 */
export function rankPlayers<T extends ScoredPlayer>(
	players: readonly T[],
	winnerIds: readonly string[],
	scoreOf: (player: T) => number = (player) => player.score
): RankedPlayer<T>[] {
	const winners = new Set(winnerIds);
	const byScore = (a: T, b: T) => scoreOf(b) - scoreOf(a);
	const active = players.filter((p) => p.status === 'active').sort(byScore);
	const removed = players.filter((p) => p.status === 'removed').sort(byScore);

	const ranked: RankedPlayer<T>[] = [];
	active.forEach((player, index) => {
		const previous = ranked[index - 1];
		const rank = previous && scoreOf(previous.player) === scoreOf(player) ? previous.rank : index + 1;
		ranked.push({ player, rank, isWinner: winners.has(player.id) });
	});
	for (const player of removed) ranked.push({ player, rank: null, isWinner: false });
	return ranked;
}

/** More than one winner (player or group) means a tie. */
export function isTie(winners: readonly unknown[]): boolean {
	return winners.length > 1;
}

/**
 * Deal players, in the given (shuffled) order, round-robin into `groupCount`
 * groups, mirroring public.start_game(): sizes differ by at most one and the
 * order alternates between groups. Without groups every player gets null.
 */
export function assignGroups(playerIds: readonly string[], groupCount: number): Map<string, number | null> {
	return new Map(playerIds.map((id, index) => [id, groupCount > 1 ? (index % groupCount) + 1 : null]));
}

/** Whether `a` has more points per member than `b` (positive), fewer (negative) or as many (0). */
function comparePerMember(a: { total: number; size: number }, b: { total: number; size: number }): number {
	// Cross-multiply to compare total/size exactly.
	return a.total * b.size - b.total * a.size;
}

/**
 * Group scorecards (spec 23.3), best first. Groups are ranked by points per
 * member, which is the same order as their totals when the groups are equally
 * large and stays fair when they are not. A group whose members were all
 * removed keeps its points but is not ranked and cannot win.
 */
export function rankGroups<T extends ScoredPlayer>(
	players: readonly T[],
	groupCount: number,
	winningGroups: readonly number[] = []
): GroupStanding<T>[] {
	const winners = new Set(winningGroups);
	const groups = Array.from({ length: groupCount }, (_, i) => i + 1)
		.map((group) => {
			const members = players.filter((p) => p.group === group).sort((a, b) => b.score - a.score);
			return {
				group,
				members,
				total: members.reduce((sum, p) => sum + p.score, 0),
				size: members.length,
				eligible: members.some((p) => p.status === 'active')
			};
		})
		.filter((g) => g.size > 0);

	const eligible = groups.filter((g) => g.eligible).sort((a, b) => comparePerMember(b, a) || a.group - b.group);
	const ineligible = groups.filter((g) => !g.eligible);

	const standings: GroupStanding<T>[] = [];
	eligible.forEach((g, index) => {
		const previous = eligible[index - 1];
		const rank =
			previous && comparePerMember(previous, g) === 0 ? standings[index - 1]!.rank : index + 1;
		standings.push({ group: g.group, members: g.members, total: g.total, rank, isWinner: winners.has(g.group) });
	});
	for (const g of ineligible) {
		standings.push({ group: g.group, members: g.members, total: g.total, rank: null, isWinner: false });
	}
	return standings;
}

/** Whether the groups differ in size (then they are ranked by points per member). */
export function groupsUneven(standings: readonly GroupStanding<ScoredPlayer>[]): boolean {
	return new Set(standings.map((s) => s.members.length)).size > 1;
}

/** Winners of a finished game (mirrors private.decide_winners()). */
export function decideWinners(
	players: readonly ScoredPlayer[],
	groupCount: number
): { winnerIds: string[]; winningGroups: number[] } {
	if (groupCount <= 1) return { winnerIds: topScorers(players), winningGroups: [] };
	const standings = rankGroups(players, groupCount);
	const winningGroups = standings
		.filter((s) => s.rank === 1)
		.map((s) => s.group)
		.sort((a, b) => a - b);
	const winnerIds = players
		.filter((p) => p.status === 'active' && p.group != null && winningGroups.includes(p.group))
		.map((p) => p.id);
	return { winnerIds, winningGroups };
}
