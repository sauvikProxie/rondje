<script lang="ts">
	import { faceLabel, faceText, type BoardCell } from '$lib/game/view';

	let {
		cell,
		interactive,
		pending = false,
		onflip
	}: {
		cell: BoardCell;
		/** Whether the viewer may flip this card right now (server re-validates). */
		interactive: boolean;
		pending?: boolean;
		onflip?: (position: number) => void;
	} = $props();

	const text = $derived(cell.face ? faceText(cell.face) : '');
	const isImage = $derived(cell.face?.kind === 'image');
	const longText = $derived(!isImage && text.length > 9);

	const label = $derived.by(() => {
		const n = `Card ${cell.position + 1}`;
		if (cell.state === 'hidden') return `${n}, face down${pending ? ', flipping' : ''}`;
		const content = cell.face ? faceLabel(cell.face) : 'unknown';
		if (cell.state === 'matched') return `${n}: ${content}, matched`;
		return `${n}: ${content}${cell.mismatch ? ', no match' : ', face up'}`;
	});
</script>

<button
	type="button"
	class="group relative aspect-square w-full touch-manipulation rounded-2xl text-center font-extrabold select-none
		transition-[transform,background-color,box-shadow] duration-200 motion-reduce:transition-none
		{cell.state === 'hidden'
		? 'bg-teal-deep text-cream shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)]'
		: cell.state === 'matched'
			? 'bg-teal-soft text-ink ring-2 ring-teal-deep/40'
			: cell.mismatch
				? 'bg-coral-soft text-ink ring-4 ring-coral'
				: 'bg-surface text-ink ring-4 ring-saffron'}
		{interactive ? 'cursor-pointer hover:-translate-y-0.5 hover:bg-ink active:translate-y-0 active:scale-[0.97]' : 'cursor-default'}
		{pending ? 'animate-pulse' : ''}"
	aria-label={label}
	aria-disabled={!interactive}
	data-position={cell.position}
	data-state={cell.state}
	onclick={() => interactive && onflip?.(cell.position)}
>
	{#if cell.state === 'hidden'}
		<svg class="mx-auto size-2/5 opacity-70" viewBox="0 0 64 64" aria-hidden="true">
			<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="8" />
			<circle cx="49" cy="15" r="7" fill="#E9C46A" />
		</svg>
	{:else}
		<span
			lang={isImage ? undefined : 'nl'}
			class="flex h-full w-full items-center justify-center p-1 leading-tight break-words hyphens-auto
				{isImage ? 'text-[clamp(1.6rem,8vw,2.6rem)]' : longText ? 'text-[clamp(0.62rem,2.6vw,0.85rem)]' : 'text-[clamp(0.75rem,3.4vw,1.05rem)]'}"
			aria-hidden="true"
		>
			{text}
		</span>
		{#if cell.state === 'matched'}
			<span class="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-teal-deep text-[0.65rem] text-white" aria-hidden="true">✓</span>
		{:else if cell.mismatch}
			<span class="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-coral-deep text-[0.65rem] text-white" aria-hidden="true">✕</span>
		{/if}
	{/if}
</button>
