import type { Worker } from '@haus/api';
import * as React from 'react';

export type WorkerSummary = Pick<Worker, 'id' | 'place' | 'title'>;

const WorkerSummariesContext = React.createContext<ReadonlyMap<string, WorkerSummary> | null>(null);

export function WorkerSummariesProvider({
    children,
    workers,
}: {
    children: React.ReactNode;
    workers: readonly WorkerSummary[];
}) {
    const key = JSON.stringify(workers.map(({ id, place, title }) => [id, place, title]));
    const summaries = React.useMemo(
        () =>
            new Map(
                (JSON.parse(key) as [string, WorkerSummary['place'], string][]).map(
                    ([id, place, title]) => [id, { id, place, title }]
                )
            ),
        [key]
    );
    return <WorkerSummariesContext value={summaries}>{children}</WorkerSummariesContext>;
}

export function useKnownWorker(workerId: string) {
    return React.use(WorkerSummariesContext)?.get(workerId) ?? null;
}
