<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/shared/Alert.svelte';
	import Logo from '$lib/components/shared/Logo.svelte';
	import GameBadge from '$lib/components/shared/GameBadge.svelte';
	import { errorMessage } from '$lib/errors';
	import { AVATARS, LEVEL_LABELS, NICKNAME_MAX_LENGTH, PROFICIENCY_LEVELS } from '$lib/game/constants';

	let { data, form } = $props();

	const values = $derived(form?.values);
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	let submitting = $state(false);

	let avatar = $state<string>(AVATARS[0]);
	let level = $state<string>('beginner');
	// bind:value (not value=) so text typed before hydration is kept.
	let nickname = $state('');
	$effect.pre(() => {
		if (values?.nickname !== undefined) nickname = values.nickname;
		if (values?.avatar) avatar = values.avatar;
		if (values?.level) level = values.level;
	});

	const errorTitles: Record<string, string> = {
		invalid_join_code: 'That code does not look right',
		session_not_found: 'Session not found',
		session_completed: 'This game has finished',
		session_in_progress: 'This game has already started',
		removed: 'You were removed from this session',
		service_unavailable: 'Joining is unavailable'
	};
</script>

<svelte:head>
	<title>Join {data.state.kind === 'open' ? data.state.session.name : 'a game'} · Rondje</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
	<header class="mb-6"><Logo /></header>

	<main id="main" class="flex-1">
		{#if data.state.kind === 'error'}
			<div class="card-surface p-6">
				<Alert title={errorTitles[data.state.code] ?? 'Something went wrong'}>
					{errorMessage(data.state.code)}
					{#if data.state.code === 'session_in_progress'}
						If you already joined, open the game on the device you joined with.
					{:else if data.state.code === 'session_completed'}
						If the host sets up another game, you can join it with this link.
					{/if}
				</Alert>
				<form method="POST" action="/?/join" class="mt-6">
					<label for="code" class="field-label">Try another code</label>
					<div class="flex gap-2">
						<input
							id="code"
							name="code"
							class="field-input font-mono font-bold tracking-widest uppercase"
							maxlength="8"
							autocomplete="off"
							autocapitalize="characters"
							required
						/>
						<button class="btn-primary shrink-0">Go</button>
					</div>
				</form>
			</div>
		{:else if data.state.kind === 'host'}
			<div class="card-surface p-6">
				<Alert tone="info" title="You're the host">{errorMessage('is_host')}</Alert>
				<a class="btn-primary mt-5 w-full" href="/dashboard/sessions/{data.state.session.id}">Manage this session</a>
			</div>
		{:else}
			{@const session = data.state.session}
			<div class="card-surface p-5 sm:p-7">
				<p class="text-sm font-bold text-ink-soft">You're joining</p>
				<h1 class="mt-0.5 text-3xl font-black break-words">{session.name}</h1>
				<div class="mt-2">
					<GameBadge mode={session.mode} variant={session.variant} pairCount={session.pair_count} groupCount={session.group_count} />
				</div>

				<form
					method="POST"
					class="mt-6 space-y-6"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update({ reset: false });
							submitting = false;
						};
					}}
				>
					{#if errors.form}<Alert>{errors.form}</Alert>{/if}

					<div>
						<label class="field-label" for="nickname">Nickname</label>
						<input
							id="nickname"
							name="nickname"
							class="field-input"
							maxlength={NICKNAME_MAX_LENGTH * 2}
							autocomplete="nickname"
							required
							bind:value={nickname}
							aria-invalid={errors.nickname ? 'true' : undefined}
							aria-describedby="nickname-hint{errors.nickname ? ' nickname-error' : ''}"
						/>
						<p id="nickname-hint" class="mt-1.5 text-sm text-ink-soft">1–{NICKNAME_MAX_LENGTH} characters. Other players will see it.</p>
						{#if errors.nickname}<p id="nickname-error" class="field-error">{errors.nickname}</p>{/if}
					</div>

					<fieldset>
						<legend class="field-label">Choose your avatar</legend>
						<div class="grid grid-cols-6 gap-2">
							{#each AVATARS as option (option)}
								<label
									class="grid aspect-square min-h-12 cursor-pointer place-items-center rounded-2xl border-2 text-2xl transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal-deep sm:text-3xl {avatar ===
									option
										? 'border-teal-deep bg-teal-soft'
										: 'border-ink/10 bg-surface hover:border-ink/25'}"
								>
									<input type="radio" name="avatar" value={option} bind:group={avatar} class="sr-only" />
									<span aria-hidden="true">{option}</span>
									<span class="sr-only">Avatar {option}</span>
								</label>
							{/each}
						</div>
						{#if errors.avatar}<p class="field-error">{errors.avatar}</p>{/if}
					</fieldset>

					<fieldset>
						<legend class="field-label">Your Dutch level</legend>
						<div class="grid grid-cols-2 gap-2">
							{#each PROFICIENCY_LEVELS as option (option)}
								<label
									class="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-3 text-center font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal-deep {level ===
									option
										? 'border-teal-deep bg-teal-soft'
										: 'border-ink/10 bg-surface hover:border-ink/25'}"
								>
									<input type="radio" name="level" value={option} bind:group={level} class="sr-only" />
									{LEVEL_LABELS[option]}
								</label>
							{/each}
						</div>
						{#if errors.level}<p class="field-error">{errors.level}</p>{/if}
					</fieldset>

					<button class="btn-primary w-full text-lg" disabled={submitting}>
						{submitting ? 'Joining…' : `Join as ${avatar}`}
					</button>
					<p class="text-center text-xs text-ink-soft">No account needed. Your place is remembered in this browser.</p>
				</form>
			</div>
		{/if}
	</main>
</div>
