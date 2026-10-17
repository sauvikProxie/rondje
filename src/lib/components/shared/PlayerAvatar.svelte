<script lang="ts">
	let {
		avatar,
		size = 'md',
		online,
		active = false
	}: { avatar: string; size?: 'sm' | 'md' | 'lg'; online?: boolean; active?: boolean } = $props();

	const sizes = { sm: 'size-9 text-xl', md: 'size-12 text-2xl', lg: 'size-16 text-4xl' };
</script>

<span
	class="relative inline-grid shrink-0 place-items-center rounded-full bg-cream {sizes[size]} {active
		? 'ring-4 ring-saffron'
		: 'ring-2 ring-ink/10'}"
	aria-hidden="true"
>
	{avatar}
	{#if online !== undefined}
		<span
			class="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-surface {online
				? 'bg-teal'
				: 'bg-ink/30'}"
		></span>
	{/if}
</span>
