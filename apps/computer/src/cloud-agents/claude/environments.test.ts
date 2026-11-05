import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClaudeEnvironmentId } from '../settings.ts';
import {
    ClaudeCloudEnvironmentUnavailableError,
    cloudAgentEnvironmentsOf,
    listClaudeCloudEnvironments,
    listClaudeCloudEnvironmentsAutoPinning,
    requireLiveClaudeCloudEnvironment,
} from './environments.ts';

const restores: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    for (const restore of restores.splice(0).reverse()) {
        await restore();
    }
});

/** A host HOME whose Claude login is the file Haus's Claude Code Agents read. */
async function hostHome(): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-env-'));
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
    return home;
}

function stubFetch(responses: Record<string, { body: unknown; status?: number }>) {
    const original = globalThis.fetch;
    globalThis.fetch = ((url: URL | string) => {
        const match = responses[String(url)];
        if (!match) {
            throw new Error(`Unstubbed fetch: ${url}`);
        }
        return Promise.resolve(Response.json(match.body, { status: match.status ?? 200 }));
    }) as typeof fetch;
    restores.push(() => {
        globalThis.fetch = original;
    });
}

const profileResponse = {
    account: { email: 'zach@example.com' },
    organization: { uuid: 'org-uuid' },
};

function environmentsResponse(environments: Record<string, unknown>[]) {
    return {
        'https://api.anthropic.com/api/oauth/profile': { body: profileResponse },
        'https://api.anthropic.com/v1/environment_providers': { body: { environments } },
    };
}

test('only Anthropic-hosted environments are listed, sorted by name', async () => {
    await hostHome();
    stubFetch(
        environmentsResponse([
            { environment_id: 'env_z', kind: 'anthropic_cloud', name: 'zeta', state: 'active' },
            { environment_id: 'ccpool_x', kind: 'self_hosted', name: 'alpha', state: 'active' },
            { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
        ])
    );

    const environments = await listClaudeCloudEnvironments();

    expect(environments).toEqual([
        { id: 'env_a', name: 'Alpha', state: 'active' },
        { id: 'env_z', name: 'zeta', state: 'active' },
    ]);
    expect(cloudAgentEnvironmentsOf(environments)).toEqual([
        { id: 'env_a', name: 'Alpha' },
        { id: 'env_z', name: 'zeta' },
    ]);
});

test('a pin missing from the live list is refused by name', async () => {
    await hostHome();
    stubFetch(
        environmentsResponse([
            { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
        ])
    );

    const rejection = requireLiveClaudeCloudEnvironment('env_gone');
    await expect(rejection).rejects.toBeInstanceOf(ClaudeCloudEnvironmentUnavailableError);
    await expect(rejection).rejects.toThrow('env_gone');
});

test('an archived pin is refused even though it is still listed', async () => {
    await hostHome();
    stubFetch(
        environmentsResponse([
            { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'ARCHIVED' },
        ])
    );

    await expect(requireLiveClaudeCloudEnvironment('env_a')).rejects.toBeInstanceOf(
        ClaudeCloudEnvironmentUnavailableError
    );
});

test('a live pin resolves to its current name', async () => {
    await hostHome();
    stubFetch(
        environmentsResponse([
            { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
        ])
    );

    expect(await requireLiveClaudeCloudEnvironment('env_a')).toEqual({
        id: 'env_a',
        name: 'Alpha',
        state: 'active',
    });
});

async function claudeDataRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-env-dataroot-'));
    restores.push(() => rm(root, { force: true, recursive: true }));
    return root;
}

test('an unpinned Computer with exactly one live environment auto-pins it', async () => {
    await hostHome();
    stubFetch(
        environmentsResponse([
            { environment_id: 'env_only', kind: 'anthropic_cloud', name: 'Only', state: 'active' },
        ])
    );
    const dataRoot = await claudeDataRoot();

    expect(await listClaudeCloudEnvironmentsAutoPinning(dataRoot)).toEqual({
        environmentId: 'env_only',
        environments: [{ id: 'env_only', name: 'Only', state: 'active' }],
    });
    expect(await readClaudeEnvironmentId(dataRoot)).toBe('env_only');
});

test('an unpinned Computer with several live environments pins none', async () => {
    await hostHome();
    stubFetch(
        environmentsResponse([
            { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
            { environment_id: 'env_b', kind: 'anthropic_cloud', name: 'Beta', state: 'active' },
        ])
    );
    const dataRoot = await claudeDataRoot();

    expect(await listClaudeCloudEnvironmentsAutoPinning(dataRoot)).toEqual({
        environmentId: null,
        environments: [
            { id: 'env_a', name: 'Alpha', state: 'active' },
            { id: 'env_b', name: 'Beta', state: 'active' },
        ],
    });
    expect(await readClaudeEnvironmentId(dataRoot)).toBeNull();
});
