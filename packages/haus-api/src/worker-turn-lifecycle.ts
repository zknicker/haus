import { type WorkerTurnStatus, isTerminalWorkerTurnStatus } from './worker-shared.ts';
import type { WorkerStallCode } from './worker-stall.ts';

/** How often a Run still stuck gets another notice. */
const stallReminderMs = 2 * 60 * 60_000;

/** Why a recorded reading tells the delegating Agent about its Run. */
export type WorkerTurnNotice = { kind: 'settled' } | { kind: 'stall'; window: number };

export interface WorkerTurnStall {
    code: WorkerStallCode;
    since: Date;
}

export interface WorkerTurnSnapshot {
    cancelRequested: boolean;
    observedAt: Date | null;
    stall: WorkerTurnStall | null;
    status: WorkerTurnStatus;
    workStatus: WorkerTurnStatus;
}

export interface WorkerTurnReading {
    observedAt: Date;
    stallCode: WorkerStallCode | null;
    status: WorkerTurnStatus;
}

export type WorkerTurnStep =
    | { kind: 'ignored' }
    | {
          kind: 'recorded';
          notice: WorkerTurnNotice | null;
          settled: boolean;
          stall: WorkerTurnStall | null;
          status: WorkerTurnStatus;
      };

/** The Work lifecycle fields, which always equal those of the newest Run. */
export interface WorkerLifecycle {
    startedAt: Date | null;
    status: WorkerTurnStatus;
    terminalAt: Date | null;
}

/**
 * The Run state machine (specs/worker-turn-lifecycle.md). A stale reading
 * and anything after settling are ignored, because the first settled result
 * stands. A Run never returns to `queued`: a reading that cannot reconfirm the
 * prompt it already found once (a session log too large to scan back through,
 * say) must not leave the job looking unaddressed (TECH-7). Each reading states
 * the stall, so one without a code clears it, and settling always does.
 */
export function advanceWorkerTurn(
    run: WorkerTurnSnapshot,
    reading: WorkerTurnReading
): WorkerTurnStep {
    if (
        isTerminalWorkerTurnStatus(run.status) ||
        (run.observedAt && run.observedAt >= reading.observedAt)
    ) {
        return { kind: 'ignored' };
    }
    const status = reading.status === 'queued' ? run.status : reading.status;
    const settled = isTerminalWorkerTurnStatus(status);
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
export function projectWorker(newestRun: WorkerLifecycle): WorkerLifecycle {
    const { startedAt, status, terminalAt } = newestRun;
    return { startedAt, status, terminalAt };
}

function nextStall(
    previous: WorkerTurnStall | null,
    reading: WorkerTurnReading
): WorkerTurnStall | null {
    if (!reading.stallCode) {
        return null;
    }
    return previous?.code === reading.stallCode
        ? previous
        : { code: reading.stallCode, since: reading.observedAt };
}

/** Work already settled or a Run being cancelled has nobody left to act on a stall. */
function noticeFor(
    run: WorkerTurnSnapshot,
    stall: WorkerTurnStall | null,
    reading: WorkerTurnReading,
    settled: boolean
): WorkerTurnNotice | null {
    if (settled) {
        return { kind: 'settled' };
    }
    if (!stall || run.cancelRequested || isTerminalWorkerTurnStatus(run.workStatus)) {
        return null;
    }
    const elapsed = reading.observedAt.getTime() - stall.since.getTime();
    return { kind: 'stall', window: Math.floor(elapsed / stallReminderMs) };
}
