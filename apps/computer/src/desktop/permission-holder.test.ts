import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    clearPermissionsMoved,
    permissionHolder,
    permissionsMoved,
    recordPermissionHolder,
} from './permission-holder.ts';

const bare = '/Users/me/.local/bin/haus-computer';
const bundled =
    '/Users/me/.local/share/haus-computer/Haus Computer.app/Contents/MacOS/haus-computer';

test('a bundled executable holds its permissions as its app', () => {
    expect(permissionHolder(bundled)).toBe(
        '/Users/me/.local/share/haus-computer/Haus Computer.app'
    );
    expect(permissionHolder(bare)).toBe(bare);
});

test('moving from the bare executable into the app marks the permissions moved', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-permission-holder-'));
    try {
        await recordPermissionHolder({ dataRoot, next: bundled, previous: bare });
        expect(await permissionsMoved(dataRoot)).toBe(true);

        await clearPermissionsMoved(dataRoot);
        expect(await permissionsMoved(dataRoot)).toBe(false);
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a first install and an update inside the same app move nothing', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-permission-holder-'));
    try {
        await recordPermissionHolder({ dataRoot, next: bundled, previous: null });
        await recordPermissionHolder({ dataRoot, next: bundled, previous: bundled });
        expect(await permissionsMoved(dataRoot)).toBe(false);
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});
