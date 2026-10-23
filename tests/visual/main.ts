import { mount } from 'svelte';
import './harness.css';
import Harness from './Harness.svelte';

const params = new URLSearchParams(location.search);
// ?theme=dark renders the scene in the dark colour theme.
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
mount(Harness, {
	target: document.getElementById('app')!,
	props: { scene: params.get('scene') ?? 'game', cards: Number(params.get('pairs') ?? 8) as 6 | 8 | 12 }
});
