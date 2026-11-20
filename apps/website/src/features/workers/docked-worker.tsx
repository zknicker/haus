import type { Worker } from '@haus/api';
import { Button } from '@heroui/react';
import * as React from 'react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { WorkerCard } from './worker-card.tsx';
import { workerText } from './worker-presentation.ts';
import { WorkerStatusDisc } from './worker-status-disc.tsx';

interface DockedWorker {
    isDocked: (workerId: string) => boolean;
    reveal: (workerId: string) => void;
}

const DockedWorkerContext = React.createContext<DockedWorker | null>(null);

export function DockedWorkerProvider({
    children,
    dock,
    workerIds,
}: {
    children: React.ReactNode;
    dock: React.RefObject<HTMLElement | null>;
    workerIds: readonly string[];
}) {
    const key = workerIds.join('\n');
    const value = React.useMemo<DockedWorker>(() => {
        const docked = new Set(key.split('\n'));
        return {
            isDocked: (workerId) => docked.has(workerId),
            reveal: (workerId) => {
                const card = dock.current?.querySelector<HTMLElement>(
                    `[data-work-id="${CSS.escape(workerId)}"]`
                );
                card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                card?.focus({ preventScroll: true });
            },
        };
    }, [dock, key]);
    return <DockedWorkerContext.Provider value={value}>{children}</DockedWorkerContext.Provider>;
}

export function useDockedWorker() {
    return React.use(DockedWorkerContext);
}

export function MessageWorker({ work }: { work: Worker }) {
    const docked = React.use(DockedWorkerContext);
    if (docked?.isDocked(work.id)) {
        return <WorkerReference onPress={() => docked.reveal(work.id)} work={work} />;
    }
    return <WorkerCard work={work} />;
}

function WorkerReference({ onPress, work }: { onPress: () => void; work: Worker }) {
    const now = useRelativeNow(work.job.state === 'working' || work.job.followUp ? 5000 : 60_000);
    const status = workerText(work, now);
    return (
        <div className="flex min-w-0" data-testid="worker-reference">
            <Button
                aria-label={`Show Worker: ${work.title}, ${status}`}
                className="max-w-full justify-start"
                onPress={onPress}
                size="sm"
                variant="ghost"
            >
                <WorkerStatusDisc state={work.job.state} />
                <span className="min-w-0 truncate font-medium">{work.title}</span>
                <span className="text-muted shrink-0">{status}</span>
            </Button>
        </div>
    );
}
