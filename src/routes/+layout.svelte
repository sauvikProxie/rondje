<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<a
	href="#main"
	class="sr-only z-50 rounded-xl bg-ink px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
>
	Skip to content
</a>

{@render children()}
