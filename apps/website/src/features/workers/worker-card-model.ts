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

export function liveWorkerTurns(work: Pick<Worker, 'turns'>) {
    return work.turns.filter((turn) => !isTerminalWorkerTurnStatus(turn.status));
}

export function isWorkerTurnLive(work: Pick<Worker, 'turns'>) {
    return liveWorkerTurns(work).length > 0;
}

export function isWorkerStopping(work: Pick<Worker, 'turns'>) {
    return liveWorkerTurns(work).some((turn) => turn.stopRequestedAt !== null);
}

export function workerRowStatus(work: Pick<Worker, 'status' | 'turns'>) {
    const live = liveWorkerTurns(work);
    if (live.some((turn) => turn.status === 'running')) {
        return 'working' satisfies WorkerStatus;
    }
    return live.length > 0 ? ('queued' satisfies WorkerStatus) : work.status;
}

export function workerRowQuestion(work: Pick<Worker, 'status' | 'turns'>) {
    const [newest] = work.turns;
    return newest?.outcome?.kind === 'report' && newest.outcome.report.outcome === 'needs-you'
        ? (newest.outcome.report.ask ?? null)
        : null;
}

export function canFollowUpWorker(work: Pick<Worker, 'closedAt' | 'closingAt' | 'taskId'>) {
    return work.taskId !== null && work.closedAt === null && work.closingAt === null;
}

export function workerStatusText(work: Pick<Worker, 'status' | 'turns'>) {
    return isWorkerStopping(work) ? 'Stopping' : workerStatusLabels[work.status];
}

export function workerCardLine(work: CardWorker, input: CardLineInput) {
    const live = liveWorkerTurns(work);
    if (live.length > 0) {
        return liveTurnLine(work, live, input);
    }
    const [newest] = work.turns;
    if (newest?.outcome?.kind === 'failed') {
        return {
            text: workerFailureLabels[newest.outcome.reason],
            tone: 'danger',
        } satisfies WorkerCardLine;
    }
    if (newest?.outcome?.kind === 'stopped') {
        return { text: stoppedLine(newest, input), tone: 'muted' } satisfies WorkerCardLine;
    }
    return newest && newest.outcome === null ? legacyLine(newest, input) : noLine;
}

export function legacyWorkerSummary(work: Pick<Worker, 'turns'>) {
    if (newestWorkerReport(work)) {
        return null;
    }
    const [newest] = work.turns;
    return newest?.outcome === null &&
        (newest.status === 'completed' || newest.status === 'pending_input')
        ? newest.summary
        : null;
}

function legacyLine(turn: WorkerTurn, input: CardLineInput) {
    const when = formatRelativeTime(turn.terminalAt ?? turn.createdAt, input.now);
    switch (turn.status) {
        case 'failed':
            return {
                text: activityLine(turn.summary) ?? errorWords(turn.errorCode) ?? 'Failed',
                tone: 'danger',
            } satisfies WorkerCardLine;
        case 'expired':
            return { text: 'Expired', tone: 'danger' } satisfies WorkerCardLine;
        case 'cancelled':
            return { text: stoppedLine(turn, input), tone: 'muted' } satisfies WorkerCardLine;
        case 'completed':
            return { text: `Finished ${when}`, tone: 'muted' } satisfies WorkerCardLine;
        default:
            return { text: `Updated ${when}`, tone: 'muted' } satisfies WorkerCardLine;
    }
}

function errorWords(code: null | string) {
    if (code === null) {
        return null;
    }
    const words = code.replaceAll(/[_-]+/gu, ' ').trim();
    return words === '' ? null : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function liveTurnLine(work: CardWorker, live: WorkerTurn[], input: CardLineInput) {
    const quiet = input.now - Date.parse(work.updatedAt);
    if (quiet > workerStaleAfterMs) {
        return {
            text: `No update in ${formatWorkerDuration(quiet)}`,
            tone: 'warning',
        } satisfies WorkerCardLine;
    }
    if (live.some((turn) => turn.stopRequestedAt !== null)) {
        return { text: 'Stopping', tone: 'muted' } satisfies WorkerCardLine;
    }
    const working = live.find((turn) => turn.status === 'running') ?? null;
    const waiting = working ? (live.find((turn) => turn.status === 'queued') ?? null) : null;
    const waitingFollowUp = waiting ? followUpOf(waiting) : null;
    if (waitingFollowUp) {
        return {
            text: `${input.name(waitingFollowUp.author)}'s follow-up goes in next`,
            tone: 'muted',
        } satisfies WorkerCardLine;
    }
    if (!working) {
        return { text: 'Waiting for a free slot', tone: 'muted' } satisfies WorkerCardLine;
    }
    const followUp = followUpOf(working);
    if (followUp) {
        return {
            text: `On ${input.name(followUp.author)}'s follow-up`,
            tone: 'muted',
        } satisfies WorkerCardLine;
    }
    return {
        text:
            activityLine(work.activity?.summary ?? null) ??
            `Started ${formatRelativeTime(working.startedAt ?? working.createdAt, input.now)}`,
        tone: 'muted',
    } satisfies WorkerCardLine;
}

function followUpOf(turn: WorkerTurn) {
    return turn.input?.find((item) => item.kind === 'follow-up') ?? null;
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
