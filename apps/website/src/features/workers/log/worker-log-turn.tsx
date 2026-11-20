import { type WorkerTurn, type WorkerTurnInput, workerPullRequestNumber } from '@haus/api';
import { Link } from '@heroui/react';
import { cn } from '../../../lib/utils.ts';
import { ReferenceMarkdown } from '../../mentions/reference-markdown.tsx';
import { workerFailureLabels } from '../worker-card-model.ts';
import { formatWorkerDuration } from '../worker-presentation.ts';
import { WorkerReport } from '../worker-report.tsx';
import { WorkerStepLine } from './worker-step-line.tsx';
import { workerStepLines } from './worker-step-lines.ts';

export function WorkerLogTurn({
    chatId,
    name,
    server,
    turn,
}: {
    chatId: null | string;
    name: (author: WorkerTurnInput['author']) => string;
    server: { id: string; slug: string };
    turn: WorkerTurn;
}) {
    return (
        <article className="flex min-w-0 flex-col gap-2.5" data-testid="worker-log-turn">
            {(turn.input ?? []).map((input) => (
                <div
                    className="bg-default max-w-[82%] self-end rounded-xl px-3 py-2"
                    key={`${input.kind}:${input.at}`}
                >
                    <p className="text-muted text-xs">
                        {`${name(input.author)} · ${input.kind === 'brief' ? 'brief' : 'follow-up'}`}
                    </p>
                    <ReferenceMarkdown
                        className="text-sm"
                        content={input.text}
                        serverId={server.id}
                    />
                </div>
            ))}
            {workerStepLines(turn.steps ?? []).map((line, index) => (
                <WorkerStepLine key={`${line.kind}:${index}`} line={line} />
            ))}
            <WorkerLogOutcome chatId={chatId} server={server} turn={turn} />
        </article>
    );
}

function WorkerLogOutcome({
    chatId,
    server,
    turn,
}: {
    chatId: null | string;
    server: { id: string; slug: string };
    turn: WorkerTurn;
}) {
    const outcome = turn.outcome;
    if (outcome?.kind === 'report') {
        const tone = outcomeTones[outcome.report.outcome];
        return (
            <section className="border-separator flex min-w-0 flex-col gap-1.5 border-t pt-2.5">
                <OutcomeKey tone={tone} turn={turn}>
                    {outcomeLabels[outcome.report.outcome]}
                </OutcomeKey>
                <WorkerReport chatId={chatId} report={outcome.report} server={server} />
                {outcome.report.pullRequestUrls.length > 0 ? (
                    <p className="flex flex-wrap gap-3 text-sm">
                        {outcome.report.pullRequestUrls.map((url) => (
                            <Link href={url} key={url} rel="noreferrer" target="_blank">
                                {pullRequestLabel(url)}
                                <Link.Icon />
                            </Link>
                        ))}
                    </p>
                ) : null}
            </section>
        );
    }
    if (outcome?.kind === 'failed') {
        return (
            <OutcomeKey tone="text-danger" turn={turn}>
                {`Failed · ${workerFailureLabels[outcome.reason]}`}
            </OutcomeKey>
        );
    }
    if (outcome?.kind === 'stopped') {
        return (
            <OutcomeKey tone="text-muted" turn={turn}>
                Stopped
            </OutcomeKey>
        );
    }
    return turn.summary && turn.terminalAt ? (
        <ReferenceMarkdown className="text-sm" content={turn.summary} serverId={server.id} />
    ) : null;
}

function OutcomeKey({
    children,
    tone,
    turn,
}: {
    children: string;
    tone: string;
    turn: WorkerTurn;
}) {
    const span =
        turn.startedAt && turn.terminalAt
            ? Date.parse(turn.terminalAt) - Date.parse(turn.startedAt)
            : null;
    return (
        <p className={cn('text-xs font-semibold', tone)} data-testid="worker-log-outcome">
            {span === null ? children : `${children} · worked for ${formatWorkerDuration(span)}`}
        </p>
    );
}

const outcomeLabels = { done: 'Finished', failed: 'Failed', 'needs-you': 'Needs you' } as const;
const outcomeTones = {
    done: 'text-success',
    failed: 'text-danger',
    'needs-you': 'text-warning',
} as const;

function pullRequestLabel(url: string) {
    const number = workerPullRequestNumber(url);
    return number === null ? 'Pull request' : `PR #${number}`;
}
