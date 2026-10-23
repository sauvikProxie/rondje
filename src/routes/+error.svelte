<script lang="ts">
	import { page } from '$app/state';
	import Logo from '$lib/components/shared/Logo.svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';

	const title = $derived(
		page.status === 404
			? 'We couldn’t find that page'
			: page.status === 503
				? 'Temporarily unavailable'
				: 'Something went wrong'
	);
	// Messages from error() calls are written for users; unexpected errors get a generic text.
	const message = $derived(
		page.status >= 500 && page.status !== 503
			? 'Please try again in a moment.'
			: (page.error?.message ?? 'Please check the link and try again.')
	);
</script>

<svelte:head>
	<title>{title} · Rondje</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
	<header class="mb-6 flex items-center justify-between gap-3"><Logo /><ThemeToggle /></header>
	<main id="main" class="card-surface p-6 text-center">
		<p class="text-5xl" aria-hidden="true">{page.status === 404 ? '🔍' : '🛠️'}</p>
		<h1 class="mt-3 text-2xl font-black">{title}</h1>
		<p class="mt-2 text-ink-soft">{message}</p>
		<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
			<a href="/" class="btn-primary">Go to the start page</a>
			<button type="button" class="btn-ghost" onclick={() => location.reload()}>Try again</button>
		</div>
	</main>
</div>
