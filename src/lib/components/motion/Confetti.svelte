<script lang="ts">
	import { onMount } from 'svelte';
	import { shouldCelebrate } from '$lib/client/motion';

	/**
	 * A short, decorative confetti effect in the Rondje palette. Fills its
	 * nearest positioned ancestor (which should clip with overflow-hidden),
	 * never takes pointer events and removes itself when done. Plays only
	 * when it appears live (see shouldCelebrate) and never with reduced motion.
	 *
	 *   rain : pieces fall from the top edge (results banner).
	 *   burst: pieces fly outwards from the centre (a small "well done").
	 */
	let { mode = 'rain', count = 28, distance = 220 }: { mode?: 'rain' | 'burst'; count?: number; distance?: number } = $props();

	const COLORS = ['#E9C46A', '#FDF0D5', '#E76F51', '#249D8F', '#F8ECC9'];

	/** Deterministic pseudo-random number in [0, 1) for piece i (no Math.random, so renders agree). */
	const rand = (i: number, salt: number) => {
		const x = Math.sin((i + 1) * salt) * 43758.5453;
		return x - Math.floor(x);
	};

	// svelte-ignore state_referenced_locally
	const pieces = Array.from({ length: count }, (_, i) => {
		const size = 5 + rand(i, 5.1) * 4;
		const round = i % 3 === 0;
		const common = {
			width: size,
			height: round ? size : size * 1.6,
			round,
			color: COLORS[i % COLORS.length],
			rot: (rand(i, 39.42) - 0.5) * 720,
			delay: rand(i, 7.13) * (mode === 'rain' ? 350 : 120),
			duration: mode === 'rain' ? 1400 + rand(i, 3.7) * 900 : 700 + rand(i, 3.7) * 400
		};
		if (mode === 'rain') {
			return { ...common, left: 3 + rand(i, 12.9898) * 94, top: -4, dx: (rand(i, 78.233) - 0.5) * 90, dy: distance * (0.75 + rand(i, 2.2) * 0.35) };
		}
		const angle = (i / count) * Math.PI * 2 + rand(i, 1.7) * 0.6;
		const reach = distance * (0.55 + rand(i, 2.2) * 0.45);
		return { ...common, left: 50, top: 50, dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach };
	});

	let active = $state(false);

	onMount(() => {
		if (!shouldCelebrate()) return;
		active = true;
		const done = setTimeout(() => (active = false), 2600);
		return () => clearTimeout(done);
	});
</script>

{#if active}
	<span class="pointer-events-none absolute inset-0 z-0 overflow-hidden motion-reduce:hidden" aria-hidden="true">
		{#each pieces as p, i (i)}
			<span
				class="absolute block animate-confetti {p.round ? 'rounded-full' : 'rounded-[2px]'}"
				style:left="{p.left}%"
				style:top={p.top < 0 ? `${p.top}px` : `${p.top}%`}
				style:width="{p.width}px"
				style:height="{p.height}px"
				style:background-color={p.color}
				style:--confetti-dx="{p.dx}px"
				style:--confetti-dy="{p.dy}px"
				style:--confetti-rot="{p.rot}deg"
				style:--confetti-delay="{p.delay}ms"
				style:--confetti-duration="{p.duration}ms"
			></span>
		{/each}
	</span>
{/if}
