import { type CloudAgentStatus, isTerminalCloudAgentStatus } from './cloud-agent-shared.ts';

/** Why a recorded reading tells the delegating Agent about its Run. */
export type CloudAgentNoticeKind = 'settled' | 'stall';

export interface CloudAgentRunSnapshot {
    observedAt: Date | null;
    status: CloudAgentStatus;
    workStatus: CloudAgentStatus;
}

export interface CloudAgentRunReading {
    observedAt: Date;
    /** Whether this reading carries a non-terminal code that still earns a notice. */
    stalled: boolean;
    status: CloudAgentStatus;
}

export type CloudAgentRunStep =
    | { kind: 'ignored' }
    | {
          kind: 'recorded';
          notice: CloudAgentNoticeKind | null;
          settled: boolean;
          status: CloudAgentStatus;
      };

/** The Work lifecycle fields, which always equal those of the newest Run. */
export interface CloudAgentWorkLifecycle {
    startedAt: Date | null;
    status: CloudAgentStatus;
    terminalAt: Date | null;
}

/**
 * The Run state machine (specs/cloud-agent-run-lifecycle.md). A stale reading
 * and anything after settling are ignored, because the first settled result
 * stands. A Run never returns to `queued`: a reading that cannot reconfirm the
 * prompt it already found once (a session log too large to scan back through,
 * say) must not leave the job looking unaddressed (TECH-7). Work settled by a
 * cancel has nobody left to act on a stall.
 */
export function advanceCloudAgentRun(
    run: CloudAgentRunSnapshot,
    reading: CloudAgentRunReading
): CloudAgentRunStep {
    if (
        isTerminalCloudAgentStatus(run.status) ||
        (run.observedAt && run.observedAt >= reading.observedAt)
    ) {
        return { kind: 'ignored' };
    }
    const status = reading.status === 'queued' ? run.status : reading.status;
    const settled = isTerminalCloudAgentStatus(status);
    return { kind: 'recorded', notice: noticeFor(run, reading, settled), settled, status };
}

/** Work reads its newest Run; an older Run never projects lifecycle. */
export function projectCloudAgentWork(newestRun: CloudAgentWorkLifecycle): CloudAgentWorkLifecycle {
    const { startedAt, status, terminalAt } = newestRun;
    return { startedAt, status, terminalAt };
}

function noticeFor(
    run: CloudAgentRunSnapshot,
    reading: CloudAgentRunReading,
    settled: boolean
): CloudAgentNoticeKind | null {
    if (settled) {
        return 'settled';
    }
    return reading.stalled && !isTerminalCloudAgentStatus(run.workStatus) ? 'stall' : null;
}
