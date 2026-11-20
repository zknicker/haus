import { type Worker, workerPullRequestNumber } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { Chip } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';
import { useOpenWorkerView } from './use-open-worker-view.ts';
import {
    newestWorkerReport,
    workerRowQuestion,
    workerRowStatus,
    workerStatusChipColors,
    workerStatusDiscStates,
    workerStatusLabels,
} from './worker-card-model.ts';
import { workerBranch } from './worker-presentation.ts';
import { WorkerStatusDisc } from './worker-status-disc.tsx';

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
    const status = workerRowStatus(work);
    const question = workerRowQuestion(work);
    const pullRequest = workerRowPullRequest(work);
    return (
        <ListView.ItemContent data-testid="worker-row">
            <WorkerKeycap provider={work.place} size={20} />
            <div className="flex min-w-0 flex-1 flex-col">
                <ListView.Title>{work.title}</ListView.Title>
                {question ? <ListView.Description>{question}</ListView.Description> : null}
            </div>
            {pullRequest ? (
                <Chip size="sm" variant="tertiary">
                    <Icon aria-hidden="true" icon={GitPullRequestIcon} size={12} />
                    <Chip.Label>{pullRequest}</Chip.Label>
                </Chip>
            ) : null}
            <Chip color={workerStatusChipColors[status]} size="sm" variant="soft">
                <WorkerStatusDisc
                    className="size-3 text-current"
                    state={workerStatusDiscStates[status]}
                />
                <Chip.Label>{workerStatusLabels[status]}</Chip.Label>
            </Chip>
        </ListView.ItemContent>
    );
}

function workerRowPullRequest(work: Pick<Worker, 'pullRequest' | 'turns'>) {
    if (work.pullRequest) {
        return `#${work.pullRequest.number}`;
    }
    const url =
        newestWorkerReport(work)?.pullRequestUrls[0] ?? workerBranch(work)?.pullRequestUrl ?? null;
    const number = url ? workerPullRequestNumber(url) : null;
    return number === null ? (url ? 'PR' : null) : `#${number}`;
}
