import type { WorkerTurn, WorkerTurnInput } from '@haus/api';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { ReferenceMarkdown } from '../../mentions/reference-markdown.tsx';
import { workerFailureLabels } from '../worker-card-model.ts';
import { formatWorkerDuration } from '../worker-presentation.ts';
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
                        <RelativeTime value={input.at} />
                    </p>
                    <div className="bg-default rounded-xl px-3 py-2">
                        <ReferenceMarkdown
                            className="text-sm"
                            content={input.text}
                            serverId={server.id}
                        />
                    </div>
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
            <>
                <WorkerReport chatId={chatId} report={outcome.report} server={server} />
                <TurnLine turn={turn}>{reportOutcomeWords[outcome.report.outcome]}</TurnLine>
            </>
        );
    }
    if (outcome?.kind === 'failed') {
        return <TurnLine turn={turn}>{`Failed: ${workerFailureLabels[outcome.reason]}`}</TurnLine>;
    }
    if (outcome?.kind === 'stopped') {
        return <TurnLine turn={turn}>Stopped</TurnLine>;
    }
    return turn.summary && turn.terminalAt ? (
        <ReferenceMarkdown className="text-sm" content={turn.summary} serverId={server.id} />
    ) : null;
}

function TurnLine({ children, turn }: { children: string; turn: WorkerTurn }) {
    const span =
        turn.startedAt && turn.terminalAt
            ? Date.parse(turn.terminalAt) - Date.parse(turn.startedAt)
            : null;
    return (
        <p className="text-muted text-center text-sm" data-testid="worker-turn-line">
            {span === null ? children : `${children}, worked for ${formatWorkerDuration(span)}`}
        </p>
    );
}

const reportOutcomeWords = {
    done: 'Finished',
    failed: 'Failed',
    'needs-you': 'Needs you',
} as const;
