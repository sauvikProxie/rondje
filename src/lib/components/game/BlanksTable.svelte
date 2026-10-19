<script lang="ts">
	import type { SessionSync } from '$lib/client/session-sync.svelte';
	import { ANSWER_MAX_LENGTH, isCorrectAnswer, splitSentence } from '$lib/game/blanks';
	import { GRAMMAR_TOPIC_LABELS } from '$lib/game/constants';
	import { playersInTurnOrder } from '$lib/game/view';
	import Confetti from '$lib/components/motion/Confetti.svelte';
	import Scoreboard from './Scoreboard.svelte';

	let { sync }: { sync: SessionSync } = $props();

	const view = $derived(sync.view);
	const round = $derived(view.game!.round!);
	const me = $derived(view.me);
	const players = $derived(playersInTurnOrder(view));
	const activePlayers = $derived(players.filter((p) => p.status === 'active'));
	const answeredCount = $derived(activePlayers.filter((p) => round.answered.includes(p.id)).length);

	const [before, after] = $derived(splitSentence(round.sentence));
	const reveal = $derived(round.phase === 'reveal');
	const lastRound = $derived(round.index + 1 >= round.count);
	/** My answer once submitted (or while it is being submitted). */
	const myAnswer = $derived(round.my_answer ?? sync.pendingAnswer);
	const myResult = $derived(reveal && me ? (round.results?.[me] ?? null) : null);
	const canAnswer = $derived(!!me && !reveal && myAnswer === null && !sync.busy);
	/** Sentences finished so far, for the progress bar along the top of the card. */
	const progress = $derived((round.index + (reveal ? 1 : 0)) / round.count);
	/** Which status message is shown; it eases in when it changes. */
	const statusKind = $derived(reveal ? `reveal-${myResult}` : myAnswer !== null ? 'locked' : 'open');

	let typed = $state('');
	let roundSeen = -1;
	$effect.pre(() => {
		// A new sentence starts with an empty answer field.
		if (round.index !== roundSeen) {
			roundSeen = round.index;
			typed = '';
		}
	});

	function submitTyped(event: SubmitEvent) {
		event.preventDefault();
		const answer = typed.trim();
		if (answer && canAnswer) void sync.answer(answer);
	}

	function optionState(option: string): 'correct' | 'wrong' | 'picked' | 'idle' {
		if (reveal && round.correct_answer !== null && isCorrectAnswer(option, round.correct_answer)) return 'correct';
		if (option === myAnswer) return reveal ? 'wrong' : 'picked';
		return 'idle';
	}

	const announcement = $derived.by(() => {
		const position = `Sentence ${round.index + 1} of ${round.count}.`;
		if (!reveal) return myAnswer === null ? position : `Answer locked in. ${answeredCount} of ${activePlayers.length} answered.`;
		const answer = `The answer is ${round.correct_answer}.`;
		if (myResult === true) return `${answer} You were correct.`;
		if (myResult === false) return `${answer} Your answer was not correct.`;
		return answer;
	});
</script>

