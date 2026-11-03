import { expect, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { startCloudAgentWork } from './launch-work.ts';
import {
    receipt,
    registerLaunchWorkFixture,
    request,
    runId,
    workId,
} from './launch-work-fixture.ts';
import { CloudAgentProviderUnavailableError } from './provider.ts';

const fixture = registerLaunchWorkFixture();

test('an unavailable provider fails before the Server is asked for anything', async () => {
    fixture.install(
        createFakeCloudAgentProvider({
            readiness: { ready: false, reason: 'provider-unavailable' },
        })
    );
    const calls = fixture.stubServer();

    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(
        CloudAgentProviderUnavailableError
    );
    expect(calls).toHaveLength(0);
});

test('a launch records the work, keeps instructions local, and reports the provider ids', async () => {
    const provider = fixture.install(createFakeCloudAgentProvider());
    const calls = fixture.stubServer();

    const result = await startCloudAgentWork(fixture.input());

    expect(result).toMatchObject({ state: 'started', work: { id: workId } });
    expect(calls[0]?.url).toBe('https://haus.test/api/agent/cloud-agents');
    expect(calls[0]?.body).toEqual({
        content: request.content,
        nonce: request.nonce,
        provider: 'cursor',
        repository: request.repository,
        replyToMessageId: request.replyToMessageId,
        startingRef: 'main',
        target: '#product',
        title: request.title,
    });
    // The provider prompt reaches the provider and nothing else.
    expect(provider.launches[0]).toMatchObject({
        idempotencyKey: runId,
        instructions: request.instructions,
        ref: 'main',
        repository: 'haus/haus',
    });
    expect(fixture.observations).toEqual([
        {
            observedAt: expect.any(String),
            providerAgentId: `bc_${runId}`,
            providerRunId: `run_${runId}`,
            providerUrl: `https://cursor.com/agents/bc_${runId}`,
            runId,
            status: 'running',
            workId,
        },
    ]);
});

test('a Server refusal reaches the caller and reports nothing', async () => {
    fixture.install(createFakeCloudAgentProvider());
    fixture.stubServer({ code: 'TARGET_READ_ONLY', message: 'That channel is archived.' }, 409);

    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(/archived/);
    expect(fixture.observations).toHaveLength(0);
});

test('a lost identity report replays the journal address without a second launch', async () => {
    const provider = fixture.install(createFakeCloudAgentProvider());
    fixture.stubServer();
    await startCloudAgentWork(fixture.input());
    fixture.observations.length = 0;
    fixture.stubServer({ ...receipt, idempotent: true });
    await startCloudAgentWork(fixture.input());
    expect(provider.launches).toHaveLength(1);
    expect(fixture.reconciled[0]).toMatchObject({
        providerAgentId: `bc_${runId}`,
        providerRunId: `run_${runId}`,
        runId,
    });
});

const effort = { name: 'effort' as const, providerParamId: 'reasoning', value: 'low' };
const resolved = { droppedParams: [], fallbackFrom: null, id: 'gpt-5.4-nano', params: [effort] };
const autoFallback = { droppedParams: [], fallbackFrom: 'retired', id: 'default', params: [] };

test.each([
    [resolved, { id: 'gpt-5.4-nano', params: [{ id: 'reasoning', value: 'low' }] }],
    [autoFallback, { id: 'default', params: [] }],
])('a launch sends the model and params Server resolved onto the Run', async (model, sent) => {
    const provider = fixture.install(createFakeCloudAgentProvider());
    const run = { branches: [], errorCode: null, model, providerRunId: null, rawStatus: null };
    const settled = { createdAt: receipt.work.createdAt, startedAt: null, terminalAt: null };
    const runs = [{ ...run, ...settled, runId, status: 'queued', summary: null, usage: null }];
    fixture.stubServer({ ...receipt, work: { ...receipt.work, runs } });
    await startCloudAgentWork(fixture.input());
    expect(provider.launches[0]?.model).toEqual(sent);
});
