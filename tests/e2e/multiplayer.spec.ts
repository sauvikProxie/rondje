/**
 * End-to-end multiplayer journeys (spec 19.3, 23) against a real Supabase project.
 *
 * Requires PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY and
 * SUPABASE_SECRET_KEY (e.g. in .env), with supabase/schema.sql and
 * supabase/seed.sql applied and anonymous sign-ins enabled. Skipped otherwise.
 *
 * Every participant uses an independent browser context (separate cookies,
 * separate Supabase identity).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { e2eConfig, pairPositions, SupabaseAdmin } from './helpers/supabase-admin';

const config = e2eConfig();
test.skip(!config, 'Supabase credentials missing: set PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY');

const UI_TIMEOUT = 20_000;
const NICKNAMES = ['Anna', 'Bram', 'Cas'];
const AVATARS = ['🦊', '🐼', '🐸'];

async function newPage(browser: Browser): Promise<Page> {
	const context = await browser.newContext();
	return context.newPage();
}

/** Click a card on the shared board and wait until it is face up. */
async function flip(page: Page, position: number) {
	const card = page.locator(`[data-position="${position}"]`);
	await expect(card).toHaveAttribute('aria-disabled', 'false', { timeout: UI_TIMEOUT });
	await card.click();
	await expect(card).not.toHaveAttribute('data-state', 'hidden', { timeout: UI_TIMEOUT });
}

function scoreEntry(page: Page, nickname: string, points: number) {
	// The scoreboard exists twice (mobile strip / desktop sidebar); only one is visible.
	return page.locator(`li[data-nickname="${nickname}"][data-score="${points}"]`).filter({ visible: true }).first();
}

