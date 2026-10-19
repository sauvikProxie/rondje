<script lang="ts">
	import Confetti from '$lib/components/motion/Confetti.svelte';
	import CountUp from '$lib/components/motion/CountUp.svelte';
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { END_REASON_LABELS, MODE_INFO, VARIANT_INFO } from '$lib/game/constants';
	import { groupsUneven, isTie, rankGroups, rankPlayers } from '$lib/game/scoring';
	import { groupLabel } from '$lib/game/view';
	import type { SessionView } from '$lib/types/session-view';

	let { view }: { view: SessionView } = $props();

	const game = $derived(view.game);
	const session = $derived(view.session);
	const gameLabel = $derived(
		session.mode === 'matchen' && session.variant ? VARIANT_INFO[session.variant].label : MODE_INFO[session.mode].label
	);
	const winnerIds = $derived(game?.winner_ids ?? []);
	const ranked = $derived(rankPlayers(view.players, winnerIds));
	const winners = $derived(view.players.filter((p) => winnerIds.includes(p.id)));
	const iWon = $derived(!!view.me && winnerIds.includes(view.me));

	const grouped = $derived(session.group_count > 1 && view.players.some((p) => p.group !== null));
	const winningGroups = $derived(game?.winning_groups ?? []);
	const standings = $derived(grouped ? rankGroups(view.players, session.group_count, winningGroups) : []);
	const myGroup = $derived(view.players.find((p) => p.id === view.me)?.group ?? null);
	const tie = $derived(grouped ? isTie(winningGroups) : isTie(winnerIds));

	const heading = $derived.by(() => {
		if (!game) return 'Session finished';
		if (grouped) {
			if (winningGroups.length === 0) return 'Game over';
			if (tie) return "It's a tie!";
			if (myGroup !== null && winningGroups.includes(myGroup)) return 'Your group won! 🎉';
			return `${groupLabel(winningGroups[0]!)} wins!`;
		}
		if (winners.length === 0) return 'Game over';
		if (tie) return "It's a tie!";
		if (iWon) return 'You won! 🎉';
		return `${winners[0]!.nickname} wins!`;
	});

	/** Confetti when the game is decided: fuller for the winners (and the host's shared screen), lighter for everyone else. */
	const celebration = $derived.by(() => {
		if (!game || (grouped ? winningGroups.length === 0 : winners.length === 0)) return null;
		const mine = grouped ? myGroup !== null && winningGroups.includes(myGroup) : iWon;
		return mine || view.role === 'host' ? 36 : 14;
	});

	function detail(score: number): string {
		if (session.mode === 'fill_blanks') return `${score} of ${session.pair_count} correct`;
		return `${score} ${score === 1 ? 'pair' : 'pairs'} found`;
	}
</script>

