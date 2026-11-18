import {
    finishThoughtPhrase,
    narratesRequest,
    thoughtReasoningExcerptMaxLength,
    thoughtRequestMaxLength,
} from '@haus/api';
import { isHousekeepingPhrase } from './thought-housekeeping.ts';
import { skipAnswer, thoughtCue, thoughtInstructions } from './thought-summary-prompt.ts';

/**
 * What a thought is phrased from: a reasoning excerpt, a Codex status title, or
 * a scrubbed description of a tool action the run started (with a scrubbed
 * excerpt of what it returned once it has finished), with the scrubbed
 * human message the run is answering and the run's last shown lines in that
 * Chat (oldest first) as optional context. `requester` is that message's
 * author's display name; it never reaches the model and only filters a line
 * that restates their ask by name.
 */
export type ThoughtSource = (
    | { action: string; kind: 'action'; result?: string }
    | { kind: 'reasoning'; reasoning: string }
    | { kind: 'title'; title: string }
) & { previous?: readonly string[]; request?: string; requester?: string };

/**
 * A phrase to show, or `skip` when the source is only the Agent's own
 * housekeeping. `stream` is the model's workstream judgment once a line has
 * shown: `new` starts a different part of the work or states a new result,
 * `still` continues the work already shown. A request's first line is `new`.
 */
export type ThoughtSummary =
    | { kind: 'phrase'; stream: ThoughtStream; text: string }
    | { kind: 'skip' };
export type ThoughtStream = 'new' | 'still';

/** Phrases one thought source, or null when it cannot and the caller should fall back. */
export interface ThoughtSummarizer {
    summarize(source: ThoughtSource): Promise<ThoughtSummary | null>;
}

export const thoughtSummaryModel = 'gemini-3.5-flash-lite';
/** Bumped whenever the prompt changes, so eval runs name the wording they measured. */
export const thoughtSummaryPromptVersion = 'thought-v21-findings';
const thoughtSummaryTimeoutMs = 4000;
const thoughtAnswerMaxWords = 10;
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${thoughtSummaryModel}:generateContent`;
/**
 * Gemini 3.5 Flash-Lite through the Gemini API: one stateless request per
 * source, minimal thinking, a handful of output tokens, and a four-second
 * deadline. `SKIP` drops the thought; any failure, refusal, or late answer
 * yields null, and the caller falls back locally. Nothing is kept after the call.
 */
export function createGeminiThoughtSummarizer(input: {
    apiKey: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}): ThoughtSummarizer {
    const send = input.fetch ?? fetch;
    const timeoutMs = input.timeoutMs ?? thoughtSummaryTimeoutMs;
    return {
        async summarize(source) {
            try {
                const response = await send(endpoint, {
                    body: JSON.stringify(requestBody(source)),
                    headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey },
                    method: 'POST',
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!response.ok) {
                    return null;
                }
                const answer = readStream(readAnswer(await response.json()));
                if (answer && isSkip(answer.text)) {
                    return { kind: 'skip' };
                }
                // The prompt asks for eight words; the looser cap keeps a slightly long answer whole.
                const phrase = answer
                    ? finishThoughtPhrase(answer.text, thoughtAnswerMaxWords)
                    : null;
                if (!(answer && phrase)) {
                    return null;
                }
                // Flash-Lite sometimes phrases its own reply drafting, bookkeeping, or the ask itself instead of skipping it.
                return isHousekeepingPhrase(phrase) || narratesRequest(phrase, source.requester)
                    ? { kind: 'skip' }
                    : { kind: 'phrase', stream: answer.stream, text: phrase };
            } catch {
                // A thought is presentation only: the caller condenses locally instead.
                return null;
            }
        },
    };
}

function requestBody(source: ThoughtSource) {
    const request = source.request
        ? `<request>\n${source.request.slice(0, thoughtRequestMaxLength)}\n</request>\n`
        : '';
    const input = sourceBlock(source);
    const previous = previousNote(source.previous);
    const cue = thoughtCue(source);
    const text = `${request}${input}${previous}\n${cue}`;
    return {
        contents: [{ parts: [{ text }], role: 'user' }],
        generationConfig: {
            maxOutputTokens: 32,
            temperature: 0.8,
            thinkingConfig: { thinkingLevel: 'minimal' },
        },
        systemInstruction: { parts: [{ text: thoughtInstructions(source) }] },
    };
}

function sourceBlock(source: ThoughtSource): string {
    switch (source.kind) {
        case 'action':
            return source.result
                ? `<action>\n${source.action}\n</action>\n<result>\n${source.result}\n</result>`
                : `<action>\n${source.action}\n</action>`;
        case 'title':
            return `<title>\n${source.title}\n</title>`;
        default:
            return `<reasoning>\n${source.reasoning.slice(0, thoughtReasoningExcerptMaxLength)}\n</reasoning>`;
    }
}

/**
 * The run's shown lines in this Chat, oldest first. Present only once one has
 * shown, so a run's first thought is phrased by exactly the prompt without it.
 */
function previousNote(previous: readonly string[] | undefined): string {
    if (!previous?.length) {
        return '';
    }
    return `\nAlready shown: ${previous.map((line) => `"${line}"`).join(', then ')}.`;
}

/**
 * The answer's workstream label and line: `NEW: …` or `STILL: …` after a
 * shown line; an unlabeled answer (every first line) is new.
 */
function readStream(text: string | null): { stream: ThoughtStream; text: string } | null {
    if (!text) {
        return null;
    }
    const label = /^\W*(new|still)\W*[:\-–—]\s*/iu.exec(text);
    if (!label) {
        // "Still digging…" without a label continues the work too.
        return { stream: /^still\s+[a-z]+ing\b/iu.test(text) ? 'still' : 'new', text };
    }
    const stream = label[1]?.toLowerCase() === 'still' ? 'still' : 'new';
    return { stream, text: text.slice(label[0].length) };
}

/** `SKIP`, allowing the stray punctuation or quoting a model adds. */
function isSkip(text: string): boolean {
    return text.replace(/[^A-Za-z]/gu, '').toUpperCase() === skipAnswer;
}

/** The first candidate's non-thought text, or null. */
function readAnswer(body: unknown): string | null {
    const candidate = isRecord(body) && Array.isArray(body.candidates) ? body.candidates[0] : null;
    const content = isRecord(candidate) ? candidate.content : null;
    const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
    const text = parts
        .filter((part) => isRecord(part) && part.thought !== true && typeof part.text === 'string')
        .map((part) => (part as { text: string }).text)
        .join('')
        .trim();
    return text.length > 0 ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
