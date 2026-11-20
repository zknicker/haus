import type { Worker, WorkerTurnInput } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Chip } from '@heroui/react';
import { Alert02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useWorkerRecord } from '../../../hooks/servers/use-worker.ts';
import { useTask } from '../../../hooks/tasks/use-task.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { WorkerKeycap } from '../cloud-agent-provider-mark.tsx';
import {
    canFollowUpWorker,
    isWorkerTurnLive,
    newestWorkerReport,
    workerCardLine,
    workerRowStatus,
    workerStatusChipColors,
    workerStatusDiscStates,
    workerStatusLabels,
} from '../worker-card-model.ts';
import { WorkerFollowUpComposer } from '../worker-follow-up-composer.tsx';
import { workerPlaceName } from '../worker-place.ts';
import { workerAgentFallbackName, workerBranch } from '../worker-presentation.ts';
import { WorkerPullRequestRow } from '../worker-pull-request-row.tsx';
import { WorkerStatusDisc } from '../worker-status-disc.tsx';
import { WorkerTurnEntry } from './worker-turn-entry.tsx';

export { WorkerBandMenu } from './worker-band-menu.tsx';

export function WorkerView({ workerId }: { workerId: string }) {
    const { server } = useServerContext();
    const record = useWorkerRecord(server.id, workerId);
    if (record.data) {
        return <WorkerThread work={record.data} />;
    }
    return record.error ? <WorkerUnavailable /> : null;
}

function WorkerThread({ work }: { work: Worker }) {
    const { server } = useServerContext();
    const task = useTask(server.id, work.taskId ? { taskId: work.taskId } : undefined).data;
    const name = useAuthorName(server.id);
    const now = useRelativeNow(isWorkerTurnLive(work) ? 5000 : 60_000);
    const line = isWorkerTurnLive(work) ? workerCardLine(work, { name, now }) : null;
    const status = workerRowStatus(work);
    const turns = [...work.turns].reverse();

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
                    <div className="text-muted flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <Chip color={workerStatusChipColors[status]} size="sm" variant="soft">
                            <WorkerStatusDisc
                                className="size-3 text-current"
                                state={workerStatusDiscStates[status]}
                            />
                            <Chip.Label>{workerStatusLabels[status]}</Chip.Label>
                        </Chip>
                        <span className="flex items-center gap-1.5">
                            <WorkerKeycap provider={work.place} size={16} />
                            {`${workerPlaceName(work)} · ${work.repository}`}
                        </span>
                        <WorkerPullRequestRow
                            branch={workerBranch(work)}
                            reading={work.pullRequest}
                            reportUrls={newestWorkerReport(work)?.pullRequestUrls}
                        />
                    </div>
                    {turns.map((turn) => (
                        <WorkerTurnEntry
                            chatId={task?.chatId ?? null}
                            key={turn.turnId}
                            name={name}
                            server={server}
                            turn={turn}
                        />
                    ))}
                    {line ? (
                        <p
                            className={
                                line.tone === 'muted'
                                    ? 'text-muted text-sm'
                                    : 'text-warning text-sm'
                            }
                            data-testid="worker-live-line"
                        >
                            {line.text}
                        </p>
                    ) : null}
                </div>
            </div>
            {task?.chatId && canFollowUpWorker(work) ? (
                <div className="mx-auto w-full max-w-3xl px-5 pb-4">
                    <WorkerFollowUpComposer serverId={server.id} work={work} />
                </div>
            ) : null}
        </div>
    );
}

function useAuthorName(serverId: string) {
    const agents = useAgentAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    return (author: WorkerTurnInput['author']) =>
        author.kind === 'agent'
            ? (agents.find((agent) => agent.id === author.id)?.displayName ??
              workerAgentFallbackName(author.id))
            : humans.name(author.id);
}

function WorkerUnavailable() {
    return (
        <EmptyState className="flex-1">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={Alert02Icon} />
                </EmptyState.Media>
                <EmptyState.Title>Worker not found</EmptyState.Title>
            </EmptyState.Header>
        </EmptyState>
    );
}
