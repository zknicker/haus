import {
    type Worker,
    type WorkerFailure,
    type WorkerJobState,
    type WorkerReport,
    type WorkerStatus,
    type WorkerTurn,
    type WorkerTurnInput,
    isTerminalWorkerTurnStatus,
} from '@haus/api';
import { formatRelativeTime } from '../../lib/format.ts';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import { formatWorkerDuration, workerStaleAfterMs } from './worker-presentation.ts';

type CardWorker = Pick<
    Worker,
    'activity' | 'closedAt' | 'closingAt' | 'status' | 'taskId' | 'turns' | 'updatedAt'
>;

interface CardLineInput {
    name: (author: WorkerTurnInput['author']) => string;
    now: number;
}

const noLine: WorkerCardLine | null = null;
const noReport: WorkerReport | null = null;

export interface WorkerCardLine {
    text: string;
    tone: 'danger' | 'muted' | 'warning';
}

export const workerStatusLabels: Record<WorkerStatus, string> = {
    done: 'Done',
    failed: 'Failed',
    'needs-you': 'Needs you',
    queued: 'Queued',
    stopped: 'Stopped',
    working: 'Working',
};

export const workerStatusChipColors = {
    done: 'success',
    failed: 'danger',
    'needs-you': 'warning',
    queued: 'default',
    stopped: 'default',
    working: 'accent',
} as const satisfies Record<WorkerStatus, 'accent' | 'danger' | 'default' | 'success' | 'warning'>;

export const workerStatusDiscStates = {
    done: 'done',
    failed: 'failed',
    'needs-you': 'pending-input',
    queued: 'working',
    stopped: 'cancelled',
    working: 'working',
} as const satisfies Record<WorkerStatus, WorkerJobState>;

export const workerFailureLabels: Record<WorkerFailure, string> = {
    'harness-error': 'The harness failed to start or crashed',
    'launch-refused': 'The place refused the launch',
    'machine-offline': 'The Device stayed offline during the turn',
    'machine-removed': 'The Device was removed',
    'no-report': 'Ended without a report',
    'place-off': 'Workers were turned off on its place',
    'provider-error': 'The provider ended the run in error',
    'provider-expired': 'The provider expired the run',
};

export function newestWorkerReport(work: Pick<Worker, 'turns'>) {
    for (const turn of work.turns) {
        if (turn.outcome?.kind === 'report') {
            return turn.outcome.report;
        }
    }
    return noReport;
}

export function isWorkerTurnLive(work: Pick<Worker, 'turns'>) {
    const newest = work.turns[0];
    return newest !== undefined && !isTerminalWorkerTurnStatus(newest.status);
}

export function isWorkerStopping(work: Pick<Worker, 'turns'>) {
    const newest = work.turns[0];
    return isWorkerTurnLive(work) && Boolean(newest?.stopRequestedAt);
}

export function canFollowUpWorker(work: Pick<Worker, 'closedAt' | 'closingAt' | 'taskId'>) {
    return work.taskId !== null && work.closedAt === null && work.closingAt === null;
}

export function workerStatusText(work: Pick<Worker, 'status' | 'turns'>) {
    return isWorkerStopping(work) ? 'Stopping' : workerStatusLabels[work.status];
}

export function workerCardLine(work: CardWorker, input: CardLineInput) {
    const [newest, previous] = work.turns;
    if (!newest) {
        return noLine;
    }
    if (newest.outcome?.kind === 'failed') {
        return {
            text: workerFailureLabels[newest.outcome.reason],
            tone: 'danger',
        } satisfies WorkerCardLine;
    }
    if (newest.outcome?.kind === 'stopped') {
        return { text: stoppedLine(newest, input), tone: 'muted' } satisfies WorkerCardLine;
    }
    if (isTerminalWorkerTurnStatus(newest.status)) {
        return noLine;
    }
    return liveTurnLine(work, newest, previous ?? null, input);
}

function liveTurnLine(
    work: CardWorker,
    newest: WorkerTurn,
    previous: null | WorkerTurn,
    input: CardLineInput
) {
    const quiet = input.now - Date.parse(work.updatedAt);
    if (newest.status === 'running' && quiet > workerStaleAfterMs) {
        return {
            text: `No update in ${formatWorkerDuration(quiet)}`,
            tone: 'warning',
        } satisfies WorkerCardLine;
    }
    if (newest.stopRequestedAt) {
        return { text: 'Stopping', tone: 'muted' } satisfies WorkerCardLine;
    }
    const followUp = newest.input?.find((item) => item.kind === 'follow-up') ?? null;
    if (newest.status === 'queued' && previous && !isTerminalWorkerTurnStatus(previous.status)) {
        return followUp
            ? ({
                  text: `${input.name(followUp.author)}'s follow-up goes in next`,
                  tone: 'muted',
              } satisfies WorkerCardLine)
            : noLine;
    }
    if (newest.status === 'queued') {
        return { text: 'Waiting for a free slot', tone: 'muted' } satisfies WorkerCardLine;
    }
    if (followUp) {
        return {
            text: `On ${input.name(followUp.author)}'s follow-up`,
            tone: 'muted',
        } satisfies WorkerCardLine;
    }
    return {
        text:
            activityLine(work.activity?.summary ?? null) ??
            `Started ${formatRelativeTime(newest.startedAt ?? newest.createdAt, input.now)}`,
        tone: 'muted',
    } satisfies WorkerCardLine;
}

function stoppedLine(turn: WorkerTurn, input: CardLineInput) {
    const when = formatRelativeTime(turn.terminalAt ?? turn.createdAt, input.now);
    return turn.stopRequestedBy
        ? `Stopped by ${input.name(turn.stopRequestedBy)} ${when}`
        : `Stopped ${when}`;
}

function activityLine(text: null | string) {
    if (text === null) {
        return null;
    }
    const line = messagePreviewLine(text);
    return line === '' ? null : line;
}
