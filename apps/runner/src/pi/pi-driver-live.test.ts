import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunTools } from '../run-context.ts';
import { cleanups, drainCleanups, live, startedRun } from '../runner-test-server.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { openFileCredentialStore, piLoginsDir } from './pi-credentials.ts';
import { createPiHarness } from './pi-driver.ts';
import { createPiModels } from './pi-models.ts';

const liveTest = process.env.HAUS_RUN_LIVE_RUNNER_PI_TEST === '1' ? test : test.skip;
const xaiApiKey = process.env.HAUS_RUNNER_XAI_API_KEY ?? null;
const modelId = process.env.HAUS_RUNNER_PI_LIVE_MODEL ?? (xaiApiKey ? 'grok-4.7' : 'gpt-5.6-sol');
const dataDir = process.env.HAUS_RUNNER_DATA_DIR ?? '/data';

afterEach(drainCleanups);

function liveHarness() {
    const harness = createPiHarness({
        log: (line) => process.stderr.write(`${line}\n`),
        maxWarm: 1,
        models: createPiModels({
            apiKeys: { geminiApiKey: null, openrouterApiKey: null, xaiApiKey },
            credentials: openFileCredentialStore(piLoginsDir(dataDir)),
        }),
    });
    cleanups.push(() => harness.close());
    return harness;
}

function launch(agentDir: string, tools: RunTools) {
    return {
        agentDir,
        agentId: 'agt_1',
        instructions:
            'You are a terse test Agent. Use your shell tool when asked to look at files, then answer in one sentence.\n',
        modelId,
        reasoningEffort: 'low' as const,
        tools,
    };
}

async function collect(events: AsyncIterable<TurnEvent>) {
    const all: TurnEvent[] = [];
    for await (const event of events) {
        all.push(event);
    }
    return {
        last: all.at(-1)?.type,
        text: all.map((event) => (event.type === 'text-delta' ? event.text : '')).join(''),
        tools: all.flatMap((event) => (event.type === 'tool-call' ? [event.toolName] : [])),
    };
}

describe('Pi Durable driver against a live provider', () => {
    liveTest(
        'two turns, a steer mid-tool, and a cold resume after closing the store',
        async () => {
            const { run, server } = await startedRun();
            const agentDir = await mkdtemp(join(tmpdir(), 'haus-pi-live-'));
            cleanups.push(() => rm(agentDir, { force: true, recursive: true }));
            const first = liveHarness();
            const session = await first
                .factory(launch(agentDir, run.tools))
                .openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });

            const turn = await session.startTurn({
                prompt: 'List the files in your working directory.',
                signal: live(),
            });
            const events = collect(turn.events);
            const frame = await server.frame('invocation-request');
            expect(await session.steer('Also say how many there are.')).toEqual({
                delivered: true,
            });
            if (frame.type === 'invocation-request') {
                server.answer({
                    exitCode: 0,
                    outcome: 'completed',
                    output: { kind: 'text', text: 'alpha.txt\nbeta.txt' },
                    runId: frame.runId,
                    seq: frame.seq,
                    toolCallId: frame.toolCallId,
                });
            }
            const answered = await events;
            expect(answered.last).toBe('turn-finish');
            expect(answered.text).toMatch(/alpha|beta|two|2/iu);
            expect(turn.unconsumedSteers()).toEqual([]);
            const sessionId = await session.detach();

            const warm = await first
                .factory(launch(agentDir, run.tools))
                .openSession({ resumeFrom: sessionId, sessionId: 'agt_1-1' });
            const second = await collect(
                (
                    await warm.startTurn({
                        prompt: 'Without running anything, which file comes first?',
                        signal: live(),
                    })
                ).events
            );
            expect(warm.isResume).toBe(true);
            expect(second.tools).toEqual([]);
            expect(second.text).toMatch(/alpha/iu);
            await warm.detach();
            await first.close();

            const cold = await liveHarness()
                .factory(launch(agentDir, run.tools))
                .openSession({ resumeFrom: sessionId, sessionId: 'agt_1-1' });
            const resumed = await collect(
                (
                    await cold.startTurn({
                        prompt: 'Without running anything, name the second file you saw.',
                        signal: live(),
                    })
                ).events
            );
            expect(cold.isResume).toBe(true);
            expect(resumed.tools).toEqual([]);
            expect(resumed.text).toMatch(/beta/iu);
        },
        180_000
    );
});
