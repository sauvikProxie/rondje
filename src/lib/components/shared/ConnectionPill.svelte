<script lang="ts">
	import type { ConnectionState } from '$lib/client/session-sync.svelte';

	let { state: connection }: { state: ConnectionState } = $props();

	const info = {
		connecting: { label: 'Connecting…', dot: 'bg-saffron', live: false },
		live: { label: 'Live', dot: 'bg-teal', live: false },
		reconnecting: { label: 'Reconnecting…', dot: 'bg-saffron animate-pulse', live: true },
		offline: { label: 'Offline', dot: 'bg-coral', live: true }
	};
</script>

<span class="pill bg-surface text-ink ring-2 ring-ink/10" role="status" aria-live={info[connection].live ? 'polite' : 'off'}>
	<span class="size-2 rounded-full {info[connection].dot}" aria-hidden="true"></span>
	{info[connection].label}
</span>
