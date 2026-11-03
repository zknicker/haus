import { expect, spyOn, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudAgentLaunchFailedError, startCloudAgentWork } from './launch-work.ts';
import {
    collect,
    dataRoot,
    install,
    observations,
    pushRestore,
    receipt,
    reconciled,
    request,
    runId,
    serverId,
    serverOrigin,
    stubServer,
    supervisor,
    workId,
} from './launch-work-test-support.ts';
import { CloudAgentProviderUnavailableError } from './provider.ts';

test('an unavailable provider fails before the Server is asked for anything', async () => {
    install(
        createFakeCloudAgentProvider({
            readiness: { ready: false, reason: 'provider-unavailable' },
        })
    );
    const calls = stubServer();

    await expect(
        startCloudAgentWork({
            dataRoot,
            supervisor,
            request,
            runnerToken: 'grtr_x',
            serverId,
            serverOrigin,
        })
    ).rejects.toThrow(CloudAgentProviderUnavailableError);
    expect(calls).toHaveLength(0);
});

test('a launch records the work, keeps instructions local, and reports the provider ids', async () => {
    const provider = install(createFakeCloudAgentProvider());
    const calls = stubServer();
    const observations = collect();

    const result = await startCloudAgentWork({
        dataRoot,
        supervisor,
        request,
        runnerToken: 'grtr_x',
        serverId,
        serverOrigin,
    });

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
    expect(observations).toEqual([
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

test('a provider that refuses the launch settles the recorded work as failed', async () => {
    const provider = install(createFakeCloudAgentProvider());
    provider.failNextStart('Repository access is missing.');
    stubServer();
    const observations = collect();

    await expect(
        startCloudAgentWork({
            dataRoot,
            supervisor,
            request,
            runnerToken: 'grtr_x',
            serverId,
            serverOrigin,
        })
    ).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(observations[0]).toMatchObject({
        errorCode: 'provider-launch-rejected',
        runId,
        status: 'failed',
        summary: 'The provider rejected the launch: Repository access is missing.',
        workId,
    });
});

test('a Server refusal reaches the caller and reports nothing', async () => {
    install(createFakeCloudAgentProvider());
    stubServer({ code: 'TARGET_READ_ONLY', message: 'That channel is archived.' }, 409);
    const observations = collect();

    await expect(
        startCloudAgentWork({
            dataRoot,
            supervisor,
            request,
            runnerToken: 'grtr_x',
            serverId,
            serverOrigin,
        })
    ).rejects.toThrow(/archived/);
    expect(observations).toHaveLength(0);
});

test('a lost identity report replays the journal address without a second launch', async () => {
    const provider = install(createFakeCloudAgentProvider());
    stubServer();
    await startCloudAgentWork({
        dataRoot,
        supervisor,
        request,
        runnerToken: 'grtr_x',
        serverId,
        serverOrigin,
    });
    observations.length = 0;
    stubServer({ ...receipt, idempotent: true });
    await startCloudAgentWork({
        dataRoot,
        supervisor,
        request,
        runnerToken: 'grtr_x',
        serverId,
        serverOrigin,
    });
    expect(provider.launches).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
        providerAgentId: `bc_${runId}`,
        providerRunId: `run_${runId}`,
        runId,
    });
});

test('a lost launch response stops the work and replay never launches twice', async () => {
    const provider = install(createFakeCloudAgentProvider());
    let attempts = 0;
    provider.start = () => {
        attempts += 1;
        return Promise.reject(new Error('network response lost'));
    };
    stubServer();
    const input = { dataRoot, supervisor, request, runnerToken: 'grtr_x', serverId, serverOrigin };
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchFailedError);
    stubServer({ ...receipt, idempotent: true });
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(attempts).toBe(1);
    expect(observations.map((entry) => entry.status)).toEqual(['failed', 'failed']);
    expect(observations[0]).toMatchObject({ errorCode: 'provider-launch-failed' });
});

test('a failed launch logs the provider cause but reports only the generic summary', async () => {
    const provider = install(createFakeCloudAgentProvider());
    provider.start = () => Promise.reject(new Error('Error: no cloud environment is available'));
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    pushRestore(() => logged.mockRestore());
    stubServer();
    const input = { dataRoot, supervisor, request, runnerToken: 'grtr_x', serverId, serverOrigin };
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(logged).toHaveBeenCalledWith('Cloud Agent launch failed.', {
        cause: 'Error: no cloud environment is available',
        errorCode: 'provider-launch-failed',
        operation: 'cloud-agent.launch',
        provider: 'cursor',
        runId,
        workId,
    });
    expect(observations[0]?.summary).toBe(
        'The cloud agent launch failed before the provider confirmed it started.'
    );
});

test('a replayed rejection settles the same work without another provider launch', async () => {
    const provider = install(createFakeCloudAgentProvider());
    provider.failNextStart('Denied');
    stubServer();
    const input = { dataRoot, supervisor, request, runnerToken: 'grtr_x', serverId, serverOrigin };
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchFailedError);
    stubServer({ ...receipt, idempotent: true });
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(provider.launches).toHaveLength(0);
    expect(observations.map((entry) => entry.status)).toEqual(['failed', 'failed']);
});

const effort = { name: 'effort' as const, providerParamId: 'reasoning', value: 'low' };
const resolved = { droppedParams: [], fallbackFrom: null, id: 'gpt-5.4-nano', params: [effort] };
const autoFallback = { droppedParams: [], fallbackFrom: 'retired', id: 'default', params: [] };

test.each([
    [resolved, { id: 'gpt-5.4-nano', params: [{ id: 'reasoning', value: 'low' }] }],
    [autoFallback, { id: 'default', params: [] }],
])('a launch sends the model and params Server resolved onto the Run', async (model, sent) => {
    const provider = install(createFakeCloudAgentProvider());
    const run = { branches: [], errorCode: null, model, providerRunId: null, rawStatus: null };
    const settled = { createdAt: receipt.work.createdAt, startedAt: null, terminalAt: null };
    const runs = [{ ...run, ...settled, runId, status: 'queued', summary: null, usage: null }];
    stubServer({ ...receipt, work: { ...receipt.work, runs } });
    await startCloudAgentWork({
        dataRoot,
        supervisor,
        request,
        runnerToken: 'grtr_x',
        serverId,
        serverOrigin,
    });
    expect(provider.launches[0]?.model).toEqual(sent);
});
