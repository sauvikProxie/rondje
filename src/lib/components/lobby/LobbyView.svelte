<script lang="ts">
	import VariantBadge from '$lib/components/shared/VariantBadge.svelte';
	import { VARIANT_INFO } from '$lib/game/constants';
	import type { SessionView } from '$lib/types/session-view';
	import ParticipantList from './ParticipantList.svelte';

	let { view, online }: { view: SessionView; online: ReadonlySet<string> } = $props();

	const activePlayers = $derived(view.players.filter((p) => p.status === 'active'));
	const me = $derived(view.players.find((p) => p.id === view.me));
</script>

<div class="mx-auto max-w-xl space-y-4">
	<section class="card-surface p-5 text-center sm:p-7" aria-labelledby="lobby-heading">
		{#if me}<p class="text-5xl" aria-hidden="true">{me.avatar}</p>{/if}
		<h1 id="lobby-heading" class="mt-2 text-3xl font-black break-words">{view.session.name}</h1>
		<div class="mt-3 flex flex-wrap justify-center gap-2">
			<VariantBadge variant={view.session.variant} pairCount={view.session.pair_count} />
			<span class="pill bg-teal-soft text-teal-deep">{activePlayers.length} {activePlayers.length === 1 ? 'player' : 'players'}</span>
		</div>
		<p class="mt-3 text-ink-soft">{VARIANT_INFO[view.session.variant].description} Example: {VARIANT_INFO[view.session.variant].example}</p>
		<div class="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-saffron-soft px-4 py-3 font-bold" role="status">
			<span class="flex gap-1" aria-hidden="true">
				<span class="size-2 animate-bounce rounded-full bg-teal-deep [animation-delay:-0.3s]"></span>
				<span class="size-2 animate-bounce rounded-full bg-teal-deep [animation-delay:-0.15s]"></span>
				<span class="size-2 animate-bounce rounded-full bg-teal-deep"></span>
			</span>
			Waiting for the host to start the game…
		</div>
	</section>

	<section class="card-surface p-5 sm:p-6" aria-labelledby="players-heading">
		<h2 id="players-heading" class="text-lg font-extrabold">In the lobby</h2>
		<ParticipantList players={view.players} {online} me={view.me} hostOnline={online.has('host')} />
	</section>

	<p class="text-center text-sm text-ink-soft">
		Tip: everyone gets the same board. Watch the other players' flips to learn where the cards are!
	</p>
</div>
