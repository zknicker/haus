import { expect, test } from 'bun:test';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import {
    createRecordedCursorTransport,
    recordedAuthenticationError,
} from './cursor/recorded-transport.ts';
import {
    reconcileEntry,
    registerSupervisorFixture,
    serverId,
    turnRef,
    turnStartFrame,
} from './worker-supervisor.fixture.ts';

const supervisors = registerSupervisorFixture();

test('a follow-up Cursor refuses settles failed with its reason and no provider run', async () => {
    const transport = createRecordedCursorTransport({
        reads: [],
        sendFailure: recordedAuthenticationError(),
    });
    const f = await supervisors(createCursorCloudAgentProvider(transport));
    const frame = turnStartFrame({ providerAgentId: 'bc_same', turnId: 'wkt_followup12345678' });
    const daemon = f.start();
    await daemon.work.accept(frame);
    await daemon.work.reconcile([reconcileEntry(frame)]);
    expect(daemon.observations().at(-1)).toMatchObject({
        errorCode: 'followup-delivery-rejected',
        status: 'failed',
        summary: 'The provider rejected the follow-up: Invalid API key (unauthorized)',
    });
    expect(daemon.observations().at(-1)?.providerRunId).toBeUndefined();
    expect(transport.requests.filter((request) => request.startsWith('send'))).toHaveLength(1);
    expect((await f.journal.read(serverId, turnRef(frame)))?.phase).toBe('rejected');
});
