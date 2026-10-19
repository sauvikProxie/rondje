<script lang="ts">
	import PlayerAvatar from '$lib/components/shared/PlayerAvatar.svelte';
	import { groupLabel } from '$lib/game/view';
	import type { SessionView, ViewPlayer } from '$lib/types/session-view';

	let {
		view,
		players,
		online,
		compact = false
	}: {
		view: SessionView;
		/** Players in display order (turn order). */
		players: ViewPlayer[];
		online: ReadonlySet<string>;
		/** Small screens above the board: groups shown as one short card each. */
		compact?: boolean;
	} = $props();

	const game = $derived(view.game!);
	const round = $derived(game.round);
	const me = $derived(view.me);
	const grouped = $derived(view.session.group_count > 1 && players.some((p) => p.group !== null));

	/** One scorecard per group, in group order, with the group's total. */
	const groups = $derived(
		Array.from({ length: view.session.group_count }, (_, i) => i + 1)
			.map((group) => {
				const members = players.filter((p) => p.group === group);
				return { group, members, total: members.reduce((sum, p) => sum + p.score, 0) };
			})
			.filter((g) => g.members.length > 0)
	);
	const myGroup = $derived(players.find((p) => p.id === me)?.group ?? null);

	function status(player: ViewPlayer): { text: string; tone: 'active' | 'good' | 'bad' | 'muted' } {
		if (player.status === 'removed') return { text: 'Removed', tone: 'muted' };
		if (round) {
			if (round.phase === 'reveal') {
				const result = round.results?.[player.id];
				if (result === true) return { text: '✓ Correct', tone: 'good' };
				if (result === false) return { text: '✕ Wrong', tone: 'bad' };
				return { text: 'No answer', tone: 'muted' };
			}
			return round.answered.includes(player.id)
				? { text: '✓ Answered', tone: 'good' }
				: { text: 'Thinking…', tone: 'muted' };
		}
		if (game.active_player_id === player.id) return { text: '▶ Playing', tone: 'active' };
		return { text: 'Waiting', tone: 'muted' };
	}

	function points(score: number) {
		return `${score} ${score === 1 ? 'point' : 'points'}`;
	}
</script>

{#snippet entry(player: ViewPlayer, compact: boolean)}
	{@const isActive = game.active_player_id === player.id}
	{@const removed = player.status === 'removed'}
	{@const s = status(player)}
	<li
		class="relative flex items-center gap-2.5 rounded-2xl border-2 p-2 {isActive ? 'border-saffron bg-saffron-soft' : 'border-transparent bg-surface'}
			{removed ? 'opacity-60' : ''} {compact ? 'min-w-[9.5rem] shrink-0 snap-start lg:min-w-0' : ''}"
		data-nickname={player.nickname}
		data-score={player.score}
	>
		<PlayerAvatar avatar={player.avatar} size="sm" active={isActive} online={removed ? undefined : online.has(player.id)} />
		<span class="min-w-0 flex-1">
			<span class="flex items-center gap-1">
				<span class="truncate text-sm font-extrabold">{player.nickname}</span>
				{#if player.id === me}<span class="text-xs font-bold text-teal-deep">(you)</span>{/if}
			</span>
			<span
				class="block text-xs {s.tone === 'good'
					? 'font-bold text-teal-deep'
					: s.tone === 'bad'
						? 'font-bold text-coral-deep'
						: s.tone === 'active'
							? 'font-bold text-ink'
							: 'text-ink-soft'}">{s.text}</span
			>
		</span>
		<span class="text-xl font-black tabular-nums" aria-hidden="true">{player.score}</span>
		<span class="sr-only">{points(player.score)}</span>
	</li>
{/snippet}

<section aria-labelledby="scoreboard-heading">
	<h2 id="scoreboard-heading" class="sr-only">Scoreboard</h2>
	{#if grouped && compact}
		<ol class="grid grid-cols-2 gap-2" aria-label="Group scores">
			{#each groups as { group, members, total } (group)}
				{@const playing = members.find((p) => p.id === game.active_player_id)}
				<li
					class="rounded-2xl bg-surface p-2 {group === myGroup ? 'ring-2 ring-teal-deep' : 'ring-2 ring-ink/5'}"
					data-group={group}
					data-total={total}
				>
					<p class="flex items-baseline justify-between gap-1 px-1">
						<span class="truncate text-sm font-black">{groupLabel(group)}{#if group === myGroup}<span class="sr-only">{' (your group)'}</span>{/if}</span>
						<span class="text-lg font-black tabular-nums">{total}<span class="sr-only">{` ${total === 1 ? 'point' : 'points'}`}</span></span>
					</p>
					<ul class="mt-1 flex flex-wrap gap-1" aria-label="Members of {groupLabel(group)}">
						{#each members as player (player.id)}
							<li
								class="relative {player.status === 'removed' ? 'opacity-40' : ''}"
								data-nickname={player.nickname}
								data-score={player.score}
							>
								<PlayerAvatar avatar={player.avatar} size="sm" active={player.id === game.active_player_id} />
								<span class="sr-only">{player.nickname}{player.id === me ? ' (you)' : ''}: {points(player.score)}</span>
							</li>
						{/each}
					</ul>
					{#if playing}<p class="mt-1 truncate px-1 text-xs font-bold"><span aria-hidden="true">▶ </span>{playing.nickname}</p>{/if}
				</li>
			{/each}
		</ol>
	{:else if grouped}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
			{#each groups as { group, members, total } (group)}
				<section
					class="rounded-3xl bg-ink/5 p-2 {group === myGroup ? 'ring-2 ring-teal-deep' : ''}"
					aria-label="{groupLabel(group)}{group === myGroup ? ' (your group)' : ''}: {points(total)}"
					data-group={group}
					data-total={total}
				>
					<header class="flex items-baseline justify-between gap-2 px-2 pt-1 pb-2">
						<h3 class="font-black">
							{groupLabel(group)}
							{#if group === myGroup}<span class="text-xs font-bold text-teal-deep">(your group)</span>{/if}
						</h3>
						<p class="text-sm text-ink-soft"><span class="text-xl font-black text-ink tabular-nums">{total}</span> {total === 1 ? 'pt' : 'pts'}</p>
					</header>
					<ol class="space-y-1.5" aria-label="Members of {groupLabel(group)}">
						{#each members as player (player.id)}
							{@render entry(player, false)}
						{/each}
					</ol>
				</section>
			{/each}
		</div>
	{:else}
		<ol class="flex snap-x gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Players">
			{#each players as player (player.id)}
				{@render entry(player, true)}
			{/each}
		</ol>
	{/if}
</section>
