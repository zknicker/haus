import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClaudeEnvironmentId, writeClaudeEnvironmentId } from './settings.ts';

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

async function dataRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'haus-worker-settings-'));
    roots.push(root);
    return root;
}

test('an unconfigured Computer has no environment pin', async () => {
    expect(await readClaudeEnvironmentId(await dataRoot())).toBeNull();
});

test('unpinning writes null back', async () => {
    const root = await dataRoot();
    await writeClaudeEnvironmentId(root, 'env_bidbeacon');
    expect(await readClaudeEnvironmentId(root)).toBe('env_bidbeacon');
    await writeClaudeEnvironmentId(root, null);
    expect(await readClaudeEnvironmentId(root)).toBeNull();
});

test('a file that still names a default provider keeps its pin and drops the provider', async () => {
    const root = await dataRoot();
    const path = join(root, 'cloud-agents.json');
    await writeFile(
        path,
        JSON.stringify({ claudeEnvironmentId: 'env_kept', defaultProvider: 'claude' })
    );
    expect(await readClaudeEnvironmentId(root)).toBe('env_kept');

    await writeClaudeEnvironmentId(root, 'env_default');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
        claudeEnvironmentId: 'env_default',
    });
});
