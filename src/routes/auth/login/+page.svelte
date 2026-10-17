<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/shared/Alert.svelte';
	import Logo from '$lib/components/shared/Logo.svelte';

	let { data, form } = $props();

	let mode = $state<'signin' | 'signup'>('signin');
	let submitting = $state(false);
	// bind:value (not value=) so text typed before hydration is kept.
	let email = $state('');

	$effect.pre(() => {
		if (form?.mode) mode = form.mode as 'signin' | 'signup';
		if (form?.email) email = form.email;
	});

	const errors = $derived<Record<string, string>>((form && 'errors' in form ? form.errors : undefined) ?? {});
</script>

<svelte:head>
	<title>{mode === 'signin' ? 'Host sign in' : 'Create host account'} · Rondje</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
	<header class="mb-8"><Logo /></header>

	<main id="main" class="card-surface p-5 sm:p-8">
		<h1 class="text-3xl font-black">{mode === 'signin' ? 'Host sign in' : 'Create a host account'}</h1>
		<p class="mt-1 text-ink-soft">
			Hosts create sessions and run the game. Players don't need an account.
		</p>

		<div class="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-cream p-1" role="group" aria-label="Choose sign in or sign up">
			<button
				type="button"
				class="min-h-11 rounded-xl font-bold {mode === 'signin' ? 'bg-surface shadow-sm' : 'text-ink-soft'}"
				aria-pressed={mode === 'signin'}
				onclick={() => (mode = 'signin')}>Sign in</button
			>
			<button
				type="button"
				class="min-h-11 rounded-xl font-bold {mode === 'signup' ? 'bg-surface shadow-sm' : 'text-ink-soft'}"
				aria-pressed={mode === 'signup'}
				onclick={() => (mode = 'signup')}>Create account</button
			>
		</div>

		<div class="mt-5 space-y-3">
			{#if !data.configured}
				<Alert tone="warning" title="Not configured">
					Supabase environment variables are missing, so sign-in is unavailable.
				</Alert>
			{/if}
			{#if data.playingAsGuest}
				<Alert tone="info">
					You're currently playing as a guest in this browser. Signing in as a host will end that guest
					session here.
				</Alert>
			{/if}
			{#if form && 'confirmEmail' in form && form.confirmEmail}
				<Alert tone="success" title="Check your inbox">
					We sent a confirmation link to {form.email}. Confirm your address, then sign in here.
				</Alert>
			{/if}
			{#if errors.form}
				<Alert>{errors.form}</Alert>
			{/if}
		</div>

		<form
			method="POST"
			action="?/{mode}&next={encodeURIComponent(data.next)}"
			class="mt-5 space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<div>
				<label class="field-label" for="email">Email</label>
				<input
					class="field-input"
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					required
					bind:value={email}
					aria-invalid={errors.email ? 'true' : undefined}
					aria-describedby={errors.email ? 'email-error' : undefined}
				/>
				{#if errors.email}<p id="email-error" class="field-error">{errors.email}</p>{/if}
			</div>
			<div>
				<label class="field-label" for="password">Password</label>
				<input
					class="field-input"
					id="password"
					name="password"
					type="password"
					autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
					minlength={mode === 'signup' ? 8 : undefined}
					required
					aria-invalid={errors.password ? 'true' : undefined}
					aria-describedby={errors.password ? 'password-error' : mode === 'signup' ? 'password-hint' : undefined}
				/>
				{#if errors.password}
					<p id="password-error" class="field-error">{errors.password}</p>
				{:else if mode === 'signup'}
					<p id="password-hint" class="mt-1.5 text-sm text-ink-soft">At least 8 characters.</p>
				{/if}
			</div>
			<button class="btn-primary w-full" disabled={submitting || !data.configured}>
				{#if submitting}Please wait…{:else}{mode === 'signin' ? 'Sign in' : 'Create account'}{/if}
			</button>
		</form>
	</main>

	<p class="mt-6 text-center text-sm">
		<a href="/" class="font-bold text-teal-deep underline underline-offset-4">Join a game as a player instead</a>
	</p>
</div>
