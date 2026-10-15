/** One run's upload queue: frames the Server has not stored yet, in sequence order. */
import type { AgentExecutionJournalAck, AgentExecutionJournalRecordsFrame } from '@haus/api';
import { frameSequence, type QueuedFrame } from './journal-upload-frames.ts';

export interface RunUpload {
    agentId: string;
    agentRoot: string;
    /** `sent` while a frame is in flight on this connection. */
    frames: Array<QueuedFrame & { sent: boolean }>;
    /** Wakes a backfill waiting on this run: synced, superseded, or offline. */
    idle?: () => void;
    live: boolean;
    /** The run's start never reached this uploader, or its queue overflowed. */
    resendWhole: boolean;
    runId: string;
    runStartedAt: string;
    /** The sequence that completes the run once the Server stored it. */
    settlesAt: number | null;
    /** The most frames in flight at once. */
    window: number;
}

export function createRunUpload(
    input: Pick<RunUpload, 'agentId' | 'agentRoot' | 'runId' | 'runStartedAt'>,
    options: { live: boolean; resendWhole: boolean; window: number }
): RunUpload {
    return { ...input, ...options, frames: [], settlesAt: null };
}

/** Sends unsent frames in order up to the window; false once the socket refuses one. */
export function pumpRunUpload(
    run: RunUpload,
    send: (frame: AgentExecutionJournalRecordsFrame) => boolean
): boolean {
    let inFlight = run.frames.filter(({ sent }) => sent).length;
    for (const queued of run.frames) {
        if (inFlight >= run.window) {
            return true;
        }
        if (!queued.sent) {
            queued.sent = send(queued.frame);
            if (!queued.sent) {
                return false;
            }
            inFlight += 1;
        }
    }
    return true;
}

/** Drops the acknowledged frame; true when that completes a settled run. */
export function acknowledgeRunUpload(run: RunUpload, ack: AgentExecutionJournalAck): boolean {
    run.frames = run.frames.filter(({ frame }) => frameSequence(frame) !== ack.throughSequence);
    return run.frames.length === 0 && run.settlesAt !== null && !run.live;
}

export function queuedRunBytes(run: RunUpload): number {
    return run.frames.reduce((total, { bytes }) => total + bytes, 0);
}
