import { dirname, join } from 'node:path';
import type { InvocationOperation } from '@haus/api';
import { touchAgentWorktreeAt } from '../repos/agent-worktrees.ts';
import type { OperationContext } from './operation.ts';
import { resolveMachinePath } from './paths.ts';

export async function recordWorktreeUse(
    agentsRoot: string,
    operation: InvocationOperation,
    context: Pick<OperationContext, 'cwd' | 'env' | 'sessionGeneration'>
) {
    const path = usedPath(operation);
    if (path !== null) {
        const root = join(dirname(agentsRoot), 'worktrees');
        await touchAgentWorktreeAt(
            resolveMachinePath(path, context),
            root,
            context.sessionGeneration
        );
    }
}

function usedPath(operation: InvocationOperation) {
    switch (operation.kind) {
        case 'edit':
            return operation.edit.command === 'apply_patch'
                ? (operation.edit.cwd ?? '.')
                : operation.edit.path;
        case 'file-read':
        case 'file-write':
        case 'view-image':
            return operation.path;
        default:
            return null;
    }
}
