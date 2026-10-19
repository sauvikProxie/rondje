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
	// One shared board: matched pairs stay face up for everyone.
	const cells = $derived(boardCells(game));
	const myTurn = $derived(!!me && game.active_player_id === me);

	function canFlip(position: number) {
		return myTurn && !sync.busy && sync.pendingFlip === null && flipBlockReason(view, position) === null;
	}

	// Screen-reader announcements for flips, outcomes and turn changes.
	const announcement = $derived.by(() => {
		const actor = active?.nickname ?? 'A player';
		if (game.mismatch_positions) {
			const [a, b] = game.mismatch_positions;
			const fa = game.faces[String(a)];
			const fb = game.faces[String(b)];
			return `${myTurn ? 'You' : actor} flipped ${fa ? faceText(fa) : 'a card'} and ${fb ? faceText(fb) : 'a card'}. No match.`;
		}
		if (game.first_flip !== null) {
			const f = game.faces[String(game.first_flip)];
			return `${myTurn ? 'You' : actor} flipped ${f ? faceText(f) : 'a card'}.`;
		}
		const last = game.last_attempt;
		if (last?.outcome === 'match' && last.player_id === game.active_player_id) {
			const f = last.first_position !== null ? game.faces[String(last.first_position)] : undefined;
			return `Match${f ? `: ${faceText(f)}` : ''}! ${myTurn ? 'You score a point. Go again.' : `${actor} scores and goes again.`}`;
		}
		return myTurn ? 'Your turn. Flip two cards.' : `${actor}'s turn.`;
	});
</script>

<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
	<div class="min-w-0 space-y-3">
		<TurnBanner {game} {active} {me} />

		<div class="lg:hidden">
			<Scoreboard {view} {players} online={sync.online} compact />
		</div>

		<GameBoard
			{cells}
			{players}
			label="Game board, {view.session.variant ? VARIANT_INFO[view.session.variant].label : 'Matchen'}"
			{canFlip}
			pendingPosition={sync.pendingFlip}
			onflip={(position) => sync.flip(position)}
		/>
		{#if me && !myTurn}
			<p class="text-center text-sm text-ink-soft">Found pairs stay face up for everyone. Wait for your turn to flip.</p>
		{/if}
	</div>

	<aside class="hidden lg:block">
		<Scoreboard {view} {players} online={sync.online} />
	</aside>

	<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
</div>
