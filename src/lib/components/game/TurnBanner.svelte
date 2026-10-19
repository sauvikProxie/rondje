<script lang="ts">
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { groupLabel, pairsLeft } from '$lib/game/view';
	import type { ViewGame, ViewPlayer } from '$lib/types/session-view';

	let { game, active, me = null }: { game: ViewGame; active: ViewPlayer | undefined; me?: string | null } = $props();

	const myTurn = $derived(!!me && game.active_player_id === me);
	const revealing = $derived(game.mismatch_positions !== null);
	const lastMatch = $derived(
		game.last_attempt?.outcome === 'match' && game.last_attempt.player_id === game.active_player_id && game.first_flip === null
	);
	const left = $derived(pairsLeft(game));
</script>

<div
	class="flex items-center gap-3 rounded-3xl p-3 sm:p-4 {myTurn
		? 'bg-teal-deep text-white'
		: 'bg-surface text-ink ring-2 ring-ink/5'}"
>
	{#if active}<PlayerAvatar avatar={active.avatar} size="md" active />{/if}
	<div class="min-w-0 flex-1">
		<p class="truncate text-lg leading-tight font-black sm:text-xl">
			{#if myTurn}Your turn!{:else if active}{active.nickname}'s turn{:else}Waiting…{/if}
			{#if active?.group}<span class="ml-1 align-middle text-sm font-bold {myTurn ? 'text-white/85' : 'text-ink-soft'}">{groupLabel(active.group)}</span>{/if}
		</p>
		<p class="text-sm {myTurn ? 'text-white/90' : 'text-ink-soft'}">
			{#if revealing}
				<span aria-hidden="true">✕</span> No match. Cards turn back in a moment…
			{:else if lastMatch}
				<span aria-hidden="true">✓</span> Match! {myTurn ? 'Go again.' : 'They go again.'}
			{:else if game.first_flip !== null}
				{myTurn ? 'Now flip a second card.' : 'One card flipped…'}
			{:else}
				{myTurn ? 'Flip two cards.' : 'Watch closely and remember the cards.'}
			{/if}
		</p>
	</div>
	<p class="shrink-0 text-right text-sm leading-tight font-bold {myTurn ? 'text-white/90' : 'text-ink-soft'}">
		<span class="block text-2xl font-black tabular-nums {myTurn ? 'text-white' : 'text-ink'}">{left}</span>
		{left === 1 ? 'pair left' : 'pairs left'}
	</p>
</div>
