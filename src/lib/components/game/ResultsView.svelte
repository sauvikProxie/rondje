<script lang="ts">
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { END_REASON_LABELS, VARIANT_INFO } from '$lib/game/constants';
	import { isTie, rankPlayers } from '$lib/game/scoring';
	import { matchedPairs } from '$lib/game/view';
	import type { SessionView } from '$lib/types/session-view';

	let { view }: { view: SessionView } = $props();

	const game = $derived(view.game);
	const winnerIds = $derived(game?.winner_ids ?? []);
	const ranked = $derived(rankPlayers(view.players, winnerIds));
	const winners = $derived(view.players.filter((p) => winnerIds.includes(p.id)));
	const tie = $derived(isTie(winnerIds));
	const iWon = $derived(!!view.me && winnerIds.includes(view.me));
</script>

<section class="mx-auto max-w-2xl" aria-labelledby="results-heading">
	<div class="card-surface overflow-hidden">
		<div class="bg-teal-deep px-5 py-7 text-center text-white sm:px-8">
			<p class="text-sm font-bold tracking-wide text-white/85 uppercase">{view.session.name} · {VARIANT_INFO[view.session.variant].label}</p>
			<h1 id="results-heading" class="mt-2 text-3xl font-black sm:text-4xl">
				{#if !game}Session finished{:else if winners.length === 0}Game over{:else if tie}It's a tie!{:else if iWon}You won! 🎉{:else}{winners[0]!.nickname} wins!{/if}
			</h1>
			{#if game?.end_reason}
				<p class="mt-2 text-white/90">{END_REASON_LABELS[game.end_reason]}</p>
			{/if}
			{#if winners.length > 0}
				<p class="mt-4 flex flex-wrap justify-center gap-2" aria-label="Winners">
					{#each winners as winner (winner.id)}
						<span class="pill bg-saffron px-3 py-1 text-sm text-ink"><span aria-hidden="true">🏆 {winner.avatar}</span> {winner.nickname}</span>
					{/each}
				</p>
			{/if}
		</div>

		{#if game}
			<ol class="divide-y-2 divide-ink/5 px-4 py-2 sm:px-6" aria-label="Final rankings">
				{#each ranked as { player, rank, isWinner } (player.id)}
					<li class="flex items-center gap-3 py-3">
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
								{matchedPairs(game, player.id)} of {game.card_count / 2} pairs matched
								{#if isWinner}<span class="pill bg-saffron-soft text-ink">🏆 Winner</span>{/if}
								{#if player.status === 'removed'}<span class="pill bg-ink/10 text-ink">Removed</span>{/if}
							</p>
						</div>
						<p class="text-right">
							<span class="block text-2xl leading-none font-black tabular-nums">{player.score}</span>
							<span class="text-xs text-ink-soft">{player.score === 1 ? 'point' : 'points'}</span>
						</p>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</section>
