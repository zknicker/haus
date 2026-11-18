import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    openRouterManagementKeyPath,
    readOpenRouterManagementKey,
    saveOpenRouterManagementKey,
} from './openrouter-settings.ts';

test('OpenRouter management key stays in a private Computer-local file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-openrouter-key-'));

    try {
        await expect(readOpenRouterManagementKey(root)).resolves.toBeNull();
        await saveOpenRouterManagementKey(root, '  management-secret  ');

        expect(await readOpenRouterManagementKey(root)).toBe('management-secret');
        expect(await readFile(openRouterManagementKeyPath(root), 'utf8')).toBe(
            'management-secret\n'
        );
        expect((await stat(openRouterManagementKeyPath(root))).mode & 0o777).toBe(0o600);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});
