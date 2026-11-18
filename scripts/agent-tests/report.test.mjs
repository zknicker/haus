import { expect, test } from 'bun:test';
import { buildTranscript, captureAgentDiagnostics } from './report.mjs';

test('failure evidence preserves delivery state even when a turn query fails', async () => {
    const diagnostics = await captureAgentDiagnostics(
        {
            turns: {
                deliveryState: async () => ({ running: false, pending: 1 }),
                listTurns: async () => {
                    throw new Error('query failed');
                },
                listDeliveries: async () => [{ messageId: 'msg_peer', state: 'served' }],
            },
        },
        [{ id: 'agt_coordinator' }]
    );
    expect(diagnostics).toEqual([
        {
            agentId: 'agt_coordinator',
            state: { running: false, pending: 1 },
            turns: { error: 'Error: query failed' },
            deliveries: [{ messageId: 'msg_peer', state: 'served' }],
        },
    ]);
    const report = buildTranscript({
        diagnostics,
        error: new Error('missing summary'),
        scenario: { name: 'mention-wakes-only-addressed', contract: 'one reply, bystander silent' },
    });
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toEqual(diagnostics);
});
