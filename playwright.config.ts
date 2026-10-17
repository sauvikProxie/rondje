import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Load .env for the multiplayer E2E test (Supabase credentials). The
// responsive tests do not need it.
if (existsSync('.env')) process.loadEnvFile('.env');

const APP_PORT = 4173;
const HARNESS_PORT = 4174;
const appUrl = `http://localhost:${APP_PORT}`;

export default defineConfig({
	testDir: 'tests/e2e',
	outputDir: 'test-results',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: [['list']],
	timeout: 60_000,
	use: {
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'responsive',
			testMatch: /responsive\.spec\.ts/,
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'multiplayer',
			testMatch: /multiplayer\.spec\.ts/,
			timeout: 240_000,
			use: { ...devices['Desktop Chrome'], baseURL: appUrl }
		}
	],
	webServer: [
		{
			command: `npm run build && npx vite preview --port ${APP_PORT} --strictPort`,
			url: appUrl,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			env: { PUBLIC_APP_URL: process.env.PUBLIC_APP_URL_E2E ?? appUrl }
		},
		{
			command: `npx vite --config tests/visual/vite.config.ts --port ${HARNESS_PORT} --strictPort`,
			url: `http://localhost:${HARNESS_PORT}`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000
		}
	]
});
