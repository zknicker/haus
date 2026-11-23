import type { AttachmentConnectionWork } from '../attachment-connection-work.ts';
import { pruneIdleAgentWorktrees } from './agent-worktrees.ts';

export function startAgentWorktreeSweep(
    work: Pick<AttachmentConnectionWork, 'startLoop'>,
    input: { dataRoot: string; serverId: string; track<T>(work: Promise<T>): Promise<T> }
) {
    const sweep = async () => {
        await input.track(pruneIdleAgentWorktrees(input));
    };
    void sweep().catch(logSweepFailure);
    work.startLoop('1 day', sweep, logSweepFailure);
}

function logSweepFailure(cause: unknown) {
    console.error(
        `The Agent worktree sweep did not finish: ${cause instanceof Error ? cause.message : cause}`
    );
}