<section class="mx-auto max-w-2xl" aria-labelledby="results-heading">
	<div class="card-surface overflow-hidden">
		<div class="relative overflow-hidden bg-teal-deep px-5 py-7 text-center text-white sm:px-8">
			{#if celebration}<Confetti count={celebration} distance={260} />{/if}
			<p class="relative z-10 text-sm font-bold tracking-wide text-white/85 uppercase">
				{session.name} · {game && game.number > 1 ? `Game ${game.number} · ` : ''}{gameLabel}
			</p>
			<h1 id="results-heading" class="relative z-10 mt-2 animate-pop-in text-3xl font-black [animation-delay:120ms] sm:text-4xl">{heading}</h1>
			{#if game?.end_reason}
				<p class="relative z-10 mt-2 text-white/90">{END_REASON_LABELS[game.end_reason]}</p>
			{/if}
			{#if grouped && winningGroups.length > 0}
				<p class="relative z-10 mt-4 flex flex-wrap justify-center gap-2" aria-label="Winning groups">
					{#each winningGroups as group (group)}
						<span class="pill shimmer animate-pop-in bg-saffron px-3 py-1 text-sm text-ink [animation-delay:260ms]"><span aria-hidden="true">🏆</span> {groupLabel(group)}</span>
					{/each}
				</p>
			{:else if !grouped && winners.length > 0}
				<p class="relative z-10 mt-4 flex flex-wrap justify-center gap-2" aria-label="Winners">
					{#each winners as winner (winner.id)}
						<span class="pill shimmer animate-pop-in bg-saffron px-3 py-1 text-sm text-ink [animation-delay:260ms]"><span aria-hidden="true">🏆 {winner.avatar}</span> {winner.nickname}</span>
					{/each}
				</p>
			{/if}
		</div>

		{#if game && grouped}
			<div class="border-b-2 border-ink/5 px-4 py-4 sm:px-6">
				<h2 class="text-lg font-extrabold">Group scorecards</h2>
				{#if groupsUneven(standings)}
					<p class="text-sm text-ink-soft">The groups differ in size, so they are ranked by points per player.</p>
				{/if}
				<ol class="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Group rankings">
					{#each standings as standing, i (standing.group)}
						<li
							class="animate-fade-up rounded-2xl border-2 p-3 {standing.isWinner ? 'border-saffron bg-saffron-soft' : 'border-ink/10 bg-surface'}"
							style:--i={i + 2}
							data-group={standing.group}
						>
							<div class="flex items-baseline justify-between gap-2">
								<p class="font-black">
									{#if standing.rank !== null}<span class="sr-only">Rank</span>{standing.rank}.{/if}
									{groupLabel(standing.group)}
									{#if standing.group === myGroup}<span class="text-xs font-bold text-teal-deep">(your group)</span>{/if}
								</p>
								<p><span class="text-2xl font-black"><CountUp value={standing.total} /></span> <span class="text-xs text-ink-soft">{standing.total === 1 ? 'point' : 'points'}</span></p>
							</div>
							<ul class="mt-2 space-y-1 text-sm" aria-label="Members of {groupLabel(standing.group)}">
								{#each standing.members as member (member.id)}
									<li class="flex items-center gap-2 {member.status === 'removed' ? 'opacity-60' : ''}">
										<span aria-hidden="true">{member.avatar}</span>
										<span class="min-w-0 flex-1 truncate font-bold">{member.nickname}{#if member.id === view.me}{' (you)'}{/if}</span>
										<span class="tabular-nums">{member.score}</span>
									</li>
								{/each}
							</ul>
							{#if standing.isWinner}<p class="mt-2"><span class="pill shimmer bg-saffron text-ink">🏆 Winner</span></p>{/if}
						</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if game}
			{#if grouped}<h2 class="px-4 pt-4 text-lg font-extrabold sm:px-6">All players</h2>{/if}
			<ol class="divide-y-2 divide-ink/5 px-4 py-2 sm:px-6" aria-label="Final rankings">
				{#each ranked as { player, rank, isWinner }, i (player.id)}
					<li class="flex animate-fade-up items-center gap-3 py-3" style:--i={i + 2}>
						<span class="w-8 text-center text-lg font-black {isWinner ? 'text-teal-deep' : 'text-ink-soft'}">
							{#if rank === null}<span class="sr-only">Not ranked</span><span aria-hidden="true">–</span>{:else}<span class="sr-only">Rank</span>{rank}{/if}
						</span>
						<PlayerAvatar avatar={player.avatar} size="sm" />
						<div class="min-w-0 flex-1">
							<p class="truncate font-extrabold">
								{player.nickname}
								{#if player.id === view.me}<span class="text-sm font-bold text-teal-deep">(you)</span>{/if}
							</p>
							<p class="flex flex-wrap items-center gap-1 text-sm text-ink-soft">
								{detail(player.score)}
								{#if player.group}<span class="pill bg-ink/5 text-ink">{groupLabel(player.group)}</span>{/if}
								{#if isWinner && !grouped}<span class="pill shimmer bg-saffron-soft text-ink">🏆 Winner</span>{/if}
								{#if player.status === 'removed'}<span class="pill bg-ink/10 text-ink">Removed</span>{/if}
							</p>
						</div>
						<p class="text-right">
							<span class="block text-2xl leading-none font-black"><CountUp value={player.score} /></span>
							<span class="text-xs text-ink-soft">{player.score === 1 ? 'point' : 'points'}</span>
						</p>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</section>
