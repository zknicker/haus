import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { runCloudAgentCapabilityRequest } from './capability-requests.ts';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import { createRecordedCursorTransport, recordedAuth } from './cursor/recorded-transport.ts';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { unavailableCloudAgentProvider } from './provider.ts';
import { closeProviderSignIns } from './provider-sign-in.ts';
import { setCloudAgentProvider } from './registry.ts';
import { readClaudeEnvironmentId, writeClaudeEnvironmentId } from './settings.ts';

const runtime = makeTestRuntime();
afterAll(() => runtime.dispose());

const restores: Array<() => void> = [];
let dataRoot = '';

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-capability-env-'));
    // A developer's own Claude Code sign-in must not leak into these readings.
    restores.push(setCloudAgentProvider(unavailableCloudAgentProvider('claude')));
    // The live environment list reads the host login directly, past the provider fake, so every
    // test starts on a throwaway login and an empty list. A test wanting environments stubs them.
    await hostClaudeEnvironments([]);
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
}

function request(kind: 'get', provider: 'claude' | 'cursor') {
    return {
        operation: { kind },
        provider,
        requestId: 'req_capability_env',
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

function installFakeClaude() {
    const provider = { ...createFakeCloudAgentProvider(), provider: 'claude' as const };
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

test('get reports Claude’s environments and current pin; other providers report neither', async () => {
    installFakeClaude();
    await hostClaudeEnvironments([
        { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
        { environment_id: 'env_b', kind: 'anthropic_cloud', name: 'Beta', state: 'active' },
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

test('get on an unpinned Computer with exactly one environment auto-pins it, idempotently', async () => {
    installFakeClaude();
    await hostClaudeEnvironments([
        { environment_id: 'env_only', kind: 'anthropic_cloud', name: 'Only', state: 'active' },
    ]);

    const first = await runCloudAgentCapabilityRequest(request('get', 'claude'), runtime, dataRoot);
    expect(first.result).toMatchObject({
        environmentId: 'env_only',
        environments: [{ id: 'env_only', name: 'Only' }],
    });
    expect(await readClaudeEnvironmentId(dataRoot)).toBe('env_only');

    const second = await runCloudAgentCapabilityRequest(
        request('get', 'claude'),
        runtime,
        dataRoot
    );
    expect(second.result).toMatchObject({ environmentId: 'env_only' });
    expect(second.error).toBeUndefined();
});

function environmentFixture(id: string, name: string, createdAt?: string): Record<string, unknown> {
    return {
        created_at: createdAt,
        environment_id: id,
        kind: 'anthropic_cloud',
        name,
        state: 'active',
    };
}

test('get on an unpinned Computer with several environments and no Default auto-pins the oldest', async () => {
    installFakeClaude();
    await hostClaudeEnvironments([
        environmentFixture('env_newer', 'Newer', '2026-06-01T00:00:00Z'),
        environmentFixture('env_older', 'Older', '2026-01-01T00:00:00Z'),
    ]);

    const claude = await runCloudAgentCapabilityRequest(
        request('get', 'claude'),
        runtime,
        dataRoot
    );
    expect(claude.error).toBeUndefined();
    expect(claude.result).toMatchObject({ environmentId: 'env_older' });
    expect(await readClaudeEnvironmentId(dataRoot)).toBe('env_older');
});

test('get on an unpinned Computer with several environments pins the one named Default', async () => {
    installFakeClaude();
    await hostClaudeEnvironments([
        environmentFixture('env_a', 'Alpha'),
        environmentFixture('env_default', 'Default'),
    ]);

    const claude = await runCloudAgentCapabilityRequest(
        request('get', 'claude'),
        runtime,
        dataRoot
    );
    expect(claude.error).toBeUndefined();
    expect(claude.result).toMatchObject({ environmentId: 'env_default' });
    expect(await readClaudeEnvironmentId(dataRoot)).toBe('env_default');
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
    installFakeClaude();

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
