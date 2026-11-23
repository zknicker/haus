import { mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { reminderScriptEnvironment } from '../reminder-script.ts';
import { readGithubBotIdentity } from '../repos/github-bot-identity.ts';
import { agentGitEnvironment, githubAppGit } from '../repos/github-git.ts';

/**
 * Where an Agent command runs and its environment. Its git reaches GitHub only
 * as the Haus GitHub App, through the Computer's credential helper for this
 * command, and commits as the App's bot.
 */
export async function invocationEnvironment(
    agentsRoot: string,
    command: { agentId: string; invocationId: string },
    operationCwd: string | undefined
) {
    const { agentId, invocationId } = command;
    const { dataRoot, serverId } = agentsRootParts(agentsRoot);
    const agentRoot = join(agentsRoot, agentId);
    const workspace = join(agentRoot, 'workspace');
    const home = join(agentRoot, 'home');
    await Promise.all([
        mkdir(workspace, { mode: 0o700, recursive: true }),
        mkdir(home, { mode: 0o700, recursive: true }),
    ]);
    const identity = await readGithubBotIdentity(dirname(agentsRoot));
    return {
        cwd: operationCwd === undefined ? workspace : resolve(workspace, operationCwd),
        env: {
            ...reminderScriptEnvironment(home, dataRoot, serverId),
            ...agentGitEnvironment(
                githubAppGit(dataRoot, serverId, { access: 'write', invocationId }),
                identity
            ),
        },
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
