import type { Worker } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useOpenWorkerView } from './use-open-worker-view.ts';
import {
    isWorkerTurnLive,
    workerAge,
    workerRowQuestion,
    workerRowStatus,
    workerStatusDiscStates,
    workerStatusLabels,
} from './worker-card-model.ts';
import { workerPlaceName } from './worker-place.ts';
import { WorkerStatusDisc } from './worker-status-disc.tsx';

const statusTones = {
    done: 'text-success',
    failed: 'text-danger',
    'needs-you': 'text-warning',
    queued: 'text-muted',
    stopped: 'text-muted',
    working: 'text-accent',
} as const;

export function WorkerRows({ label, works }: { label: string; works: readonly Worker[] }) {
    const openWorker = useOpenWorkerView();
    const live = works.some(isWorkerTurnLive);
    const now = useRelativeNow(live ? 5000 : 60_000);
    return (
        <ListView
            aria-label={label}
            items={works}
            onAction={(key) => openWorker(String(key))}
            variant="secondary"
        >
            {(work) => {
                const status = workerRowStatus(work);
                return (
                    <ListView.Item id={work.id} textValue={work.title}>
                        <ListView.ItemContent data-testid="worker-row">
                            <span
                                aria-label={workerStatusLabels[status]}
                                className="self-start pt-0.5"
                                role="img"
                                title={workerStatusLabels[status]}
                            >
                                <WorkerStatusDisc
                                    className={statusTones[status]}
                                    state={workerStatusDiscStates[status]}
                                />
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col">
                                <ListView.Title>{work.title}</ListView.Title>
                                <ListView.Description>
                                    {`${workerRowQuestion(work) ?? workerPlaceName(work)} · ${workerAge(work, now)}`}
                                </ListView.Description>
                            </div>
                        </ListView.ItemContent>
                    </ListView.Item>
                );
            }}
        </ListView>
    );
}
