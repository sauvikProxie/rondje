<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/shared/Alert.svelte';
	import {
		GAME_MODES,
		GROUP_COUNTS,
		MODE_INFO,
		PAIR_COUNTS,
		SESSION_NAME_MAX_LENGTH,
		VARIANTS,
		VARIANT_INFO,
		type GameMode,
		type Variant
	} from '$lib/game/constants';
	import { formatDateTime } from '$lib/utils/format';

	let { form } = $props();

	// Initial values only (e.g. after a failed submit without JS); the inputs own their state.
	// svelte-ignore state_referenced_locally
	const initial = form?.values;
	let name = $state(initial?.name ?? '');
	let mode = $state<GameMode>((initial?.mode as GameMode) || 'matchen');
	let variant = $state<Variant>((initial?.variant as Variant) || 'word_image');
	let pairCount = $state(Number(initial?.pairCount) || 8);
	let groupCount = $state(Number(initial?.groupCount) || 1);
	let scheduledLocal = $state(initial?.scheduledLocal ?? '');

	const unit = $derived(MODE_INFO[mode].unit[1]);
	const groupsLabel = (n: number) => (n === 1 ? 'No groups' : `${n} groups`);
	let step = $state<'configure' | 'review'>('configure');
	let submitting = $state(false);
	let clientErrors = $state<Record<string, string>>({});

	const errors = $derived<Record<string, string>>({ ...(form?.errors ?? {}), ...clientErrors });

	// datetime-local has no time zone; convert in the browser so the server
	// stores the instant the host meant.
	const scheduledIso = $derived.by(() => {
		if (!scheduledLocal) return '';
		const date = new Date(scheduledLocal);
		return Number.isNaN(date.getTime()) ? '' : date.toISOString();
	});

	$effect.pre(() => {
		if (form?.errors) step = 'configure';
	});

	function review() {
		const next: Record<string, string> = {};
		if (!name.trim()) next.name = 'Please give the session a name.';
		if (scheduledLocal && !scheduledIso) next.scheduledAt = 'Please enter a valid date and time.';
		clientErrors = next;
		if (Object.keys(next).length === 0) step = 'review';
	}
</script>

<svelte:head>
	<title>New session · Rondje</title>
</svelte:head>

