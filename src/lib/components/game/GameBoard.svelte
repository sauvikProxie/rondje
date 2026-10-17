<script lang="ts">
	import type { BoardCell } from '$lib/game/view';
	import GameCard from './GameCard.svelte';

	let {
		cells,
		label,
		canFlip,
		pendingPosition = null,
		onflip
	}: {
		cells: BoardCell[];
		label: string;
		canFlip: (position: number) => boolean;
		pendingPosition?: number | null;
		onflip?: (position: number) => void;
	} = $props();

	// 12 cards: 4×3, 16 cards: 4×4, 24 cards: 4×6 on phones, 6×4 from tablet up.
	// Width is capped so the whole board fits a desktop viewport.
	const columns = $derived(
		cells.length > 16 ? 'grid-cols-4 sm:grid-cols-6 sm:max-w-[44rem]' : 'grid-cols-4 sm:max-w-[34rem]'
	);
</script>

<div class="mx-auto grid w-full gap-2 sm:gap-3 {columns}" role="group" aria-label={label}>
	{#each cells as cell (cell.position)}
		<GameCard {cell} interactive={canFlip(cell.position)} pending={pendingPosition === cell.position} {onflip} />
	{/each}
</div>
