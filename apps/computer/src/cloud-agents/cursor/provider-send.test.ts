import { expect, test } from 'bun:test';
import { createCursorCloudAgentProvider } from './provider.ts';
import { createRecordedCursorTransport, recordedAgentBusyError } from './recorded-transport.ts';

const input = {
    idempotencyKey: 'follow-up-1',
    instructions: 'Address the review feedback.',
    model: null,
    providerAgentId: 'existing-agent',
};

test('follow-up preserves the hosted Agent and returns the new Run', async () => {
    const transport = createRecordedCursorTransport();
    const launch = await createCursorCloudAgentProvider(transport).send(input);
    expect(launch).toEqual({
        providerAgentId: input.providerAgentId,
        providerRunId: 'run_follow-up-1',
        providerUrl: 'https://cursor.com/agents?id=existing-agent',
        status: 'running',
    });
    expect(transport.requests).toEqual(['send existing-agent follow-up-1 model=auto']);
});

test('busy follow-up preserves the SDK error and never launches a replacement', async () => {
    const busy = recordedAgentBusyError();
    const transport = createRecordedCursorTransport({ sendFailure: busy });
    await expect(createCursorCloudAgentProvider(transport).send(input)).rejects.toBe(busy);
    expect(transport.requests).toEqual(['send existing-agent follow-up-1 model=auto']);
});

test('follow-up rejects a provider response for another Agent', async () => {
    const transport = createRecordedCursorTransport();
    const launch = await transport.send({ ...input, agentId: 'another-agent' });
    const provider = createCursorCloudAgentProvider(
        createRecordedCursorTransport({ sendReading: launch })
    );
    await expect(provider.send(input)).rejects.toThrow('different provider Agent');
});
