<script lang="ts">
	let { message, ondismiss }: { message: string | null; ondismiss: () => void } = $props();
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6" aria-live="assertive">
	{#if message}
		<div class="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl bg-ink-solid px-4 py-3 text-white shadow-lg" role="alert">
			<span aria-hidden="true">⚠️</span>
			<p class="flex-1 text-sm font-semibold">{message}</p>
			<button type="button" class="-my-1 min-h-9 rounded-lg px-2 text-sm font-bold text-saffron" onclick={ondismiss}>
				Dismiss
			</button>
		</div>
	{/if}
</div>
