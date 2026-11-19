import { expect, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import {
    registerLaunchWorkFixture,
    request,
    serverId,
    serverOrigin,
} from './launch-work-fixture.ts';
import { handleWorkerStart } from './proxy-route.ts';

const fixture = registerLaunchWorkFixture();

test('a launch named on a Task reaches the Server with its Task key', async () => {
    fixture.install(createFakeCloudAgentProvider());
    const calls = fixture.stubServer();
    const url = new URL('/api/agent/workers', 'http://127.0.0.1');

    const response = await handleWorkerStart(
        new Request(url.href, {
            body: JSON.stringify({ ...request, target: 'task:GEN-15', task: 'GEN-15' }),
            method: 'POST',
        }),
        url,
        {
            dataRoot: fixture.dataRoot,
            runnerToken: 'grtr_x',
            serverId,
            serverOrigin,
            supervisor: fixture.supervisor,
        }
    );
    await fixture.launched();

    expect(response?.status).toBe(200);
    expect(calls[0]?.body).toMatchObject({ target: 'task:GEN-15', task: 'GEN-15' });
});
