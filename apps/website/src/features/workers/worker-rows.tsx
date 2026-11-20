import type { Worker } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { Tooltip } from '@heroui/react';
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
    return (
        <ListView
            aria-label={label}
            items={works}
            onAction={(key) => openWorker(String(key))}
            variant="secondary"
        >
            {(work) => (
                <ListView.Item id={work.id} textValue={work.title}>
                    <WorkerRowContent work={work} />
                </ListView.Item>
            )}
        </ListView>
    );
}

export function WorkerRowContent({ work }: { work: Worker }) {
    const now = useRelativeNow(isWorkerTurnLive(work) ? 5000 : 60_000);
    const status = workerRowStatus(work);
    const question = workerRowQuestion(work);
    return (
        <ListView.ItemContent data-testid="worker-row">
            <Tooltip>
                <Tooltip.Trigger>
                    <span aria-label={workerStatusLabels[status]} role="img">
                        <WorkerStatusDisc
                            className={statusTones[status]}
                            state={workerStatusDiscStates[status]}
                        />
                    </span>
                </Tooltip.Trigger>
                <Tooltip.Content>{workerStatusLabels[status]}</Tooltip.Content>
            </Tooltip>
            <div className="flex min-w-0 flex-1 flex-col">
                <ListView.Title>{work.title}</ListView.Title>
                <ListView.Description>
                    {`${question ?? workerPlaceName(work)} · ${workerAge(work, now)}`}
                </ListView.Description>
            </div>
        </ListView.ItemContent>
    );
}
