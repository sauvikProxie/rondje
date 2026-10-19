<script lang="ts">
	import { MODE_INFO, VARIANT_INFO, type GameMode, type Variant } from '$lib/game/constants';

	let {
		mode,
		variant,
		pairCount,
		groupCount = 1
	}: { mode: GameMode; variant: Variant | null; pairCount?: number; groupCount?: number } = $props();

	const label = $derived(mode === 'matchen' && variant ? VARIANT_INFO[variant].label : MODE_INFO[mode].label);
	const unit = $derived(MODE_INFO[mode].unit[pairCount === 1 ? 0 : 1]);
</script>

<span class="pill bg-surface text-ink ring-2 ring-ink/10">
	{label}{#if pairCount}<span aria-hidden="true">·</span>{pairCount} {unit}{/if}{#if groupCount > 1}<span aria-hidden="true">·</span>{groupCount} groups{/if}
</span>
