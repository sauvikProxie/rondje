<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone = 'error',
		title,
		children
	}: { tone?: 'error' | 'info' | 'success' | 'warning'; title?: string; children?: Snippet } = $props();

	const styles = {
		error: 'border-coral-deep/30 bg-coral-soft text-ink',
		info: 'border-teal-deep/25 bg-teal-soft text-ink',
		success: 'border-teal-deep/25 bg-teal-soft text-ink',
		warning: 'border-saffron bg-saffron-soft text-ink'
	};
	const icons = { error: '⚠️', info: 'ℹ️', success: '✅', warning: '⏳' };
</script>

<div
	class="flex gap-3 rounded-2xl border-2 px-4 py-3 {styles[tone]}"
	role={tone === 'error' ? 'alert' : 'status'}
>
	<span aria-hidden="true" class="text-lg leading-6">{icons[tone]}</span>
	<div class="min-w-0 text-sm leading-6">
		{#if title}<p class="font-extrabold">{title}</p>{/if}
		{@render children?.()}
	</div>
</div>
