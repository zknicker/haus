import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateAgentWorkspace } from './maintenance.ts';

test('maintenance refuses a running Computer and preserves an ordinary workspace', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-maintenance-'));
    const agentRoot = join(dataRoot, 'agent');
    try {
        await mkdir(join(agentRoot, 'workspace'), { recursive: true });
        await writeFile(join(agentRoot, 'workspace', 'notes'), 'keep');
        await expect(
            migrateAgentWorkspace({
                dataRoot,
                agentRoot,
                assertComputerStopped: async () => {
                    throw new Error('still running');
                },
            })
        ).rejects.toThrow('still running');
        const result = await migrateAgentWorkspace({
            dataRoot,
            agentRoot,
            assertComputerStopped: async () => undefined,
        });
        expect(result.path).toBe(join(agentRoot, 'workspace'));
        expect(await readFile(join(result.path, 'notes'), 'utf8')).toBe('keep');
    } finally {
        await rm(dataRoot, { recursive: true, force: true });
    }
});
