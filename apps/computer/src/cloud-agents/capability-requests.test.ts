import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { detectFullInventory } from '../inventory.ts';
import {
    parseCloudAgentCapabilityRequest,
    runCloudAgentCapabilityRequest,
} from './capability-requests.ts';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import {
    createRecordedCursorTransport,
    recordedAuth,
    recordedModels,
} from './cursor/recorded-transport.ts';
import { mapCloudAgentModelCatalog } from './model-catalog-mapping.ts';
import { unavailableCloudAgentProvider } from './provider.ts';
import { closeProviderSignIns } from './provider-sign-in.ts';
import { setCloudAgentProvider } from './registry.ts';
import { readDefaultCloudAgentProvider } from './settings.ts';

const runtime = makeTestRuntime();
afterAll(() => runtime.dispose());

const restores: Array<() => void> = [];
let dataRoot = '';

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-capability-'));
    // A developer's own Claude Code sign-in must not leak into these readings.
    restores.push(setCloudAgentProvider(unavailableCloudAgentProvider('claude')));
});

afterEach(async () => {
    await closeProviderSignIns(runtime);
    while (restores.length > 0) {
        restores.pop()?.();
    }
    await rm(dataRoot, { force: true, recursive: true });
});

function installDisconnectedCursor() {
    const transport = createRecordedCursorTransport({ auth: recordedAuth.loggedOut });
    restores.push(setCloudAgentProvider(createCursorCloudAgentProvider(transport)));
    return transport;
}

function request(
    kind: 'connect' | 'disconnect' | 'get' | 'make-default',
    provider: 'claude' | 'cursor' = 'cursor'
) {
    return {
        operation: { kind },
        provider,
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

    expect(
        (await runCloudAgentCapabilityRequest(request('get'), runtime, dataRoot)).result
    ).toEqual({
        accountEmail: null,
        expiresAt: null,
        isDefault: true,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
    });

    const connected = await runCloudAgentCapabilityRequest(request('connect'), runtime, dataRoot);
    expect(connected.result).toEqual({
        accountEmail: 'delegate@example.com',
        expiresAt: '2026-12-03T21:03:33.000Z',
        isDefault: true,
        provider: 'cursor',
        ready: true,
        reason: null,
    });
    expect(connected.error).toBeUndefined();

    expect(
        (await runCloudAgentCapabilityRequest(request('disconnect'), runtime, dataRoot)).result
            ?.ready
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

    const result = await runCloudAgentCapabilityRequest(request('connect'), runtime, dataRoot);
    expect(result.result?.signIn).toEqual({
        status: 'failed',
        message: 'Could not complete Cursor sign-in. Try again.',
    });
    expect(result.error).toBeUndefined();
});

test('the Computer inventory reports Cursor readiness truthfully', async () => {
    installDisconnectedCursor();
    expect((await detectFullInventory()).cloudAgentProviders).toEqual([
        {
            isDefault: true,
            models: null,
            provider: 'cursor',
            ready: false,
            reason: 'not-connected',
        },
        claudeUnavailable,
    ]);

    await runCloudAgentCapabilityRequest(request('connect'), runtime, dataRoot);
    expect((await detectFullInventory()).cloudAgentProviders).toEqual([
        {
            models: {
                ...mapCloudAgentModelCatalog(recordedModels),
                refreshedAt: expect.any(String),
            },
            provider: 'cursor',
            ready: true,
            reason: null,
            isDefault: true,
        },
        claudeUnavailable,
    ]);
});

test('making a provider the default moves the inventory flag to it', async () => {
    installDisconnectedCursor();
    const made = await runCloudAgentCapabilityRequest(
        request('make-default', 'claude'),
        runtime,
        dataRoot
    );
    expect(made.result).toMatchObject({ isDefault: true, provider: 'claude' });
    expect(await readDefaultCloudAgentProvider(dataRoot)).toBe('claude');
    expect(
        (
            await detectFullInventory({ defaultCloudAgentProvider: 'claude' })
        ).cloudAgentProviders?.map((entry) => [entry.provider, entry.isDefault])
    ).toEqual([
        ['cursor', false],
        ['claude', true],
    ]);
});

const claudeUnavailable = {
    isDefault: false,
    models: null,
    provider: 'claude' as const,
    ready: false,
    reason: 'provider-unavailable' as const,
};
