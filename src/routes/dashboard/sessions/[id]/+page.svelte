<script lang="ts">
	import HostSession from '$lib/components/session/HostSession.svelte';

	let { data } = $props();
</script>

{#key data.view.session.id}
	<HostSession initialView={data.view} inviteUrl={data.inviteUrl} qrSvg={data.qrSvg} />
{/key}
