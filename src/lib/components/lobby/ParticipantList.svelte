<script lang="ts">
	import ConfirmButton from '$lib/components/shared/ConfirmButton.svelte';
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { LEVEL_LABELS } from '$lib/game/constants';
	import type { ViewPlayer } from '$lib/types/session-view';

	let {
		players,
		online,
		me = null,
		hostOnline,
		onremove,
		removing = null,
		showRemoved = false
	}: {
		players: ViewPlayer[];
		online: ReadonlySet<string>;
		me?: string | null;
		hostOnline?: boolean;
		onremove?: (player: ViewPlayer) => void | Promise<unknown>;
		removing?: string | null;
		showRemoved?: boolean;
	} = $props();

	const visible = $derived(players.filter((p) => showRemoved || p.status === 'active'));
</script>

<ul class="divide-y-2 divide-ink/5" aria-label="Participants">
	{#if hostOnline !== undefined}
		<li class="flex min-h-16 items-center gap-3 py-2.5">
			<PlayerAvatar avatar="🎙️" online={hostOnline} size="sm" />
			<div class="min-w-0 flex-1">
				<p class="font-extrabold">Host</p>
				<p class="text-sm text-ink-soft">Runs the game · {hostOnline ? 'online' : 'offline'}</p>
			</div>
			<span class="pill bg-saffron-soft text-ink">Host</span>
		</li>
	{/if}
	{#each visible as player (player.id)}
		{@const isOnline = online.has(player.id)}
		<li class="flex min-h-16 items-center gap-3 py-2.5 {player.status === 'removed' ? 'opacity-60' : ''}">
			<PlayerAvatar avatar={player.avatar} online={player.status === 'active' ? isOnline : undefined} size="sm" />
			<div class="min-w-0 flex-1">
				<p class="truncate font-extrabold">
					{player.nickname}
					{#if player.id === me}<span class="pill ml-1 bg-teal-soft align-middle text-teal-deep">You</span>{/if}
				</p>
				<p class="text-sm text-ink-soft">
					{LEVEL_LABELS[player.level]} ·
					{#if player.status === 'removed'}removed{:else}{isOnline ? 'online' : 'offline'}{/if}
				</p>
			</div>
			{#if onremove && player.status === 'active'}
				<ConfirmButton
					class="btn-ghost min-h-11 px-3 text-sm"
					confirmLabel="Confirm remove"
					ariaLabel="Remove {player.nickname}"
					disabled={removing !== null}
					onconfirm={() => onremove(player)}
				>
					{removing === player.id ? 'Removing…' : 'Remove'}
				</ConfirmButton>
			{/if}
		</li>
	{:else}
		<li class="py-6 text-center text-ink-soft">No players yet. Share the code to invite people.</li>
	{/each}
</ul>
