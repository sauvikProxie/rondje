import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['tests/unit/**/*.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'db',
					environment: 'node',
					include: ['tests/db/**/*.test.ts'],
					testTimeout: 60_000,
					hookTimeout: 120_000
				}
			}
		]
	}
});
