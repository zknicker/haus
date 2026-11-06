import { type CloudAgentStatus, isTerminalCloudAgentStatus } from './cloud-agent-shared.ts';
import type { CloudAgentStallCode } from './cloud-agent-stall.ts';

/** How often a Run still stuck gets another notice. */
const stallReminderMs = 2 * 60 * 60_000;

/** Why a recorded reading tells the delegating Agent about its Run. */
export type CloudAgentRunNotice = { kind: 'settled' } | { kind: 'stall'; window: number };

export interface CloudAgentRunStall {
    code: CloudAgentStallCode;
    since: Date;
}

export interface CloudAgentRunSnapshot {
    cancelRequested: boolean;
    observedAt: Date | null;
    stall: CloudAgentRunStall | null;
    status: CloudAgentStatus;
    workStatus: CloudAgentStatus;
}

export interface CloudAgentRunReading {
    observedAt: Date;
    stallCode: CloudAgentStallCode | null;
    status: CloudAgentStatus;
}

export type CloudAgentRunStep =
    | { kind: 'ignored' }
    | {
          kind: 'recorded';
          notice: CloudAgentRunNotice | null;
          settled: boolean;
          stall: CloudAgentRunStall | null;
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
 * say) must not leave the job looking unaddressed (TECH-7). Each reading states
 * the stall, so one without a code clears it, and settling always does.
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
    const stall = settled ? null : nextStall(run.stall, reading);
    return {
        kind: 'recorded',
        notice: noticeFor(run, stall, reading, settled),
        settled,
        stall,
        status,
    };
}

/** Work reads its newest Run; an older Run never projects lifecycle. */
export function projectCloudAgentWork(newestRun: CloudAgentWorkLifecycle): CloudAgentWorkLifecycle {
    const { startedAt, status, terminalAt } = newestRun;
    return { startedAt, status, terminalAt };
}

function nextStall(
    previous: CloudAgentRunStall | null,
    reading: CloudAgentRunReading
): CloudAgentRunStall | null {
    if (!reading.stallCode) {
        return null;
    }
    return previous?.code === reading.stallCode
        ? previous
        : { code: reading.stallCode, since: reading.observedAt };
}

/** Work already settled or a Run being cancelled has nobody left to act on a stall. */
function noticeFor(
    run: CloudAgentRunSnapshot,
    stall: CloudAgentRunStall | null,
    reading: CloudAgentRunReading,
    settled: boolean
): CloudAgentRunNotice | null {
    if (settled) {
        return { kind: 'settled' };
    }
    if (!stall || run.cancelRequested || isTerminalCloudAgentStatus(run.workStatus)) {
        return null;
    }
    const elapsed = reading.observedAt.getTime() - stall.since.getTime();
    return { kind: 'stall', window: Math.floor(elapsed / stallReminderMs) };
}
