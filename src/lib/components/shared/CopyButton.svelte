<script lang="ts">
	let { text, label = 'Copy link', class: className = 'btn-ghost' }: { text: string; label?: string; class?: string } = $props();

	let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copyState = 'copied';
		} catch {
			copyState = 'failed';
		}
		clearTimeout(timer);
		timer = setTimeout(() => (copyState = 'idle'), 2500);
	}
</script>

<button type="button" class={className} onclick={copy}>
	<span aria-hidden="true">{copyState === 'copied' ? '✓' : '🔗'}</span>
	{copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed: select the link' : label}
</button>
<span class="sr-only" aria-live="polite">{copyState === 'copied' ? 'Link copied to clipboard' : ''}</span>
