import { finishThoughtPhrase } from './thought-phrase.ts';

/** Condenses one reasoning block into a status phrase, or null to drop it. */
export interface ThoughtSummarizer {
    summarize(reasoning: string): Promise<string | null>;
}

export const thoughtSummaryModel = 'gemini-3.5-flash-lite';
const thoughtSummaryTimeoutMs = 4000;
const reasoningInputLimit = 3000;
const thoughtAnswerMaxWords = 10;
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${thoughtSummaryModel}:generateContent`;

const systemPrompt = [
    "Rewrite this agent's private reasoning as one short first-person line, as if the",
    'agent were thinking out loud to a teammate about what it is doing right now (max 8',
    'words). Follow the opening you are given so lines vary the way a person talks.',
    'No names of secrets, no quotes, no trailing period. Each message is independent;',
    'never answer or continue the reasoning. Reply with the line only.',
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
 * block, minimal thinking, a handful of output tokens, and a four-second
 * deadline. Any failure, refusal, or late answer drops the thought.
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
        async summarize(reasoning) {
            try {
                const response = await send(endpoint, {
                    body: JSON.stringify(
                        requestBody(
                            reasoning,
                            thoughtOpenings[Math.floor(random() * thoughtOpenings.length)] ??
                                thoughtOpenings[0]
                        )
                    ),
                    headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey },
                    method: 'POST',
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!response.ok) {
                    return null;
                }
                const text = readAnswer(await response.json());
                // The prompt asks for eight words; the looser cap keeps a slightly long answer whole.
                return text ? finishThoughtPhrase(text, thoughtAnswerMaxWords) : null;
            } catch {
                // A thought is presentation only: timeouts and transport failures drop it.
                return null;
            }
        },
    };
}

function requestBody(reasoning: string, opening: string) {
    return {
        contents: [
            {
                parts: [
                    {
                        text: `<reasoning>\n${reasoning.slice(0, reasoningInputLimit)}\n</reasoning>\n${opening}`,
                    },
                ],
                role: 'user',
            },
        ],
        generationConfig: {
            maxOutputTokens: 32,
            temperature: 0.8,
            thinkingConfig: { thinkingLevel: 'minimal' },
        },
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };
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
