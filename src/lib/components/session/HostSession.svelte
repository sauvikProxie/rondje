<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { SessionSync } from '$lib/client/session-sync.svelte';
	import BlanksTable from '$lib/components/game/BlanksTable.svelte';
	import GameTable from '$lib/components/game/GameTable.svelte';
	import ResultsView from '$lib/components/game/ResultsView.svelte';
	import SessionStandings from '$lib/components/game/SessionStandings.svelte';
	import ParticipantList from '$lib/components/lobby/ParticipantList.svelte';
	import InvitePanel from '$lib/components/session/InvitePanel.svelte';
	import NextGamePanel from '$lib/components/session/NextGamePanel.svelte';
	import Alert from '$lib/components/shared/Alert.svelte';
	import ConfirmButton from '$lib/components/shared/ConfirmButton.svelte';
	import ConnectionPill from '$lib/components/shared/ConnectionPill.svelte';
	import GameBadge from '$lib/components/shared/GameBadge.svelte';
	import NoticeToast from '$lib/components/shared/NoticeToast.svelte';
	import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
	import { MODE_INFO, VARIANT_INFO } from '$lib/game/constants';
	import { playerById } from '$lib/game/view';
	import type { SessionView, ViewPlayer } from '$lib/types/session-view';
	import { formatDateTime } from '$lib/utils/format';

	let { initialView, inviteUrl, qrSvg }: { initialView: SessionView; inviteUrl: string; qrSvg: string } = $props();

	// Keyed by session id in the page, so the initial view is only read once.
	// svelte-ignore state_referenced_locally
	const sync = new SessionSync(initialView, 'host');
	onMount(() => sync.start());

	const view = $derived(sync.view);
	const session = $derived(view.session);
	const status = $derived(session.status);
	const activePlayers = $derived(view.players.filter((p) => p.status === 'active'));
	const minPlayers = $derived(Math.max(2, session.group_count));
	const canStart = $derived(status === 'lobby' && activePlayers.length >= minPlayers);
	/** The game being set up or played (1, 2, ...). */
	const gameNumber = $derived(view.game?.number ?? view.history.length + 1);
	let removing = $state<string | null>(null);
	/** After a game: choosing the settings of the next one. */
	let settingUpNext = $state(false);
	/** In the lobby: changing the settings before the start. */
	let changingGame = $state(false);

	// The host moves a stalled game on (there is no turn timer).
	const skip = $derived.by(() => {
		const game = view.game;
		if (status !== 'in_progress' || !game || game.status !== 'active') return null;
		if (session.mode === 'matchen') {
			const active = playerById(view, game.active_player_id);
			return {
				label: 'Skip turn',
				hint: `Skip ${active?.nickname ?? 'the current player'}'s turn if they are away.`,
				disabled: game.mismatch_positions !== null
			};
		}
		return {
			label: 'Reveal answer now',
			hint: "Close this sentence if someone isn't answering. Players who haven't answered get no point.",
			disabled: game.round?.phase !== 'answering'
		};
	});

	async function deleteSession() {
		const result = await sync.act('delete');
		if (result.ok || sync.fatal) await goto('/dashboard', { invalidateAll: true });
	}

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
				{#if gameNumber > 1}<span class="pill bg-teal-soft text-teal-deep">Game {gameNumber}</span>{/if}
				<GameBadge mode={session.mode} variant={session.variant} pairCount={session.pair_count} groupCount={session.group_count} />
				{#if view.session.scheduled_at}
					<span class="pill bg-surface ring-2 ring-ink/10">📅 {formatDateTime(view.session.scheduled_at)}</span>
				{/if}
				<ConnectionPill state={sync.connection} />
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if status === 'in_progress'}
				<ConfirmButton class="btn-danger" confirmLabel="Confirm: end game now" disabled={sync.busy} onconfirm={() => sync.act('end')}>
					<span aria-hidden="true">⏹</span> End game
				</ConfirmButton>
			{/if}
			<ConfirmButton
				class="btn-ghost"
				confirmLabel="Confirm: delete session"
				ariaLabel="Delete this session"
				disabled={sync.busy}
				onconfirm={deleteSession}
			>
				<span aria-hidden="true">🗑</span> Delete session
			</ConfirmButton>
		</div>
	</header>

	{#if sync.fatal}
		<div class="mt-6"><Alert title="This session is unavailable">{sync.fatal.message}</Alert></div>
	{:else if status === 'lobby'}
		<div class="mt-6 grid animate-screen-in gap-5 lg:grid-cols-2">
			<div class="space-y-5">
				<InvitePanel joinCode={view.session.join_code} {inviteUrl} {qrSvg} accepting />
				{#if changingGame}
					<NextGamePanel
						{sync}
						title="Change the game"
						hint="Players in the lobby see the new game straight away."
						submitLabel="Save changes"
						oncancel={() => (changingGame = false)}
						ondone={() => (changingGame = false)}
					/>
				{:else}
				<section class="card-surface p-5 sm:p-6" aria-labelledby="config-heading">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h2 id="config-heading" class="text-xl font-extrabold">
							{gameNumber > 1 ? `Game ${gameNumber} configuration` : 'Game configuration'}
						</h2>
						<button type="button" class="btn-ghost min-h-11 px-4 text-sm" disabled={sync.busy} onclick={() => (changingGame = true)}>
							<span aria-hidden="true">✎</span> Change game
						</button>
					</div>
					<dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
						<div><dt class="text-ink-soft">Game</dt><dd class="font-bold">{MODE_INFO[session.mode].label}</dd></div>
						{#if session.mode === 'matchen' && session.variant}
							<div><dt class="text-ink-soft">Variant</dt><dd class="font-bold">{VARIANT_INFO[session.variant].label}</dd></div>
							<div><dt class="text-ink-soft">Pairs</dt><dd class="font-bold">{session.pair_count} ({session.pair_count * 2} cards on the board)</dd></div>
						{:else}
							<div><dt class="text-ink-soft">Sentences</dt><dd class="font-bold">{session.pair_count}</dd></div>
						{/if}
						<div><dt class="text-ink-soft">Groups</dt><dd class="font-bold">{session.group_count > 1 ? `${session.group_count} groups` : 'No groups'}</dd></div>
					</dl>
					<p class="mt-2 text-sm text-ink-soft">
						{session.mode === 'matchen' && session.variant ? VARIANT_INFO[session.variant].description : MODE_INFO[session.mode].description}
						{#if session.mode === 'fill_blanks'}Beginner and Elementary players pick from four options; Intermediate and Advanced players type the answer.{/if}
					</p>
				</section>
				{/if}
				{#if view.history.length > 0}<SessionStandings {view} />{/if}
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
					<button class="btn-primary w-full text-lg" disabled={!canStart || changingGame || sync.busy} onclick={() => sync.act('start')}>
						{sync.busy ? 'Starting…' : gameNumber > 1 ? `▶ Start game ${gameNumber}` : '▶ Start game'}
					</button>
					<p class="mt-2 text-center text-sm text-ink-soft">
						{#if activePlayers.length < minPlayers}
							At least {minPlayers} players are needed to start{session.group_count > 1 ? ` with ${session.group_count} groups` : ''} ({activePlayers.length} so far).
						{:else}
							{session.group_count > 1 ? `Players are split into ${session.group_count} groups at random. ` : ''}New players can't join after the start.
						{/if}
					</p>
				</div>
			</section>
		</div>
	{:else if status === 'in_progress' && view.game}
		{#if skip}
			<div class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-3 ring-2 ring-ink/5 sm:px-4">
				<p class="text-sm text-ink-soft">{skip.hint}</p>
				<button type="button" class="btn-ghost min-h-11 px-4 text-sm" disabled={skip.disabled || sync.busy} onclick={() => sync.act('skip')}>
					<span aria-hidden="true">⏭</span> {skip.label}
				</button>
			</div>
		{/if}
		<div class="mt-4">
			{#if session.mode === 'fill_blanks'}
				<BlanksTable {sync} />
			{:else}
				<GameTable {sync} />
			{/if}
		</div>
		<details class="card-surface mt-6 p-5 sm:p-6">
			<summary class="cursor-pointer text-lg font-extrabold">Manage participants</summary>
			<p class="mt-1 text-sm text-ink-soft">
				{session.mode === 'matchen' ? 'Removing the active player passes the turn on.' : 'Removed players no longer need to answer.'}
				Their score stays in the results{session.group_count > 1 ? ' and counts for their group' : ''}.
			</p>
			<div class="mt-2">
				<ParticipantList players={view.players} online={sync.online} onremove={remove} {removing} showRemoved />
			</div>
		</details>
	{:else if settingUpNext}
		<div class="mx-auto mt-6 max-w-3xl">
			<NextGamePanel
				{sync}
				title="Set up the next game"
				hint="Everyone goes back to the lobby and keeps their points in the session total. New players can join until you start."
				submitLabel="Back to the lobby →"
				oncancel={() => (settingUpNext = false)}
				ondone={() => (settingUpNext = false)}
			/>
		</div>
	{:else}
		<div class="mt-6 animate-screen-in space-y-6">
			<ResultsView {view} />
			<div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
				<button type="button" class="btn-primary" disabled={sync.busy} onclick={() => (settingUpNext = true)}>
					<span aria-hidden="true">▶</span> Play another game
				</button>
				<a href="/dashboard" class="btn-ghost">Back to sessions</a>
			</div>
			{#if view.history.length > 1}
				<div class="mx-auto max-w-2xl"><SessionStandings {view} /></div>
			{/if}
		</div>
	{/if}
</div>

<NoticeToast message={sync.notice?.message ?? null} ondismiss={() => sync.dismissNotice()} />
