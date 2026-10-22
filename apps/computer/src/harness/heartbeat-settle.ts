import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { latestCheckpoint, pruneCheckpoints } from './heartbeat-checkpoints.ts';
import { recordHeartbeatSettled } from './heartbeat-note.ts';

/**
 * After a heartbeat run completes: counts it once for the main session's quiet-run
 * note (a replayed run id is ignored) and deletes checkpoints past retention. Any
 * other run, or a run that did not complete, is left alone. A failure is logged and
 * never fails the run.
 */
export async function settleHeartbeat(input: {
    agentRoot: string;
    command: { heartbeat?: unknown; runId: string };
    now?: Date;
    proxy: { reportCount(): number };
    runtime: DaemonRuntime;
    status: string;
    workspaceDir: string;
}): Promise<void> {
    if (!input.command.heartbeat || input.status !== 'completed') {
        return;
    }
    try {
        await pruneCheckpoints(input.workspaceDir, input.now ?? new Date());
        await recordHeartbeatSettled(input.agentRoot, {
            latestCheckpoint: await latestCheckpoint(input.workspaceDir),
            reported: input.proxy.reportCount() > 0,
            runId: input.command.runId,
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
