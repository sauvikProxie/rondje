<script lang="ts">
	import { faceLabel, faceText, type BoardCell, type CellState } from '$lib/game/view';
	import type { CardFace } from '$lib/game/types';
	import type { ViewPlayer } from '$lib/types/session-view';

	let {
		cell,
		interactive,
		pending = false,
		matcher,
		onflip
	}: {
		cell: BoardCell;
		/** Whether the viewer may flip this card right now (server re-validates). */
		interactive: boolean;
		pending?: boolean;
		/** Player who found this pair (matched cells). */
		matcher?: Pick<ViewPlayer, 'avatar' | 'nickname'>;
		onflip?: (position: number) => void;
	} = $props();

	/** Half of the 360 ms flip: the moment the front turns out of view. */
	const HALF_FLIP_MS = 180;

	const faceUp = $derived(cell.state !== 'hidden');

	/*
	 * What the front face shows. When a card turns back face down it keeps its
	 * last (already revealed) face only until the front has rotated out of
	 * view, so the card doesn't go blank while it is still visibly turning.
	 */
	type Front = { face: CardFace | null; state: Exclude<CellState, 'hidden'>; mismatch: boolean };
	const frontOf = (c: BoardCell): Front | null =>
		c.state === 'hidden' ? null : { face: c.face, state: c.state, mismatch: c.mismatch };
	// svelte-ignore state_referenced_locally
	let front = $state<Front | null>(frontOf(cell));
	$effect.pre(() => {
		const next = frontOf(cell);
		if (next) {
			front = next;
			return;
		}
		const clear = setTimeout(() => (front = null), HALF_FLIP_MS);
		return () => clearTimeout(clear);
	});

	// A pair that was just found (not one that was already matched on load) celebrates briefly.
	let previousState: CellState | undefined;
	let justMatched = $state(false);
	$effect(() => {
		const state = cell.state;
		const celebrate = state === 'matched' && previousState !== undefined && previousState !== 'matched';
		previousState = state;
		if (!celebrate) return;
		justMatched = true;
		const done = setTimeout(() => (justMatched = false), 1000);
		return () => clearTimeout(done);
	});

	const text = $derived(front?.face ? faceText(front.face) : '');
	const isImage = $derived(front?.face?.kind === 'image');
	const longText = $derived(!isImage && text.length > 9);

	const label = $derived.by(() => {
		const n = `Card ${cell.position + 1}`;
		if (cell.state === 'hidden') return `${n}, face down${pending ? ', flipping' : ''}`;
		const content = cell.face ? faceLabel(cell.face) : 'unknown';
		if (cell.state === 'matched') return `${n}: ${content}, matched${matcher ? ` by ${matcher.nickname}` : ''}`;
		return `${n}: ${content}${cell.mismatch ? ', no match' : ', face up'}`;
	});
</script>

<button
	type="button"
	class="group flip-scene relative aspect-square w-full touch-manipulation rounded-2xl text-center font-extrabold select-none
		transition-transform duration-200 motion-reduce:transition-none
		{interactive ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]' : 'cursor-default'}
		{pending ? 'animate-pulse' : ''}
		{cell.mismatch ? 'animate-shake [animation-delay:340ms]' : ''}
		{justMatched ? 'animate-match-bump [animation-delay:200ms]' : ''}"
	aria-label={label}
	aria-disabled={!interactive}
	data-position={cell.position}
	data-state={cell.state}
	onclick={() => interactive && onflip?.(cell.position)}
>
	<span class="flip-inner absolute inset-0 block {faceUp ? 'flip-turned' : ''}" aria-hidden="true">
		<!-- Back -->
		<span
			class="flip-face absolute inset-0 grid place-items-center rounded-2xl bg-teal-solid text-cream-fixed shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)] transition-colors duration-200
				{interactive ? 'group-hover:bg-ink-solid' : ''}"
		>
			<svg class="size-2/5 opacity-70" viewBox="0 0 64 64">
				<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="8" />
				<circle cx="49" cy="15" r="7" fill="#E9C46A" />
			</svg>
		</span>
		<!-- Front -->
		<span
			class="flip-face flip-turned absolute inset-0 block rounded-2xl text-ink
				{front?.state === 'matched'
				? 'bg-teal-soft ring-2 ring-teal-deep/40'
				: front?.mismatch
					? 'bg-coral-soft ring-4 ring-coral'
					: 'bg-surface ring-4 ring-saffron'}"
		>
			{#if front}
				<span
					lang={isImage ? undefined : 'nl'}
					class="flex h-full w-full items-center justify-center p-1 leading-tight break-words hyphens-auto
						{isImage ? 'text-[clamp(1.6rem,8vw,2.6rem)]' : longText ? 'text-[clamp(0.62rem,2.6vw,0.85rem)]' : 'text-[clamp(0.75rem,3.4vw,1.05rem)]'}"
				>
					{text}
				</span>
				{#if front.state === 'matched'}
					{#if matcher}
						<span
							class="absolute top-0.5 right-0.5 grid size-6 place-items-center rounded-full bg-surface text-sm ring-2 ring-teal-deep
								{justMatched ? 'animate-pop-in [animation-delay:380ms]' : ''}">{matcher.avatar}</span
						>
					{:else}
						<span class="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-teal-solid text-[0.65rem] text-white">✓</span>
					{/if}
				{:else if front.mismatch}
					<span class="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-coral-solid text-[0.65rem] text-white">✕</span>
				{/if}
			{/if}
		</span>
	</span>
	{#if justMatched}
		<!-- Saffron glow around a pair that was just found. -->
		<span class="pointer-events-none absolute -inset-1 animate-match-glow rounded-[1.1rem] ring-4 ring-saffron [animation-delay:200ms]" aria-hidden="true"></span>
	{/if}
</button>
