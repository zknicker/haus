import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudAgentLaunchRejectedError } from '../provider.ts';
import { readClaudeEnvironmentId, writeClaudeEnvironmentId } from '../settings.ts';
import { createClaudeCloudAgentProvider, resolveClaudeEnvironment } from './provider.ts';

const restores: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    for (const restore of restores.splice(0).reverse()) {
        await restore();
    }
});

/** A host HOME whose Claude login is the file Haus's Claude Code Agents read. */
async function hostHome(): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-provider-'));
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

function stubFetch(environments: Record<string, unknown>[]) {
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

async function claudeDataRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-settings-'));
    restores.push(() => rm(root, { force: true, recursive: true }));
    return root;
}

const startInput = {
    idempotencyKey: 'car_run',
    instructions: 'Trim the copy.',
    model: null,
    ref: null,
    repository: 'haus/haus',
    title: 'Trim the copy',
    workId: 'caw_work',
};

test('a pin that no longer exists fails the launch before any checkout', async () => {
    await hostHome();
    stubFetch([]);
    const dataRoot = await claudeDataRoot();
    await writeClaudeEnvironmentId(dataRoot, 'env_gone');

    const rejection = createClaudeCloudAgentProvider(dataRoot).start(startInput);
    await expect(rejection).rejects.toBeInstanceOf(CloudAgentLaunchRejectedError);
    await expect(rejection).rejects.toThrow('env_gone');
});

test('an archived pin fails the launch by name', async () => {
    await hostHome();
    stubFetch([
        { environment_id: 'env_archived', kind: 'anthropic_cloud', name: 'Old', state: 'archived' },
    ]);
    const dataRoot = await claudeDataRoot();
    await writeClaudeEnvironmentId(dataRoot, 'env_archived');

    await expect(createClaudeCloudAgentProvider(dataRoot).start(startInput)).rejects.toThrow(
        'env_archived'
    );
});

test('a valid pin resolves to the environment start() reports', async () => {
    await hostHome();
    stubFetch([
        { environment_id: 'env_live', kind: 'anthropic_cloud', name: 'BidBeacon', state: 'active' },
    ]);
    const dataRoot = await claudeDataRoot();
    await writeClaudeEnvironmentId(dataRoot, 'env_live');

    expect(await resolveClaudeEnvironment(dataRoot)).toEqual({ id: 'env_live', name: 'BidBeacon' });
});

test('an unpinned Computer with exactly one environment auto-pins it and resolves to it', async () => {
    await hostHome();
    stubFetch([
        { environment_id: 'env_only', kind: 'anthropic_cloud', name: 'Only', state: 'active' },
    ]);
    const dataRoot = await claudeDataRoot();

    expect(await resolveClaudeEnvironment(dataRoot)).toEqual({ id: 'env_only', name: 'Only' });
    expect(await readClaudeEnvironmentId(dataRoot)).toBe('env_only');
});

test('an unpinned Computer with zero or several environments refuses the launch', async () => {
    await hostHome();

    stubFetch([]);
    const emptyDataRoot = await claudeDataRoot();
    const emptyRejection = resolveClaudeEnvironment(emptyDataRoot);
    await expect(emptyRejection).rejects.toBeInstanceOf(CloudAgentLaunchRejectedError);
    await expect(emptyRejection).rejects.toThrow('Choose a Claude environment');

    stubFetch([
        { environment_id: 'env_a', kind: 'anthropic_cloud', name: 'Alpha', state: 'active' },
        { environment_id: 'env_b', kind: 'anthropic_cloud', name: 'Beta', state: 'active' },
    ]);
    const severalDataRoot = await claudeDataRoot();
    const severalRejection = resolveClaudeEnvironment(severalDataRoot);
    await expect(severalRejection).rejects.toBeInstanceOf(CloudAgentLaunchRejectedError);
    await expect(severalRejection).rejects.toThrow('Choose a Claude environment');
});
