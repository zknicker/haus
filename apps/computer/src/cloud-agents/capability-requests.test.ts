import { afterAll, afterEach, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { detectFullInventory } from '../inventory.ts';
import {
    parseCloudAgentCapabilityRequest,
    runCloudAgentCapabilityRequest,
} from './capability-requests.ts';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import { createRecordedCursorTransport, recordedAuth } from './cursor/recorded-transport.ts';
import { closeProviderSignIns } from './provider-sign-in.ts';
import { setCloudAgentProvider } from './registry.ts';

const runtime = makeTestRuntime();
afterAll(() => runtime.dispose());

const restores: Array<() => void> = [];

afterEach(async () => {
    await closeProviderSignIns(runtime);
    while (restores.length > 0) {
        restores.pop()?.();
    }
});

function installDisconnectedCursor() {
    const transport = createRecordedCursorTransport({ auth: recordedAuth.loggedOut });
    restores.push(setCloudAgentProvider(createCursorCloudAgentProvider(transport)));
    return transport;
}

function request(kind: 'connect' | 'disconnect' | 'get') {
    return {
        operation: { kind },
        provider: 'cursor' as const,
        requestId: 'req_cursor_capability',
        type: 'cloud-agent-capability-request' as const,
    };
}

test('the capability request parses only its own frame', () => {
    expect(parseCloudAgentCapabilityRequest(request('get'))?.operation.kind).toBe('get');
    expect(parseCloudAgentCapabilityRequest({ type: 'browser-request' })).toBeNull();
});

test('connecting stores the credential with Cursor and reports the account back', async () => {
    installDisconnectedCursor();

    expect((await runCloudAgentCapabilityRequest(request('get'), runtime)).result).toEqual({
        accountEmail: null,
        expiresAt: null,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
    });

    const connected = await runCloudAgentCapabilityRequest(request('connect'), runtime);
    expect(connected.result).toEqual({
        accountEmail: 'delegate@example.com',
        expiresAt: '2026-12-03T21:03:33.000Z',
        provider: 'cursor',
        ready: true,
        reason: null,
    });
    expect(connected.error).toBeUndefined();

    expect(
        (await runCloudAgentCapabilityRequest(request('disconnect'), runtime)).result?.ready
    ).toBe(false);
});

test('a refused login answers with a retryable state, never raw authentication details', async () => {
    const transport = createRecordedCursorTransport({ auth: recordedAuth.loggedOut });
    restores.push(
        setCloudAgentProvider(
            createCursorCloudAgentProvider({
                ...transport,
                login: () => Promise.reject(new Error(`Login cancelled. ${'detail '.repeat(200)}`)),
            })
        )
    );

    const result = await runCloudAgentCapabilityRequest(request('connect'), runtime);
    expect(result.result?.signIn).toEqual({
        status: 'failed',
        message: 'Could not complete Cursor sign-in. Try again.',
    });
    expect(result.error).toBeUndefined();
});

test('the Computer inventory reports Cursor readiness truthfully', async () => {
    installDisconnectedCursor();
    expect((await detectFullInventory()).cloudAgentProviders).toEqual([
        { provider: 'cursor', ready: false, reason: 'not-connected' },
    ]);

    await runCloudAgentCapabilityRequest(request('connect'), runtime);
    expect((await detectFullInventory()).cloudAgentProviders).toEqual([
        { provider: 'cursor', ready: true, reason: null },
    ]);
});
