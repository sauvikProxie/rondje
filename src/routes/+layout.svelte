<script lang="ts">
	import { onMount } from 'svelte';
	import { markAppReady } from '$lib/client/motion';
	import '../app.css';

	let { children } = $props();

	// Children mount first, so screens shown on page load don't replay celebrations.
	onMount(markAppReady);
</script>

<a
	href="#main"
	class="sr-only z-50 rounded-xl bg-ink-solid px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
>
	Skip to content
</a>

{@render children()}
