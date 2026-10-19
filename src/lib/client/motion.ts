/**
 * Helpers for presentational motion. Nothing here affects game state.
 *
 * Celebrations and count-ups play only for screens that appear while the
 * page is open (a game ending live), not when a page is first loaded or
 * refreshed: the root layout marks the app ready after the first render,
 * and components mounted during that render see `false`.
 */

let ready = false;

/** Called once by the root layout after the initial (hydration) render. */
export function markAppReady() {
	ready = true;
}

export function prefersReducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether a component mounting now should play its entrance celebration. */
export function shouldCelebrate(): boolean {
	return ready && !prefersReducedMotion();
}
