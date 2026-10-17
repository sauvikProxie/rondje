<script lang="ts">
	import { VARIANT_INFO, type Variant } from '$lib/game/constants';

	let { variant, pairCount }: { variant: Variant; pairCount?: number } = $props();
</script>

<span class="pill bg-surface text-ink ring-2 ring-ink/10">
	{VARIANT_INFO[variant].label}{#if pairCount}<span aria-hidden="true">·</span>{pairCount} pairs{/if}
</span>
