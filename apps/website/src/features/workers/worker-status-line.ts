import { isTerminalWorkerTurnStatus } from '@haus/api';
import { formatRelativeTime } from '../../lib/format.ts';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import {
    type WorkerPresentationInput,
    workerJobLabels,
    elapsedSince,
    formatWorkerDuration,
    newestWorkerTurn,
    newestWorkerTurnStatus,
    quietFor,
} from './worker-presentation.ts';

export interface WorkerStatusLine {
    text: string;
    tone: 'danger' | 'muted' | 'warning';
}

/**
 * The card's one status line. It is always present and always one line, so a
 * follow-up or a quiet spell never adds or removes a row: the card only grows
 * when its pull request first appears. The most urgent fact wins:
 *
 * 1. why the job failed,
 * 2. that a live Run has gone quiet,
 * 3. that a stop was requested,
 * 4. that the delegating Agent sent a follow-up (including its answer); a
 *    follow-up whose auto-interrupt fallback still didn't deliver it reads
 *    distinctly so it is never mistaken for an ordinary brief wait,
 * 5. otherwise the latest activity, or when the job last updated or settled.
 *
 * A job that needs input never shows its question: that is for the delegating
 * Agent, which the inbox wakes. The card shows only the "Needs input" badge and
 * when the job last updated.
 */
export function workerStatusLine(
    work: WorkerPresentationInput,
    input: { agentName: string; now: number }
): WorkerStatusLine {
    const { job } = work;
    if (job.state === 'failed') {
        return { text: failureReason(job), tone: 'danger' };
    }
    const quiet = quietFor(work, input.now);
    if (quiet !== null) {
        return { text: `No update in ${formatWorkerDuration(quiet)}`, tone: 'warning' };
    }
    const stopping = stoppingLine(work, input.now);
    if (stopping) {
        return stopping;
    }
    if (job.followUp) {
        const elapsed = elapsedSince(job.followUp.since, input.now) ?? '0s';
        if (job.followUp.state === 'stalled') {
            return {
                text: `follow-up waiting: auto-interrupt failed · ${elapsed}`,
                tone: 'warning',
            };
        }
        const verb = job.followUp.state === 'waiting' ? 'waiting' : 'running';
        return { text: `${input.agentName} asked for changes · ${verb} ${elapsed}`, tone: 'muted' };
    }
    switch (job.state) {
        case 'working':
            return {
                text:
                    oneLine(work.activity?.summary ?? null) ??
                    `Updated ${formatRelativeTime(work.updatedAt, input.now)}`,
                tone: 'muted',
            };
        case 'pending-input':
            return {
                text: `Updated ${formatRelativeTime(job.settledAt ?? work.updatedAt, input.now)}`,
                tone: 'muted',
            };
        case 'done':
            return {
                text: `Finished ${formatRelativeTime(job.settledAt ?? work.updatedAt, input.now)}`,
                tone: 'muted',
            };
        case 'cancelled':
        case 'expired':
            return {
                text: `${workerJobLabels[job.state]} · ${formatRelativeTime(job.settledAt ?? work.updatedAt, input.now)}`,
                tone: 'muted',
            };
    }
}

/** The provider's own report, else its error code, as one readable line. */
function failureReason(job: { errorCode: null | string; summary: null | string }): string {
    const summary = oneLine(job.summary);
    if (summary) {
        return summary;
    }
    if (job.errorCode) {
        const words = job.errorCode.replaceAll(/[_-]+/gu, ' ').trim();
        return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
    }
    return 'The run failed without a reason';
}

/** Markdown a provider wrote, as the one flat line a surface can show. */
function oneLine(text: null | string): null | string {
    if (text === null) {
        return null;
    }
    const line = messagePreviewLine(text);
    return line === '' ? null : line;
}

function stoppingLine(work: WorkerPresentationInput, now: number) {
    const stopRequestedAt = newestWorkerTurn(work)?.stopRequestedAt ?? null;
    if (!stopRequestedAt || isTerminalWorkerTurnStatus(newestWorkerTurnStatus(work))) {
        return null;
    }
    return {
        text: `Stopping · requested ${formatRelativeTime(stopRequestedAt, now)}`,
        tone: 'muted',
    } satisfies WorkerStatusLine;
}
