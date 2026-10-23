<script lang="ts">
	import Alert from '$lib/components/shared/Alert.svelte';
	import Logo from '$lib/components/shared/Logo.svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';

	let { sessionName, message, title = 'You can no longer take part' }: { sessionName: string; message?: string; title?: string } = $props();
</script>

<svelte:head>
	<title>{sessionName} · Rondje</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
	<header class="mb-6 flex items-center justify-between gap-3"><Logo /><ThemeToggle /></header>
	<main id="main" class="card-surface p-6">
		<h1 class="mb-4 text-2xl font-black break-words">{sessionName}</h1>
		<Alert {title}>
			{message ?? 'The host has removed you from this session, so you can no longer play or see the game.'}
		</Alert>
		<a href="/" class="btn-primary mt-6 w-full">Back to the start page</a>
	</main>
</div>
