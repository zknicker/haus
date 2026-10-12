import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Attachment } from '../launch.ts';
import { runWorkspaceMaintenance } from './command.ts';

test.skipIf(process.platform !== 'darwin')(
    'workspace maintenance resolves the documented slash-prefixed Server slug',
    async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), 'haus-maintenance-target-'));
        const serverRoot = join(dataRoot, 'servers', 'srv_fixture');
        try {
            await mkdir(serverRoot, { recursive: true });
            await writeFile(
                join(serverRoot, 'attachment.json'),
                JSON.stringify({
                    computerId: 'cmp_fixture',
                    credential: 'fixture-credential',
                    serverId: 'srv_fixture',
                    serverOrigin: 'https://haus.test',
                    slug: 'haus',
                } satisfies Attachment)
            );
            await expect(
                runWorkspaceMaintenance({
                    agentId: 'agt_fixture',
                    command: 'workspace-compact',
                    dataRoot,
                    target: '/haus',
                })
            ).rejects.toThrow('Stop the whole Computer');
        } finally {
            await rm(dataRoot, { force: true, recursive: true });
        }
    }
);
