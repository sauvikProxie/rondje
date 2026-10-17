<script lang="ts">
	let { size = 'md', href = '/' }: { size?: 'sm' | 'md' | 'lg'; href?: string | null } = $props();
	const dims = { sm: 'size-7', md: 'size-9', lg: 'size-14' };
	const text = { sm: 'text-xl', md: 'text-2xl', lg: 'text-5xl' };
</script>

{#snippet mark()}
	<svg class={dims[size]} viewBox="0 0 64 64" aria-hidden="true">
		<circle cx="32" cy="32" r="30" fill="#249D8F" />
		<circle cx="32" cy="32" r="17" fill="none" stroke="#FDF0D5" stroke-width="7" />
		<circle cx="47" cy="17" r="7.5" fill="#E9C46A" />
	</svg>
	<span class="{text[size]} font-black tracking-tight text-ink">Rondje</span>
{/snippet}

{#if href}
	<a {href} class="inline-flex items-center gap-2 rounded-xl" aria-label="Rondje home">{@render mark()}</a>
{:else}
	<span class="inline-flex items-center gap-2">{@render mark()}</span>
{/if}
