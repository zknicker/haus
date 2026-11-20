import type { Worker } from '@haus/api';
import * as React from 'react';

export interface WorkerSummary {
    id: string;
    place: Worker['place'];
    title: string;
    turnSpans: Readonly<Record<string, null | number>>;
}

const WorkerSummariesContext = React.createContext<ReadonlyMap<string, WorkerSummary> | null>(null);

export function WorkerSummariesProvider({
    children,
    workers,
}: {
    children: React.ReactNode;
    workers: readonly Pick<Worker, 'id' | 'place' | 'title' | 'turns'>[];
}) {
    const key = JSON.stringify(workers.map(summarizeWorker));
    const summaries = React.useMemo(
        () => new Map((JSON.parse(key) as WorkerSummary[]).map((summary) => [summary.id, summary])),
        [key]
    );
    return <WorkerSummariesContext value={summaries}>{children}</WorkerSummariesContext>;
}

export function useKnownWorker(workerId: string) {
    return React.use(WorkerSummariesContext)?.get(workerId) ?? null;
}

export function summarizeWorker(work: Pick<Worker, 'id' | 'place' | 'title' | 'turns'>) {
    return {
        id: work.id,
        place: work.place,
        title: work.title,
        turnSpans: Object.fromEntries(
            work.turns.map((turn) => [turn.turnId, turnSpan(turn.startedAt, turn.terminalAt)])
        ),
    } satisfies WorkerSummary;
}

function turnSpan(startedAt: null | string, terminalAt: null | string) {
    if (startedAt === null || terminalAt === null) {
        return null;
    }
    return Math.max(0, Date.parse(terminalAt) - Date.parse(startedAt));
}
