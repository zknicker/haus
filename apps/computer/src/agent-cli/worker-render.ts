import type { z } from 'zod';
import type { agentWorkerStartResponseSchema } from './agent-api-schemas.ts';
import { formatHistoryLine } from './agent-format.ts';

type WorkerStartResponse = z.infer<typeof agentWorkerStartResponseSchema>;
type WorkerRecorded = Exclude<WorkerStartResponse, { state: 'held' }>;

interface WorkerSummary {
    id: string;
    place: string;
    title: string;
}

export function renderWorkerStart(
    response: WorkerStartResponse,
    request: { repository: string; startingRef: string | null; task: string; target: string }
) {
    return response.state === 'held'
        ? renderHeld(request.target, response)
        : renderRecorded(response, request);
}

export function renderWorkerSend(
    receipt: { turnId: string; worker: WorkerSummary },
    interrupt: boolean
) {
    const { worker } = receipt;
    const when = interrupt
        ? 'The working turn is stopping and older queued follow-ups were dropped; this one runs next.'
        : 'It runs when the working turn ends, or now if the Worker is idle.';
    return `${[
        `Follow-up queued for ${worker.title} (${worker.id}) as turn ${receipt.turnId}.`,
        when,
        'Its report posts in the Task and reaches you as an inbox item.',
    ].join('\n')}\n`;
}

export function renderWorkerStop(worker: WorkerSummary) {
    return `${[
        `Stop requested for ${worker.title} (${worker.id}).`,
        'Its working or queued turn settles as stopped, and queued follow-ups are dropped. Nothing posts in the Task.',
        `It takes later follow-ups: haus worker send --worker ${worker.id}`,
    ].join('\n')}\n`;
}

export function renderWorkerList(workers: readonly WorkerListSource[]) {
    if (workers.length === 0) {
        return 'No Worker found.\n';
    }
    const rows = workers.map((worker) => {
        const environment = worker.environmentName ? ` [${worker.environmentName}]` : '';
        return `${worker.id} [${worker.status}] on ${worker.place}${environment} ${worker.title} (${worker.repository})`;
    });
    return `${rows.join('\n')}\n`;
}

export function renderWorkerDetail(workers: readonly WorkerReportSource[]) {
    const pointers = workers
        .filter((worker) => worker.turns.some(turnHasMoreResult))
        .map((worker) => `More: haus worker inspect --worker ${worker.id} --report`);
    return `${JSON.stringify(workers, null, 2)}\n${pointers.map((line) => `${line}\n`).join('')}`;
}

export function findWorkerReportTurn(
    workers: readonly WorkerReportSource[],
    workerId: string,
    turnId?: string
) {
    const turns = workers.find((candidate) => candidate.id === workerId)?.turns ?? [];
    return turnId
        ? turns.find((turn) => turn.turnId === turnId)
        : turns.find((turn) => turn.report);
}

export function renderWorkerReportText(turn: WorkerTurnReportSource) {
    const clippedLine = turn.report?.clipped ? '\n[clipped at 64 KiB]' : '';
    return `${turn.report?.text ?? ''}${clippedLine}\n`;
}

function turnHasMoreResult(turn: WorkerTurnReportSource) {
    return Boolean(turn.report) && (turn.report?.text.length ?? 0) > (turn.summary?.length ?? 0);
}

export interface WorkerTurnReportSource {
    report: { clipped: boolean; text: string } | null;
    summary?: string | null;
    turnId: string;
}

interface WorkerReportSource {
    id: string;
    turns: readonly WorkerTurnReportSource[];
}

interface WorkerListSource {
    environmentName?: string | null;
    id: string;
    place: string;
    repository: string;
    status: string;
    title: string;
}

function renderRecorded(
    receipt: WorkerRecorded,
    request: { repository: string; startingRef: string | null; task: string }
) {
    const { worker } = receipt;
    const ref = request.startingRef ? `@${request.startingRef}` : '';
    const lead =
        receipt.state === 'started'
            ? `Worker ${worker.id} started on ${worker.place} for ${request.task}: ${worker.title} (${request.repository}${ref}).`
            : `Worker ${worker.id} queued on ${worker.place} for ${request.task}: ${worker.title} (${request.repository}${ref}). It starts when ${worker.place} has a free slot.`;
    return `${[
        lead,
        `Its report posts in ${request.task} and reaches you as an inbox item when the turn ends; a launch that fails reaches you the same way.`,
        `Follow up with haus worker send --worker ${worker.id}; stop it with haus worker stop --worker ${worker.id}.`,
    ].join('\n')}\n`;
}

/** Mirrors the `haus message send` hold so the Agent reads the same shape. */
function renderHeld(target: string, response: Extract<WorkerStartResponse, { state: 'held' }>) {
    const shown = response.shownMessages.length;
    const lines = [
        `Freshness hold: showing latest ${shown} of ${response.newMessageCount} newer messages.`,
    ];
    if (response.omittedMessageCount > 0) {
        lines.push(
            `${response.omittedMessageCount} earlier newer messages were omitted. Use haus message read --target "${target}" to review them.`
        );
    }
    lines.push('The Worker was not started: nothing was recorded. Review this context.');
    if (response.formalMentionCount > 0) {
        lines.push(
            `You were formally mentioned in ${response.formalMentionCount} of these newer messages.`
        );
    }
    lines.push(
        '',
        ...response.shownMessages.map(formatHistoryLine),
        '',
        `If the Worker is still right for ${target}, run the same haus worker start command again. If the newer messages change the brief, start it with the new brief or skip it.`
    );
    return `${lines.join('\n')}\n`;
}
