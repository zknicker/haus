import { expect, test } from 'bun:test';
import { cloudAgentObservationSchema } from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import { createCursorCloudAgentProvider } from './provider.ts';
import {
    createRecordedCursorTransport,
    recordedAgentId,
    recordedRun,
    recordedRunId,
} from './recorded-transport.ts';

const ref = {
    provider: 'cursor' as const,
    providerAgentId: recordedAgentId,
    providerRunId: recordedRunId,
    runId: 'car_1234567890abcdef',
    workId: 'caw_1234567890abcdef',
};

test('the Run event stream carries raw status and one bounded activity line', async () => {
    const transport = createRecordedCursorTransport({ reads: [recordedRun('FINISHED')] });
    const provider = createCursorCloudAgentProvider(transport);
    const seen: CloudAgentProviderObservation[] = [];
    const controller = new AbortController();
    const watching = provider.subscribe(
        ref,
        (observation) => seen.push(observation),
        controller.signal
    );

    await transport.emit({ kind: 'status', rawStatus: 'RUNNING' });
    await transport.emit({
        kind: 'activity',
        summary: `Reading\n  ${'the failing test '.repeat(20)}`,
    });
    await transport.emit({ kind: 'status', rawStatus: 'FINISHED' });
    await watching;
    controller.abort();
    await watching;
    await transport.emit({ kind: 'status', rawStatus: 'CANCELLED' });

    expect(seen.map((observation) => observation.status)).toEqual([
        'running',
        'running',
        'completed',
    ]);
    expect(seen[0]?.rawStatus).toBe('RUNNING');
    expect(seen[1]?.activity?.summary.length).toBe(120);
    // One settling observation, carrying the Run's evidence. A bare terminal
    // status first would settle the work, and the caller unsubscribes on
    // settlement — the evidence would never arrive.
    expect(seen[2]?.summary).toBe('Reproduced the flake and opened a pull request.');
    expect(seen[2]?.branches).toHaveLength(1);
    expect(seen[2]?.usage).toBeDefined();
    for (const observation of seen) {
        parse(observation);
    }
});

test('a streamed EXPIRED survives the read that collapses it into a failure', async () => {
    const transport = createRecordedCursorTransport({
        // A read cannot tell expiry from an ordinary failure; the stream can.
        reads: [recordedRun('ERROR')],
    });
    const provider = createCursorCloudAgentProvider(transport);
    const seen: CloudAgentProviderObservation[] = [];
    const watching = provider.subscribe(
        ref,
        (observation) => seen.push(observation),
        new AbortController().signal
    );

    await transport.emit({ kind: 'status', rawStatus: 'EXPIRED' });
    await watching;

    expect(seen.map((observation) => observation.status)).toEqual(['expired']);
    expect(seen[0]?.rawStatus).toBe('EXPIRED');
    expect(seen[0]?.errorCode).toBe('agent_run_failed');
});

test('detaching hands reconciliation to the supervisor without fabricating settlement', async () => {
    const transport = createRecordedCursorTransport();
    const provider = createCursorCloudAgentProvider(transport);
    const seen: CloudAgentProviderObservation[] = [];
    const watching = provider.subscribe(
        ref,
        (observation) => seen.push(observation),
        new AbortController().signal
    );
    await transport.emit({ kind: 'detached' });
    await watching;
    expect(seen).toEqual([]);
    expect(transport.requests).toEqual([`streamRun ${recordedAgentId}/${recordedRunId}`]);
});

test('abort joins an in-flight terminal read without publishing its stale result', async () => {
    const transport = createRecordedCursorTransport();
    const read = Promise.withResolvers<ReturnType<typeof recordedRun>>();
    const started = Promise.withResolvers<void>();
    const provider = createCursorCloudAgentProvider({
        ...transport,
        readRun: () => {
            started.resolve();
            return read.promise;
        },
    });
    const seen: CloudAgentProviderObservation[] = [];
    const controller = new AbortController();
    const watching = provider.subscribe(
        ref,
        (observation) => seen.push(observation),
        controller.signal
    );
    const event = transport.emit({ kind: 'status', rawStatus: 'FINISHED' });
    await started.promise;
    controller.abort();
    read.resolve(recordedRun('FINISHED'));
    await event;
    await watching;
    await transport.emit({ kind: 'status', rawStatus: 'RUNNING' });
    expect(seen).toEqual([]);
});

test('a settling read that fails still settles the work from the streamed status', async () => {
    const transport = createRecordedCursorTransport();
    const provider = createCursorCloudAgentProvider({
        ...transport,
        readRun: () => Promise.reject(new Error('The provider is unreachable.')),
    });
    const seen: CloudAgentProviderObservation[] = [];
    const watching = provider.subscribe(
        ref,
        (observation) => seen.push(observation),
        new AbortController().signal
    );

    await transport.emit({ kind: 'status', rawStatus: 'CANCELLED' });
    await watching;

    expect(seen).toHaveLength(1);
    expect(parse(seen[0] as CloudAgentProviderObservation).status).toBe('cancelled');
});

function parse(observation: CloudAgentProviderObservation) {
    return cloudAgentObservationSchema.parse({
        ...observation,
        runId: ref.runId,
        workId: ref.workId,
    });
}
