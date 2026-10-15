import { expect, test } from 'bun:test';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkspaceDisk } from './disk-image.ts';
import { migrateAgentWorkspace } from './maintenance.ts';

for (const scenario of ['volume metadata', 'unexpected file', 'source metadata directory']) {
    test.skipIf(process.platform !== 'darwin')(
        `migration verifies personal files with ${scenario}`,
        async () => {
            const dataRoot = await mkdtemp(join(tmpdir(), 'haus-migration-metadata-'));
            const agentRoot = join(dataRoot, 'agent');
            const workspace = join(agentRoot, 'workspace');
            const staging = join(agentRoot, 'workspace-migration-mount');
            const mounted = new Set<string>();
            const uuid = 'test-volume';
            const disk: WorkspaceDisk = {
                compact: async () => undefined,
                create: async (image) => {
                    await mkdir(image);
                },
                detach: async (path) => {
                    mounted.delete(path);
                },
                holders: async () => [],
                mount: async (_image, path) => {
                    await mkdir(path, { recursive: true });
                    await chmod(path, 0o700);
                    if (path === staging) {
                        await mkdir(join(path, '.fseventsd'), { recursive: true });
                        await writeFile(join(path, '.fseventsd', 'events'), 'OS bookkeeping');
                        if (scenario === 'unexpected file') {
                            await writeFile(join(path, 'unexpected.txt'), 'not from the source');
                        }
                    } else {
                        await cp(staging, path, { recursive: true, preserveTimestamps: true });
                    }
                    mounted.add(path);
                    return uuid;
                },
                mountedUuid: async (path) => (mounted.has(path) ? uuid : null),
                mounts: async () => [...mounted],
            };
            try {
                await mkdir(workspace, { recursive: true });
                await writeFile(join(workspace, 'personal.txt'), 'keep exactly');
                if (scenario === 'source metadata directory') {
                    await mkdir(join(workspace, '.fseventsd'));
                    await writeFile(join(workspace, '.fseventsd', 'personal.txt'), 'also personal');
                }
                const migration = migrateAgentWorkspace({
                    agentRoot,
                    dataRoot,
                    disk,
                    assertComputerStopped: async () => undefined,
                    options: {
                        capacityBytes: 128 * 1024 ** 2,
                        cacheBytes: 1024 ** 2,
                        reserveBytes: 1024 ** 2,
                    },
                });
                if (scenario === 'volume metadata') {
                    const result = await migration;
                    expect(await readFile(join(result.path, 'personal.txt'), 'utf8')).toBe(
                        'keep exactly'
                    );
                    expect(await readFile(join(result.backup, 'personal.txt'), 'utf8')).toBe(
                        'keep exactly'
                    );
                } else {
                    await expect(migration).rejects.toThrow('copy verification failed');
                    expect(await readFile(join(workspace, 'personal.txt'), 'utf8')).toBe(
                        'keep exactly'
                    );
                }
            } finally {
                await rm(dataRoot, { force: true, recursive: true });
            }
        }
    );
}
