import { expect, test } from 'bun:test';
import { cloudAgentObservationSchema, isTerminalCloudAgentStatus } from '@haus/api';
import { createCursorCloudAgentProvider } from './provider.ts';
import { createCursorSdkTransport } from './sdk-transport.ts';

/**
 * The one live Cursor lane. It is opt-in because it spends a real Cursor
 * allowance against a real repository: set `HAUS_RUN_LIVE_CURSOR_TEST=1` and
 * `HAUS_LIVE_CURSOR_REPOSITORY=owner/name` on a Computer whose Cursor
 * credential is already connected, then run
 * `bun test apps/computer/src/cloud-agents/cursor/live-smoke.test.ts`.
 *
 * Every other Cursor lane runs against recorded provider responses, so this
 * one exists to prove the recordings still describe Cursor.
 */
const repository = process.env.HAUS_LIVE_CURSOR_REPOSITORY ?? '';
const enabled = process.env.HAUS_RUN_LIVE_CURSOR_TEST === '1' && repository.length > 0;
const twentyMinutes = 20 * 60_000;

test.skipIf(!enabled)(
    'a live Cursor Cloud Agent runs to a terminal observation Server can store',
    async () => {
        const provider = createCursorCloudAgentProvider(createCursorSdkTransport());
        const readiness = await provider.readiness();
        expect(readiness).toMatchObject({ ready: true });

        const runId = `car_live_${Date.now().toString(36)}`;
        const launch = await provider.start({
            idempotencyKey: runId,
            instructions:
                'Read the repository README and reply with one sentence describing what it is. Change no files and open no pull request.',
            model: null,
            ref: null,
            repository,
            title: 'Haus live Cloud Agent smoke',
        });
        expect(launch.providerAgentId).toStartWith('bc');
        expect(launch.providerUrl).toContain(launch.providerAgentId);

        const ref = {
            providerAgentId: launch.providerAgentId,
            providerRunId: launch.providerRunId,
            runId,
            workId: `caw_live_${runId}`,
        };
        const settled = await waitForTerminal(provider, ref);

        // Everything asserted here is what Server actually stores, parsed by
        // the same schema, so a provider change that broke the mapping fails
        // here rather than in production.
        const observation = cloudAgentObservationSchema.parse({
            ...settled,
            runId,
            workId: ref.workId,
        });
        expect(isTerminalCloudAgentStatus(observation.status)).toBe(true);
        expect(observation.rawStatus).toBeString();
        expect(observation.providerRunId).toBe(launch.providerRunId);
        expect(observation.providerUrl).toBe(launch.providerUrl ?? undefined);
        if (observation.status === 'completed') {
            expect(observation.summary).toBeString();
        }
    },
    twentyMinutes
);

async function waitForTerminal(
    provider: ReturnType<typeof createCursorCloudAgentProvider>,
    ref: { providerAgentId: string; providerRunId: string; runId: string; workId: string }
) {
    const deadline = Date.now() + twentyMinutes - 60_000;
    let observation = await provider.read(ref);
    while (!isTerminalCloudAgentStatus(observation.status)) {
        if (Date.now() > deadline) {
            await provider.cancel(ref);
            throw new Error('The live Cursor run did not settle within the smoke window.');
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
        observation = await provider.read(ref);
    }
    return observation;
}
