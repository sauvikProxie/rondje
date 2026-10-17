<script lang="ts">
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { TURN_TIME_LIMIT_MS } from '$lib/game/constants';
	import type { ViewGame, ViewPlayer } from '$lib/types/session-view';

	let {
		game,
		active,
		me = null,
		now
	}: { game: ViewGame; active: ViewPlayer | undefined; me?: string | null; now: number } = $props();

	const myTurn = $derived(!!me && game.active_player_id === me);
	const revealing = $derived(game.mismatch_positions !== null);
	const remainingMs = $derived(game.turn_until ? Math.max(0, Date.parse(game.turn_until) - now) : 0);
	const seconds = $derived(Math.ceil(remainingMs / 1000));
	const lastMatch = $derived(
		game.last_attempt?.outcome === 'match' && game.last_attempt.player_id === game.active_player_id && game.first_flip === null
	);
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
		</p>
		<p class="text-sm {myTurn ? 'text-white/90' : 'text-ink-soft'}">
			{#if revealing}
				<span aria-hidden="true">✕</span> No match. Cards turn back in a moment…
			{:else if lastMatch}
				<span aria-hidden="true">✓</span> Match! {myTurn ? 'Go again.' : 'They go again.'}
			{:else if game.first_flip !== null}
				{myTurn ? 'Now flip a second card.' : 'One card flipped…'}
			{:else}
				{myTurn ? 'Flip two cards on your board.' : 'Watch closely: their board is the same as yours.'}
			{/if}
		</p>
	</div>
	{#if game.turn_until && !revealing}
		<div class="shrink-0 text-right" aria-label="{seconds} seconds left in this turn">
			<p class="text-2xl font-black tabular-nums {seconds <= 10 ? (myTurn ? 'text-saffron' : 'text-coral-deep') : ''}" aria-hidden="true">
				{seconds}s
			</p>
			<div class="mt-1 h-1.5 w-14 overflow-hidden rounded-full {myTurn ? 'bg-white/25' : 'bg-ink/10'}" aria-hidden="true">
				<div class="h-full rounded-full {myTurn ? 'bg-saffron' : 'bg-teal'}" style="width: {Math.min(100, (remainingMs / TURN_TIME_LIMIT_MS) * 100)}%"></div>
			</div>
		</div>
	{/if}
</div>
