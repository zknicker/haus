import type { ChatMessage, Worker, WorkerReport, WorkerStep, WorkerTurn } from '@haus/api';
import { cloudAgentProviderPresentation } from '../cloud-agent-provider-presentation.ts';
import { workerFailureLabels } from '../worker-card-model.ts';
import { workerPlaceName, workerPlaceProvider } from '../worker-place.ts';
import { formatWorkerDuration } from '../worker-presentation.ts';

export interface WorkerTranscriptMessage {
    message: ChatMessage;
    notice: boolean;
    steps: null | WorkerTurnSteps;
}

export interface WorkerTurnSteps {
    live: boolean;
    span: null | number;
    steps: readonly WorkerStep[];
}

export function workerActorId(workerId: string) {
    return `worker:${workerId}`;
}

export function workerTranscriptMessages(input: {
    chatId: string;
    liveLine: null | string;
    reportMessages: ReadonlyMap<string, ChatMessage>;
    serverId: string;
    work: Pick<Worker, 'id' | 'place' | 'turns' | 'updatedAt'>;
}) {
    const base = { chatId: input.chatId, serverId: input.serverId };
    const author = workerAuthor(input.work);
    const items: WorkerTranscriptMessage[] = [];
    for (const turn of [...input.work.turns].reverse()) {
        for (const [index, item] of (turn.input ?? []).entries()) {
            items.push({
                message: message(base, {
                    author:
                        item.author.kind === 'agent'
                            ? { agentId: item.author.id, kind: 'agent' }
                            : { kind: 'human', userId: item.author.id },
                    content: item.text,
                    createdAt: item.at,
                    id: `${turn.turnId}:input:${index}`,
                }),
                notice: false,
                steps: null,
            });
        }
        items.push(
            ...turnOutputItems(turn, {
                author,
                base,
                liveLine: input.liveLine,
                reportMessages: input.reportMessages,
            })
        );
    }
    const newest = input.work.turns[0];
    const liveCarriedBySteps = Boolean(newest?.steps?.length) && newest?.outcome === null;
    if (input.liveLine && !liveCarriedBySteps) {
        items.push({
            message: message(base, {
                author,
                content: input.liveLine,
                createdAt: input.work.updatedAt,
                id: `${input.work.id}:live`,
            }),
            notice: true,
            steps: null,
        });
    }
    return items.map((item, sequence) => ({
        ...item,
        message: { ...item.message, sequence },
    }));
}

function turnOutputItems(
    turn: WorkerTurn,
    context: {
        author: ChatMessage['author'];
        base: { chatId: string; serverId: string };
        liveLine: null | string;
        reportMessages: ReadonlyMap<string, ChatMessage>;
    }
) {
    const items: WorkerTranscriptMessage[] = [];
    const steps = turnSteps(turn);
    const output = turnOutput(turn, context.reportMessages);
    const line = turnLine(turn, steps !== null);
    const live = turn.outcome === null && turn.terminalAt === null;
    if (output) {
        items.push({
            message: { ...output, ...context.base, author: context.author, body: { kind: 'text' } },
            notice: false,
            steps,
        });
    } else if (steps) {
        items.push({
            message: message(context.base, {
                author: context.author,
                content: (live ? context.liveLine : line) ?? 'Working',
                createdAt: turn.terminalAt ?? turn.createdAt,
                id: `${turn.turnId}:steps`,
            }),
            notice: false,
            steps,
        });
    }
    if (line && !(steps && !output)) {
        items.push({
            message: message(context.base, {
                author: context.author,
                content: line,
                createdAt: turn.terminalAt ?? turn.createdAt,
                id: `${turn.turnId}:line`,
            }),
            notice: true,
            steps: null,
        });
    }
    return items;
}

function turnSteps(turn: WorkerTurn) {
    if (!turn.steps?.length) {
        return null;
    }
    return {
        live: turn.outcome === null && turn.terminalAt === null,
        span: turnSpan(turn),
        steps: turn.steps,
    } satisfies WorkerTurnSteps;
}

function turnSpan(turn: WorkerTurn) {
    return turn.startedAt && turn.terminalAt
        ? Date.parse(turn.terminalAt) - Date.parse(turn.startedAt)
        : null;
}

function workerAuthor(work: Pick<Worker, 'id' | 'place'>) {
    const provider = workerPlaceProvider(work.place);
    return {
        agentId: workerActorId(work.id),
        kind: 'agent',
        profile: {
            avatarUrl: provider ? cloudAgentProviderPresentation[provider].logo.light : null,
            deleted: false,
            description: null,
            displayName: `Worker on ${workerPlaceName(work)}`,
        },
    } satisfies ChatMessage['author'];
}

function turnOutput(turn: WorkerTurn, reportMessages: ReadonlyMap<string, ChatMessage>) {
    const at = turn.terminalAt ?? turn.createdAt;
    if (turn.outcome?.kind === 'report') {
        const report = turn.outcome.report;
        const posted = report.messageId ? reportMessages.get(report.messageId) : undefined;
        return (
            posted ??
            message(
                { chatId: '', serverId: '' },
                {
                    content: reportContent(report),
                    createdAt: at,
                    id: `${turn.turnId}:report`,
                }
            )
        );
    }
    if (turn.outcome === null && turn.summary && turn.terminalAt) {
        return message(
            { chatId: '', serverId: '' },
            {
                content: turn.summary,
                createdAt: at,
                id: `${turn.turnId}:summary`,
            }
        );
    }
    return null;
}

function reportContent(report: WorkerReport) {
    return report.ask ? `${report.text}\n\n${report.ask}` : report.text;
}

function turnLine(turn: WorkerTurn, stepsShowSpan: boolean) {
    const outcome = turn.outcome;
    if (!outcome) {
        return null;
    }
    const label =
        outcome.kind === 'report'
            ? reportLabels[outcome.report.outcome]
            : outcome.kind === 'failed'
              ? `Failed: ${workerFailureLabels[outcome.reason]}`
              : 'Stopped';
    const span = stepsShowSpan ? null : turnSpan(turn);
    return span === null ? label : `${label}, worked for ${formatWorkerDuration(span)}`;
}

const reportLabels = {
    done: 'Finished',
    failed: 'Failed',
    'needs-you': 'Needs you',
} as const;

function message(
    base: { chatId: string; serverId: string },
    fields: Pick<ChatMessage, 'content' | 'createdAt' | 'id'> & {
        author?: ChatMessage['author'];
    }
) {
    return {
        attachments: [],
        author: fields.author ?? { agentId: 'worker', kind: 'agent' },
        body: { kind: 'text' },
        chatId: base.chatId,
        content: fields.content,
        createdAt: fields.createdAt,
        driveCitations: [],
        id: fields.id,
        imageGenerations: [],
        nonce: fields.id,
        reactions: [],
        reply: null,
        runId: null,
        sequence: 0,
        serverId: base.serverId,
        sessionGeneration: null,
        taskLinks: [],
        workers: [],
    } satisfies ChatMessage;
}
