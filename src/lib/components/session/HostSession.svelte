<script lang="ts">
	import { onMount } from 'svelte';
	import { SessionSync } from '$lib/client/session-sync.svelte';
	import GameTable from '$lib/components/game/GameTable.svelte';
	import ResultsView from '$lib/components/game/ResultsView.svelte';
	import ParticipantList from '$lib/components/lobby/ParticipantList.svelte';
	import InvitePanel from '$lib/components/session/InvitePanel.svelte';
	import Alert from '$lib/components/shared/Alert.svelte';
	import ConfirmButton from '$lib/components/shared/ConfirmButton.svelte';
	import ConnectionPill from '$lib/components/shared/ConnectionPill.svelte';
	import NoticeToast from '$lib/components/shared/NoticeToast.svelte';
	import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
	import VariantBadge from '$lib/components/shared/VariantBadge.svelte';
	import { VARIANT_INFO } from '$lib/game/constants';
	import type { SessionView, ViewPlayer } from '$lib/types/session-view';
	import { formatDateTime } from '$lib/utils/format';

	let { initialView, inviteUrl, qrSvg }: { initialView: SessionView; inviteUrl: string; qrSvg: string } = $props();

	// Keyed by session id in the page, so the initial view is only read once.
	// svelte-ignore state_referenced_locally
	const sync = new SessionSync(initialView, 'host');
	onMount(() => sync.start());

	const view = $derived(sync.view);
	const status = $derived(view.session.status);
	const activePlayers = $derived(view.players.filter((p) => p.status === 'active'));
	const canStart = $derived(status === 'lobby' && activePlayers.length >= 2);
	let removing = $state<string | null>(null);

	async function remove(player: ViewPlayer) {
		removing = player.id;
		await sync.act(`players/${player.id}/remove`);
		removing = null;
	}
</script>

<svelte:head>
	<title>{view.session.name} · Rondje</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
	<a href="/dashboard" class="text-sm font-bold text-teal-deep underline underline-offset-4">← All sessions</a>

	<header class="mt-3 flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-3xl font-black break-words sm:text-4xl">{view.session.name}</h1>
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<StatusBadge {status} />
				<VariantBadge variant={view.session.variant} pairCount={view.session.pair_count} />
				{#if view.session.scheduled_at}
					<span class="pill bg-surface ring-2 ring-ink/10">📅 {formatDateTime(view.session.scheduled_at)}</span>
				{/if}
				{#if status !== 'completed'}<ConnectionPill state={sync.connection} />{/if}
			</div>
		</div>
		{#if status === 'in_progress'}
			<ConfirmButton class="btn-danger" confirmLabel="Confirm: end game now" disabled={sync.busy} onconfirm={() => sync.act('end')}>
				<span aria-hidden="true">⏹</span> End game
			</ConfirmButton>
		{/if}
	</header>

	{#if sync.fatal}
		<div class="mt-6"><Alert title="This session is unavailable">{sync.fatal.message}</Alert></div>
	{:else if status === 'lobby'}
		<div class="mt-6 grid gap-5 lg:grid-cols-2">
			<div class="space-y-5">
				<InvitePanel joinCode={view.session.join_code} {inviteUrl} {qrSvg} accepting />
				<section class="card-surface p-5 sm:p-6" aria-labelledby="config-heading">
					<h2 id="config-heading" class="text-xl font-extrabold">Game configuration</h2>
					<dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
						<div><dt class="text-ink-soft">Variant</dt><dd class="font-bold">{VARIANT_INFO[view.session.variant].label}</dd></div>
						<div><dt class="text-ink-soft">Pairs</dt><dd class="font-bold">{view.session.pair_count} ({view.session.pair_count * 2} cards per board)</dd></div>
					</dl>
					<p class="mt-2 text-sm text-ink-soft">{VARIANT_INFO[view.session.variant].description}</p>
				</section>
			</div>

			<section class="card-surface flex flex-col p-5 sm:p-6" aria-labelledby="participants-heading">
				<div class="flex items-center justify-between gap-2">
					<h2 id="participants-heading" class="text-xl font-extrabold">Participants</h2>
					<span class="pill bg-teal-soft text-teal-deep">{activePlayers.length} joined</span>
				</div>
				<div class="mt-2 flex-1">
					<ParticipantList players={view.players} online={sync.online} onremove={remove} {removing} />
				</div>
				<div class="mt-5 border-t-2 border-ink/5 pt-5">
					<button class="btn-primary w-full text-lg" disabled={!canStart || sync.busy} onclick={() => sync.act('start')}>
						{sync.busy ? 'Starting…' : '▶ Start game'}
					</button>
					<p class="mt-2 text-center text-sm text-ink-soft">
						{#if activePlayers.length < 2}
							At least 2 players are needed to start ({activePlayers.length} so far).
						{:else}
							Everyone gets an identical board. New players can't join after the start.
						{/if}
					</p>
				</div>
			</section>
		</div>
	{:else if status === 'in_progress' && view.game}
		<div class="mt-6">
			<GameTable {sync} />
		</div>
		<details class="card-surface mt-6 p-5 sm:p-6">
			<summary class="cursor-pointer text-lg font-extrabold">Manage participants</summary>
			<p class="mt-1 text-sm text-ink-soft">
				Removing the active player passes the turn on. Their score stays in the results.
			</p>
			<div class="mt-2">
				<ParticipantList players={view.players} online={sync.online} onremove={remove} {removing} showRemoved />
			</div>
		</details>
	{:else}
		<div class="mt-6">
			<ResultsView {view} />
			<p class="mt-6 text-center"><a href="/dashboard" class="btn-ghost">Back to sessions</a></p>
		</div>
	{/if}
</div>

<NoticeToast message={sync.notice?.message ?? null} ondismiss={() => sync.dismissNotice()} />
