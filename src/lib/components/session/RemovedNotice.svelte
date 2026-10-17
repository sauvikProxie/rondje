<script lang="ts">
	import Alert from '$lib/components/shared/Alert.svelte';
	import Logo from '$lib/components/shared/Logo.svelte';

	let { sessionName, message }: { sessionName: string; message?: string } = $props();
</script>

<svelte:head>
	<title>{sessionName} · Rondje</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
	<header class="mb-6"><Logo /></header>
	<main id="main" class="card-surface p-6">
		<h1 class="mb-4 text-2xl font-black break-words">{sessionName}</h1>
		<Alert title="You can no longer take part">
			{message ?? 'The host has removed you from this session, so you can no longer play or see the game.'}
		</Alert>
		<a href="/" class="btn-primary mt-6 w-full">Back to the start page</a>
	</main>
</div>