async function signInHost(browser: Browser, admin: SupabaseAdmin): Promise<Page> {
	const email = `rondje-e2e-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
	const password = `E2e-${crypto.randomUUID()}`;
	await admin.createHost(email, password);
	const host = await newPage(browser);
	await host.goto('/auth/login');
	await host.getByLabel('Email').fill(email);
	await host.getByLabel('Password').fill(password);
	await host.getByRole('button', { name: 'Sign in' }).last().click();
	await expect(host).toHaveURL(/\/dashboard$/, { timeout: UI_TIMEOUT });
	return host;
}

async function joinAs(browser: Browser, joinCode: string, nickname: string, avatar: string, level = 'Beginner') {
	const page = await newPage(browser);
	await page.goto(`/join/${joinCode}`);
	await page.getByLabel('Nickname').fill(nickname);
	await page.locator('label', { hasText: `Avatar ${avatar}` }).click();
	await page.locator('label', { hasText: new RegExp(`^${level}$`) }).click();
	await page.getByRole('button', { name: /^Join as/ }).click();
	await expect(page).toHaveURL(new RegExp(`/session/${joinCode}$`), { timeout: UI_TIMEOUT });
	await expect(page.getByText('Waiting for the host to start the game')).toBeVisible();
	return page;
}

async function createdSession(host: Page, admin: SupabaseAdmin) {
	await host.getByRole('button', { name: /Review session/ }).click();
	await host.getByRole('button', { name: 'Create session' }).click();
	await expect(host).toHaveURL(/\/dashboard\/sessions\/[0-9a-f-]{36}$/, { timeout: UI_TIMEOUT });
	const joinCode = (await host.locator('p.font-mono').first().innerText()).trim();
	expect(joinCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
	const sessions = await admin.sessionByCode(joinCode);
	expect(sessions).toHaveLength(1);
	return { joinCode, sessionId: sessions[0]!.id as string };
}

test('Matchen: host and three players play a complete game on one shared board', async ({ browser }) => {
	const admin = new SupabaseAdmin(config!.url, config!.secretKey);
	try {
		// 1. A host signs in. 2. The host creates a session (Matchen, Word–Image, 6 pairs).
		const host = await signInHost(browser, admin);
		await host.goto('/dashboard/sessions/new');
		await host.getByLabel('Session name').fill('E2E Dutch class');
		await host.getByText('Word–Image', { exact: true }).click();
		await host.locator('label', { hasText: '12 cards' }).click();
		// 3. The session has a unique six-character join code.
		const { joinCode, sessionId } = await createdSession(host, admin);

		// 4–5. Three players join in separate browser contexts, each choosing a nickname and avatar.
		const players: Page[] = [];
		for (const [i, nickname] of NICKNAMES.entries()) players.push(await joinAs(browser, joinCode, nickname, AVATARS[i]!));
		admin.trackUsers((await admin.players(sessionId)).map((p) => p.user_id));
		await expect(host.getByText('3 joined')).toBeVisible({ timeout: UI_TIMEOUT });

		// 6. The host starts the game.
		await host.getByRole('button', { name: /Start game/ }).click();

		// 7. Everyone sees the same shared board, face down.
		for (const page of players) await expect(page.locator('[data-position]')).toHaveCount(12, { timeout: UI_TIMEOUT });
		const game = await admin.game(sessionId);
		const layout = await admin.layout(game.id);
		expect(layout.size).toBe(12);
		for (const page of players) await expect(page.locator('[data-position][data-state="hidden"]')).toHaveCount(12);
		// There is no turn timer.
		await expect(players[0]!.getByText(/\d+s$/)).toHaveCount(0);

		const dbPlayers = await admin.players(sessionId);
		const nicknameOf = (playerId: string) => dbPlayers.find((p) => p.id === playerId)!.nickname;
		const pageOf = (playerId: string) => players[NICKNAMES.indexOf(nicknameOf(playerId))]!;
		const [firstId, secondId] = game.turn_order as [string, string, string];
		const first = pageOf(firstId);
		const second = pageOf(secondId);
		const pairs = pairPositions(layout);

		// 8–9. A successful match awards one point and the same player flips again.
		await expect(first.getByText('Your turn!')).toBeVisible({ timeout: UI_TIMEOUT });
		await flip(first, pairs[0]![0]);
		await flip(first, pairs[0]![1]);
		await expect(first.locator(`[data-position="${pairs[0]![1]}"]`)).toHaveAttribute('data-state', 'matched');
		await expect(first.getByText('Your turn!')).toBeVisible();

		// 11. The scoreboard synchronises across browsers.
		for (const page of [host, ...players]) {
			await expect(scoreEntry(page, nicknameOf(firstId), 1)).toBeVisible({ timeout: UI_TIMEOUT });
		}

		// 10. An unsuccessful match advances the turn (after the reveal interval).
		await flip(first, pairs[1]![0]);
		await flip(first, pairs[2]![0]);
		await expect(first.locator('[data-state="flipped"]')).toHaveCount(2);
		await expect(second.getByText('Your turn!')).toBeVisible({ timeout: UI_TIMEOUT });
		expect((await admin.game(sessionId)).active_player_id).toBe(secondId);

		// The matched pair stays face up for everyone after the turn passed.
		for (const page of [host, ...players]) {
			for (const position of pairs[0]!) {
				await expect(page.locator(`[data-position="${position}"]`)).toHaveAttribute('data-state', 'matched');
			}
			await expect(page.locator('[data-state="matched"]')).toHaveCount(2);
		}

		// 12. The second player finds every remaining pair and the game completes.
		const remaining = pairs.slice(1);
		for (const [i, [a, b]] of remaining.entries()) {
			await flip(second, a);
			if (i < remaining.length - 1) {
				await flip(second, b);
			} else {
				// The final match ends the game: the board is replaced by the results screen.
				const card = second.locator(`[data-position="${b}"]`);
				await expect(card).toHaveAttribute('aria-disabled', 'false', { timeout: UI_TIMEOUT });
				await card.click();
			}
		}

		// 13. All participants see the same final results.
		const winner = nicknameOf(secondId);
		await expect(second.getByRole('heading', { name: 'You won! 🎉' })).toBeVisible({ timeout: UI_TIMEOUT });
		for (const page of [host, ...players.filter((p) => p !== second)]) {
			await expect(page.getByRole('heading', { name: `${winner} wins!` })).toBeVisible({ timeout: UI_TIMEOUT });
		}
		const finalGame = await admin.game(sessionId);
		expect(finalGame).toMatchObject({ status: 'completed', end_reason: 'board_cleared', winner_ids: [secondId] });
		const scores = Object.fromEntries((await admin.players(sessionId)).map((p) => [p.nickname, p.score]));
		expect(scores[nicknameOf(firstId)]).toBe(1);
		expect(scores[winner]).toBe(5);

		for (const page of [host, ...players]) {
			const rankings = page.getByRole('list', { name: 'Final rankings' });
			await expect(rankings).toContainText(winner);
			await expect(rankings).toContainText('5 pairs found');
			await expect(page.getByText('All pairs were found')).toBeVisible();
		}

		// 14. Refreshing a page does not erase persisted results.
		for (const page of [host, ...players]) {
			await page.reload();
			await expect(page.getByRole('list', { name: 'Final rankings' })).toContainText(winner, { timeout: UI_TIMEOUT });
		}
	} finally {
		await admin.cleanup();
	}
});

test('Fill in the Blanks with groups: choose, type, reveal and group scorecards', async ({ browser }) => {
	const admin = new SupabaseAdmin(config!.url, config!.secretKey);
	try {
		const host = await signInHost(browser, admin);
		await host.goto('/dashboard/sessions/new');
		await host.getByLabel('Session name').fill('E2E grammar');
		await host.getByText('Fill in the Blanks', { exact: true }).click();
		await host.locator('label', { hasText: /^6\s*sentences$/ }).click();
		await host.locator('label', { hasText: '2 groups' }).click();
		const { joinCode, sessionId } = await createdSession(host, admin);

		const chooser = await joinAs(browser, joinCode, 'Kiezer', '🦊', 'Beginner');
		const typer = await joinAs(browser, joinCode, 'Typer', '🐼', 'Advanced');
		await expect(chooser.getByText('pick each answer from four options')).toBeVisible();
		await expect(typer.getByText('type each answer yourself')).toBeVisible();
		admin.trackUsers((await admin.players(sessionId)).map((p) => p.user_id));
		await expect(host.getByText('2 joined')).toBeVisible({ timeout: UI_TIMEOUT });
		await host.getByRole('button', { name: /Start game/ }).click();

		// Round 1: the chooser picks the right option; the typer types a wrong answer.
		await expect(chooser.getByText('Sentence 1 of 6')).toBeVisible({ timeout: UI_TIMEOUT });
		const game = await admin.game(sessionId);
		const answer = await admin.roundAnswer(game.id, 0);
		await expect(typer.getByRole('group', { name: 'Answer options' })).toHaveCount(0);
		await chooser.getByRole('group', { name: 'Answer options' }).getByRole('button', { name: answer, exact: true }).click();
		await expect(chooser.getByText(/Answer locked in/)).toBeVisible({ timeout: UI_TIMEOUT });
		await typer.getByLabel('Your answer for the blank').fill('fout');
		await typer.getByRole('button', { name: 'Submit' }).click();

		// The round closes and everyone sees the answer.
		await expect(chooser.getByText('Correct! +1 point.')).toBeVisible({ timeout: UI_TIMEOUT });
		await expect(typer.getByText(/Not quite\. The answer is/)).toBeVisible({ timeout: UI_TIMEOUT });
		await expect(host.getByTestId('blank')).toHaveText(answer, { timeout: UI_TIMEOUT });

		// The next sentence starts by itself; the host can close it early.
		await expect(chooser.getByText('Sentence 2 of 6')).toBeVisible({ timeout: UI_TIMEOUT });
		await host.getByRole('button', { name: /Reveal answer now/ }).click();
		await expect(typer.getByText(/No answer this time/)).toBeVisible({ timeout: UI_TIMEOUT });

		// Each group has its own scorecard; the host ends the game.
		await expect(host.locator('[data-group]').filter({ visible: true })).toHaveCount(2);
		await host.getByRole('button', { name: /End game/ }).click();
		await host.getByRole('button', { name: /Confirm: end game now/ }).click();

		const players = await admin.players(sessionId);
		const chooserGroup = players.find((p) => p.nickname === 'Kiezer')!.group_number!;
		expect((await admin.game(sessionId)).winning_groups).toEqual([chooserGroup]);
		await expect(chooser.getByRole('heading', { name: 'Your group won! 🎉' })).toBeVisible({ timeout: UI_TIMEOUT });
		await expect(typer.getByRole('heading', { name: `Group ${chooserGroup} wins!` })).toBeVisible({ timeout: UI_TIMEOUT });
		await expect(host.getByRole('list', { name: 'Group rankings' })).toBeVisible();
		await expect(host.getByRole('list', { name: 'Final rankings' })).toContainText('1 of 6 correct');
	} finally {
		await admin.cleanup();
	}
});
