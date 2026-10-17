<script lang="ts">
	import { page } from '$app/state';
	import Logo from '$lib/components/shared/Logo.svelte';

	let { email }: { email: string | null } = $props();

	const links = [
		{ href: '/dashboard', label: 'Sessions', icon: '🗂️', exact: true },
		{ href: '/dashboard/sessions/new', label: 'New session', icon: '➕', exact: true }
	];

	const isCurrent = (href: string, exact: boolean) =>
		exact ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

<!-- Desktop: side navigation -->
<nav
	aria-label="Host navigation"
	class="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r-2 border-ink/5 bg-surface/70 px-4 py-6 lg:flex"
>
	<Logo />
	<ul class="mt-8 space-y-1">
		{#each links as link (link.href)}
			<li>
				<a
					href={link.href}
					class="flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold transition-colors {isCurrent(
						link.href,
						link.exact
					)
						? 'bg-teal-soft text-teal-deep'
						: 'text-ink hover:bg-cream'}"
					aria-current={isCurrent(link.href, link.exact) ? 'page' : undefined}
				>
					<span aria-hidden="true">{link.icon}</span>{link.label}
				</a>
			</li>
		{/each}
	</ul>
	<div class="mt-auto space-y-2">
		{#if email}<p class="truncate px-2 text-sm text-ink-soft" title={email}>{email}</p>{/if}
		<form method="POST" action="/auth/logout">
			<button class="btn-ghost w-full">Sign out</button>
		</form>
	</div>
</nav>

<!-- Mobile: compact top bar + bottom navigation -->
<header class="flex items-center justify-between border-b-2 border-ink/5 bg-surface/80 px-4 py-3 lg:hidden">
	<Logo size="sm" />
	<form method="POST" action="/auth/logout">
		<button class="min-h-11 rounded-xl px-3 text-sm font-bold text-teal-deep">Sign out</button>
	</form>
</header>
<nav
	aria-label="Host navigation"
	class="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink/5 bg-surface lg:hidden"
>
	<ul class="mx-auto grid max-w-md grid-cols-2">
		{#each links as link (link.href)}
			<li>
				<a
					href={link.href}
					class="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold {isCurrent(
						link.href,
						link.exact
					)
						? 'text-teal-deep'
						: 'text-ink-soft'}"
					aria-current={isCurrent(link.href, link.exact) ? 'page' : undefined}
				>
					<span class="text-lg" aria-hidden="true">{link.icon}</span>{link.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
