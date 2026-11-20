import { afterEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import {
    type ModelConnectionCredential,
    modelOAuthCredentialSchema,
    modelProviderFor,
    type RunnerModelConnection,
} from '@haus/api';
import { createConnectionBook } from '../model-connections/connection-book.ts';
import { cleanups, drainCleanups, live, startedRun } from '../runner-test-server.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { createPiHarness } from './pi-driver.ts';
import { agentDir, launch } from './pi-faux-run.ts';
import { connectionModels, piProviderFor } from './pi-models.ts';

const liveTest = process.env.HAUS_RUN_LIVE_RUNNER_PI_SEARCH_TEST === '1' ? test : test.skip;

afterEach(drainCleanups);

async function liveCredential(modelId: string) {
    const apiKeys = {
        gemini: process.env.HAUS_RUNNER_TEST_GEMINI_API_KEY,
        openrouter: process.env.HAUS_RUNNER_TEST_OPENROUTER_API_KEY,
        xai: process.env.HAUS_RUNNER_TEST_XAI_API_KEY,
    };
    const provider = modelProviderFor(modelId);
    if (provider === 'chatgpt') {
        const file = process.env.HAUS_RUNNER_TEST_CHATGPT_CREDENTIAL_FILE ?? '';
        const credential: ModelConnectionCredential = {
            credential: modelOAuthCredentialSchema.parse(JSON.parse(await readFile(file, 'utf8'))),
            kind: 'oauth',
        };
        return credential;
    }
    const credential: ModelConnectionCredential = {
        key: provider === 'claude' ? '' : (apiKeys[provider] ?? ''),
        kind: 'api-key',
    };
    return credential;
}

async function searchedTurn(modelId: string) {
    const connection: RunnerModelConnection = {
        credential: await liveCredential(modelId),
        credentialVersion: 1,
        id: 'mc_live',
        label: 'Live',
        provider: modelProviderFor(modelId),
        serverId: 'srv_live',
        webSearch: true,
    };
    const book = createConnectionBook();
    await book.replace([connection]);
    const harness = createPiHarness({
        log: (line) => process.stderr.write(`${line}\n`),
        maxWarm: 1,
        models: () =>
            connectionModels({
                book,
                connectionId: connection.id,
                link: { send: () => undefined },
                provider: piProviderFor(connection.provider),
            }),
    });
    cleanups.push(() => harness.close());
    const { run } = await startedRun();
    const session = await harness
        .factory({ ...launch(await agentDir(), run.tools, modelId), connection })
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
            const events = await searchedTurn('gpt-5.6-sol');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'xAI searches inside the response',
        async () => {
            const events = await searchedTurn('grok-4.7');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'Gemini answers web_search with grounded sources',
        async () => {
            const events = await searchedTurn('gemini-2.5-pro');

            expect(String(searchResults(events)[0])).toContain('Sources:');
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'an OpenRouter Chat Completions model searches through the server tool',
        async () => {
            const events = await searchedTurn('moonshotai/kimi-k2.6');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );

    liveTest(
        'an OpenRouter Claude model searches through the server tool on the Messages API',
        async () => {
            const events = await searchedTurn('anthropic/claude-fable-5');

            expect(searchResults(events).length).toBeGreaterThan(0);
            expect(events.at(-1)?.type).toBe('turn-finish');
        },
        180_000
    );
});
