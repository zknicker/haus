import { expect, test } from 'bun:test';
import { cloudAgentObservationSchema } from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import { CloudAgentProviderUnavailableError } from '../provider.ts';
import { createCursorCloudAgentProvider } from './provider.ts';
import {
    createRecordedCursorTransport,
    recordedAgentBusyError,
    recordedAgentId,
    recordedAuth,
    recordedAuthenticationError,
    recordedRun,
    recordedRunId,
} from './recorded-transport.ts';
import { cloudAgentStatusOf } from './status.ts';
import { type CursorTransport, CursorTransportUnavailableError } from './transport.ts';

const ref = {
    providerAgentId: recordedAgentId,
    providerRunId: recordedRunId,
    runId: 'car_1234567890abcdef',
    workId: 'caw_1234567890abcdef',
};

test('every Cursor Run status maps to one Haus status', () => {
    expect(
        (
            ['QUEUED', 'CREATING', 'RUNNING', 'FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED'] as const
        ).map(cloudAgentStatusOf)
    ).toEqual(['queued', 'running', 'running', 'completed', 'failed', 'cancelled', 'expired']);
});

test('readiness reports the connected Cursor account without the credential', async () => {
    const provider = createCursorCloudAgentProvider(createRecordedCursorTransport());
    const readiness = await provider.readiness();
    expect(readiness).toEqual({
        account: { email: 'delegate@example.com', expiresAt: '2026-12-03T21:03:33.000Z' },
        ready: true,
    });
    expect(JSON.stringify(readiness)).not.toContain('key');
});

test('readiness names why the capability is unready', async () => {
    for (const [auth, reason] of [
        [recordedAuth.loggedOut, 'not-connected'],
        [recordedAuth.expired, 'expired'],
    ] as const) {
        const provider = createCursorCloudAgentProvider(createRecordedCursorTransport({ auth }));
        expect(await provider.readiness()).toEqual({ ready: false, reason });
    }
});

test('an SDK that cannot load reports provider-unavailable rather than throwing', async () => {
    const provider = createCursorCloudAgentProvider({
        ...createRecordedCursorTransport(),
        authStatus: () =>
            Promise.reject(new CursorTransportUnavailableError(new Error('no binary'))),
    } as CursorTransport);
    expect(await provider.readiness()).toEqual({ ready: false, reason: 'provider-unavailable' });
});

test('a launch creates the provider Agent and returns its Run and page', async () => {
    const transport = createRecordedCursorTransport();
    const provider = createCursorCloudAgentProvider(transport);
    const launch = await provider.start({
        idempotencyKey: 'car_1234567890abcdef',
        instructions: 'Reproduce the flake and open a pull request.',
        model: 'gpt-5.4-nano',
        ref: 'main',
        repository: 'haus/haus',
        title: 'Fix the flaky delivery test',
    });

    expect(launch).toEqual({
        providerAgentId: recordedAgentId,
        providerRunId: recordedRunId,
        providerUrl: `https://cursor.com/agents?id=${recordedAgentId}`,
        status: 'running',
    });
    expect(transport.requests).toEqual([
        'start haus/haus@main car_1234567890abcdef model=gpt-5.4-nano',
    ]);
});

test('a provider refusal reaches the caller instead of settling the Run', async () => {
    for (const failure of [recordedAgentBusyError(), recordedAuthenticationError()]) {
        const provider = createCursorCloudAgentProvider(
            createRecordedCursorTransport({ startFailure: failure })
        );
        expect(
            provider.start({
                idempotencyKey: 'car_1234567890abcdef',
                instructions: 'Reproduce the flake.',
                model: null,
                ref: null,
                repository: 'haus/haus',
                title: 'Fix the flaky delivery test',
            })
        ).rejects.toThrow(failure.message);
    }
});

test('a terminal Run read is one bounded observation Server can store', async () => {
    const provider = createCursorCloudAgentProvider(
        createRecordedCursorTransport({ reads: [recordedRun('FINISHED')] })
    );
    const observation = await provider.read(ref);

    expect(observation.status).toBe('completed');
    expect(observation.rawStatus).toBe('FINISHED');
    expect(observation.summary).toBe('Reproduced the flake and opened a pull request.');
    expect(observation.branches).toEqual([
        {
            branch: 'cursor/fix-flaky-delivery-test',
            pullRequestUrl: 'https://github.com/haus/haus/pull/412',
            repository: 'haus/haus',
        },
    ]);
    expect(observation.usage).toEqual({ costUsd: 0.425, inputTokens: 18_402, outputTokens: 3117 });
    expect(parse(observation).providerUrl).toBe(`https://cursor.com/agents?id=${recordedAgentId}`);
});

test('a failed Run keeps the provider error code and message boundedly', async () => {
    const provider = createCursorCloudAgentProvider(
        createRecordedCursorTransport({ reads: [recordedRun('ERROR')] })
    );
    const observation = await provider.read(ref);

    expect(observation.status).toBe('failed');
    expect(observation.errorCode).toBe('agent_run_failed');
    expect(observation.summary).toBe('The sandbox could not install dependencies.');
});

test('an expired Run settles as expired, not as an ordinary failure', async () => {
    const provider = createCursorCloudAgentProvider(
        createRecordedCursorTransport({ reads: [recordedRun('EXPIRED')] })
    );
    expect((await provider.read(ref)).status).toBe('expired');
});

test('a long Run result is bounded before it reaches Server', async () => {
    const provider = createCursorCloudAgentProvider(
        createRecordedCursorTransport({
            reads: [recordedRun('FINISHED', { result: 'x'.repeat(5000) })],
        })
    );
    expect(parse(await provider.read(ref)).summary?.length).toBe(2000);
});

test('cancelling addresses the provider Run Haus recorded', async () => {
    const transport = createRecordedCursorTransport();
    const provider = createCursorCloudAgentProvider(transport);
    await provider.cancel(ref);
    expect(transport.requests).toEqual([`cancelRun ${recordedAgentId}/${recordedRunId}`]);
    expect((await provider.read(ref)).status).toBe('cancelled');
});

test('a Run Cursor never hosted has no provider address to act on', () => {
    const provider = createCursorCloudAgentProvider(createRecordedCursorTransport());
    expect(() =>
        provider.subscribe(
            { ...ref, providerRunId: null },
            () => undefined,
            new AbortController().signal
        )
    ).toThrow(CloudAgentProviderUnavailableError);
    expect(provider.cancel({ ...ref, providerAgentId: null })).rejects.toThrow(
        CloudAgentProviderUnavailableError
    );
});

test('connect stores the credential with Cursor and disconnect forgets it', async () => {
    const transport = createRecordedCursorTransport({ auth: recordedAuth.loggedOut });
    const provider = createCursorCloudAgentProvider(transport);

    expect(await provider.readiness()).toEqual({ ready: false, reason: 'not-connected' });
    expect((await provider.connect()).ready).toBe(true);
    expect((await provider.readiness()).ready).toBe(true);
    expect(await provider.disconnect()).toEqual({ ready: false, reason: 'not-connected' });
    expect(await provider.readiness()).toEqual({ ready: false, reason: 'not-connected' });
    expect(transport.requests).toEqual([
        'authStatus',
        'login',
        'authStatus',
        'logout',
        'authStatus',
    ]);
});

function parse(observation: CloudAgentProviderObservation) {
    return cloudAgentObservationSchema.parse({
        ...observation,
        runId: ref.runId,
        workId: ref.workId,
    });
}
