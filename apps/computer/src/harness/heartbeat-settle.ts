import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { latestCheckpoint, pruneCheckpoints } from './heartbeat-checkpoints.ts';
import { recordHeartbeatSettled } from './heartbeat-note.ts';

/**
 * After a heartbeat run settles: counts it for the main session's quiet-run note and
 * deletes checkpoints past retention. A failure is logged and never fails the run.
 */
export async function settleHeartbeat(input: {
    agentRoot: string;
    now?: Date;
    reported: boolean;
    runtime: DaemonRuntime;
    workspaceDir: string;
}): Promise<void> {
    try {
        await pruneCheckpoints(input.workspaceDir, input.now ?? new Date());
        await recordHeartbeatSettled(input.agentRoot, {
            latestCheckpoint: await latestCheckpoint(input.workspaceDir),
            reported: input.reported,
        });
    } catch (error) {
        await input.runtime.runPromise(
            Effect.logWarning('Heartbeat settlement was not recorded.').pipe(
                Effect.annotateLogs({
                    errorCode: (error as NodeJS.ErrnoException | null)?.code ?? 'unknown',
                    event: 'heartbeat-settle-failed',
                })
            )
        );
    }
}
