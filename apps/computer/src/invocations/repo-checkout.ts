import { basename, dirname } from 'node:path';
import { agentCheckoutText, checkoutAgentWorktree } from '../repos/agent-worktrees.ts';
import { githubAppGit } from '../repos/github-git.ts';
import { WorkerCheckoutError } from '../workers/computer/git.ts';
import { type OperationRunner, stoppedOutcome, textResult } from './operation.ts';

export function createRepoCheckoutRunner(agentsRoot: string) {
    const serverRoot = dirname(agentsRoot);
    const scope = { dataRoot: dirname(dirname(serverRoot)), serverId: basename(serverRoot) };
    const runner: OperationRunner<'repo-checkout'> = async (operation, context) => {
        if (operation.folder === undefined) {
            return textResult(
                'failed',
                `This Computer has no folder for ${operation.repository}. Ask the person who attached it to add one.`
            );
        }
        try {
            const receipt = await checkoutAgentWorktree({
                ...scope,
                agentId: context.agentId,
                folder: operation.folder,
                git: githubAppGit(scope.dataRoot, scope.serverId, {
                    access: 'write',
                    invocationId: context.invocationId,
                }),
                ref: operation.ref,
                repository: operation.repository,
                signal: context.signal,
            });
            return textResult('completed', agentCheckoutText(receipt));
        } catch (cause) {
            const stopped = stoppedOutcome(context.signal);
            if (stopped) {
                return textResult(
                    stopped,
                    `Stopped before the worktree of ${operation.repository} was ready.`
                );
            }
            if (cause instanceof WorkerCheckoutError) {
                return textResult('failed', cause.message);
            }
            throw cause;
        }
    };
    return runner;
}
