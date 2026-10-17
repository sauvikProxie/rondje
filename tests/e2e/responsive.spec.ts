/**
 * Responsive layout checks at the viewport sizes required by spec 13.5.
 * Runs without Supabase: app pages that need no data are loaded from the
 * production preview build; the lobby, game and results screens are rendered
 * by the test-only harness in tests/visual with fixture views.
 */
import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
	{ name: 'phone-360', width: 360, height: 640 },
	{ name: 'phone-390', width: 390, height: 844 },
	{ name: 'phone-412', width: 412, height: 915 },
	{ name: 'tablet', width: 820, height: 1180 },
	{ name: 'desktop', width: 1440, height: 900 }
];

const APP = 'http://localhost:4173';
const HARNESS = 'http://localhost:4174';

const APP_PAGES = [
	{ name: 'landing', path: '/' },
	{ name: 'login', path: '/auth/login' },
	{ name: 'join', path: '/join/K7M2QX' },
	{ name: 'not-found', path: '/does-not-exist' }
];

const SCENES = [
	{ name: 'lobby', query: 'scene=lobby&pairs=8' },
	{ name: 'game-6', query: 'scene=game&pairs=6' },
	{ name: 'game-8', query: 'scene=game&pairs=8' },
	{ name: 'game-12', query: 'scene=game&pairs=12' },
	{ name: 'game-reveal-12', query: 'scene=game-other&pairs=12' },
	{ name: 'results', query: 'scene=results&pairs=8' },
	{ name: 'results-tie', query: 'scene=results-tie&pairs=12' }
];

async function expectNoHorizontalOverflow(page: Page) {
	const { scrollWidth, innerWidth } = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth
	}));
	expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth);
}

for (const viewport of VIEWPORTS) {
	test.describe(`${viewport.name} (${viewport.width}×${viewport.height})`, () => {
		test.use({ viewport: { width: viewport.width, height: viewport.height } });

		for (const appPage of APP_PAGES) {
			test(`app page: ${appPage.name}`, async ({ page }) => {
				await page.goto(APP + appPage.path);
				await expect(page.locator('main')).toBeVisible();
				await expectNoHorizontalOverflow(page);
				await page.screenshot({ path: `test-results/responsive/${viewport.name}-${appPage.name}.png`, fullPage: true });
			});
		}

		for (const scene of SCENES) {
			test(`screen: ${scene.name}`, async ({ page }) => {
				await page.goto(`${HARNESS}/?${scene.query}`);
				await expect(page.locator('main')).toBeVisible();
				await expectNoHorizontalOverflow(page);

				const cards = page.locator('[data-position]');
				if ((await cards.count()) > 0) {
					// Cards must stay usable touch targets (spec 13.7: ~48×48 px).
					const box = await cards.first().boundingBox();
					expect(box!.width).toBeGreaterThanOrEqual(44);
					expect(box!.height).toBeGreaterThanOrEqual(44);
					// The board must not be covered by the scoreboard or other controls.
					const last = cards.last();
					await last.scrollIntoViewIfNeeded();
					await expect(last).toBeInViewport();
					const hit = await last.evaluate((el) => {
						const r = el.getBoundingClientRect();
						const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
						return !!top && el.contains(top);
					});
					expect(hit, 'last card must not be obscured').toBe(true);
				}
				await page.screenshot({ path: `test-results/responsive/${viewport.name}-${scene.name}.png`, fullPage: true });
			});
		}
	});
}
