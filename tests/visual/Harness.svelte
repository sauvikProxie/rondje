<script lang="ts">
	import type { SessionSync } from '$lib/client/session-sync.svelte';
	import BlanksTable from '$lib/components/game/BlanksTable.svelte';
	import GameTable from '$lib/components/game/GameTable.svelte';
	import ResultsView from '$lib/components/game/ResultsView.svelte';
	import LobbyView from '$lib/components/lobby/LobbyView.svelte';
	import ConnectionPill from '$lib/components/shared/ConnectionPill.svelte';
	import Logo from '$lib/components/shared/Logo.svelte';
	import { scene } from './fixtures';

	let { scene: name, cards }: { scene: string; cards: 6 | 8 | 12 } = $props();

	// Minimal stand-in for SessionSync: static view, no network.
	// svelte-ignore state_referenced_locally
	const fake = $state({
		view: scene(name, cards),
		online: new Set(['p1', 'p2', 'p5', 'host']) as ReadonlySet<string>,
		busy: false,
		pendingFlip: null as number | null,
		pendingAnswer: null as string | null,
		connection: 'live' as const,
		flip(position: number) {
			fake.pendingFlip = position;
		},
		async answer(text: string) {
			fake.pendingAnswer = text;
			return true;
		}
	});
	const sync = fake as unknown as SessionSync;
	const view = $derived(fake.view);
</script>

<!-- Mirrors the wrapper markup of PlayerSession.svelte -->
<div class="mx-auto flex min-h-dvh max-w-6xl flex-col px-3 sm:px-6">
	<header class="flex items-center justify-between gap-3 py-3">
		<Logo size="sm" />
		<div class="flex min-w-0 items-center gap-2">
			<p class="hidden truncate text-sm font-bold text-ink-soft sm:block">{view.session.name}</p>
			<ConnectionPill state="live" />
		</div>
	</header>
	<main id="main" class="safe-bottom flex-1 pb-8">
		{#if view.session.status === 'lobby'}
			<LobbyView {view} online={fake.online} />
		{:else if view.session.status === 'in_progress' && view.session.mode === 'fill_blanks'}
			<BlanksTable {sync} />
		{:else if view.session.status === 'in_progress'}
			<GameTable {sync} />
		{:else}
			<ResultsView {view} />
		{/if}
	</main>
</div>
