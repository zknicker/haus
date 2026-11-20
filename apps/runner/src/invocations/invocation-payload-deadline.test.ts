import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { invocationGraceMs, invocationRunnerMarginMs } from '@haus/api';
import { manualClock } from '../manual-clock.ts';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

const bytes = Buffer.alloc(900_000, 5);
const reference = {
    attachmentId: 'att_stall',
    kind: 'attachment' as const,
    mediaType: 'application/octet-stream',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
};
const unread =
    'The machine stored 900000 bytes of application/octet-stream, but they could not be read: The operation was aborted.';

describe('a payload download stays under its invocation', () => {
    test('the deadline ends a download that never finishes, keeping the outcome the Server recorded', async () => {
        const payload = stalledPayload();
        const timers = manualClock();
        const { run, server } = await startedRun(
            { '/api/agent/invocation-payloads/att_stall': payload.route },
            { invocationClock: timers.clock }
        );

        const pending = run.tools.bash('toolu_1', { command: 'cat big.bin', timeout: 300 }, live());
        await server.frame('invocation-request');
        server.answer({
            exitCode: 0,
            outcome: 'completed',
            output: reference,
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });
        await payload.opened;
        timers.advance(300 + invocationGraceMs + invocationRunnerMarginMs);

        expect(await pending).toEqual({
            content: [{ text: unread, type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
        await payload.aborted;
    });

    test('a stop aborts the download in flight', async () => {
        const payload = stalledPayload();
        const { run, server } = await startedRun({
            '/api/agent/invocation-payloads/att_stall': payload.route,
        });

        const pending = run.tools.bash('toolu_1', { command: 'cat big.bin' }, live());
        await server.frame('invocation-request');
        server.answer({
            exitCode: 0,
            outcome: 'completed',
            output: reference,
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });
        await payload.opened;
        server.send({ agentId: 'agt_1', runId: 'run_1', type: 'stop' });

        await payload.aborted;
        expect(await pending).toEqual({
            content: [{ text: unread, type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
    });
});

function stalledPayload() {
    let markOpened = () => undefined as void;
    let markAborted = () => undefined as void;
    const opened = new Promise<void>((resolve) => {
        markOpened = resolve;
    });
    const aborted = new Promise<void>((resolve) => {
        markAborted = resolve;
    });
    const route = (_body: unknown, _url: URL, request: Request) => {
        request.signal.addEventListener('abort', markAborted, { once: true });
        markOpened();
        return new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes.subarray(0, 1024));
                },
            }),
            { headers: { 'content-length': String(bytes.byteLength) } }
        );
    };
    return { aborted, opened, route };
}
