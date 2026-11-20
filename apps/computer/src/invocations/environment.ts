import { mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { reminderScriptEnvironment } from '../reminder-script.ts';

export async function invocationEnvironment(
    agentsRoot: string,
    agentId: string,
    operationCwd: string | undefined
) {
    const { dataRoot, serverId } = agentsRootParts(agentsRoot);
    const agentRoot = join(agentsRoot, agentId);
    const workspace = join(agentRoot, 'workspace');
    const home = join(agentRoot, 'home');
    await Promise.all([
        mkdir(workspace, { mode: 0o700, recursive: true }),
        mkdir(home, { mode: 0o700, recursive: true }),
    ]);
    return {
        cwd: operationCwd === undefined ? workspace : resolve(workspace, operationCwd),
        env: reminderScriptEnvironment(home, dataRoot, serverId),
    };
}

function agentsRootParts(agentsRoot: string) {
    const serverRoot = dirname(agentsRoot);
    const serversRoot = dirname(serverRoot);
    if (basename(agentsRoot) !== 'agents' || basename(serversRoot) !== 'servers') {
        throw new Error(`${agentsRoot} is not <dataRoot>/servers/<serverId>/agents.`);
    }
    return { dataRoot: dirname(serversRoot), serverId: basename(serverRoot) };
}
