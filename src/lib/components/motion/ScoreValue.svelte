<script lang="ts">
	/**
	 * A live score: when it goes up, the number pops and a "+1" floats up
	 * from it. The float is absolutely positioned, so nothing moves around it.
	 * Decorative only (aria-hidden); callers keep their own accessible text.
	 */
	let { value, class: className = '' }: { value: number; class?: string } = $props();

	let previous: number | undefined;
	let gain = $state<{ amount: number; id: number } | null>(null);
	let nextId = 0;

	$effect(() => {
		const current = value;
		if (previous !== undefined && current > previous) gain = { amount: current - previous, id: ++nextId };
		previous = current;
	});
</script>

<span class="relative inline-block tabular-nums {className}" aria-hidden="true">
	{#key value}<span class="inline-block {gain ? 'animate-score-pop' : ''}">{value}</span>{/key}
	{#if gain}
		{#key gain.id}
			<span
				class="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 animate-float-up text-sm font-black whitespace-nowrap text-teal-deep"
				onanimationend={() => (gain = null)}>+{gain.amount}</span
			>
		{/key}
	{/if}
</span>
