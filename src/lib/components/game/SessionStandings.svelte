<script lang="ts">
	import { flip } from 'svelte/animate';
	import { prefersReducedMotion } from '$lib/client/motion';
	import CountUp from '$lib/components/motion/CountUp.svelte';
	import GameBadge from '$lib/components/shared/GameBadge.svelte';
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { rankPlayers } from '$lib/game/scoring';
	import { groupLabel } from '$lib/game/view';
	import type { SessionView, ViewHistoryGame } from '$lib/types/session-view';

	/** Running totals over every game of the session, and the games played so far. */
	let { view }: { view: SessionView } = $props();

	const ranked = $derived(rankPlayers(view.players, [], (p) => p.total_score));
	const gamesPlayed = $derived(view.history.length);
	// Right after a game the total already includes it; show what it added.
	const showGamePoints = $derived(view.session.status === 'completed');

	/** Rows glide to their new place if the order changes. */
	const reorder = { duration: prefersReducedMotion() ? 0 : 350 };

	function winnersText(game: ViewHistoryGame): string {
		if (game.winning_groups.length > 0) return game.winning_groups.map(groupLabel).join(' & ');
		const names = game.winner_ids.map((id) => view.players.find((p) => p.id === id)?.nickname).filter(Boolean);
		return names.length > 0 ? names.join(' & ') : 'No winner';
	}
</script>

<section class="card-surface overflow-hidden" aria-labelledby="standings-heading">
	<div class="px-4 pt-4 sm:px-6">
		<h2 id="standings-heading" class="text-lg font-extrabold">Session standings</h2>
		<p class="text-sm text-ink-soft">Total points after {gamesPlayed} {gamesPlayed === 1 ? 'game' : 'games'}.</p>
	</div>
	<ol class="divide-y-2 divide-ink/5 px-4 py-2 sm:px-6" aria-label="Session standings">
		{#each ranked as { player, rank }, i (player.id)}
			<li class="flex animate-fade-up items-center gap-3 py-2.5" style:--i={i + 1} data-player={player.id} animate:flip={reorder}>
				<span class="w-8 text-center text-lg font-black {rank === 1 ? 'text-teal-deep' : 'text-ink-soft'}">
					{#if rank === null}<span class="sr-only">Not ranked</span><span aria-hidden="true">–</span>{:else}<span class="sr-only">Rank</span>{rank}{/if}
				</span>
				<PlayerAvatar avatar={player.avatar} size="sm" />
				<div class="min-w-0 flex-1">
					<p class="truncate font-extrabold">
						{player.nickname}
						{#if player.id === view.me}<span class="text-sm font-bold text-teal-deep">(you)</span>{/if}
					</p>
					<p class="flex flex-wrap items-center gap-1 text-sm text-ink-soft">
						{#if showGamePoints && player.score > 0}<span>+<CountUp value={player.score} /> this game</span>{/if}
						{#if rank === 1 && player.total_score > 0}<span class="pill shimmer bg-saffron-soft text-ink">🏆 Leading</span>{/if}
						{#if player.status === 'removed'}<span class="pill bg-ink/10 text-ink">Removed</span>{/if}
					</p>
				</div>
				<p class="text-right">
					<span class="block text-2xl leading-none font-black"><CountUp value={player.total_score} duration={900} /></span>
					<span class="text-xs text-ink-soft">total</span>
				</p>
			</li>
		{/each}
	</ol>
	{#if gamesPlayed > 0}
		<div class="border-t-2 border-ink/5 px-4 py-4 sm:px-6">
			<h3 class="font-extrabold">Games played</h3>
			<ol class="mt-2 space-y-2 text-sm" aria-label="Games played">
				{#each view.history as game, i (game.number)}
					<li class="flex animate-fade-up flex-wrap items-center gap-2" style:--i={i}>
						<span class="font-black">Game {game.number}</span>
						<GameBadge mode={game.mode} variant={game.variant} pairCount={game.pair_count} groupCount={game.group_count} />
						<span class="text-ink-soft"><span aria-hidden="true">🏆</span><span class="sr-only">Won by</span> {winnersText(game)}</span>
					</li>
				{/each}
			</ol>
		</div>
	{/if}
</section>
