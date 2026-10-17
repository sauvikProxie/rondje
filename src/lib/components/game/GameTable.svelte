<script lang="ts">
	import type { SessionSync } from '$lib/client/session-sync.svelte';
	import { VARIANT_INFO } from '$lib/game/constants';
	import { boardCells, faceText, flipBlockReason, playerById, playersInTurnOrder } from '$lib/game/view';
	import GameBoard from './GameBoard.svelte';
	import Scoreboard from './Scoreboard.svelte';
	import TurnBanner from './TurnBanner.svelte';

	let { sync }: { sync: SessionSync } = $props();

	const view = $derived(sync.view);
	const game = $derived(view.game!);
	const me = $derived(view.me);
	const players = $derived(playersInTurnOrder(view));
	const active = $derived(playerById(view, game.active_player_id));

	/** null = follow the active player's board. */
	let pinned = $state<string | null>(null);
	const shownId = $derived(pinned ?? game.active_player_id ?? me ?? players[0]?.id ?? null);
	const shown = $derived(playerById(view, shownId));
	const followingActive = $derived(shownId === game.active_player_id);
	const cells = $derived(shownId ? boardCells(game, shownId) : []);
	const isMyBoard = $derived(!!me && shownId === me);

	// When the turn comes to me, show my board.
	$effect(() => {
		if (me && game.active_player_id === me) pinned = null;
	});

	function canFlip(position: number) {
		return isMyBoard && !sync.busy && sync.pendingFlip === null && flipBlockReason(view, position) === null;
	}

	// Screen-reader announcements for flips, outcomes and turn changes.
	const announcement = $derived.by(() => {
		const actor = active?.nickname ?? 'A player';
		const you = me && game.active_player_id === me;
		if (game.mismatch_positions) {
			const [a, b] = game.mismatch_positions;
			const fa = game.faces[String(a)];
			const fb = game.faces[String(b)];
			return `${you ? 'You' : actor} flipped ${fa ? faceText(fa) : 'a card'} and ${fb ? faceText(fb) : 'a card'}. No match.`;
		}
		if (game.first_flip !== null) {
			const f = game.faces[String(game.first_flip)];
			return `${you ? 'You' : actor} flipped ${f ? faceText(f) : 'a card'}.`;
		}
		const last = game.last_attempt;
		if (last?.outcome === 'match' && last.player_id === game.active_player_id) {
			const f = last.first_position !== null ? game.faces[String(last.first_position)] : undefined;
			return `Match${f ? `: ${faceText(f)}` : ''}! ${you ? 'You score a point. Go again.' : `${actor} scores and goes again.`}`;
		}
		return you ? 'Your turn. Flip two cards.' : `${actor}'s turn.`;
	});
</script>

<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
	<div class="min-w-0 space-y-3">
		<TurnBanner {game} {active} {me} now={sync.now} />

		<div class="lg:hidden">
			<Scoreboard {players} {game} online={sync.online} {me} viewing={shownId} onview={(id) => (pinned = id === game.active_player_id ? null : id)} />
		</div>

		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="min-w-0 truncate text-base font-extrabold sm:text-lg">
				{#if isMyBoard}Your board{:else if shown}{shown.nickname}'s board{/if}
				{#if followingActive}<span class="pill ml-1 bg-saffron-soft align-middle text-ink">Playing now</span>{/if}
			</h2>
			<div class="flex gap-2">
				{#if me && shownId !== me}
					<button type="button" class="btn-ghost min-h-11 px-3 text-sm" onclick={() => (pinned = me)}>Show my board</button>
				{/if}
				{#if !followingActive}
					<button type="button" class="btn-ghost min-h-11 px-3 text-sm" onclick={() => (pinned = null)}>Follow play</button>
				{/if}
			</div>
		</div>

		<GameBoard
			{cells}
			label="{isMyBoard ? 'Your board' : `${shown?.nickname ?? 'Player'}'s board`}, {VARIANT_INFO[view.session.variant].label}"
			{canFlip}
			pendingPosition={sync.pendingFlip}
			onflip={(position) => sync.flip(position)}
		/>
		{#if isMyBoard && me && game.active_player_id !== me}
			<p class="text-center text-sm text-ink-soft">Your matched cards stay face up here. Wait for your turn to flip.</p>
		{/if}
	</div>

	<aside class="hidden lg:block">
		<Scoreboard {players} {game} online={sync.online} {me} viewing={shownId} onview={(id) => (pinned = id === game.active_player_id ? null : id)} />
	</aside>

	<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
</div>
