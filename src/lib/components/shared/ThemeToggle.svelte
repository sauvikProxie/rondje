<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/client/theme.svelte';

	let { class: className = '' }: { class?: string } = $props();

	onMount(() => theme.init());
</script>

<!-- The icon follows data-theme via CSS, so the server-rendered button is already right on first paint. -->
<button
	type="button"
	class="grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl border-2 border-ink/15 bg-surface text-ink transition-colors duration-150 hover:border-teal-deep hover:bg-teal-soft {className}"
	aria-label="Dark mode"
	aria-pressed={theme.current === null ? undefined : theme.current === 'dark'}
	title={theme.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={() => theme.toggle()}
>
	<!-- Moon (shown in light mode) -->
	<svg class="size-5 dark:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
	</svg>
	<!-- Sun (shown in dark mode) -->
	<svg class="hidden size-5 text-saffron dark:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
		<circle cx="12" cy="12" r="4.2" fill="currentColor" />
		<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
	</svg>
</button>
