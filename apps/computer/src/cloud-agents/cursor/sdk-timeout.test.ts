import { expect, spyOn, test } from 'bun:test';
import { Agent } from '@cursor/sdk';
import { streamCursorRun } from './sdk-stream.ts';
import { createCursorSdkTransport } from './sdk-transport.ts';

const runId = 'run-12345678-1234-1234-1234-123456789012';
const agentId = 'bc-12345678-1234-1234-1234-123456789012';

test('the installed Bun SDK bounds a finite Run read to thirty seconds', async () => {
    const deadline = new AbortController();
    const timedOut = new Error('fixture request deadline');
    const timeout = spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    let requestSignal: AbortSignal | null | undefined;
    const requestStarted = Promise.withResolvers<void>();
    const fetch = mockFetch((_, options) => {
        requestSignal = options?.signal;
        requestStarted.resolve();
        return new Promise<Response>((_, reject) => {
            if (options?.signal?.aborted) {
                reject(timedOut);
                return;
            }
            options?.signal?.addEventListener('abort', () => reject(timedOut), { once: true });
        });
    });
    try {
        const reading = Agent.getRun(runId, {
            agentId,
            apiKey: 'fixture-only-key',
            runtime: 'cloud',
        }).catch((error: unknown) => error);
        await requestStarted.promise;
        expect(timeout).toHaveBeenCalledWith(30_000);
        expect(requestSignal).toBe(deadline.signal);
        deadline.abort();
        expect(await reading).toBeInstanceOf(Error);
    } finally {
        deadline.abort();
        fetch.mockRestore();
        timeout.mockRestore();
    }
});

test('the installed SDK stream keeps its abort signal and joins after idle teardown', async () => {
    const finiteDeadline = new AbortController();
    const timeout = spyOn(AbortSignal, 'timeout').mockReturnValue(finiteDeadline.signal);
    const started = Promise.withResolvers<void>();
    const controller = new AbortController();
    let streamSignal: AbortSignal | null | undefined;
    const fetch = mockFetch((url, options) => {
        if (!String(url).endsWith('/stream')) {
            return Promise.resolve(
                Response.json({
                    agentId,
                    createdAt: '2026-09-05T00:00:00.000Z',
                    id: runId,
                    status: 'RUNNING',
                })
            );
        }
        streamSignal = options?.signal;
        started.resolve();
        return new Promise<Response>((_, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('closed')), {
                once: true,
            });
        });
    });
    try {
        const run = await Agent.getRun(runId, {
            agentId,
            apiKey: 'fixture-only-key',
            runtime: 'cloud',
        });
        const watching = streamCursorRun(run, async () => undefined, controller.signal);
        await started.promise;
        expect(timeout).toHaveBeenCalledTimes(1);
        expect(streamSignal).not.toBe(finiteDeadline.signal);
        controller.abort();
        await watching;
        expect(streamSignal?.aborted).toBe(true);
    } finally {
        controller.abort();
        fetch.mockRestore();
        timeout.mockRestore();
    }
});

function mockFetch(request: (...args: Parameters<typeof globalThis.fetch>) => Promise<Response>) {
    return spyOn(globalThis, 'fetch').mockImplementation(
        Object.assign(request, { preconnect: globalThis.fetch.preconnect })
    );
}

test('SDK reconciliation keeps the hosted Run creation time after a late read', async () => {
    const startedAt = '2026-10-26T22:23:00.000Z';
    const fetch = mockFetch(() =>
        Promise.resolve(
            Response.json({
                agentId,
                createdAt: startedAt,
                id: runId,
                status: 'RUNNING',
            })
        )
    );
    const previousKey = process.env.CURSOR_API_KEY;
    process.env.CURSOR_API_KEY = 'fixture-only-key';
    try {
        const reading = await createCursorSdkTransport().readRun({ agentId, runId });
        expect(reading.startedAt).toBe(startedAt);
    } finally {
        if (previousKey === undefined) {
            Reflect.deleteProperty(process.env, 'CURSOR_API_KEY');
        } else {
            process.env.CURSOR_API_KEY = previousKey;
        }
        fetch.mockRestore();
    }
});
