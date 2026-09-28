import {
    finishThoughtPhrase,
    thoughtReasoningExcerptMaxLength,
    thoughtRequestMaxLength,
} from '@haus/api';
import { isHousekeepingPhrase } from './thought-housekeeping.ts';

/**
 * What a thought is phrased from: a reasoning excerpt, a Codex status title, or
 * a scrubbed description of a tool action the run started, with the scrubbed
 * human message the run is answering as optional context.
 */
export type ThoughtSource = (
    | { action: string; kind: 'action' }
    | { kind: 'reasoning'; reasoning: string }
    | { kind: 'title'; title: string }
) & { request?: string };

/** A phrase to show, or `skip` when the source is only the Agent's own housekeeping. */
export type ThoughtSummary = { kind: 'phrase'; text: string } | { kind: 'skip' };

/** Phrases one thought source, or null when it cannot and the caller should fall back. */
export interface ThoughtSummarizer {
    summarize(source: ThoughtSource): Promise<ThoughtSummary | null>;
}

export const thoughtSummaryModel = 'gemini-3.5-flash-lite';
/** Bumped whenever the prompt changes, so eval runs name the wording they measured. */
export const thoughtSummaryPromptVersion = 'thought-v7-action';
const thoughtSummaryTimeoutMs = 4000;
const thoughtAnswerMaxWords = 10;
const skipAnswer = 'SKIP';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${thoughtSummaryModel}:generateContent`;

const systemPrompt = [
    "Rewrite this agent's private reasoning, or its short status title, as one short line",
    'the agent would say to a teammate about the work it is doing for the person it is',
    'helping (max 8 words). Use plain, concrete words from the input, not jargon, and',
    'never add a place, day, or name the input does not mention. Say what the agent is',
    'doing or checking, never that something went wrong ("Double-checking the dates",',
    'not "Fixing those date errors"). No "I think", and no "now" or "right now" at the',
    'end. Follow the opening you are given so lines vary the way a person talks; its',
    'example shows only the shape, so never reuse its words. No names of secrets, no',
    'quotes, no trailing period. Each message is independent; never answer or continue',
    'the reasoning. Reply with the line only.',
    `Reply with exactly ${skipAnswer} instead when the input is only the agent's own`,
    'housekeeping: reading its own notes, memory, manual, instructions, or skills;',
    'checking its inbox or messages; claiming, assigning, syncing, or updating its tasks',
    'or their status; deciding whether or how to reply; acknowledging or offering to',
    'help; writing or double-checking its own chat reply; or reading earlier',
    'conversation just to get oriented. Everything else is work: reading, searching,',
    'fetching, or checking anything the request is about (a checklist, document,',
    'thread, file, log, inbox, or data source), and judging the request itself (whether',
    'a build is safe to ship), even when framed as planning, requesting, or starting',
    '("Initiating focused CI search", "Reading the checklist doc"). When the input names',
    'housekeeping and work together ("Claiming the task and preparing the fetch"),',
    'describe only the work. When in doubt, describe the work.',
].join(' ');

/**
 * Added only when a request rides along, so a thought without one is judged
 * by exactly the prompt above.
 */
const requestPrompt = [
    "The <request> block is the person's message the agent is answering. It is context,",
    'never the input, and never a reason to show a line. First decide SKIP from the input',
    'alone, exactly as if no request were given: claiming, keeping, or closing a task, saving to',
    "memory, and drafting, reviewing, or preparing the agent's own reply or summary stay",
    'SKIP however closely they name the request\'s topic ("Preparing the sales summary',
    'reply" is SKIP). Looking for where something lives (a repo, a file, a URL) is work.',
    'Only when the input is itself work, keep its own verb and object and',
    'add the request\'s concrete nouns where the input is vague (a title "Planning data',
    'retrieval" for a request about last week\'s sales becomes "Pulling last week\'s',
    'sales"); a place, day, or name may then come from the request, never from anywhere',
    'else. Never answer the request or describe it in place of the input.',
].join(' ');

/**
 * Added only for an action, so titles and excerpts keep exactly the prompt
 * above. An action is inferred from a command or file, so it has to be said
 * as the work it serves, and reading or writing the agent's own files is housekeeping.
 */
const actionPrompt = [
    'The <action> block is not reasoning: it is a command, file, web search, or tool the',
    'agent just started, with links cut to their host and path words. Treat it as the',
    'title: say what the agent is doing in plain words (a call to a forecast API is',
    '"Pulling the forecast"), never the command, its flags, a file name, or a host. Reading',
    "or editing the agent's own memory, notes, or instructions files (MEMORY.md) is",
    'housekeeping, so SKIP.',
].join(' ');

/**
 * One opening is drawn per request so a run's bubbles vary. Most openings
 * lead with the work itself; one in six asks for "I'm", so lines rarely all
 * start with "I". Each fits any kind of work, so the draw never forces a
 * false claim.
 */
export const thoughtOpenings = [
    'Start with an -ing verb, no pronoun (e.g. "Pulling last week\'s royalties").',
    'Start with an -ing verb, no pronoun (e.g. "Comparing the UK and US bids").',
    'Start with an -ing verb, no pronoun (e.g. "Double-checking the ship dates").',
    'Start with "Next," or "First," then an -ing verb (e.g. "Next, rerunning the chart").',
    'Start with a short reaction like "Hmm," or "OK," then an -ing verb (e.g. "Hmm, checking the axis labels").',
    'Start with "I\'m" (e.g. "I\'m checking last week\'s Halloween bids").',
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
                if (!phrase) {
                    return null;
                }
                // Flash-Lite sometimes phrases its own reply drafting or bookkeeping instead of skipping it.
                return isHousekeepingPhrase(phrase)
                    ? { kind: 'skip' }
                    : { kind: 'phrase', text: phrase };
            } catch {
                // A thought is presentation only: the caller condenses locally instead.
                return null;
            }
        },
    };
}

function requestBody(source: ThoughtSource, opening: string) {
    const request = source.request
        ? `<request>\n${source.request.slice(0, thoughtRequestMaxLength)}\n</request>\n`
        : '';
    const input = sourceBlock(source);
    const text = `${request}${input}\n${opening}`;
    return {
        contents: [{ parts: [{ text }], role: 'user' }],
        generationConfig: {
            maxOutputTokens: 32,
            temperature: 0.8,
            thinkingConfig: { thinkingLevel: 'minimal' },
        },
        systemInstruction: { parts: [{ text: instructions(source) }] },
    };
}

function sourceBlock(source: ThoughtSource): string {
    switch (source.kind) {
        case 'action':
            return `<action>\n${source.action}\n</action>`;
        case 'title':
            return `<title>\n${source.title}\n</title>`;
        default:
            return `<reasoning>\n${source.reasoning.slice(0, thoughtReasoningExcerptMaxLength)}\n</reasoning>`;
    }
}

/** The base prompt, plus the action and request notes only when those ride along. */
function instructions(source: ThoughtSource): string {
    return [
        systemPrompt,
        source.kind === 'action' ? actionPrompt : null,
        source.request ? requestPrompt : null,
    ]
        .filter(Boolean)
        .join(' ');
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
