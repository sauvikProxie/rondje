<script lang="ts">
	import SessionStandings from '$lib/components/game/SessionStandings.svelte';
	import GameBadge from '$lib/components/shared/GameBadge.svelte';
	import { answerModeFor } from '$lib/game/blanks';
	import { MODE_INFO, VARIANT_INFO } from '$lib/game/constants';
	import type { SessionView } from '$lib/types/session-view';
	import ParticipantList from './ParticipantList.svelte';

	let { view, online }: { view: SessionView; online: ReadonlySet<string> } = $props();

	const session = $derived(view.session);
	const activePlayers = $derived(view.players.filter((p) => p.status === 'active'));
	const me = $derived(view.players.find((p) => p.id === view.me));
	const info = $derived(session.mode === 'matchen' && session.variant ? VARIANT_INFO[session.variant] : MODE_INFO[session.mode]);
	const gamesPlayed = $derived(view.history.length);
</script>

<div class="mx-auto max-w-xl animate-screen-in space-y-4">
	<section class="card-surface p-5 text-center sm:p-7" aria-labelledby="lobby-heading">
		{#if me}<p class="text-5xl" aria-hidden="true"><span class="inline-block animate-float">{me.avatar}</span></p>{/if}
		<h1 id="lobby-heading" class="mt-2 text-3xl font-black break-words">{session.name}</h1>
		<div class="mt-3 flex flex-wrap justify-center gap-2">
			<GameBadge mode={session.mode} variant={session.variant} pairCount={session.pair_count} groupCount={session.group_count} />
			<span class="pill bg-teal-soft text-teal-deep">{activePlayers.length} {activePlayers.length === 1 ? 'player' : 'players'}</span>
		</div>
		<p class="mt-3 text-ink-soft">{info.description} Example: <span lang="nl">{info.example}</span></p>
		{#if session.group_count > 1}
			<p class="mt-2 text-ink-soft">
				Players are split into {session.group_count} groups when the game starts. Every point you score counts for your group.
			</p>
		{/if}
		{#if session.mode === 'fill_blanks' && me}
			<p class="mt-2 font-bold text-teal-deep">
				{answerModeFor(me.level) === 'choice'
					? 'At your level you pick each answer from four options.'
					: 'At your level you type each answer yourself.'}
			</p>
		{/if}
		<div class="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-saffron-soft px-4 py-3 font-bold" role="status">
			<span class="flex gap-1" aria-hidden="true">
				<span class="size-2 animate-bounce rounded-full bg-teal-deep [animation-delay:-0.3s]"></span>
				<span class="size-2 animate-bounce rounded-full bg-teal-deep [animation-delay:-0.15s]"></span>
				<span class="size-2 animate-bounce rounded-full bg-teal-deep"></span>
			</span>
			{gamesPlayed > 0 ? `Waiting for the host to start game ${gamesPlayed + 1}…` : 'Waiting for the host to start the game…'}
		</div>
	</section>

	<section class="card-surface p-5 sm:p-6" aria-labelledby="players-heading">
		<h2 id="players-heading" class="text-lg font-extrabold">In the lobby</h2>
		<ParticipantList players={view.players} {online} me={view.me} hostOnline={online.has('host')} />
	</section>

	{#if gamesPlayed > 0}<SessionStandings {view} />{/if}

	<p class="text-center text-sm text-ink-soft">
		{#if session.mode === 'matchen'}
			Tip: everyone plays on the same board, and found pairs stay face up. Watch the other players' flips to learn where the cards are!
		{:else}
			Tip: everyone answers the same sentence at the same time. The answer is shown once everyone has answered.
		{/if}
	</p>
</div>
