import { formatWorkerLink } from '@haus/api';
import type { z } from 'zod';
import type { agentWorkerStartResponseSchema } from './agent-api-schemas.ts';
import { formatHistoryLine } from './agent-format.ts';

type WorkerStartResponse = z.infer<typeof agentWorkerStartResponseSchema>;

export function renderWorkerStart(
    response: WorkerStartResponse,
    request: { repository: string; startingRef: string | null; target: string }
): string {
    return response.state === 'held'
        ? renderHeld(request.target, response)
        : renderStarted(response, request);
}

/** `haus worker inspect` without `--worker`: one line per work, each with its link. */
export function renderWorkerList(workers: readonly WorkerLinkSource[]): string {
    if (workers.length === 0) {
        return 'No Worker found.\n';
    }
    const rows = workers.map((work) => {
        // Only a pinned Claude launch carries a name; every other provider is null.
        const environment = work.environmentName ? ` [${work.environmentName}]` : '';
        return `${work.id} [${work.status}]${environment} ${work.title} (${work.repository})\n  Link: ${formatWorkerLink(work.title, work.id)}`;
    });
    return `${rows.join('\n')}\n${linkSentence}\n`;
}

/** `haus worker inspect --worker <id>`: the recorded work, then its link. */
export function renderWorkerDetail(workers: readonly WorkerLinkSource[]): string {
    const links = workers.map((work) => `Link: ${formatWorkerLink(work.title, work.id)}`);
    const reportPointers = workers
        // One pointer per work, not per Run: `--report` always reads the newest
        // Run with one, so a second identical line would add nothing (TECH-8).
        .filter((work) => work.turns.some(runHasMoreReport))
        .map((work) => reportPointerLine(work.id));
    const trailer = [...links, ...reportPointers, ...(links.length ? [linkSentence] : [])];
    return `${JSON.stringify(workers, null, 2)}\n${trailer.length ? `${trailer.join('\n')}\n` : ''}`;
}

/**
 * The Run `haus worker inspect --worker <id> --report` shows: the one
 * named by `--run`, or else the newest Run on that work carrying a report.
 */
export function findWorkerReportRun(
    workers: readonly WorkerReportSource[],
    workerId: string,
    turnId?: string
): WorkerTurnReportSource | undefined {
    const work = workers.find((candidate) => candidate.id === workerId);
    const turns = work?.turns ?? [];
    return turnId ? turns.find((run) => run.turnId === turnId) : turns.find((run) => run.report);
}

/** The plain-text block `--report` prints for one resolved Run. */
export function renderWorkerReportText(run: WorkerTurnReportSource): string {
    const clippedLine = run.report?.clipped ? '\n[clipped at 64 KiB]' : '';
    return `${run.report?.text ?? ''}${clippedLine}\n`;
}

function reportPointerLine(workerId: string): string {
    return `More: haus worker inspect --worker ${workerId} --report`;
}

/** Mirrors `hasFullReport`: the full report outgrew the capped `summary` already shown. */
function runHasMoreReport(run: WorkerTurnReportSource): boolean {
    return Boolean(run.report) && (run.report?.text.length ?? 0) > (run.summary?.length ?? 0);
}

export interface WorkerTurnReportSource {
    report: { clipped: boolean; text: string } | null;
    turnId: string;
    summary?: string | null;
}

interface WorkerReportSource {
    id: string;
    turns: readonly WorkerTurnReportSource[];
}

interface WorkerLinkSource extends WorkerReportSource {
    environmentName?: string | null;
    repository: string;
    status: string;
    title: string;
}

const linkSentence =
    'To show this work in another conversation, paste its Link line into haus message send.';

function renderStarted(
    receipt: Extract<WorkerStartResponse, { state: 'started' }>,
    request: { repository: string; startingRef: string | null }
): string {
    const ref = request.startingRef ? `@${request.startingRef}` : '';
    const lines = [
        `Worker launching for ${request.repository}${ref}. Work ID: ${receipt.worker.id}`,
        `Posted to ${receipt.target}. Message ID: ${receipt.messageId}`,
        `Haus wakes you on ${receipt.target} when the run settles, a failed launch included, and when its pull request becomes ready or its checks finish; post what you learn yourself.`,
        // Agents paste this line; they never build a work link themselves.
        `Link: ${formatWorkerLink(receipt.worker.title, receipt.worker.id)}`,
        linkSentence,
    ];
    return `${lines.join('\n')}\n`;
}

/** Mirrors the `haus message send` hold so the Agent reads the same shape. */
function renderHeld(
    target: string,
    response: Extract<WorkerStartResponse, { state: 'held' }>
): string {
    const shown = response.shownMessages.length;
    const lines = [
        `Freshness hold: showing latest ${shown} of ${response.newMessageCount} newer messages.`,
    ];
    if (response.omittedMessageCount > 0) {
        lines.push(
            `${response.omittedMessageCount} earlier newer messages were omitted. Use haus message read --target "${target}" to review them.`
        );
    }
    lines.push(
        'The Worker was not started: no card was posted and nothing was launched. Review this context.'
    );
    if (response.formalMentionCount > 0) {
        lines.push(
            `You were formally mentioned in ${response.formalMentionCount} of these newer messages.`
        );
    }
    lines.push(
        '',
        ...response.shownMessages.map(formatHistoryLine),
        '',
        `If the launch still belongs in ${target}, run the same haus worker start command again. If the newer messages change where or whether it belongs, launch it there or skip it.`
    );
    return `${lines.join('\n')}\n`;
}
