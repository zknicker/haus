import { finishThoughtPhrase, thoughtReasoningExcerptMaxLength } from '@haus/api';

/** What a thought is phrased from: a reasoning excerpt, or a Codex status title. */
export type ThoughtSource =
    | { kind: 'reasoning'; reasoning: string }
    | { kind: 'title'; title: string };

/** A phrase to show, or `skip` when the source is only the Agent's own housekeeping. */
export type ThoughtSummary = { kind: 'phrase'; text: string } | { kind: 'skip' };

/** Phrases one thought source, or null when it cannot and the caller should fall back. */
export interface ThoughtSummarizer {
    summarize(source: ThoughtSource): Promise<ThoughtSummary | null>;
}

export const thoughtSummaryModel = 'gemini-3.5-flash-lite';
/** Bumped whenever the prompt changes, so eval runs name the wording they measured. */
export const thoughtSummaryPromptVersion = 'thought-v3-skip';
const thoughtSummaryTimeoutMs = 4000;
const thoughtAnswerMaxWords = 10;
const skipAnswer = 'SKIP';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${thoughtSummaryModel}:generateContent`;

const systemPrompt = [
    "Rewrite this agent's private reasoning, or its short status title, as one short",
    'first-person line, as if the agent were thinking out loud to a teammate about the',
    'work it is doing right now for the person it is helping (max 8 words). Follow the',
    'opening you are given so lines vary the way a person talks; its example shows only',
    'the shape, so never reuse its words. No names of secrets, no quotes, no trailing',
    'period. Each message is independent; never answer or continue the reasoning.',
    'Reply with the line only.',
    `Reply with exactly ${skipAnswer} instead when the input is only the agent's own`,
    'housekeeping: reading its own notes, memory, manual, instructions, or skills;',
    'checking its inbox or messages; claiming, assigning, or updating tasks; deciding',
    'whether or how to reply; or reading earlier conversation just to get oriented. When',
    "the input also names work on the person's request — reading data, debugging, fixing,",
    'drafting, scheduling something they asked for — describe that work instead. When in',
    'doubt, describe the work.',
].join(' ');

/**
 * One opening is drawn per request so a run's bubbles don't all start "I'm".
 * Each fits any kind of work, so the draw never forces a false claim.
 */
export const thoughtOpenings = [
    'Start with "I\'m" (e.g. "I\'m checking last week\'s Halloween bids").',
    'Start with a bare verb, no pronoun (e.g. "Pulling today\'s royalties first").',
    'Start with "Now" or "Next" (e.g. "Now patching the chart args").',
    'Start with "I think", "I need to", or "I want to" (e.g. "I need to rerun the chart").',
    'Start with a short reaction like "Hmm,", "OK,", or "Ah," (e.g. "Hmm, the chart wants a new format").',
    'Start with the thing being worked on (e.g. "The UK numbers look delayed").',
] as const;

/**
 * Gemini 3.5 Flash-Lite through the Gemini API: one stateless request per
 * source, minimal thinking, a handful of output tokens, and a four-second
 * deadline. `SKIP` drops the thought; any failure, refusal, or late answer
 * yields null, and the caller falls back locally. Nothing is kept after the call.
 */
export function createGeminiThoughtSummarizer(input: {
    apiKey: string;
    fetch?: typeof fetch;
    random?: () => number;
    timeoutMs?: number;
}): ThoughtSummarizer {
    const send = input.fetch ?? fetch;
    const random = input.random ?? Math.random;
    const timeoutMs = input.timeoutMs ?? thoughtSummaryTimeoutMs;
    return {
        async summarize(source) {
            try {
                const opening =
                    thoughtOpenings[Math.floor(random() * thoughtOpenings.length)] ??
                    thoughtOpenings[0];
                const response = await send(endpoint, {
                    body: JSON.stringify(requestBody(source, opening)),
                    headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey },
                    method: 'POST',
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!response.ok) {
                    return null;
                }
                const text = readAnswer(await response.json());
                if (text && isSkip(text)) {
                    return { kind: 'skip' };
                }
                // The prompt asks for eight words; the looser cap keeps a slightly long answer whole.
                const phrase = text ? finishThoughtPhrase(text, thoughtAnswerMaxWords) : null;
                return phrase ? { kind: 'phrase', text: phrase } : null;
            } catch {
                // A thought is presentation only: the caller condenses locally instead.
                return null;
            }
        },
    };
}

function requestBody(source: ThoughtSource, opening: string) {
    const text =
        source.kind === 'title'
            ? `<title>\n${source.title}\n</title>\n${opening}`
            : `<reasoning>\n${source.reasoning.slice(0, thoughtReasoningExcerptMaxLength)}\n</reasoning>\n${opening}`;
    return {
        contents: [{ parts: [{ text }], role: 'user' }],
        generationConfig: {
            maxOutputTokens: 32,
            temperature: 0.8,
            thinkingConfig: { thinkingLevel: 'minimal' },
        },
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };
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
