/**
 * Test-only render harness (NOT part of the application build or routes).
 * Mounts the real player-facing components with fixture views so Playwright
 * can check layouts at the spec's viewport sizes without a Supabase project.
 * Run via playwright.config.ts (port 4174).
 */
import { resolve } from 'node:path';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname);

export default defineConfig({
	root,
	plugins: [
		tailwindcss(),
		svelte({ configFile: false, preprocess: vitePreprocess(), compilerOptions: { runes: true } })
	],
	resolve: { alias: { $lib: resolve(root, '../../src/lib') } },
	server: { port: 4174, strictPort: true, fs: { allow: [resolve(root, '../..')] } }
});
