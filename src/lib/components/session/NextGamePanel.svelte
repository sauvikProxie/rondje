<script lang="ts">
	import type { SessionSync } from '$lib/client/session-sync.svelte';
	import type { GameMode, Variant } from '$lib/game/constants';
	import GameOptionsFields from './GameOptionsFields.svelte';

	/**
	 * Host: choose the settings of the session's next game. After a finished
	 * game this sends everyone back to the lobby; in the lobby it changes the
	 * settings of the game about to start.
	 */
	let {
		sync,
		title,
		hint,
		submitLabel,
		oncancel,
		ondone
	}: {
		sync: SessionSync;
		title: string;
		hint: string;
		submitLabel: string;
		oncancel: () => void;
		ondone: () => void;
	} = $props();

	// Starts from the current settings; the form owns its state afterwards.
	// svelte-ignore state_referenced_locally
	const current = sync.view.session;
	let mode = $state<GameMode>(current.mode);
	let variant = $state<Variant>(current.variant ?? 'word_image');
	let pairCount = $state<number>(current.pair_count);
	let groupCount = $state<number>(current.group_count);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const result = await sync.act('configure', {
			mode,
			variant: mode === 'matchen' ? variant : undefined,
			pairCount,
			groupCount
		});
		if (result.ok) ondone();
	}
</script>

<form class="card-surface animate-screen-in space-y-7 p-5 sm:p-7" onsubmit={submit} aria-labelledby="next-game-heading">
	<div>
		<h2 id="next-game-heading" class="text-xl font-extrabold">{title}</h2>
		<p class="mt-1 text-sm text-ink-soft">{hint}</p>
	</div>
	<GameOptionsFields bind:mode bind:variant bind:pairCount bind:groupCount />
	<div class="flex flex-col-reverse gap-3 sm:flex-row">
		<button type="button" class="btn-ghost" onclick={oncancel}>Cancel</button>
		<button class="btn-primary sm:flex-1" disabled={sync.busy}>{sync.busy ? 'Saving…' : submitLabel}</button>
	</div>
</form>