<div class="grid animate-screen-in gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
	<div class="min-w-0 space-y-4">
		<section class="card-surface relative overflow-hidden p-5 sm:p-7" aria-labelledby="sentence-heading">
			<!-- Progress through the game: a slim bar along the top edge (decorative). -->
			<span class="absolute inset-x-0 top-0 h-1 bg-teal-soft" aria-hidden="true">
				<span
					class="block h-full origin-left bg-teal transition-transform duration-700 ease-out"
					style:transform="scaleX({progress})"
				></span>
			</span>
			<div class="flex flex-wrap items-center justify-between gap-2">
				{#key round.index}
					<p id="sentence-heading" class="animate-fade-up text-sm font-bold text-ink-soft">Sentence {round.index + 1} of {round.count}</p>
				{/key}
				<span class="pill bg-saffron-soft text-ink">{GRAMMAR_TOPIC_LABELS[round.topic]}</span>
			</div>
			<!-- The blank is always visibly marked; its content is the answer only once revealed. -->
			{#key round.index}
			<p class="mt-4 animate-fade-up text-2xl leading-relaxed font-extrabold break-words sm:text-3xl" lang="nl">
				{before}<span
					class="mx-1 inline-block min-w-[4.5ch] rounded-xl border-b-4 px-2 text-center align-baseline transition-colors duration-300
						{reveal ? 'border-teal-deep bg-teal-soft text-teal-deep' : myAnswer !== null ? 'border-saffron bg-saffron-soft' : 'border-ink/30 bg-ink/5 text-transparent'}"
					data-testid="blank"
					>{#if reveal}<span class="inline-block animate-drop-in">{round.correct_answer}</span>{:else if myAnswer !== null}<span
							class="inline-block animate-settle">{myAnswer}</span
						>{:else}<span aria-hidden="true">___</span><span class="sr-only">blank</span>{/if}</span
				>{after}
			</p>
			<p class="mt-3 animate-fade-up text-sm text-ink-soft [--i:1]"><span class="font-bold">English:</span> {round.translation}</p>
			{/key}
		</section>

		{#if round.options && (round.answer_mode === 'choice' || !me)}
			<div class="grid grid-cols-2 gap-3" role="group" aria-label="Answer options">
				{#each round.options as option (option)}
					{@const state = optionState(option)}
					<button
						type="button"
						lang="nl"
						class="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2 text-lg font-extrabold break-words transition-[color,background-color,border-color,transform] duration-200
							{state === 'correct'
							? 'animate-settle border-teal-deep bg-teal-soft text-teal-deep'
							: state === 'wrong'
								? 'animate-shake border-coral bg-coral-soft text-ink'
								: state === 'picked'
									? 'animate-settle border-saffron bg-saffron-soft text-ink'
									: 'border-ink/10 bg-surface text-ink'}
							{canAnswer ? 'cursor-pointer hover:-translate-y-0.5 hover:border-teal-deep active:translate-y-0 active:scale-[0.97]' : 'cursor-default'}"
						aria-disabled={!canAnswer}
						aria-pressed={option === myAnswer}
						onclick={() => canAnswer && void sync.answer(option)}
					>
						{#if state === 'correct'}<span class="inline-block animate-pop-in" aria-hidden="true">✓</span>{:else if state === 'wrong'}<span class="inline-block animate-pop-in" aria-hidden="true">✕</span>{/if}
						{option}
					</button>
				{/each}
			</div>
		{:else if round.answer_mode === 'type' && !reveal && myAnswer === null}
			<form class="card-surface flex flex-col gap-3 p-4 sm:flex-row sm:p-5" onsubmit={submitTyped}>
				<label for="blank-answer" class="sr-only">Your answer for the blank</label>
				<input
					id="blank-answer"
					class="field-input flex-1 text-lg"
					lang="nl"
					bind:value={typed}
					maxlength={ANSWER_MAX_LENGTH}
					placeholder="Type the missing word"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					disabled={!canAnswer}
				/>
				<button class="btn-primary shrink-0" disabled={!canAnswer || !typed.trim()}>Submit</button>
			</form>
		{/if}

		<div class="relative overflow-hidden rounded-2xl px-4 py-3 text-center font-bold transition-colors duration-300 {reveal ? (myResult === true ? 'bg-teal-soft text-teal-deep' : myResult === false ? 'bg-coral-soft text-ink' : 'bg-surface') : 'bg-saffron-soft'}" role="status">
			{#if myResult === true}<Confetti mode="burst" count={14} distance={70} />{/if}
			{#key statusKind}
			<span class="relative block {myResult === true ? 'animate-pop-in' : 'animate-fade-in'}">
			{#if reveal}
				{#if myResult === true}
					<span aria-hidden="true">🎉</span> Correct! +1 point.
				{:else if myResult === false}
					Not quite. The answer is <span lang="nl" class="text-teal-deep">{round.correct_answer}</span>.
				{:else if me}
					No answer this time. The answer is <span lang="nl" class="text-teal-deep">{round.correct_answer}</span>.
				{:else}
					The answer is <span lang="nl" class="text-teal-deep">{round.correct_answer}</span>.
				{/if}
				<span class="mt-1 block text-sm font-normal text-ink-soft">{lastRound ? 'Final results in a moment…' : 'Next sentence in a moment…'}</span>
			{:else if me && myAnswer !== null}
				Answer locked in. Waiting for the others… ({answeredCount} of {activePlayers.length})
			{:else if me}
				{round.answer_mode === 'choice' ? 'Pick the word that fits the blank.' : 'Type the word that fits the blank.'}
			{:else}
				{answeredCount} of {activePlayers.length} players answered.
			{/if}
			</span>
			{/key}
		</div>

		<div class="lg:hidden">
			<Scoreboard {view} {players} online={sync.online} />
		</div>
	</div>

	<aside class="hidden lg:block">
		<Scoreboard {view} {players} online={sync.online} />
	</aside>

	<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
</div>
