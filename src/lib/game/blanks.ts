import type { ProficiencyLevel } from './constants';

/**
 * Fill in the Blanks rules shared with the database (spec 23.4). The server
 * decides whether an answer is correct (public.submit_answer()); these helpers
 * mirror its rules for tests and for the UI.
 */

export const BLANK = '___';
export const ANSWER_MAX_LENGTH = 60;

export type AnswerMode = 'choice' | 'type';

/** Beginner and Elementary players pick from four options; the others type the answer. */
export function answerModeFor(level: ProficiencyLevel): AnswerMode {
	return level === 'beginner' || level === 'elementary' ? 'choice' : 'type';
}

/**
 * Normalised answer (mirrors private.normalize_answer()): case, surrounding and
 * repeated whitespace, typographic apostrophes and final punctuation are
 * ignored.
 */
export function normalizeAnswer(answer: string): string {
	return answer
		.trim()
		.toLowerCase()
		.replace(/[’‘]/g, "'")
		.replace(/\s+/g, ' ')
		.replace(/\s*[.!?]+$/, '');
}

export function isCorrectAnswer(answer: string, correct: string): boolean {
	return normalizeAnswer(answer) === normalizeAnswer(correct);
}

/** The text before and after the blank. */
export function splitSentence(sentence: string): [before: string, after: string] {
	const index = sentence.indexOf(BLANK);
	if (index < 0) return [sentence, ''];
	return [sentence.slice(0, index), sentence.slice(index + BLANK.length)];
}

export interface GrammarQuestion {
	sentence: string;
	answer: string;
	distractors: readonly string[];
}

/**
 * Why a question is unusable, or null (mirrors the grammar_questions CHECK
 * constraints): exactly one blank, an answer of 1–40 characters and three
 * distinct wrong options that differ from the answer.
 */
export function questionError(question: GrammarQuestion): string | null {
	const blanks = question.sentence.split(BLANK).length - 1;
	if (blanks !== 1) return 'sentence must contain exactly one blank';
	const answer = question.answer.trim();
	if (answer !== question.answer || answer.length < 1 || answer.length > 40) return 'invalid answer';
	if (question.distractors.length !== 3) return 'needs exactly three distractors';
	const normalized = question.distractors.map(normalizeAnswer);
	if (new Set(normalized).size !== 3) return 'distractors must be distinct';
	if (normalized.includes(normalizeAnswer(answer))) return 'a distractor equals the answer';
	if (question.distractors.some((d) => d.trim() !== d || d === '')) return 'invalid distractor';
	return null;
}
