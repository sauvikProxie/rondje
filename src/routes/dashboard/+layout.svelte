<script lang="ts">
	import HostNav from '$lib/components/layout/HostNav.svelte';

	let { data, children } = $props();
</script>

<div class="lg:flex">
	<HostNav email={data.hostEmail} />
	<main id="main" class="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
		{@render children()}
	</main>
</div>
