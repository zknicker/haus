import type { Worker, WorkerTurnInput } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Alert02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useWorkerRecord } from '../../../hooks/servers/use-worker.ts';
import { useTask } from '../../../hooks/tasks/use-task.ts';
import { cn } from '../../../lib/utils.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { PanelSection } from '../../tasks/work/panel-section.tsx';
import { PullRequestRows } from '../../tasks/work/pull-request-rows.tsx';
import {
    canFollowUpWorker,
    isWorkerTurnLive,
    workerCardLine,
    workerRowStatus,
    workerStatusDiscStates,
} from '../worker-card-model.ts';
import { WorkerFollowUpComposer } from '../worker-follow-up-composer.tsx';
import { workerPlaceName } from '../worker-place.ts';
import { workerAgentFallbackName } from '../worker-presentation.ts';
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
    const turns = [...work.turns].reverse();
    const pullRequests = work.pullRequest ? [work.pullRequest] : [];

    return (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8 lg:pe-5">
            <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
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
                                className={cn(
                                    'flex items-center justify-center gap-2 text-center text-sm',
                                    line.tone === 'muted' ? 'text-muted' : 'text-warning'
                                )}
                                data-testid="worker-live-line"
                            >
                                <WorkerStatusDisc
                                    className="size-3.5"
                                    state={workerStatusDiscStates[workerRowStatus(work)]}
                                />
                                {line.text}
                            </p>
                        ) : null}
                    </div>
                </div>
                {task?.chatId && canFollowUpWorker(work) ? (
                    <div className="mx-auto w-full max-w-3xl px-5 pb-4">
                        <WorkerFollowUpComposer
                            context={`${workerPlaceName(work)} · ${work.repository}`}
                            serverId={server.id}
                            work={work}
                        />
                    </div>
                ) : null}
            </div>
            {pullRequests.length > 0 ? (
                <aside
                    aria-label="Overview"
                    className="hidden min-h-0 flex-col gap-3 overflow-y-auto pt-4 pb-6 lg:flex"
                >
                    <PanelSection count={pullRequests.length} title="Pull requests">
                        <PullRequestRows readings={pullRequests} />
                    </PanelSection>
                </aside>
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
