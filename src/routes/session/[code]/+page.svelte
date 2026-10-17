<script lang="ts">
	import PlayerSession from '$lib/components/session/PlayerSession.svelte';
	import RemovedNotice from '$lib/components/session/RemovedNotice.svelte';

	let { data } = $props();
</script>

{#if data.view}
	{#key data.view.session.id}
		<PlayerSession initialView={data.view} />
	{/key}
{:else}
	<RemovedNotice sessionName={data.sessionName} />
{/if}
