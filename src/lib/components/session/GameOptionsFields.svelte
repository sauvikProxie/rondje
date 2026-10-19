<script lang="ts">
	import {
		GAME_MODES,
		GROUP_COUNTS,
		MODE_INFO,
		PAIR_COUNTS,
		VARIANTS,
		VARIANT_INFO,
		type GameMode,
		type Variant
	} from '$lib/game/constants';

	/** The game settings pickers, shared by "Create a session" and "Set up the next game". */
	let {
		mode = $bindable(),
		variant = $bindable(),
		pairCount = $bindable(),
		groupCount = $bindable(),
		errors = {}
	}: {
		mode: GameMode;
		variant: Variant;
		pairCount: number;
		groupCount: number;
		errors?: Record<string, string>;
	} = $props();

	const unit = $derived(MODE_INFO[mode].unit[1]);
	const groupsLabel = (n: number) => (n === 1 ? 'No groups' : `${n} groups`);
</script>

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
