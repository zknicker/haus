import { afterEach, describe, expect, test } from 'bun:test';
import { cleanups, drainCleanups, live, startedRun } from '../runner-test-server.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { openFileCredentialStore, piLoginsDir } from './pi-credentials.ts';
import { createPiHarness } from './pi-driver.ts';
import { agentDir, launch } from './pi-faux-run.ts';
import { createPiModels } from './pi-models.ts';
import type { WebSearchProvider } from './pi-web-search.ts';

const liveTest = process.env.HAUS_RUN_LIVE_RUNNER_PI_SEARCH_TEST === '1' ? test : test.skip;
const dataDir = process.env.HAUS_RUNNER_DATA_DIR ?? '/data';

afterEach(drainCleanups);

async function searchedTurn(provider: WebSearchProvider, modelId: string) {
    const harness = createPiHarness({
        log: (line) => process.stderr.write(`${line}\n`),
        maxWarm: 1,
        models: createPiModels({
            apiKeys: {
                geminiApiKey: process.env.HAUS_RUNNER_GEMINI_API_KEY ?? null,
                openrouterApiKey: process.env.HAUS_RUNNER_OPENROUTER_API_KEY ?? null,
                xaiApiKey: process.env.HAUS_RUNNER_XAI_API_KEY ?? null,
            },
            credentials: openFileCredentialStore(piLoginsDir(dataDir)),
        }),
        webSearch: [provider],
    });
    cleanups.push(() => harness.close());
    const { run } = await startedRun();
    const session = await harness
        .factory(launch(await agentDir(), run.tools, modelId))
        .openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });
    const turn = await session.startTurn({
        prompt: 'Search the web for the current stable Bun release and answer with its version number only.',
        signal: live(),
    });
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
    }
    return events;
}

function searchResults(events: readonly TurnEvent[]) {
    return events.flatMap((event) =>
        event.type === 'tool-result' &&
        (event.toolName === 'webSearch' || event.toolName === 'web_search')
            ? [event.output]
            : []
    );
}

describe('native web search against live providers', () => {
    liveTest(
        'the ChatGPT plan searches inside the response',
        async () => {
            const events = await searchedTurn('openai-codex', 'gpt-5.6-sol');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'xAI searches inside the response',
        async () => {
            const events = await searchedTurn('xai', 'grok-4.7');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'Gemini answers web_search with grounded sources',
        async () => {
            const events = await searchedTurn('google', 'gemini-2.5-pro');

            expect(String(searchResults(events)[0])).toContain('Sources:');
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'an OpenRouter Chat Completions model searches through the server tool',
        async () => {
            const events = await searchedTurn('openrouter', 'moonshotai/kimi-k2.6');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'an OpenRouter Claude model searches through the server tool on the Messages API',
        async () => {
            const events = await searchedTurn('openrouter', 'anthropic/claude-fable-5');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );
});
