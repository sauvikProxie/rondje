import { mount } from 'svelte';
import './harness.css';
import Harness from './Harness.svelte';

const params = new URLSearchParams(location.search);
mount(Harness, {
	target: document.getElementById('app')!,
	props: { scene: params.get('scene') ?? 'game', cards: Number(params.get('pairs') ?? 8) as 6 | 8 | 12 }
});
