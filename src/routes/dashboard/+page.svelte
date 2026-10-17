<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { callApi } from '$lib/client/api';
	import Alert from '$lib/components/shared/Alert.svelte';
	import ConfirmButton from '$lib/components/shared/ConfirmButton.svelte';
	import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
	import VariantBadge from '$lib/components/shared/VariantBadge.svelte';
	import { formatDateTime } from '$lib/utils/format';

	let { data } = $props();

	let deleting = $state<string | null>(null);
	let deleteError = $state<string | null>(null);

	async function deleteSession(id: string) {
		deleting = id;
		deleteError = null;
		const result = await callApi(`/api/sessions/${id}/delete`, { method: 'POST', body: {} });
		if (!result.ok && result.error?.code !== 'session_not_found') deleteError = result.error?.message ?? null;
		await invalidateAll();
		deleting = null;
	}
</script>

<svelte:head>
	<title>Your sessions · Rondje</title>
</svelte:head>

<div class="mx-auto max-w-4xl">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-3xl font-black sm:text-4xl">Your sessions</h1>
			<p class="mt-1 text-ink-soft">Create a session, share the code, and start the game when everyone is in.</p>
		</div>
		<a href="/dashboard/sessions/new" class="btn-primary"><span aria-hidden="true">➕</span> Create session</a>
	</div>

	{#if deleteError}
		<div class="mt-6"><Alert>{deleteError}</Alert></div>
	{/if}

	{#if data.sessions.length === 0}
		<section class="card-surface mt-8 p-8 text-center">
			<p class="text-5xl" aria-hidden="true">🃏</p>
			<h2 class="mt-3 text-xl font-extrabold">No sessions yet</h2>
			<p class="mx-auto mt-1 max-w-sm text-ink-soft">
				Create your first session to get a join code and QR code for your players.
			</p>
			<a href="/dashboard/sessions/new" class="btn-primary mt-5">Create your first session</a>
		</section>
	{:else}
		<ul class="mt-8 space-y-3">
			{#each data.sessions as session (session.id)}
				<li class="card-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<StatusBadge status={session.status} />
							<VariantBadge variant={session.variant} pairCount={session.pair_count} />
						</div>
						<h2 class="mt-2 truncate text-lg font-extrabold">{session.name}</h2>
						<p class="mt-0.5 text-sm text-ink-soft">
							Code <span class="font-mono font-bold text-ink">{session.join_code}</span>
							· {session.participantCount}
							{session.participantCount === 1 ? 'participant' : 'participants'}
							{#if session.scheduled_at}· {formatDateTime(session.scheduled_at)}{/if}
						</p>
					</div>
					<div class="flex shrink-0 flex-wrap gap-2">
						<a href="/dashboard/sessions/{session.id}" class="btn-secondary">
							{session.status === 'completed' ? 'View results' : 'Open & manage'}
							<span class="sr-only">: {session.name}</span>
						</a>
						<ConfirmButton
							class="btn-ghost"
							confirmLabel="Confirm delete"
							ariaLabel="Delete session {session.name}"
							disabled={deleting !== null}
							onconfirm={() => deleteSession(session.id)}
						>
							{deleting === session.id ? 'Deleting…' : '🗑 Delete'}
						</ConfirmButton>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
