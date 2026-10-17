<script lang="ts">
	import type { ViewSession } from '$lib/types/session-view';

	let { status }: { status: ViewSession['status'] } = $props();

	const info = {
		lobby: { label: 'Lobby open', icon: '🟢', classes: 'bg-teal-soft text-teal-deep' },
		in_progress: { label: 'In progress', icon: '▶', classes: 'bg-saffron-soft text-ink' },
		completed: { label: 'Completed', icon: '✓', classes: 'bg-ink/10 text-ink' }
	};
</script>

<span class="pill {info[status].classes}">
	<span aria-hidden="true">{info[status].icon}</span>{info[status].label}
</span>
