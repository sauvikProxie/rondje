<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Two-step button for destructive actions: the first activation asks for
	 * confirmation, the second performs the action. No hover dependency.
	 */
	let {
		onconfirm,
		confirmLabel = 'Tap again to confirm',
		class: className = 'btn-danger',
		disabled = false,
		ariaLabel,
		children
	}: {
		onconfirm: () => void | Promise<unknown>;
		confirmLabel?: string;
		class?: string;
		disabled?: boolean;
		ariaLabel?: string;
		children: Snippet;
	} = $props();

	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function click() {
		if (!armed) {
			armed = true;
			clearTimeout(timer);
			timer = setTimeout(() => (armed = false), 4000);
			return;
		}
		clearTimeout(timer);
		armed = false;
		await onconfirm();
	}
</script>

<button
	type="button"
	class={className}
	{disabled}
	onclick={click}
	aria-label={armed ? confirmLabel : ariaLabel}
	onblur={() => (armed = false)}
>
	{#if armed}<span aria-hidden="true">⚠️</span> {confirmLabel}{:else}{@render children()}{/if}
</button>
