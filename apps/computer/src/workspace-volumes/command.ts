import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createAttachmentStore } from '../attachment-store.ts';
import { processExists } from '../pid-lock.ts';
import { compactAgentWorkspace, migrateAgentWorkspace } from './maintenance.ts';

const execute = promisify(execFile);

export async function runWorkspaceMaintenance(input: {
    command: 'workspace-migrate' | 'workspace-compact';
    dataRoot: string;
    target: string | undefined;
    agentId: string | undefined;
}) {
    if (process.platform !== 'darwin') {
        throw new Error('Haus Computers currently require macOS.');
    }
    if (
        !(
            input.target?.startsWith('/') &&
            input.agentId &&
            /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(input.agentId)
        )
    ) {
        throw new Error(`Usage: haus-computer ${input.command} /server-slug <agent-id>`);
    }
    const attachment = await createAttachmentStore(input.dataRoot).findAttachment(
        input.target.slice(1)
    );
    if (!attachment) {
        throw new Error('Server attachment was not found.');
    }
    const agentRoot = join(input.dataRoot, 'servers', attachment.serverId, 'agents', input.agentId);
    const assertComputerStopped = () => assertStopped(input.dataRoot, agentRoot);
    const options = { agentRoot, dataRoot: input.dataRoot, assertComputerStopped };
    return input.command === 'workspace-migrate'
        ? await migrateAgentWorkspace(options)
        : await compactAgentWorkspace(options);
}

async function assertStopped(dataRoot: string, agentRoot: string) {
    await readFile(join(dataRoot, 'stopped')).catch(() => {
        throw new Error(
            'Stop the whole Computer with haus-computer stop before workspace maintenance.'
        );
    });
    for (const server of await readdir(join(dataRoot, 'servers'))) {
        const marker = await readFile(
            join(dataRoot, 'servers', server, 'attachment-daemon.pid'),
            'utf8'
        ).catch((error: unknown) => {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                return null;
            }
            throw error;
        });
        if (marker) {
            const value: unknown = JSON.parse(marker);
            if (
                !(
                    value &&
                    typeof value === 'object' &&
                    'pid' in value &&
                    typeof value.pid === 'number'
                )
            ) {
                throw new Error('Cannot verify Computer daemon state.');
            }
            if (processExists(value.pid)) {
                throw new Error('A Computer daemon is still running.');
            }
        }
    }
    const processes = await execute('/bin/ps', ['-axo', 'pid=,command=']);
    for (const line of processes.stdout.split('\n')) {
        const match = /^\s*(\d+)\s+(.*)$/u.exec(line);
        if (match && Number(match[1]) !== process.pid && match[2]?.includes(dataRoot)) {
            throw new Error(
                'A process still references this Computer data root. Stop it before maintenance.'
            );
        }
    }
    try {
        const holders = await execute('/usr/sbin/lsof', ['-t', '+D', join(agentRoot, 'workspace')]);
        if (holders.stdout.trim()) {
            throw new Error('A process still has this workspace open.');
        }
    } catch (error) {
        if (
            error instanceof Error &&
            'code' in error &&
            error.code === 1 &&
            'stderr' in error &&
            error.stderr === ''
        ) {
            return;
        }
        throw error;
    }
}
