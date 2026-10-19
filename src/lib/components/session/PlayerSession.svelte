<script lang="ts">
	import { onMount } from 'svelte';
	import { SessionSync } from '$lib/client/session-sync.svelte';
	import BlanksTable from '$lib/components/game/BlanksTable.svelte';
	import GameTable from '$lib/components/game/GameTable.svelte';
	import ResultsView from '$lib/components/game/ResultsView.svelte';
	import SessionStandings from '$lib/components/game/SessionStandings.svelte';
	import LobbyView from '$lib/components/lobby/LobbyView.svelte';
	import ConnectionPill from '$lib/components/shared/ConnectionPill.svelte';
	import Logo from '$lib/components/shared/Logo.svelte';
	import NoticeToast from '$lib/components/shared/NoticeToast.svelte';
	import type { SessionView } from '$lib/types/session-view';
	import RemovedNotice from './RemovedNotice.svelte';

	let { initialView }: { initialView: SessionView } = $props();

	// Keyed by session id in the page, so the initial view is only read once.
	// svelte-ignore state_referenced_locally
	const sync = new SessionSync(initialView, initialView.me ?? 'player');
	onMount(() => sync.start());

	const view = $derived(sync.view);
	const status = $derived(view.session.status);
</script>

<svelte:head>
	<title>{view.session.name} · Rondje</title>
</svelte:head>

{#if sync.fatal}
	{#if sync.fatal.code === 'session_not_found'}
		<RemovedNotice
			sessionName={view.session.name}
			title="This session was deleted"
			message="The host deleted this session, so the game is no longer available."
		/>
	{:else}
		<RemovedNotice sessionName={view.session.name} message={sync.fatal.message} />
	{/if}
{:else}
	<div class="mx-auto flex min-h-dvh max-w-6xl flex-col px-3 sm:px-6">
		<header class="flex items-center justify-between gap-3 py-3">
			<Logo size="sm" />
			<div class="flex min-w-0 items-center gap-2">
				<p class="hidden truncate text-sm font-bold text-ink-soft sm:block">{view.session.name}</p>
				<ConnectionPill state={sync.connection} />
			</div>
		</header>

		<main id="main" class="safe-bottom flex-1 pb-8">
			{#if status === 'lobby'}
				<LobbyView {view} online={sync.online} />
			{:else if status === 'in_progress' && view.game}
				<h1 class="sr-only">{view.session.name}: game in progress</h1>
				{#if view.session.mode === 'fill_blanks'}
					<BlanksTable {sync} />
				{:else}
					<GameTable {sync} />
				{/if}
			{:else}
				<div class="animate-screen-in space-y-6">
					<ResultsView {view} />
					<p class="mx-auto max-w-2xl rounded-2xl bg-teal-soft px-4 py-3 text-center font-bold text-teal-deep" role="status">
						Stay on this page: if the host starts another game, you'll join it automatically.
					</p>
					{#if view.history.length > 1}
						<div class="mx-auto max-w-2xl"><SessionStandings {view} /></div>
					{/if}
					<p class="text-center"><a href="/" class="btn-ghost">Back to the start page</a></p>
				</div>
			{/if}
		</main>
	</div>
{/if}

<NoticeToast message={sync.notice?.message ?? null} ondismiss={() => sync.dismissNotice()} />
