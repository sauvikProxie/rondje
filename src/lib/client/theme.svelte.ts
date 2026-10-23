/**
 * Light/dark colour theme. The initial theme is applied before first paint by
 * the inline script in src/app.html (same storage key and resolution rules);
 * this module takes over once the app is running.
 *
 * Without a stored choice the theme follows the system setting, live. Once the
 * user toggles, that choice is remembered on this device.
 */
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rondje-theme';
const THEME_COLORS: Record<Theme, string> = { light: '#FDF0D5', dark: '#0D1F1C' };

function readStored(): Theme | null {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return value === 'light' || value === 'dark' ? value : null;
	} catch {
		return null;
	}
}

function writeStored(value: Theme) {
	try {
		localStorage.setItem(STORAGE_KEY, value);
	} catch {
		// Private mode or blocked storage: the choice still applies for this page.
	}
}

function apply(value: Theme) {
	document.documentElement.dataset.theme = value;
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[value]);
}

class ThemeState {
	/** null until known on the client (SSR cannot know the visitor's theme). */
	current = $state<Theme | null>(null);
	#initialised = false;

	/** Idempotent; call from onMount. */
	init() {
		if (!browser || this.#initialised) return;
		this.#initialised = true;

		const system = matchMedia('(prefers-color-scheme: dark)');
		const fromDom = document.documentElement.dataset.theme;
		this.current =
			fromDom === 'light' || fromDom === 'dark' ? fromDom : (readStored() ?? (system.matches ? 'dark' : 'light'));
		apply(this.current);

		system.addEventListener('change', (event) => {
			if (readStored()) return;
			this.current = event.matches ? 'dark' : 'light';
			apply(this.current);
		});
	}

	toggle() {
		this.init();
		const next: Theme = this.current === 'dark' ? 'light' : 'dark';
		this.current = next;
		apply(next);
		writeStored(next);
	}
}

export const theme = new ThemeState();
