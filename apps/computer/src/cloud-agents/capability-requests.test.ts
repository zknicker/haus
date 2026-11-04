import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { mapCloudAgentModelCatalog } from './model-catalog-mapping.ts';
import { unavailableCloudAgentProvider } from './provider.ts';
import { closeProviderSignIns } from './provider-sign-in.ts';
import { setCloudAgentProvider } from './registry.ts';
import {
    readClaudeEnvironmentId,
    readDefaultCloudAgentProvider,
    writeClaudeEnvironmentId,
} from './settings.ts';

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

function setEnvironmentRequest(
    environmentId: string | null,
    provider: 'claude' | 'cursor' = 'claude'
) {
    return {
        operation: { environmentId, kind: 'set-environment' as const },
        provider,
        requestId: 'req_set_environment',
        type: 'cloud-agent-capability-request' as const,
    };
}

function installFakeClaude(environments: Array<{ id: string; name: string }> = []) {
    const provider = {
        ...createFakeCloudAgentProvider(),
        listEnvironments: () => Promise.resolve(environments),
        provider: 'claude' as const,
    };
    restores.push(setCloudAgentProvider(provider));
    return provider;
}

/** A host HOME whose Claude login resolves, and Anthropic's own environment list stubbed. */
async function hostClaudeEnvironments(environments: Record<string, unknown>[]) {
    const home = await mkdtemp(join(tmpdir(), 'haus-cloud-capability-home-'));
    restores.push(() => rm(home, { force: true, recursive: true }));
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(
        join(home, '.claude', '.credentials.json'),
        JSON.stringify({
            claudeAiOauth: {
                accessToken: 'sk-ant-oat01-agents',
                expiresAt: Date.now() + 60 * 60_000,
                refreshToken: 'refresh',
            },
        })
    );
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    restores.push(() => {
        process.env.HOME = previousHome;
    });
    const original = globalThis.fetch;
    globalThis.fetch = ((url: URL | string) => {
        if (String(url) === 'https://api.anthropic.com/api/oauth/profile') {
            return Promise.resolve(
                Response.json({
                    account: { email: 'zach@example.com' },
                    organization: { uuid: 'org-uuid' },
                })
            );
        }
        if (String(url) === 'https://api.anthropic.com/v1/environment_providers') {
            return Promise.resolve(Response.json({ environments }));
        }
        throw new Error(`Unstubbed fetch: ${url}`);
    }) as typeof fetch;
    restores.push(() => {
        globalThis.fetch = original;
    });
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
        environmentId: null,
        environments: null,
        expiresAt: null,
        isDefault: true,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
    });

    const connected = await runCloudAgentCapabilityRequest(request('connect'), runtime, dataRoot);
    expect(connected.result).toEqual({
        accountEmail: 'delegate@example.com',
        environmentId: null,
        environments: null,
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
    expect((await detectFullInventory({ dataRoot })).cloudAgentProviders).toEqual([
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
    expect((await detectFullInventory({ dataRoot })).cloudAgentProviders).toEqual([
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
            await detectFullInventory({ dataRoot, defaultCloudAgentProvider: 'claude' })
        ).cloudAgentProviders?.map((entry) => [entry.provider, entry.isDefault])
    ).toEqual([
        ['cursor', false],
        ['claude', true],
    ]);
});

test('get reports Claude’s environments and current pin; other providers report neither', async () => {
    installFakeClaude([
        { id: 'env_a', name: 'Alpha' },
        { id: 'env_b', name: 'Beta' },
    ]);
    await writeClaudeEnvironmentId(dataRoot, 'env_a');

    const claude = await runCloudAgentCapabilityRequest(
        request('get', 'claude'),
        runtime,
        dataRoot
    );
    expect(claude.result).toMatchObject({
        environmentId: 'env_a',
        environments: [
            { id: 'env_a', name: 'Alpha' },
            { id: 'env_b', name: 'Beta' },
        ],
        provider: 'claude',
    });

    installDisconnectedCursor();
    const cursor = await runCloudAgentCapabilityRequest(
        request('get', 'cursor'),
        runtime,
        dataRoot
    );
    expect(cursor.result).toMatchObject({
        environmentId: null,
        environments: null,
        provider: 'cursor',
    });
});

test('an unready Claude reports its pin but no live environment list', async () => {
    const provider = installFakeClaude();
    provider.readiness = () => Promise.resolve({ ready: false, reason: 'not-connected' });
    await writeClaudeEnvironmentId(dataRoot, 'env_a');

    const claude = await runCloudAgentCapabilityRequest(
        request('get', 'claude'),
        runtime,
        dataRoot
    );
    expect(claude.result).toMatchObject({
        environmentId: 'env_a',
        environments: null,
        ready: false,
    });
});

test('set-environment pins a live environment and persists it', async () => {
    await hostClaudeEnvironments([
        { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
    ]);

    const result = await runCloudAgentCapabilityRequest(
        setEnvironmentRequest('env_a'),
        runtime,
        dataRoot
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({ environmentId: 'env_a' });
    expect(await readClaudeEnvironmentId(dataRoot)).toBe('env_a');
});

test('set-environment rejects an id missing from the live list, and never writes it', async () => {
    await hostClaudeEnvironments([
        { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
    ]);

    const result = await runCloudAgentCapabilityRequest(
        setEnvironmentRequest('env_gone'),
        runtime,
        dataRoot
    );
    expect(result.error).toContain('env_gone');
    expect(result.result).toBeUndefined();
    expect(await readClaudeEnvironmentId(dataRoot)).toBeNull();
});

test('set-environment rejects an archived id', async () => {
    await hostClaudeEnvironments([
        { environment_id: 'env_old', kind: 'anthropic_cloud', name: 'Old', state: 'archived' },
    ]);

    const result = await runCloudAgentCapabilityRequest(
        setEnvironmentRequest('env_old'),
        runtime,
        dataRoot
    );
    expect(result.error).toContain('env_old');
    expect(await readClaudeEnvironmentId(dataRoot)).toBeNull();
});

test('set-environment with null unpins, with no live check needed', async () => {
    await writeClaudeEnvironmentId(dataRoot, 'env_a');
    installFakeClaude([{ id: 'env_a', name: 'Alpha' }]);

    const result = await runCloudAgentCapabilityRequest(
        setEnvironmentRequest(null),
        runtime,
        dataRoot
    );
    expect(result.error).toBeUndefined();
    expect(await readClaudeEnvironmentId(dataRoot)).toBeNull();
});

test('set-environment refuses a provider with no environment concept', async () => {
    installDisconnectedCursor();

    const result = await runCloudAgentCapabilityRequest(
        setEnvironmentRequest('env_a', 'cursor'),
        runtime,
        dataRoot
    );
    expect(result.error).toContain('cursor');
    expect(await readClaudeEnvironmentId(dataRoot)).toBeNull();
});

const claudeUnavailable = {
    isDefault: false,
    models: null,
    provider: 'claude' as const,
    ready: false,
    reason: 'provider-unavailable' as const,
};
