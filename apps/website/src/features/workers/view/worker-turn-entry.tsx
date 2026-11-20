import type { WorkerTurn, WorkerTurnInput } from '@haus/api';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { ReferenceMarkdown } from '../../mentions/reference-markdown.tsx';
import { workerFailureLabels } from '../worker-card-model.ts';
import { WorkerReport } from '../worker-report.tsx';

export function WorkerTurnEntry({
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
        <article className="flex min-w-0 flex-col gap-4" data-testid="worker-turn">
            {(turn.input ?? []).map((input) => (
                <section className="flex min-w-0 flex-col gap-1" key={`${input.kind}:${input.at}`}>
                    <p className="text-muted flex items-baseline gap-2 text-sm">
                        <span className="text-foreground font-medium">{name(input.author)}</span>
                        <span>{input.kind === 'brief' ? 'Brief' : 'Follow-up'}</span>
                        <span aria-hidden="true">·</span>
                        <RelativeTime value={input.at} />
                    </p>
                    <ReferenceMarkdown
                        className="text-sm"
                        content={input.text}
                        serverId={server.id}
                    />
                </section>
            ))}
            <WorkerTurnOutcome chatId={chatId} server={server} turn={turn} />
        </article>
    );
}

function WorkerTurnOutcome({
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
        return (
            <section className="border-separator flex min-w-0 flex-col gap-1 border-s-2 ps-3">
                <p className="text-muted text-sm">
                    {`Report · ${reportOutcomeLabels[outcome.report.outcome]}`}
                </p>
                <WorkerReport chatId={chatId} report={outcome.report} server={server} />
            </section>
        );
    }
    if (outcome?.kind === 'failed') {
        return <p className="text-danger text-sm">{workerFailureLabels[outcome.reason]}</p>;
    }
    if (outcome?.kind === 'stopped') {
        return <p className="text-muted text-sm">Stopped</p>;
    }
    return turn.outcome === null && turn.summary && turn.terminalAt ? (
        <ReferenceMarkdown className="text-sm" content={turn.summary} serverId={server.id} />
    ) : null;
}

const reportOutcomeLabels = {
    done: 'Done',
    failed: 'Failed',
    'needs-you': 'Needs you',
} as const;
