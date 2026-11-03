import { expect, spyOn, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudAgentLaunchFailedError, startCloudAgentWork } from './launch-work.ts';
import { receipt, registerLaunchWorkFixture, runId, workId } from './launch-work-fixture.ts';

const fixture = registerLaunchWorkFixture();

test('a provider that refuses the launch settles the recorded work as failed', async () => {
    const provider = fixture.install(createFakeCloudAgentProvider());
    provider.failNextStart('Repository access is missing.');
    fixture.stubServer();

    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(fixture.observations[0]).toMatchObject({
        errorCode: 'provider-launch-rejected',
        runId,
        status: 'failed',
        summary: 'The provider rejected the launch: Repository access is missing.',
        workId,
    });
});

test('a lost launch response stops the work and replay never launches twice', async () => {
    const provider = fixture.install(createFakeCloudAgentProvider());
    let attempts = 0;
    provider.start = () => {
        attempts += 1;
        return Promise.reject(new Error('network response lost'));
    };
    fixture.stubServer();
    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(CloudAgentLaunchFailedError);
    fixture.stubServer({ ...receipt, idempotent: true });
    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(attempts).toBe(1);
    expect(fixture.observations.map((entry) => entry.status)).toEqual(['failed', 'failed']);
    expect(fixture.observations[0]).toMatchObject({ errorCode: 'provider-launch-failed' });
});

test('a failed launch logs the provider cause but reports only the generic summary', async () => {
    const provider = fixture.install(createFakeCloudAgentProvider());
    provider.start = () => Promise.reject(new Error('Error: no cloud environment is available'));
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    fixture.restores.push(() => logged.mockRestore());
    fixture.stubServer();
    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(logged).toHaveBeenCalledWith('Cloud Agent launch failed.', {
        cause: 'Error: no cloud environment is available',
        errorCode: 'provider-launch-failed',
        operation: 'cloud-agent.launch',
        provider: 'cursor',
        runId,
        workId,
    });
    expect(fixture.observations[0]?.summary).toBe(
        'The cloud agent launch failed before the provider confirmed it started.'
    );
});

test('a replayed rejection settles the same work without another provider launch', async () => {
    const provider = fixture.install(createFakeCloudAgentProvider());
    provider.failNextStart('Denied');
    fixture.stubServer();
    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(CloudAgentLaunchFailedError);
    fixture.stubServer({ ...receipt, idempotent: true });
    await expect(startCloudAgentWork(fixture.input())).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(provider.launches).toHaveLength(0);
    expect(fixture.observations.map((entry) => entry.status)).toEqual(['failed', 'failed']);
});