<div class="mx-auto max-w-3xl">
	<a href="/dashboard" class="text-sm font-bold text-teal-deep underline underline-offset-4">← Back to sessions</a>
	<h1 class="mt-3 text-3xl font-black sm:text-4xl">Create a session</h1>
	<p class="mt-1 text-ink-soft">
		Step {step === 'configure' ? 1 : 2} of 2: {step === 'configure' ? 'configure the game' : 'review and create'}
	</p>

	<form
		method="POST"
		class="mt-6"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<input type="hidden" name="name" value={name} />
		<input type="hidden" name="mode" value={mode} />
		<input type="hidden" name="variant" value={mode === 'matchen' ? variant : ''} />
		<input type="hidden" name="pairCount" value={pairCount} />
		<input type="hidden" name="groupCount" value={groupCount} />
		<input type="hidden" name="scheduledAt" value={scheduledIso} />
		<input type="hidden" name="scheduledLocal" value={scheduledLocal} />

		{#if errors.form}
			<div class="mb-4"><Alert>{errors.form}</Alert></div>
		{/if}

		{#if step === 'configure'}
			<div class="card-surface space-y-7 p-5 sm:p-7">
				<div>
					<label class="field-label" for="session-name">Session name</label>
					<input
						id="session-name"
						class="field-input"
						bind:value={name}
						maxlength={SESSION_NAME_MAX_LENGTH}
						placeholder="e.g. Dutch class, Thursday evening"
						required
						aria-invalid={errors.name ? 'true' : undefined}
						aria-describedby={errors.name ? 'name-error' : undefined}
					/>
					{#if errors.name}<p id="name-error" class="field-error">{errors.name}</p>{/if}
				</div>

				<div>
					<label class="field-label" for="scheduled">Date and time <span class="font-normal text-ink-soft">(optional)</span></label>
					<input
						id="scheduled"
						type="datetime-local"
						class="field-input"
						bind:value={scheduledLocal}
						aria-invalid={errors.scheduledAt ? 'true' : undefined}
						aria-describedby="scheduled-hint{errors.scheduledAt ? ' scheduled-error' : ''}"
					/>
					<p id="scheduled-hint" class="mt-1.5 text-sm text-ink-soft">For your planning only; it doesn't open or close the session.</p>
					{#if errors.scheduledAt}<p id="scheduled-error" class="field-error">{errors.scheduledAt}</p>{/if}
				</div>

				<fieldset>
					<legend class="field-label">Game</legend>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each GAME_MODES as option (option)}
							<label
								class="flex min-h-12 cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal-deep {mode ===
								option
									? 'border-teal-deep bg-teal-soft'
									: 'border-ink/10 bg-surface hover:border-ink/25'}"
							>
								<input type="radio" class="sr-only" name="mode-choice" value={option} bind:group={mode} />
								<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 {mode === option ? 'border-teal-deep' : 'border-ink/30'}" aria-hidden="true">
									{#if mode === option}<span class="size-2.5 rounded-full bg-teal-deep"></span>{/if}
								</span>
								<span>
									<span class="block font-extrabold">{MODE_INFO[option].label}</span>
									<span class="block text-sm text-ink-soft">{MODE_INFO[option].description}</span>
									<span class="mt-1 block text-sm font-bold text-teal-deep" lang="nl">{MODE_INFO[option].example}</span>
								</span>
							</label>
						{/each}
					</div>
					{#if errors.mode}<p class="field-error">{errors.mode}</p>{/if}
					{#if mode === 'fill_blanks'}
						<p class="mt-2 text-sm text-ink-soft">
							Players at Beginner or Elementary level pick from four options; Intermediate and Advanced players type the answer.
						</p>
					{/if}
				</fieldset>

				{#if mode === 'matchen'}
				<fieldset>
					<legend class="field-label">Game variant</legend>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each VARIANTS as option (option)}
							<label
								class="flex min-h-12 cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal-deep {variant ===
								option
									? 'border-teal-deep bg-teal-soft'
									: 'border-ink/10 bg-surface hover:border-ink/25'}"
							>
								<input type="radio" class="sr-only" name="variant-choice" value={option} bind:group={variant} />
								<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 {variant === option ? 'border-teal-deep' : 'border-ink/30'}" aria-hidden="true">
									{#if variant === option}<span class="size-2.5 rounded-full bg-teal-deep"></span>{/if}
								</span>
								<span>
									<span class="block font-extrabold">{VARIANT_INFO[option].label}</span>
									<span class="block text-sm text-ink-soft">{VARIANT_INFO[option].description}</span>
									<span class="mt-1 block text-sm font-bold text-teal-deep">{VARIANT_INFO[option].example}</span>
								</span>
							</label>
						{/each}
					</div>
					{#if errors.variant}<p class="field-error">{errors.variant}</p>{/if}
				</fieldset>
				{/if}

				<fieldset>
					<legend class="field-label">Number of {unit}</legend>
					<div class="grid grid-cols-3 gap-3">
						{#each PAIR_COUNTS as option (option)}
							<label
								class="flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal-deep {pairCount ===
								option
									? 'border-teal-deep bg-teal-soft'
									: 'border-ink/10 bg-surface hover:border-ink/25'}"
							>
								<input type="radio" class="sr-only" name="pair-choice" value={option} bind:group={pairCount} />
								<span class="text-xl font-black">{option}</span>
								<span class="text-xs text-ink-soft">{mode === 'matchen' ? `${option * 2} cards` : unit}</span>
							</label>
						{/each}
					</div>
					{#if errors.pairCount}<p class="field-error">{errors.pairCount}</p>{/if}
				</fieldset>

				<fieldset>
					<legend class="field-label">Groups</legend>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{#each GROUP_COUNTS as option (option)}
							<label
								class="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-3 text-center font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal-deep {groupCount ===
								option
									? 'border-teal-deep bg-teal-soft'
									: 'border-ink/10 bg-surface hover:border-ink/25'}"
							>
								<input type="radio" class="sr-only" name="group-choice" value={option} bind:group={groupCount} />
								{groupsLabel(option)}
							</label>
						{/each}
					</div>
					<p class="mt-1.5 text-sm text-ink-soft">
						{groupCount > 1
							? `Players are split into ${groupCount} groups at random when the game starts. Each group gets its own scorecard, and every point counts for the player's group.`
							: 'Everyone plays for themselves.'}
					</p>
					{#if errors.groupCount}<p class="field-error">{errors.groupCount}</p>{/if}
				</fieldset>

				<button type="button" class="btn-primary w-full sm:w-auto" onclick={review}>Review session →</button>
			</div>
		{:else}
			<div class="card-surface p-5 sm:p-7">
				<h2 class="text-xl font-extrabold">Review</h2>
				<dl class="mt-4 divide-y-2 divide-ink/5">
					<div class="flex justify-between gap-4 py-3"><dt class="text-ink-soft">Name</dt><dd class="text-right font-bold break-words">{name}</dd></div>
					<div class="flex justify-between gap-4 py-3"><dt class="text-ink-soft">Game</dt><dd class="text-right font-bold">{MODE_INFO[mode].label}</dd></div>
					{#if mode === 'matchen'}
						<div class="flex justify-between gap-4 py-3"><dt class="text-ink-soft">Variant</dt><dd class="text-right font-bold">{VARIANT_INFO[variant].label}</dd></div>
						<div class="flex justify-between gap-4 py-3"><dt class="text-ink-soft">Pairs</dt><dd class="text-right font-bold">{pairCount} pairs · {pairCount * 2} cards</dd></div>
					{:else}
						<div class="flex justify-between gap-4 py-3"><dt class="text-ink-soft">Sentences</dt><dd class="text-right font-bold">{pairCount}</dd></div>
					{/if}
					<div class="flex justify-between gap-4 py-3"><dt class="text-ink-soft">Groups</dt><dd class="text-right font-bold">{groupsLabel(groupCount)}</dd></div>
					<div class="flex justify-between gap-4 py-3"><dt class="text-ink-soft">Scheduled</dt><dd class="text-right font-bold">{scheduledIso ? formatDateTime(scheduledIso) : 'Not set'}</dd></div>
				</dl>
				<p class="mt-4 text-sm text-ink-soft">
					{mode === 'matchen'
						? 'Vocabulary is picked at random from all themes when you start the game. Everyone plays on one shared board.'
						: 'Sentences are picked at random from all grammar topics when you start the game.'}
				</p>
				<div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
					<button type="button" class="btn-ghost" onclick={() => (step = 'configure')}>← Edit</button>
					<button class="btn-primary sm:flex-1" disabled={submitting}>
						{submitting ? 'Creating…' : 'Create session'}
					</button>
				</div>
			</div>
		{/if}
	</form>
</div>
