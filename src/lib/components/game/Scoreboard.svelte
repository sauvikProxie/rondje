<script lang="ts">
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { matchedPairs } from '$lib/game/view';
	import type { ViewGame, ViewPlayer } from '$lib/types/session-view';

	let {
		players,
		game,
		online,
		me = null,
		viewing,
		onview
	}: {
		players: ViewPlayer[];
		game: ViewGame;
		online: ReadonlySet<string>;
		me?: string | null;
		/** Player whose board is shown. */
		viewing: string | null;
		onview: (playerId: string) => void;
	} = $props();

	const total = $derived(game.card_count / 2);
</script>

<section aria-labelledby="scoreboard-heading">
	<h2 id="scoreboard-heading" class="sr-only">Scoreboard</h2>
	<ol class="flex snap-x gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
		{#each players as player (player.id)}
			{@const matched = matchedPairs(game, player.id)}
			{@const isActive = game.active_player_id === player.id}
			{@const removed = player.status === 'removed'}
			<li class="min-w-[9.5rem] shrink-0 snap-start lg:min-w-0">
				<button
					type="button"
					class="flex w-full items-center gap-2.5 rounded-2xl border-2 p-2 text-left transition-colors
						{isActive ? 'border-saffron bg-saffron-soft' : 'border-transparent bg-surface'}
						{viewing === player.id ? 'outline-2 outline-teal-deep' : ''}
						{removed ? 'opacity-60' : 'hover:border-ink/15'}"
					aria-pressed={viewing === player.id}
					aria-label="{player.nickname}{player.id === me ? ' (you)' : ''}: {player.score} {player.score === 1
						? 'point'
						: 'points'}, {matched} of {total} pairs matched{isActive ? ', playing now' : ''}{removed
						? ', removed'
						: ''}. Show board"
					onclick={() => onview(player.id)}
				>
					<PlayerAvatar avatar={player.avatar} size="sm" active={isActive} online={removed ? undefined : online.has(player.id)} />
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-1">
							<span class="truncate text-sm font-extrabold">{player.nickname}</span>
							{#if player.id === me}<span class="text-xs font-bold text-teal-deep">(you)</span>{/if}
						</span>
						<span class="block text-xs text-ink-soft">
							{#if removed}Removed{:else if isActive}<span aria-hidden="true">▶ </span>Playing{:else}{total - matched} left{/if}
						</span>
						<span class="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
							<span class="block h-full rounded-full bg-teal transition-[width] duration-300" style="width: {(matched / total) * 100}%"></span>
						</span>
					</span>
					<span class="text-xl font-black tabular-nums" aria-hidden="true">{player.score}</span>
				</button>
			</li>
		{/each}
	</ol>
</section>
