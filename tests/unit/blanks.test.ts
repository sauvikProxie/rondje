import { describe, expect, test } from 'vitest';
import {
	answerModeFor,
	isCorrectAnswer,
	normalizeAnswer,
	questionError,
	splitSentence
} from '../../src/lib/game/blanks';

describe('Fill in the Blanks', () => {
	test('Beginner and Elementary players choose; Intermediate and Advanced players type', () => {
		expect(answerModeFor('beginner')).toBe('choice');
		expect(answerModeFor('elementary')).toBe('choice');
		expect(answerModeFor('intermediate')).toBe('type');
		expect(answerModeFor('advanced')).toBe('type');
	});

	test('typed answers ignore case, extra spaces, typographic apostrophes and final punctuation', () => {
		expect(isCorrectAnswer('  Werk ', 'werk')).toBe(true);
		expect(isCorrectAnswer('werk.', 'werk')).toBe(true);
		expect(isCorrectAnswer('auto’s', "auto's")).toBe(true);
		expect(isCorrectAnswer('ben  gegaan', 'ben gegaan')).toBe(true);
		expect(normalizeAnswer('  HET!? ')).toBe('het');
	});

	test('typed answers must otherwise be exact', () => {
		expect(isCorrectAnswer('werkt', 'werk')).toBe(false);
		expect(isCorrectAnswer('autos', "auto's")).toBe(false);
		expect(isCorrectAnswer('', 'werk')).toBe(false);
	});

	test('a sentence is split around its blank', () => {
		expect(splitSentence('Ik ___ (werken) thuis.')).toEqual(['Ik ', ' (werken) thuis.']);
		expect(splitSentence('___ kinderen spelen.')).toEqual(['', ' kinderen spelen.']);
	});

	test('question validation mirrors the database constraints', () => {
		const valid = { sentence: 'Ik ___ thuis.', answer: 'werk', distractors: ['werkt', 'werken', 'gewerkt'] };
		expect(questionError(valid)).toBeNull();
		expect(questionError({ ...valid, sentence: 'Ik werk thuis.' })).toMatch(/blank/);
		expect(questionError({ ...valid, sentence: 'Ik ___ ___.' })).toMatch(/blank/);
		expect(questionError({ ...valid, distractors: ['werkt', 'werken'] })).toMatch(/three/);
		expect(questionError({ ...valid, distractors: ['werkt', 'Werkt', 'werken'] })).toMatch(/distinct/);
		expect(questionError({ ...valid, distractors: ['Werk', 'werkt', 'werken'] })).toMatch(/equals/);
	});
});
