import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    readClaudeEnvironmentId,
    readDefaultCloudAgentProvider,
    writeClaudeEnvironmentId,
    writeDefaultCloudAgentProvider,
} from './settings.ts';

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

async function dataRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'haus-cloud-settings-'));
    roots.push(root);
    return root;
}

test('an unconfigured Computer defaults to Cursor with no environment pin', async () => {
    const root = await dataRoot();
    expect(await readDefaultCloudAgentProvider(root)).toBe('cursor');
    expect(await readClaudeEnvironmentId(root)).toBeNull();
});

test('writing the default provider leaves no environment pin set', async () => {
    const root = await dataRoot();
    await writeDefaultCloudAgentProvider(root, 'claude');
    expect(await readDefaultCloudAgentProvider(root)).toBe('claude');
    expect(await readClaudeEnvironmentId(root)).toBeNull();
});

test('writing the environment pin does not clobber the default provider', async () => {
    const root = await dataRoot();
    await writeDefaultCloudAgentProvider(root, 'claude');
    await writeClaudeEnvironmentId(root, 'env_bidbeacon');
    expect(await readClaudeEnvironmentId(root)).toBe('env_bidbeacon');
    expect(await readDefaultCloudAgentProvider(root)).toBe('claude');
});

test('writing the default provider after a pin does not clobber the pin', async () => {
    const root = await dataRoot();
    await writeClaudeEnvironmentId(root, 'env_bidbeacon');
    await writeDefaultCloudAgentProvider(root, 'claude');
    expect(await readDefaultCloudAgentProvider(root)).toBe('claude');
    expect(await readClaudeEnvironmentId(root)).toBe('env_bidbeacon');
});

test('unpinning writes null back', async () => {
    const root = await dataRoot();
    await writeClaudeEnvironmentId(root, 'env_bidbeacon');
    await writeClaudeEnvironmentId(root, null);
    expect(await readClaudeEnvironmentId(root)).toBeNull();
});

test('a file written before the environment pin existed still reads', async () => {
    const root = await dataRoot();
    await writeFile(join(root, 'cloud-agents.json'), JSON.stringify({ defaultProvider: 'claude' }));
    expect(await readDefaultCloudAgentProvider(root)).toBe('claude');
    expect(await readClaudeEnvironmentId(root)).toBeNull();

    await writeClaudeEnvironmentId(root, 'env_default');
    expect(JSON.parse(await readFile(join(root, 'cloud-agents.json'), 'utf8'))).toEqual({
        defaultProvider: 'claude',
        claudeEnvironmentId: 'env_default',
    });
});
