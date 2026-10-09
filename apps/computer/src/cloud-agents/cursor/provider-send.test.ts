import { expect, test } from 'bun:test';
import { CloudAgentLaunchRejectedError } from '../provider.ts';
import { createCursorCloudAgentProvider } from './provider.ts';
import {
    createRecordedCursorTransport,
    recordedAgentBusyError,
    recordedAuthenticationError,
} from './recorded-transport.ts';
import { CursorTransportUnavailableError, cursorSendRejectionOf } from './transport.ts';

/** An SDK error by shape: the adapter never imports the SDK's classes. */
function sdkError(
    name: string,
    message: string,
    fields: { code?: string; isRetryable?: boolean; status?: number }
): Error {
    const error = new Error(message);
    error.name = name;
    return Object.assign(error, fields);
}

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
    expect(transport.requests).toEqual(['send existing-agent follow-up-1 model=none']);
});

test('busy follow-up preserves the SDK error and never launches a replacement', async () => {
    const busy = recordedAgentBusyError();
    const transport = createRecordedCursorTransport({ sendFailure: busy });
    await expect(createCursorCloudAgentProvider(transport).send(input)).rejects.toBe(busy);
    expect(transport.requests).toEqual(['send existing-agent follow-up-1 model=none']);
});

test('a definite Cursor refusal becomes a rejection carrying Cursor code and words', async () => {
    const refusals = [
        recordedAuthenticationError(),
        sdkError('ConfigurationError', 'Unknown model', { code: 'invalid_model', status: 400 }),
        sdkError('AgentNotFoundError', 'Agent not found', { code: 'agent_not_found' }),
        sdkError('Error', 'Forbidden', { status: 403 }),
    ];
    for (const refusal of refusals) {
        const transport = createRecordedCursorTransport({ sendFailure: refusal });
        const rejection = await createCursorCloudAgentProvider(transport)
            .send(input)
            .catch((error: unknown) => error);
        expect(rejection).toBeInstanceOf(CloudAgentLaunchRejectedError);
        expect(rejection).toMatchObject({ message: refusal.message });
    }
    expect(cursorSendRejectionOf(recordedAuthenticationError())).toEqual({
        code: 'unauthorized',
        message: 'Invalid API key',
    });
});

test('busy, rate limits, server errors, and network failures stay retryable', () => {
    const retryable = [
        recordedAgentBusyError(),
        sdkError('RateLimitError', 'Too many requests', { status: 429 }),
        sdkError('NetworkError', 'Service unavailable', { status: 503 }),
        sdkError('UnknownAgentError', 'Internal', { status: 500 }),
        sdkError('Error', 'Conflict', { status: 409 }),
        // The SDK maps an unlisted 4xx such as a proxy timeout to UnknownAgentError.
        sdkError('UnknownAgentError', '[unknown] Request Timeout', { status: 408 }),
        sdkError('ConfigurationError', 'Flaky backend', { isRetryable: true, status: 400 }),
        new TypeError('fetch failed'),
        new CursorTransportUnavailableError(new Error('no native module')),
    ];
    for (const error of retryable) {
        expect(cursorSendRejectionOf(error)).toBeNull();
    }
});

test('follow-up rejects a provider response for another Agent', async () => {
    const transport = createRecordedCursorTransport();
    const launch = await transport.send({ ...input, agentId: 'another-agent' });
    const provider = createCursorCloudAgentProvider(
        createRecordedCursorTransport({ sendReading: launch })
    );
    await expect(provider.send(input)).rejects.toThrow('different provider Agent');
});
