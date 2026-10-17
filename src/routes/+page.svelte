<script lang="ts">
	import { enhance } from '$app/forms';
	import Logo from '$lib/components/shared/Logo.svelte';
	import { VARIANTS, VARIANT_INFO } from '$lib/game/constants';

	let { data, form } = $props();

	let submitting = $state(false);
	// bind:value (not value=) so text typed before hydration is kept.
	let code = $state('');
	$effect.pre(() => {
		if (form?.code) code = form.code;
	});
</script>

<svelte:head>
	<title>Rondje: learn Dutch words together</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
	<header class="flex items-center justify-between gap-3 py-4">
		<Logo />
		<a href="/dashboard" class="btn-ghost min-h-11 px-4 text-sm">
			{data.viewer && !data.viewer.isAnonymous ? 'My sessions' : 'Host sign in'}
		</a>
	</header>

	<main id="main" class="flex-1 pb-12">
		<section class="grid items-center gap-8 pt-6 md:grid-cols-[1.1fr_1fr] md:pt-14">
			<div>
				<p class="pill mb-4 bg-saffron-soft text-ink">🧡 Dutch vocabulary, played together</p>
				<h1 class="text-4xl leading-tight font-black text-ink sm:text-5xl">
					Flip, remember and <span class="text-teal-deep">match</span> your way to new Dutch words.
				</h1>
				<p class="mt-4 max-w-prose text-lg text-ink-soft">
					Rondje is a multiplayer memory game. Everyone gets the same board, every flip is visible to the
					whole table, and remembering each other's cards is part of the fun.
				</p>
			</div>

			<form
				method="POST"
				action="?/join"
				class="card-surface p-5 sm:p-7"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<h2 class="text-2xl font-extrabold">Join a game</h2>
				<p class="mt-1 text-ink-soft">Enter the 6-character code from your host.</p>
				<label for="code" class="field-label mt-5">Session code</label>
				<input
					id="code"
					name="code"
					class="field-input text-center font-mono text-2xl font-extrabold tracking-[0.3em] uppercase"
					bind:value={code}
					maxlength="8"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					inputmode="text"
					placeholder="ABC123"
					required
					aria-invalid={form?.error ? 'true' : undefined}
					aria-describedby={form?.error ? 'code-error' : undefined}
				/>
				{#if form?.error}
					<p id="code-error" class="field-error">{form.error}</p>
				{/if}
				<button class="btn-primary mt-4 w-full" disabled={submitting}>
					{submitting ? 'Checking…' : 'Join game'}
				</button>
				<p class="mt-4 text-center text-sm text-ink-soft">
					Got a link or QR code? Just open it, no code needed.
				</p>
			</form>
		</section>

		<section class="mt-14" aria-labelledby="how-heading">
			<h2 id="how-heading" class="text-2xl font-extrabold">How it works</h2>
			<ol class="mt-4 grid gap-4 sm:grid-cols-3">
				<li class="card-surface p-5">
					<span class="text-3xl" aria-hidden="true">🙋</span>
					<h3 class="mt-2 text-lg font-extrabold">1. Join</h3>
					<p class="text-ink-soft">Pick a nickname, an emoji avatar and your Dutch level.</p>
				</li>
				<li class="card-surface p-5">
					<span class="text-3xl" aria-hidden="true">🃏</span>
					<h3 class="mt-2 text-lg font-extrabold">2. Flip two cards</h3>
					<p class="text-ink-soft">
						On your turn, flip two cards on your board. A match scores a point and you go again.
					</p>
				</li>
				<li class="card-surface p-5">
					<span class="text-3xl" aria-hidden="true">🧠</span>
					<h3 class="mt-2 text-lg font-extrabold">3. Watch and remember</h3>
					<p class="text-ink-soft">
						All boards are identical, so every flip you see helps you. First to clear their board wins!
					</p>
				</li>
			</ol>
		</section>

		<section class="mt-12" aria-labelledby="variants-heading">
			<h2 id="variants-heading" class="text-2xl font-extrabold">Four ways to play</h2>
			<ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each VARIANTS as variant (variant)}
					<li class="rounded-3xl border-2 border-ink/10 bg-surface/70 p-5">
						<p class="text-lg font-extrabold">{VARIANT_INFO[variant].label}</p>
						<p class="mt-1 text-sm text-ink-soft">{VARIANT_INFO[variant].description}</p>
						<p class="mt-3 font-bold text-teal-deep">{VARIANT_INFO[variant].example}</p>
					</li>
				{/each}
			</ul>
		</section>
	</main>

	<footer class="safe-bottom py-6 text-center text-sm text-ink-soft">
		Rondje · a memory game for learning Dutch
	</footer>
</div>
