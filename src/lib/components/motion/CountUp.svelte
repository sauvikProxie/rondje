<script lang="ts">
	import { onMount } from 'svelte';
	import { shouldCelebrate } from '$lib/client/motion';

	/**
	 * A number that counts up to `value` when it appears live (e.g. results
	 * after a game ends); otherwise it simply shows `value`. Its width is
	 * reserved for the final value (tabular digits are exactly 1ch wide), so
	 * counting never shifts the layout.
	 */
	let { value, duration = 700 }: { value: number; duration?: number } = $props();

	/** Value shown while counting; null once settled. */
	let counting = $state<number | null>(null);

	onMount(() => {
		if (!shouldCelebrate() || value <= 0) return;
		const start = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			counting = t < 1 ? Math.round(value * (1 - Math.pow(1 - t, 3))) : null;
			if (t < 1) frame = requestAnimationFrame(tick);
		};
		counting = 0;
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});
</script>

<span class="inline-block text-right tabular-nums" style:min-width="{String(value).length}ch">{counting ?? value}</span>
