<script lang="ts">
	import CopyButton from '$lib/components/shared/CopyButton.svelte';

	let {
		joinCode,
		inviteUrl,
		qrSvg,
		accepting
	}: { joinCode: string; inviteUrl: string; qrSvg: string; accepting: boolean } = $props();
</script>

<section class="card-surface p-5 sm:p-6" aria-labelledby="invite-heading">
	<h2 id="invite-heading" class="text-xl font-extrabold">Invite players</h2>
	{#if !accepting}
		<p class="mt-1 text-sm font-bold text-coral-deep">The game has started; new players can no longer join.</p>
	{/if}
	<div class="mt-4 grid items-center gap-5 sm:grid-cols-[auto_1fr]">
		<div class="mx-auto w-44 rounded-2xl bg-surface p-2 ring-2 ring-ink/10 sm:w-40" role="img" aria-label="QR code for the invitation link">
			<!-- QR SVG generated on the server from the invitation link (no user content). -->
			{@html qrSvg}
		</div>
		<div class="min-w-0">
			<p class="text-sm font-bold text-ink-soft">Join code</p>
			<p class="font-mono text-4xl font-black tracking-[0.2em] text-teal-deep" aria-label="Join code {joinCode.split('').join(' ')}">
				{joinCode}
			</p>
			<p class="mt-3 text-sm font-bold text-ink-soft">Invitation link</p>
			<p class="truncate rounded-xl bg-cream px-3 py-2 font-mono text-sm" title={inviteUrl}>{inviteUrl}</p>
			<div class="mt-3"><CopyButton text={inviteUrl} /></div>
		</div>
	</div>
</section>
